const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');
// Opt-in isolated profile for local verification; does not touch a running player's settings.
if (process.env.WINDCLOUD_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.WINDCLOUD_TEST_PROFILE));
let win, socket, decoder, telnet, lines, promptTimer, saveTimer;
let engine, Telnet, LineStream, GameConnection, executeInput, normalizePreferences, migrateSettings, settings, passwordNext = false;
let connecting = false;
const transmit = (kind, data) => { if (win && !win.isDestroyed()) win.webContents.send(kind, data); };
const notice = text => transmit('notice', String(text));
const connectionInfo = text => transmit('connection-info', String(text));
const state = status => transmit('connection', status);
function sendCommand(text) {
  if (!socket || socket.destroyed || connecting) throw Error('尚未連線，遊戲指令未送出');
  if (/[\r\n\0]/.test(text)) throw Error('單一指令不可包含換行或 NUL');
  if (socket.kind === 'websocket') { socket.sendText(text); return; }
  const bytes = iconv.encode(text + '\r\n', settings.encoding);
  const escaped = [];
  for (const byte of bytes) { escaped.push(byte); if (byte === 255) escaped.push(255); }
  socket.write(Buffer.from(escaped));
}
const defaults = () => ({ version: 2, host: '125.228.186.144', port: 8000, encoding: 'big5', transport: 'websocket', preferences: normalizePreferences(), engine: { aliases: [], triggers: [], variables: {}, groups: {} } });
const configPath = () => path.join(app.getPath('userData'), 'settings.json');
async function persist() {
  const snapshot = JSON.stringify({ ...settings, engine: engine.snapshot() }, null, 2);
  const temp = configPath() + '.tmp';
  await fs.mkdir(path.dirname(temp), { recursive: true });
  await fs.writeFile(temp, snapshot, { mode: 0o600 });
  await fs.rename(temp, configPath());
}
let saveChain = Promise.resolve();
function save() { saveChain = saveChain.catch(() => {}).then(persist); return saveChain; }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => save().catch(e => notice('設定儲存失敗：' + e.message)), 350); }
function config() { return { ...settings, engine: engine.snapshot(), paused: engine.paused }; }
function validateSettings(data) {
  if (!data || typeof data.host !== 'string' || !/^[a-zA-Z0-9.:-]{1,253}$/.test(data.host)) throw Error('主機格式錯誤');
  if (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535) throw Error('連接埠必須在 1–65535');
  if (data.transport !== undefined && !['auto','telnet','websocket'].includes(data.transport)) throw Error('不支援的連線方式');
  if (!['big5','utf8'].includes(data.encoding)) throw Error('不支援的文字編碼');
}
function closeConnection() {
  engine?.cancelPending();
  clearTimeout(promptTimer); connecting = false;
  if (socket) { const old = socket; socket = null; old.destroy(); }
  passwordNext = false; transmit('echo', true); state('disconnected');
}
function connect() {
  const current = new GameConnection(settings);
  closeConnection();
  connecting = true; state('connecting');
  decoder = iconv.getDecoder(settings.encoding);
  socket = current;
  current.on('attempt', label => connectionInfo(`正在連線 ${label}…`));
  current.on('fallback', message => connectionInfo(message));
  lines = new LineStream(
    text => { if (/(密碼|password)\s*[:：]?\s*$/i.test(text)) { passwordNext = true; transmit('echo', false); } try { engine.receive(text); } catch (e) { notice(e.message); } },
    text => {
      if (/(密碼|password)\s*[:：]?\s*$/i.test(text)) { passwordNext = true; transmit('echo', false); }
      try { engine.receive(text, 'prompt'); } catch(e) { notice(e.message); }
    }
  );
  telnet = new Telnet({ reply: bytes => { if (socket === current) current.write(bytes); }, echo: () => {} });
  current.once('connect', () => {
    if (socket !== current) return;
    connecting = false; decoder = iconv.getDecoder(current.encoding); state('connected'); connectionInfo(`已連線 ${current.label}（${current.encoding}）`);
  });
  current.on('data', bytes => {
    if (socket !== current) return;
    const text = decoder.write(Buffer.from(telnet.feed(bytes)));
    transmit('output', text); lines.feed(text); scheduleSave();
    clearTimeout(promptTimer); promptTimer = setTimeout(() => lines.flushPrompt(), 160);
  });
  current.on('error', e => { if (socket === current) notice('連線錯誤：' + e.message); });
  current.on('close', () => { if (socket === current) closeConnection(); });
  current.connect();
}
app.whenReady().then(async () => {
  const { Engine: EngineClass } = await import('./engine.js');
  ({ Telnet, LineStream } = await import('./telnet.js'));
  ({ executeInput } = await import('./input.js'));
  ({ GameConnection } = await import('./connection.js'));
  ({ normalizePreferences, migrateSettings } = await import('./preferences.js'));
  engine = new EngineClass({ send: sendCommand, notice, capture: data => transmit('capture', data), changed: scheduleSave }); settings = defaults();
  try {
    const loaded = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    validateSettings(loaded); const migrated = migrateSettings({ ...defaults(), ...loaded }); engine.restore(migrated.engine); settings = migrated;
  } catch (e) { if (e.code !== 'ENOENT') dialog.showErrorBox('設定載入失敗', '保留原檔並使用預設設定：' + e.message); }
  win = new BrowserWindow({ width: 1280, height: 850, minWidth: 640, minHeight: 480, backgroundColor: '#101519', title: '風雲再起', webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true
  } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  const handle = (name, fn) => ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('無效的呼叫來源');
    try { return { ok: true, value: await fn(...args) }; } catch(e) { return { ok: false, error: e.message }; }
  });
  handle('init', () => config());
  handle('connect', data => {
    const next = { ...settings, host: data.host, port: data.port, encoding: data.encoding, transport: data.transport || 'websocket' };
    validateSettings(next); settings = next; scheduleSave(); connect();
  });
  handle('disconnect', closeConnection);
  handle('execute', ({ text, secret }) => {
    try {
      const result = executeInput({ text, secret, passwordPrompt: passwordNext, engine, send: sendCommand, echo: text => transmit('command-echo', text) });
      if (result.secret) { passwordNext = false; transmit('echo', true); }
      return { config: config(), secret: result.secret };
    } finally { scheduleSave(); }
  });
  handle('rules', data => { engine.restore(data); scheduleSave(); return config(); });
  handle('preferences', data => { settings.preferences = normalizePreferences(data); scheduleSave(); return config(); });
  handle('pause', paused => { engine.paused = !!paused; return engine.paused; });
  handle('resize', ({cols, rows}) => { if (Number.isInteger(cols) && Number.isInteger(rows)) telnet?.resize(cols,rows); });
  handle('export', async () => {
    const result = await dialog.showSaveDialog(win, { defaultPath: 'windcloud-settings.json', filters: [{name: 'JSON', extensions:['json']}] });
    if (!result.canceled) await fs.writeFile(result.filePath, JSON.stringify(config(), null, 2), { mode: 0o600 });
    return !result.canceled;
  });
  handle('import', async () => {
    const result = await dialog.showOpenDialog(win, { properties:['openFile'], filters:[{name:'JSON',extensions:['json']}] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 2_000_000) throw Error('設定檔超過 2 MB');
    const data = JSON.parse(await fs.readFile(file,'utf8')); validateSettings(data);
    const migrated = migrateSettings({ ...defaults(), ...data }); engine.restore(migrated.engine); closeConnection(); settings = migrated;
    engine.paused = true; scheduleSave(); return config();
  });
  handle('log', async text => {
    if (typeof text !== 'string' || text.length > 10_000_000) throw Error('紀錄長度超過限制');
    const result = await dialog.showSaveDialog(win, { defaultPath:'windcloud-session.txt', filters:[{name:'文字檔',extensions:['txt']}] });
    if (!result.canceled) await fs.writeFile(result.filePath,text);
  });
  await win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => { closeConnection(); clearTimeout(saveTimer); save().finally(() => app.quit()); });
