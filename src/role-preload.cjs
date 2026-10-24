const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('roles', {
  action: (action, id) => ipcRenderer.invoke('role-host', action, id),
  onTabs: listener => ipcRenderer.on('role-tabs', (_, state) => listener(state))
});
