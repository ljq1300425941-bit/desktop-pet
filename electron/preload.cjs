const { contextBridge, ipcRenderer } = require("electron");

const electronAPI = {
  setIgnoreMouseEvents: (shouldIgnore) =>
    ipcRenderer.invoke("pet:set-ignore-mouse-events", Boolean(shouldIgnore)),
  resetPosition: () => ipcRenderer.invoke("window:reset-position"),
  moveBy: (dx, dy) => ipcRenderer.invoke("window:move-by", Number(dx) || 0, Number(dy) || 0),
  snapToNearestEdge: () => ipcRenderer.invoke("window:snap-to-nearest-edge"),
  snapToRightEdge: () => ipcRenderer.invoke("window:snap-to-right-edge"),
  quit: () => ipcRenderer.invoke("app:quit"),
  onSwitchView: (callback) => {
    const listener = (_event, payload) => callback(payload);

    ipcRenderer.on("pet:switch-view", listener);

    return () => {
      ipcRenderer.removeListener("pet:switch-view", listener);
    };
  }
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
contextBridge.exposeInMainWorld("desktopPet", electronAPI);
