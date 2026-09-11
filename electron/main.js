#!/usr/bin/env node
/**
 * TruffleTrade desktop shell (Electron main process).
 *
 * The product is the local Next app (npm run dev / npm start). Electron is the
 * native frame around it: real window, tray, taskbar icon, dark chrome — a
 * desktop app, not a browser tab. The web property handles nothing user-facing:
 * it is only licensing + federation + the AI gateway.
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require("electron");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = process.env.TT_PORT || 3210;
const APP_URL = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");

let win = null;
let tray = null;
let server = null;
let quitting = false;

// ── Local server lifecycle ────────────────────────────────────────────
function serverReady() {
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(`${APP_URL}/api/status`, (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      });
      req.on("error", () => setTimeout(probe, 700));
      req.setTimeout(1200, () => {
        req.destroy();
        setTimeout(probe, 700);
      });
    };
    probe();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    try {
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
    } catch (err) {
      reject(err);
    }
  });
}

async function ensureServer() {
  const up = await Promise.race([serverReady(), new Promise((r) => setTimeout(() => r(false), 2500))]);
  if (up) return; // already running (dev mode or previous launch)
  await startServer();
  await serverReady();
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

  win.loadURL(APP_URL);
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

  app.whenReady().then(async () => {
    try {
      await ensureServer();
    } catch (err) {
      console.error("[truffletrade] local server failed to start:", err);
    }
    createWindow();
    createTray();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      quitting = true;
      app.quit();
    }
  });

  app.on("before-quit", (e) => {
    if (server && !quitting) {
      // Closing the window hides to tray only if we later decide to; for now quit cleanly.
    }
    if (server) {
      try {
        process.platform === "win32" ? server.kill() : server.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  });
}
