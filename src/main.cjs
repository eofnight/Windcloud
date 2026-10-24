const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');
// Opt-in isolated profile for local verification; does not touch a running player's settings.
if (process.env.WINDCLOUD_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.WINDCLOUD_TEST_PROFILE));
const { ProfileStore } = require('./profiles.cjs');
const sessions = new Map(), activeProfiles = new Map(), openingProfiles = new Map(), registeredChannels = new Set();
let profiles, sharedCaptures;
function registerChannel(name) {
  if (registeredChannels.has(name)) return;
  registeredChannels.add(name);
  ipcMain.handle(name, async (event, ...args) => {
    const session = sessions.get(event.sender.id);
    if (!session || event.sender !== session.window.webContents || event.senderFrame !== session.window.webContents.mainFrame) return { ok: false, error: '無效的呼叫來源' };
    if (session.closing) return { ok: false, error: '角色視窗正在關閉' };
    const fn = session.handlers.get(name);
    if (!fn) return { ok: false, error: '無效操作' };
    try { return { ok: true, value: await fn(...args) }; } catch (error) { return { ok: false, error: error.message }; }
  });
}
function broadcastCapture(snapshot) {
  for (const session of sessions.values()) if ((session.ownsTarget(snapshot.target) || (!snapshot.lines.length && session.knownTargets.has(snapshot.target))) && !session.window.isDestroyed()) { session.knownTargets.add(snapshot.target); session.window.webContents.send('capture-shared', snapshot); }
}
function shareCapture({ target, line }) {
  const snapshot = sharedCaptures.append(target, line); if (snapshot) broadcastCapture(snapshot);
}
async function openProfile(profile) {
  const existing = activeProfiles.get(profile.id);
  if (existing) { if (existing.closing) throw Error('角色視窗正在關閉，請稍後再開啟'); existing.window.focus(); return existing; }
  if (openingProfiles.has(profile.id)) return openingProfiles.get(profile.id);
  const opening = createSession(profile); openingProfiles.set(profile.id, opening);
  try { return await opening; } finally { openingProfiles.delete(profile.id); }
}

