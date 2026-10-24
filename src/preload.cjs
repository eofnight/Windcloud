const { contextBridge, ipcRenderer } = require('electron');
const calls = new Set(['profiles','new-window','capture-history','capture-clear','timer-control','init','connect','disconnect','execute','rules','pause','resize','preferences','export','import','log','check-updates','open-update']);
const events = new Set(['capture-shared','variable-state','timer-state','timer-echo','notice','connection','output','echo','capture','command-echo','connection-info','trigger-echo','update-available']);
contextBridge.exposeInMainWorld('mud', {
  call: async (name, data) => {
    if (!calls.has(name)) throw Error('無效操作');
    const result = await ipcRenderer.invoke(name, data);
    if (!result.ok) throw Error(result.error);
    return result.value;
  },
  on: (name, listener) => {
    if (!events.has(name)) throw Error('無效事件');
    const handler = (_, data) => listener(data);
    ipcRenderer.on(name, handler);
    return () => ipcRenderer.removeListener(name, handler);
  }
});
