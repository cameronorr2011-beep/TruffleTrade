/**
 * Preload bridge — the only renderer-facing surface of the desktop shell.
 *
 * Exposes the desktop updater state to the app so it can render the persistent
 * "Update ready" banner with a Restart button (see UpdateBanner.tsx). The web
 * build has no such bridge: `window.truffleUpdates` is simply undefined there,
 * and every consumer must treat that as "not a desktop app".
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("truffleUpdates", {
  /** Snapshot of the updater state; resolves immediately with the current value. */
  getState: () => ipcRenderer.invoke("tt:get-update-state"),
  /** Quit-and-install once an update is in the "downloaded" state. */
  install: () => ipcRenderer.invoke("tt:install-update"),
  /** Push updates as they change; returns an unsubscribe function. */
  onState: (cb) => {
    if (typeof cb !== "function") return () => {};
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("tt:update-state", listener);
    return () => ipcRenderer.removeListener("tt:update-state", listener);
  },
});
