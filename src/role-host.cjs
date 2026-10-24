const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const hosts = new Map();
const HEIGHT = 42;
function publish(host) {
  if (host.window.isDestroyed()) return;
  const current = host.tabs.find(s => s === host.active);
  host.window.setTitle('風雲再起 — ' + (current?.profile.name ?? '角色'));
  host.window.webContents.send('role-tabs', { active: current?.profile.id, tabs: host.tabs.map(s => ({ id: s.profile.id, name: s.profile.name, closing: !!s.closing })) });
}
function activate(host, session) {
  if (!host.tabs.includes(session) || session.closing) return;
  host.active = session;
  for (const tab of host.tabs) tab.view.setVisible(tab === session);
  layout(host); publish(host);
  if (host.window.isMinimized()) host.window.restore();
  host.window.focus(); session.contents.focus();
}
function layout(host) {
  const [width, height] = host.window.getContentSize();
  for (const tab of host.tabs) tab.view.setBounds({ x: 0, y: HEIGHT, width, height: Math.max(0, height - HEIGHT) });
}
async function createHost() {
  const window = new BrowserWindow({ width:1280, height:892, minWidth:640, minHeight:522, backgroundColor:'#101519', webPreferences:{ preload:path.join(__dirname,'role-preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true } });
  const host = { window, tabs:[], active:null, closing:false };
  hosts.set(window.webContents.id, host);
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('page-title-updated', event => event.preventDefault());
  window.on('resize', () => layout(host));
  window.on('close', event => {
    event.preventDefault(); if (host.closing) return;
    host.closing = true;
    Promise.all(host.tabs.map(s => s.close())).then(results => {
      host.closing = false;
      if (!host.tabs.length && results.every(Boolean) && !window.isDestroyed()) window.destroy();
    });
  });
  const id = window.webContents.id;
  window.on('closed', () => hosts.delete(id));
  await window.loadFile(path.join(__dirname,'roles.html'));
  return host;
}
function attach(host, session) {
  if (host.closing || host.window.isDestroyed()) throw Error('視窗正在關閉');
  host.tabs.push(session); host.window.contentView.addChildView(session.view); activate(host, session);
}
function detach(host, session) {
  host.window.contentView.removeChildView(session.view);
  host.tabs = host.tabs.filter(s => s !== session);
  if (!host.tabs.length) { if (!host.closing) host.window.destroy(); return; }
  if (host.active === session) activate(host, host.tabs[0]); else publish(host);
}
ipcMain.handle('role-host', async (event, action, id) => {
  const host = hosts.get(event.sender.id);
  if (!host || event.senderFrame !== host.window.webContents.mainFrame || host.closing) return;
  if (action === 'list') { publish(host); return; }
  if (action === 'add') { host.active?.contents.send('new-role'); return; }
  const session = host.tabs.find(s => s.profile.id === id);
  if (!session) return;
  if (action === 'select') activate(host, session);
  if (action === 'close') await session.close();
});
module.exports = { createHost, attach, detach, activate };
