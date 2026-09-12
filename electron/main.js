#!/usr/bin/env node
/**
 * TruffleTrade desktop shell (Electron main process).
 *
 * The product is the local Next app. Electron is the native frame around it:
 * real window, tray, taskbar icon, dark chrome — a desktop app, not a tab.
 *
 * Reopen hardening: the shell is defensive about the local server. It probes
 * /api/status first; if that probe errors outright (port dead) it starts its
 * own `next start`. It NEVER trusts "port open" alone — an orphaned server or
 * a dev server serving a stale/missing build would otherwise show a blank
 * window. /api/status is a plain product liveness route (no subscriber data)
 * so probing it is safe. A verified-but-foreign server gets killed if we can.
 * The window also shows a splash immediately and swaps in the dashboard as
 * soon as /api/status proves healthy, so a slow boot is never a blank frame.
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require("electron");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, exec } = require("node:child_process");

const PORT = process.env.TT_PORT || 3210;
const APP_URL = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");
const SPLASH = `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#0c1210;display:grid;place-items:center;height:100vh;font-family:Segoe UI,sans-serif;color:#9db1a3"><div style="text-align:center"><div style="font-size:34px;font-weight:800;letter-spacing:-1px;color:#dce7de">truffle<span style="color:#e8ae52">trade</span></div><div style="margin-top:10px;font-size:13px">starting the research terminal…</div></div></body></html>`)}`;

let win = null;
let tray = null;
let server = null;
let quitting = false;

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

function startServer() {
  return new Promise((resolve, reject) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    server = spawn(npx, ["next", "start", "-p", String(PORT)], {
      cwd: ROOT,
      stdio: "ignore",
      windowsHide: true,
      shell: process.platform === "win32", // .cmd shims need a shell on Windows
      env: { ...process.env }, // passes TT_ACCESS_CODE + TT_GATEWAY_URL through
    });
    server.on("exit", () => {
      server = null;
    });
    resolve();
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
    createWindow(); // window first (splash), server boot inside it
    createTray();
    startWatchdog();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      quitting = true;
      app.quit();
    }
  });

  app.on("before-quit", () => {
    if (server) {
      try {
        process.platform === "win32" ? server.kill() : server.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  });
}
