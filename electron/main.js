#!/usr/bin/env node
/**
 * TruffleTrade desktop shell (Electron main process).
 *
 * The product is the local Next app. Electron is the native frame around it:
 * real window, tray, taskbar icon, dark chrome — a desktop app, not a tab.
 *
 * Reopen hardening: the shell is defensive about the local server. It probes
 * /api/status first; if that probe errors outright (port dead) it starts its
 * own in-process Next server. It NEVER trusts "port open" alone — an orphaned server or
 * a dev server serving a stale/missing build would otherwise show a blank
 * window. /api/status is a plain product liveness route (no subscriber data)
 * so probing it is safe. A verified-but-foreign server gets killed if we can.
 * The window also shows a splash immediately and swaps in the dashboard as
 * soon as /api/status proves healthy, so a slow boot is never a blank frame.
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { exec } = require("node:child_process");

const PORT = process.env.TT_PORT || 3210;
const APP_URL = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");
const SPLASH = `data:text/html,${encodeURIComponent(`<!doctype html><html><head><style>
  body{margin:0;background:radial-gradient(900px 420px at 70% -10%,rgba(88,169,123,.10),transparent 60%),#0c1210;display:grid;place-items:center;height:100vh;font-family:Segoe UI,sans-serif;color:#9db1a3}
  .brand{font-size:40px;font-weight:800;letter-spacing:-1.5px;color:#dce7de;text-align:center}
  .brand em{color:#58a97b;font-style:normal}
  .sub{margin-top:8px;font-size:11px;letter-spacing:3.5px;text-transform:uppercase;color:#66796d;text-align:center}
  .bar{margin:26px auto 0;width:210px;height:3px;border-radius:3px;background:#1a2620;overflow:hidden;position:relative}
  .bar i{position:absolute;top:0;left:-40%;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,transparent,#58a97b,transparent);animation:sweep 1.1s ease-in-out infinite}
  @keyframes sweep{to{left:100%}}
  .pulse{margin:0 auto;width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px rgba(74,222,128,.7);animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
</style></head><body><div style="text-align:center"><div class="brand">truffle<em>trade</em></div><div class="sub">Research terminal</div><div class="bar"><i></i></div><div style="margin-top:18px;display:flex;justify-content:center"><span class="pulse"></span></div></div></body></html>`)}`;

let win = null;
let tray = null;
let server = null;
let quitting = false;

// ── Update state shared with the renderer (read via IPC) ─────────────
// The updater runs entirely in the main process; the in-app banner polls this
// snapshot instead of importing electron-updater itself.
const updateState = {
  status: "idle", // idle | checking | available | downloading | downloaded | error
  info: null, // { version } of the pending/new release
  progress: 0, // 0..100 while downloading
  error: null,
  checkedAt: 0, // epoch ms of last completed check
};
function broadcastUpdateState() {
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send("tt:update-state", { ...updateState });
    } catch {
      // window tearing down — the renderer also polls via IPC, so nothing is lost
    }
  }
}

// ── Local server lifecycle ────────────────────────────────────────────
/** HEAD/GET /api/status → 200 only if the local Next app is genuinely ours and healthy. */
function statusProbe() {
  return new Promise((resolve) => {
    const req = http.get(`${APP_URL}/api/status`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve("dead"));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve("timeout");
    });
  });
}

function waitReady(timeoutMs = 45_000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const probe = async () => {
      const r = await statusProbe();
      if (r === true) return resolve(true);
      if (Date.now() - t0 > timeoutMs) return reject(new Error(`local server not healthy after ${timeoutMs}ms`));
      setTimeout(probe, 700);
    };
    probe();
  });
}

/** Best-effort: kill anything squatting on our port before starting fresh. */
function freePort() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(); // POSIX path uses kill below
    exec(
      'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' +
        PORT +
        ' -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"',
      { timeout: 10_000 },
      () => resolve(),
    );
  });
}

/**
 * Serve the built Next app IN-PROCESS. Spawning `npx next start` broke in the
 * packaged app twice over: (1) spawn's cwd pointed into app.asar, which is not
 * a real directory on disk → `spawn C:\\WINDOWS\\system32\\cmd.exe ENOENT`
 * (Windows can't launch the shell with a nonexistent working directory); and
 * (2) buyers' machines have no Node.js/npx at all. Requiring `next` inside
 * Electron's main process avoids both: no child process, no shell, no Node on
 * PATH — and Electron's patched fs reads .next straight out of the asar.
 */