async function createSession(profile) {
  const profileDirectory = profiles.directory(profile.id);
  let win, socket, decoder, telnet, lines, promptTimer, saveTimer, updateTimer;
  let importScript;
  let engine, Telnet, LineStream, GameConnection, executeInput, echoTriggeredCommand, normalizePreferences, migrateSettings, settings, passwordNext = false;
  let connecting = false, checkForUpdate, updateInfo = null, updateCheck = null, notifiedVersion = '';
  async function checkUpdates() {
    if (updateCheck) return updateCheck;
    updateCheck = checkForUpdate(app.getVersion()).then(info => {
      updateInfo = info;
      if (info && info.version !== notifiedVersion) {
        notifiedVersion = info.version; transmit('update-available', info);
      }
      return info;
    }).finally(() => { updateCheck = null; });
    return updateCheck;
  }
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
  const configPath = () => path.join(profileDirectory, 'settings.json');
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
  function config() { return { ...settings, engine: engine.snapshot(), paused: engine.paused, timerState: engine.timers.state(), profile: { ...profile } }; }
  function validateSettings(data) {
    if (!data || typeof data.host !== 'string' || !/^[a-zA-Z0-9.:-]{1,253}$/.test(data.host)) throw Error('主機格式錯誤');
    if (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535) throw Error('連接埠必須在 1–65535');
    if (data.transport !== undefined && !['auto','telnet','websocket'].includes(data.transport)) throw Error('不支援的連線方式');
    if (!['big5','utf8'].includes(data.encoding)) throw Error('不支援的文字編碼');
  }
  function closeConnection() {
    engine?.timers.stopAll();
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
  const { Engine: EngineClass } = await import('./engine.js');
  ({ importScript } = await import('./import-settings.js'));
  ({ Telnet, LineStream } = await import('./telnet.js'));
  ({ executeInput, echoTriggeredCommand } = await import('./input.js'));
  ({ checkForUpdate } = await import('./updates.js'));
  ({ GameConnection } = await import('./connection.js'));
  ({ normalizePreferences, migrateSettings } = await import('./preferences.js'));
  engine = new EngineClass({
    send: sendCommand, notice, capture: data => shareCapture(data),
    changed: () => { scheduleSave(); transmit('variable-state', { ...engine.variables }); },
    canStartTimers: () => !!socket && !socket.destroyed && !connecting,
    timerChanged: () => transmit('timer-state', engine.timers.state()),
    echo: (text, timerName) => echoTriggeredCommand({ text, passwordPrompt: passwordNext,
      echo: text => transmit(timerName ? 'timer-echo' : 'trigger-echo', timerName ? { text, name: timerName } : text)
    })
  });
  settings = defaults();
  try {
    const loaded = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    validateSettings(loaded); const migrated = migrateSettings({ ...defaults(), ...loaded }); engine.restore(migrated.engine); settings = migrated;
  } catch (e) { if (e.code !== 'ENOENT') dialog.showErrorBox('設定載入失敗', '保留原檔並使用預設設定：' + e.message); }
  win = new BrowserWindow({ width: 1280, height: 850, minWidth: 640, minHeight: 480, backgroundColor: '#101519', title: '風雲再起 — ' + profile.name, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true
  } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('page-title-updated', event => event.preventDefault());
  const session = { window: win, profile, handlers: new Map(), knownTargets: new Set(), ownsTarget: target => engine.captures.some(r => r.target === target) };
  sessions.set(win.webContents.id, session); activeProfiles.set(profile.id, session);
  const handle = (name, fn) => { session.handlers.set(name, fn); registerChannel(name); };
  handle('init', () => config());
  handle('profiles', () => profiles.list().map(p => ({ ...p, open: activeProfiles.has(p.id) || openingProfiles.has(p.id) })));
  handle('new-window', async (data = {}) => {
    let selected;
    if (typeof data.id === 'string') selected = profiles.get(data.id);
    else selected = await profiles.create(data.name);
    const opened = await openProfile(selected); opened.window.focus();
    return { ...selected };
  });
  handle('capture-history', () => [...new Set(engine.captures.map(r => r.target))].map(target => { session.knownTargets.add(target); return sharedCaptures.snapshot(target); }));
  handle('capture-clear', target => {
    if (typeof target !== 'string' || !session.ownsTarget(target) && !session.knownTargets.has(target)) throw Error('找不到此角色的擷取分頁');
    broadcastCapture(sharedCaptures.clear(target)); return true;
  });
  handle('check-updates', () => checkUpdates());
  handle('open-update', async () => {
    if (!updateInfo) throw Error('目前沒有可下載的更新');
    await shell.openExternal(updateInfo.url);
  });
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
  handle('rules', data => { engine.restore(data, { preserveTimers: true }); scheduleSave(); return config(); });
  handle('timer-control', ({ enabled, name } = {}) => {
    if (typeof enabled !== 'boolean' || (name !== undefined && typeof name !== 'string')) throw Error('無效的計時器操作');
    engine.timers.control(enabled, name); return config();
  });
  handle('preferences', data => { settings.preferences = normalizePreferences(data); scheduleSave(); return config(); });
  handle('pause', paused => { engine.paused = !!paused; return engine.paused; });
  handle('resize', ({cols, rows}) => { if (Number.isInteger(cols) && Number.isInteger(rows)) telnet?.resize(cols,rows); });
  handle('export', async () => {
    const result = await dialog.showSaveDialog(win, { defaultPath: 'windcloud-settings.json', filters: [{name: 'JSON', extensions:['json']}] });
    const { timerState, profile: profileMetadata, ...exported } = config(); // Runtime countdowns must never enter settings exports.
    if (!result.canceled) await fs.writeFile(result.filePath, JSON.stringify(exported, null, 2), { mode: 0o600 });
    return !result.canceled;
  });
  handle('import', async () => {
    const result = await dialog.showOpenDialog(win, { properties:['openFile'], filters:[{name:'設定檔／zMUD',extensions:['json','txt','mud']},{name:'JSON',extensions:['json']},{name:'zMUD 設定／文字腳本',extensions:['txt','mud']}] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 2_000_000) throw Error('設定檔超過 2 MB');
    const bytes = await fs.readFile(file);
    if (bytes.length > 2_000_000) throw Error('設定檔超過 2 MB');
    if (path.extname(file).toLowerCase() !== '.json') {
      const imported = importScript(bytes, engine.snapshot()), summary = imported.summary;
      const confirmation = await dialog.showMessageBox(win, { type: 'question', title: '匯入 zMUD 設定',
        message: `將匯入 ${summary.aliases} 個 Alias、${summary.triggers} 個 Trigger、${summary.variables} 個變數、${summary.captures ?? 0} 個新擷取規則（轉換 ${summary.converted ?? 0} 個 #CAP 動作）。`,
        detail: `編碼：${summary.encoding}。同名項目將取代 ${summary.replaced} 項。其他設定與連線位址保留。\n匯入不會執行腳本；Alias／Trigger／擷取規則預設停用，觸發器暫停並斷線。請檢查腳本相容性再啟用。\n${(summary.warnings ?? []).join('\n')}`,
        buttons: ['取消', '匯入'], defaultId: 0, cancelId: 0 });
      if (confirmation.response !== 1) return null;
      engine.restore(imported.engine); closeConnection(); engine.paused = true; scheduleSave(); return config();
    }
    const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); validateSettings(data);
    const migrated = migrateSettings({ ...defaults(), ...data }); engine.restore(migrated.engine); closeConnection(); settings = migrated;
    engine.paused = true; scheduleSave(); return config();
  });
  handle('log', async text => {
    if (typeof text !== 'string' || text.length > 10_000_000) throw Error('紀錄長度超過限制');
    const result = await dialog.showSaveDialog(win, { defaultPath:'windcloud-session.txt', filters:[{name:'文字檔',extensions:['txt']}] });
    if (!result.canceled) await fs.writeFile(result.filePath,text);
  });
  let closing = false;
  win.on('close', event => {
    event.preventDefault(); if (closing) return; closing = true; session.closing = true;
    closeConnection(); clearTimeout(saveTimer); clearInterval(updateTimer);
    save().then(() => win.destroy()).catch(error => {
      closing = false; session.closing = false; dialog.showErrorBox('設定儲存失敗', '視窗保留以避免遺失設定：' + error.message);
    });
  });
  const webContentsId = win.webContents.id;
  win.once('closed', () => { sessions.delete(webContentsId); activeProfiles.delete(profile.id); });
  await win.loadFile(path.join(__dirname, 'index.html'));
  checkUpdates().catch(() => {});
  updateTimer = setInterval(() => checkUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  updateTimer.unref();
  return session;
}

app.whenReady().then(async () => {
  const { SharedCaptures } = await import('./shared-captures.js');
  sharedCaptures = new SharedCaptures();
  profiles = new ProfileStore(app.getPath('userData')); await profiles.load();
  await openProfile(profiles.get('default'));
}).catch(error => { dialog.showErrorBox('啟動失敗', error.message); app.quit(); });
app.on('window-all-closed', () => {
  if (!openingProfiles.size) app.quit();
  else Promise.allSettled([...openingProfiles.values()]).then(() => { if (!sessions.size) app.quit(); });
});
