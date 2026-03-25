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
  }
});
