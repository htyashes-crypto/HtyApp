const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("htyElectron", {
  invoke(command, args) {
    return ipcRenderer.invoke("hty:invoke", { command, args });
  },
  openDialog(options) {
    return ipcRenderer.invoke("hty:dialog:open", options);
  },
  saveDialog(options) {
    return ipcRenderer.invoke("hty:dialog:save", options);
  },
  onSyncEvent(channel, callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return listener;
  },
  removeSyncEvent(channel, listener) {
    ipcRenderer.removeListener(channel, listener);
  },
  onDownloadEvent(channel, callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return listener;
  },
  removeDownloadEvent(channel, listener) {
    ipcRenderer.removeListener(channel, listener);
  },
  getAppVersion() {
    return ipcRenderer.invoke("hty:get-app-version");
  },
  checkForUpdate() {
    return ipcRenderer.invoke("hty:check-update");
  },
  downloadUpdate() {
    return ipcRenderer.invoke("hty:download-update");
  },
  quitAndInstall() {
    return ipcRenderer.invoke("hty:quit-and-install");
  },
  onUpdateStatus(callback) {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("hty:update-status", listener);
    return listener;
  },
  removeUpdateStatus(listener) {
    ipcRenderer.removeListener("hty:update-status", listener);
  }
});