async function startServer() {
  // Packaged buyers have no .env (secrets must never ship in the installer):
  // default the TT_* knobs so the local app still boots. Production secrets
  // (DATABASE_URL, GROQ_API_KEY, licensing keys) stay out of the package on
  // purpose — the local app talks to the hosted gateway over HTTP.
  //   · TT_GATEWAY_URL  → the hosted AI gateway (subscribers get a code, not a key)
  //   · TT_SITE_URL     → absolute URL used for payment callbacks
  //   · TT_ACCESS_CODE  → picked up from the machine's real env when present
  // Dev (`npm run app`) is untouched — there the repo .env drives everything.
  if (app.isPackaged) {
    if (!process.env.TT_GATEWAY_URL) process.env.TT_GATEWAY_URL = "https://truffletrade.vercel.app";
    if (!process.env.TT_SITE_URL) process.env.TT_SITE_URL = "https://truffletrade.vercel.app";
    // SQLite must live in a writable per-user dir: the install dir (Program
    // Files) is read-only, and cwd-relative "data/" would break there. The
    // core/* db modules honor absolute SQLITE_PATH/MEMORY_DB_PATH directly.
    if (!process.env.SQLITE_PATH) process.env.SQLITE_PATH = path.join(app.getPath("userData"), "truffletrade.sqlite3");
    if (!process.env.MEMORY_DB_PATH) process.env.MEMORY_DB_PATH = path.join(app.getPath("userData"), "memory.sqlite3");
  }
  const next = require("next");
  const nextApp = next({ dev: false, dir: ROOT, conf: { env: process.env } });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  server = http.createServer((req, res) => handle(req, res));
  server.on("close", () => {
    server = null;
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(PORT), () => resolve());
  });
}

async function ensureServer() {
  const first = await statusProbe();
  if (first === true) return; // healthy app already listening
  // Port dead, timing out, or answering with something that is not our app.
  if (first !== "dead") await freePort(); // something foreign on the port — evict it
  await startServer();
  await waitReady();
}

// ── Window ────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0c1210",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "icons", "truffle.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
  });

  // External links (docs, GitHub, publisher links in news) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Splash immediately (never a blank frame), then the dashboard once healthy.
  win.loadURL(SPLASH);
  ensureServer()
    .then(() => {
      if (win && !win.isDestroyed()) win.loadURL(`${APP_URL}/dashboard`);
    })
    .catch((err) => {
      // Extra context: a stale/corrupt .next (no BUILD_ID) is the most common
      // packaged-boot failure, and "not healthy after 45000ms" alone hides it.
      if (/not healthy/i.test(String(err.message))) {
        const buildId = path.join(ROOT, ".next", "BUILD_ID");
        console.error("[truffletrade] boot failure detail: BUILD_ID present =", fs.existsSync(buildId));
      }
      console.error("[truffletrade] local server failed to start:", err);
      if (win && !win.isDestroyed()) {
        win.loadURL(
          `data:text/html,${encodeURIComponent(
            `<!doctype html><body style="background:#0c1210;color:#f2b8b5;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh"><div style="max-width:560px;text-align:center"><h2 style="color:#dce7de">TruffleTrade could not start its local server</h2><p style="line-height:1.6">${String(
              err.message || err,
            )}</p><p style="color:#9db1a3">Fix: run <code>npm run build</code> in the app folder, then reopen.</p></div></body>`,
          )}`,
        );
      }
    });
}

// ── Health watchdog: self-heal when the local server dies mid-session ──
// Without this, a crashed/orphaned server leaves the window permanently blank
// and the single-instance lock blocks any recovery launch.
let healing = false;
function startWatchdog() {
  setInterval(async () => {
    if (quitting || healing || !win || win.isDestroyed()) return;
    const healthy = await statusProbe();
    if (healthy === true) return;
    healing = true;
    console.log("[truffletrade] server unhealthy — reviving");
    try {
      await ensureServer();
      if (win && !win.isDestroyed()) win.loadURL(`${APP_URL}/dashboard`);
    } catch (err) {
      console.error("[truffletrade] revival failed:", err);
    } finally {
      healing = false;
    }
  }, 12_000);
}

// ── Auto-update: releases come from GitHub (app-update.yml) ───────────
// Checks on launch, then every 30 minutes, and again when the window regains
// focus after a long idle. Downloads run in the background and resume across
// launches via electron-updater's cache, so closing the app mid-download is
// safe. Once downloaded, the renderer shows a persistent in-app banner with a
// Restart button (primary surface) and the one-shot native dialog stays as a
// backstop for users parked on a single page. Dev builds skip all of this.
const UPDATE_CHECK_MS = 30 * 60 * 1000;
const UPDATE_FOCUS_RECHECK_MS = 4 * 60 * 60 * 1000; // focus re-check only if last check is older

function startAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    updateState.status = "checking";
    broadcastUpdateState();
  });
  autoUpdater.on("update-available", (i) => {
    updateState.status = "downloading"; // autoDownload is on — the fetch starts right away
    updateState.info = { version: i && i.version ? i.version : null };
    updateState.error = null;
    broadcastUpdateState();
  });
  autoUpdater.on("download-progress", (p) => {
    updateState.status = "downloading";
    updateState.progress = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
    broadcastUpdateState();
  });
  autoUpdater.on("update-downloaded", (i) => {
    updateState.status = "downloaded";
    updateState.info = { version: i && i.version ? i.version : null };
    updateState.progress = 100;
    broadcastUpdateState();
    // Zero-action updates: no dialogs, no prompts. The update installs
    // silently the next time the user closes the app (quit path now reliably
    // fires — see before-quit). The in-app banner exists only for users who
    // want to switch immediately.
  });
  autoUpdater.on("error", (e) => {
    updateState.status = "error";
    updateState.error = (e && e.message) || String(e);
    updateState.checkedAt = Date.now();
    broadcastUpdateState();
    console.error("[truffletrade] updater:", updateState.error);
  });

  const check = () => {
    // While a build is downloading or already staged, further checks can only
    // restart work — everything newer than the staged build arrives after it.
    if (updateState.status === "downloading" || updateState.status === "downloaded") return Promise.resolve();
    return autoUpdater.checkForUpdates().then(
      (r) => {
        updateState.checkedAt = Date.now();
        if (updateState.status === "checking") updateState.status = "idle";
        broadcastUpdateState();
        return r;
      },
      () => undefined, // offline / rate-limited → silent
    );
  };
  check();
  setInterval(check, UPDATE_CHECK_MS);

  // Machines that sleep for days should still see fresh releases promptly.
  app.on("browser-window-focus", () => {
    if (Date.now() - updateState.checkedAt > UPDATE_FOCUS_RECHECK_MS) check();
  });
}

// Renderer bridge for the in-app update banner. Registered unconditionally so
// dev mode answers too (idle state) instead of rejecting the invoke.
function registerUpdateIpc() {
  ipcMain.handle("tt:get-update-state", () => ({ ...updateState }));
  ipcMain.handle("tt:install-update", () => {
    if (!app.isPackaged || updateState.status !== "downloaded") return;
    quitting = true;
    // Silent + force-run-after: the installer runs unattended and the app
    // relaunches straight into the new version. Belt-and-braces: if quit
    // somehow hangs (socket keep-alives etc.), force-exit after 3s — the
    // staged installer is applied automatically on the next launch anyway.
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch {
        app.exit(0);
      }
      setTimeout(() => {
        try {
          app.exit(0);
        } catch {
          // already gone
        }
      }, 3_000);
    });
  });
}

// ── Tray ──────────────────────────────────────────────────────────────
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, "icons", "truffle.png"));
  tray = new Tray(img.isEmpty() ? path.join(__dirname, "icons", "truffle.ico") : img);
  tray.setToolTip("TruffleTrade — AI chart intelligence");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open TruffleTrade", click: () => (win ? win.focus() : createWindow()) },
      { label: "Markets", click: () => (win ? (win.show(), win.loadURL(`${APP_URL}/markets`)) : createWindow()) },
      { type: "separator" },
      { label: "Check for updates", click: () => (app.isPackaged ? autoUpdater.checkForUpdates().catch(() => undefined) : null) },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

// Single instance: clicking the shortcut again focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerUpdateIpc();
    createWindow(); // window first (splash), server boot inside it
    createTray();
    startWatchdog();
    startAutoUpdate();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      quitting = true;
      app.quit();
    }
  });

  app.on("before-quit", () => {
    if (server) {
      // closeAllConnections is the fix for the "update never installs on
      // quit" bug: browser/HTTP keep-alive sockets kept server.close() waiting
      // forever, which blocked app.quit() — so the on-quit updater hook never
      // fired and the staged installer never ran.
      try {
        server.closeAllConnections?.();
      } catch {
        // older Node — fall through to plain close
      }
      try {
        server.close();
      } catch {
        // already gone
      }
    }
  });
}
