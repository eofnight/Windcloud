import { handleTerminalKey } from './keyboard.js';
import { prepareInput } from './input.js';
import { CaptureLog } from './capture-log.js';
import { installMudUnicode } from './mud-unicode.js';
import { TerminalOutput } from './terminal-output.js';
import { COLOR_FIELDS, CLASSIC_COLORS, SOFT_COLORS, normalizePreferences, terminalTheme } from './preferences.js';
const $ = id => document.getElementById(id);
const term = new window.Terminal({ fontFamily:'"Windcloud Mono", Menlo, Consolas, monospace', allowProposedApi:true, customGlyphs:false, rescaleOverlappingGlyphs:true, fontSize:14, lineHeight:1, scrollback:5000, convertEol:true, disableStdin:true, drawBoldTextInBrightColors:true,theme:terminalTheme(normalizePreferences()) });
installMudUnicode(term);
const fit = new window.FitAddon.FitAddon(); term.loadAddon(fit); term.open($('terminal'));
const output = new TerminalOutput();
let preferences = normalizePreferences(), colorDraft, panelOpen = false, resizeFrame = 0;
const measure = document.createElement('canvas').getContext('2d');
let activeView = null;
const captureViews = new Map();
let config, tab = 'aliases', editIndex = -1, history = [], historyIndex = 0, log = '', secretFromServer = false;
function status(text) { $('status').textContent = text; }
function error(e) { status(e.message); term.write(output.local('[錯誤] ' + e.message, preferences.colors.error)); }
function clean(text) { return String(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,''); }
async function call(name, data) { return window.mud.call(name,data); }
let fontReady = false;
function resize() {
  if (!fontReady) return;
  if (activeView !== null) return;
  try {
    const frame = $('terminal-frame');
    measure.font = `${preferences.fontSize}px ${term.options.fontFamily}`;
    const cell = Math.ceil(measure.measureText('W').width * 1000) / 1000;
    $('terminal').style.width = Math.max(frame.clientWidth - 24, Math.ceil(cell * preferences.columns + 24)) + 'px';
    const dimensions = fit.proposeDimensions();
    if (!dimensions) return;
    if (term.cols !== preferences.columns || term.rows !== dimensions.rows) term.resize(preferences.columns, Math.max(2, dimensions.rows));
    call('resize', {cols:term.cols, rows:term.rows}).catch(error);
  } catch (e) { status(e.message); }
}
function scheduleResize() { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(resize); }
new ResizeObserver(scheduleResize).observe($('terminal-frame'));
document.fonts.load('14px \"Windcloud Mono\"').then(() => { fontReady = true; scheduleResize(); }).catch(error);
function applyPreferences(value) {
  preferences = normalizePreferences(value);
  term.options.theme = terminalTheme(preferences);
  term.options.fontSize = preferences.fontSize;
  term.options.drawBoldTextInBrightColors = preferences.boldAsBright;
  document.documentElement.style.setProperty('--terminal-bg', preferences.colors.background);
  document.documentElement.style.setProperty('--terminal-fg', preferences.colors.foreground);
  $('status-bar').hidden = !preferences.showConnectionInfo;
  $('show-connection-info').checked = preferences.showConnectionInfo;
  for (const record of captureViews.values()) record.pane.style.fontSize = preferences.fontSize + 'px';
  scheduleResize();
}
function setPanel(open, nextTab = tab) {
  panelOpen = open; tab = nextTab;
  $('rules-panel').hidden = !open;
  document.querySelectorAll('[data-panel]').forEach(button => {
    const active = open && button.dataset.panel === tab;
    button.classList.toggle('active', active); button.setAttribute('aria-expanded', String(active));
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  if (config) render();
}
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => setPanel(!(panelOpen && tab === button.dataset.panel), button.dataset.panel);
$('close-panel').onclick = () => { setPanel(false); document.querySelector(`[data-panel="${tab}"]`).focus(); };
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panelOpen && !document.querySelector('dialog[open]')) setPanel(false);
});
function ensureCapture(target) {
  if (captureViews.has(target)) return captureViews.get(target);
  const button = document.createElement('button');
  button.type = 'button'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', 'false');
  const pane = document.createElement('pre');
  pane.className = 'capture-pane'; pane.style.fontSize = preferences.fontSize + 'px'; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-label', target); pane.hidden = true;
  const id = 'capture-' + captureViews.size;
  pane.id = id; button.setAttribute('aria-controls', id); button.id = id + '-tab'; pane.setAttribute('aria-labelledby', button.id);
  const record = { button, pane, log: new CaptureLog() };
  captureViews.set(target, record); button.onclick = () => selectView(target);
  $('output-tabs').append(button); $('capture-views').append(pane); updateCaptureLabel(target);
  return record;
}
function updateCaptureLabel(target) {
  const record = captureViews.get(target);
  record.button.textContent = target + (record.log.unread ? ` (${record.log.unread})` : '');
}
function selectView(target) {
  activeView = target;
  $('terminal-frame').hidden = target !== null; $('capture-views').hidden = target === null;
  $('game-tab').classList.toggle('active', target === null); $('game-tab').setAttribute('aria-selected', String(target === null));
  $('view-title').textContent = target === null ? '遊戲終端' : target + ' · 擷取紀錄';
  if (target !== null) $('welcome').hidden = true;
  for (const [name, record] of captureViews) {
    const selected = name === target;
    record.pane.hidden = !selected; record.button.classList.toggle('active', selected); record.button.setAttribute('aria-selected', String(selected));
    if (selected) { record.log.read(); record.pane.scrollTop = record.pane.scrollHeight; updateCaptureLabel(name); }
  }
  if (target === null) requestAnimationFrame(resize);
}
$('game-tab').onclick = () => selectView(null);
function render() {
  for (const rule of config.engine.captures) ensureCapture(rule.target);
  $('capture-count').textContent = config.engine.captures.length;
  $('alias-count').textContent = config.engine.aliases.length; $('trigger-count').textContent = config.engine.triggers.length;
  const labels = {aliases:'Alias',triggers:'Trigger',variables:'變數',captures:'擷取規則'};
  $('add-rule').textContent = '＋ 新增 ' + labels[tab];
  $('rules').replaceChildren();
  const list = tab === 'variables' ? Object.entries(config.engine.variables).map(([name,body])=>({name,body})) : config.engine[tab];
  if (!list.length) {
    const empty = document.createElement('div'); empty.className='empty';
    const heading = document.createElement('strong'); heading.textContent='建立你的第一個 ' + labels[tab];
    const p = document.createElement('span'); p.textContent = tab === 'aliases' ? '把常用的操作，縮成一個簡單指令。' : tab === 'triggers' ? '收到符合條件的文字時，自動執行指定指令。' : tab === 'captures' ? '符合的完整文字行會另外記錄到指定分頁。' : '讓不同指令共用同一份設定值。';
    const code = document.createElement('code'); code.textContent = tab === 'aliases' ? '#ALIAS kk {kill %1;kick %1}' : tab === 'triggers' ? '#TRIGGER {You get (%d) coins} {split %1}' : tab === 'captures' ? '#CAP {【系統】連線精靈：} system' : '#VAR container waterskin';
    empty.append(heading,p,code); $('rules').append(empty);
  }
  list.forEach((rule,index) => {
    const row=document.createElement('div'); row.className='rule' + (rule.enabled === false || (config.engine.groups[rule.group] === false || (tab === 'triggers' && config.engine.triggerGroups?.[rule.group] === false)) ? ' off':'');
    const top=document.createElement('div'); top.className='rule-top';
    if(tab!=='variables') {
      const enabled=document.createElement('input'); enabled.type='checkbox'; enabled.checked=rule.enabled!==false; enabled.setAttribute('aria-label','啟用規則');
      enabled.onchange=async()=>{ const next=structuredClone(config.engine); next[tab][index].enabled=enabled.checked; await saveRules(next); }; top.append(enabled);
    }
    const title=document.createElement('strong'); title.textContent=rule.pattern||rule.text||rule.name; top.append(title);
    const body=document.createElement('div'); body.className='rule-body'; body.textContent=tab==='captures'?'→ '+rule.target:rule.body;
    const actions=document.createElement('div'); actions.className='rule-actions';
    const group=document.createElement('span'); group.textContent=rule.group ? `${rule.group}${(config.engine.groups[rule.group]===false || (tab==='triggers' && config.engine.triggerGroups?.[rule.group]===false))?' · 已停用':''}` : '未分組';
    const edit=document.createElement('button'); edit.textContent='編輯'; edit.onclick=()=>openEditor(index);
    const remove=document.createElement('button'); remove.textContent='刪除'; remove.onclick=async()=>{
      const next=structuredClone(config.engine); if(tab==='variables') delete next.variables[rule.name]; else next[tab].splice(index,1); await saveRules(next);
    };
    actions.append(group,edit,remove); row.append(top,body,actions); $('rules').append(row);
  });
  $('pause').textContent=config.paused?'恢復觸發器':'暫停觸發器'; document.body.classList.toggle('paused',config.paused);
}
async function saveRules(next) { try { config=await call('rules',next); render(); status('規則已更新，自動儲存。'); } catch(e) {error(e); render();} }
function loadConfig(data) { config=data; $('host').value=data.host; $('port').value=data.port; $('encoding').value=data.encoding; $('transport').value=data.transport||'websocket'; applyPreferences(data.preferences); updateConnectionFields(); render(); }
function openEditor(index=-1) {
  editIndex=index;
  const list=tab==='variables'?Object.entries(config.engine.variables).map(([name,body])=>({name,body})):config.engine[tab];
  const rule=list[index]||{};
  $('editor-title').textContent=(index<0?'新增 ':'編輯 ')+({aliases:'Alias',triggers:'Trigger',variables:'變數',captures:'擷取規則'})[tab];
  $('key-label').firstChild.textContent=tab==='triggers'?'比對式':tab==='captures'?'觸發文字（包含即符合）':'名稱';
  $('body-label').firstChild.textContent=tab==='variables'?'值':tab==='captures'?'分頁名稱':'執行內容';
  $('rule-key').value=rule.pattern||rule.text||rule.name||''; $('rule-body').value=(tab==='captures'?rule.target:rule.body)||''; $('rule-body').rows=tab==='captures'?1:5; $('rule-group').value=rule.group||'';
  $('rule-mode').value=rule.mode||'line'; $('rule-case').checked=!!rule.caseSensitive;
  $('trigger-options').hidden=tab!=='triggers'; $('group-label').hidden=tab==='variables';
  $('editor-hint').textContent=tab==='triggers'?'使用 zMUD 比對式，例如 ^You get (%d) coins，擷取結果用 %1。執行內容以 ; 串接；#wa 1000;pp 表示等一秒後執行 pp。':tab==='aliases'?'例如名稱 kk，執行內容 kill %1;kick %1。可用 #wa 1000;pp 等一秒後執行 pp。變數在執行時展開。':tab==='captures'?'逐字比對伺服器訊息，擷取符合的完整文字行；主終端也會保留原訊息。':'變數名稱使用英文、數字與底線。在腳本內用 @名稱 取用。';
  $('editor-error').textContent=''; $('editor').showModal(); $('rule-key').focus();
}
$('rule-form').onsubmit=async event=>{
  event.preventDefault(); const next=structuredClone(config.engine), key=$('rule-key').value.trim(), body=$('rule-body').value;
  if(tab==='variables') {
    const old=Object.keys(next.variables)[editIndex]; if(old) delete next.variables[old]; next.variables[key]=body;
  } else {
    const rule={ ...(tab==='captures'?{text:key,target:body.trim()}:{[tab==='triggers'?'pattern':'name']:key,body}), group:$('rule-group').value.trim(), enabled:editIndex<0?true:next[tab][editIndex].enabled };
    if(tab==='triggers') Object.assign(rule,{mode:$('rule-mode').value,caseSensitive:$('rule-case').checked});
    const duplicate=next[tab].findIndex((r,i)=>i!==editIndex && (tab==='aliases'?r.name.toLowerCase()===key.toLowerCase():tab==='captures'?r.text===key&&r.target===rule.target:r.pattern===key&&r.group===rule.group));
    if(duplicate>=0) { $('editor-error').textContent='已有相同名稱或比對式的規則，請編輯現有規則。'; return; }
    if(editIndex<0) next[tab].push(rule); else next[tab][editIndex]=rule;
  }
  try { config=await call('rules',next); render(); $('editor').close(); status('規則已儲存。'); } catch(e) { $('editor-error').textContent=e.message; }
};
$('cancel').onclick=()=>$('editor').close(); $('add-rule').onclick=()=>openEditor();
for(const button of document.querySelectorAll('[data-tab]')) button.onclick=()=>{
  setPanel(true, button.dataset.tab);
};
$('connect').onclick=async()=>{try{await call('connect',{host:$('host').value.trim(),port:Number($('port').value),encoding:$('encoding').value,transport:$('transport').value});}catch(e){error(e);}};
$('disconnect').onclick=()=>call('disconnect').catch(error);
$('pause').onclick=async()=>{try{config.paused=await call('pause',!config.paused);render();}catch(e){error(e);}};
$('clear').onclick=()=>{if(activeView===null)term.clear();else{const record=captureViews.get(activeView);record.log.clear();record.pane.textContent='';updateCaptureLabel(activeView);}status('已清除目前分頁。');};
$('export').onclick=()=>call('export').then(saved=>status(saved?'設定已匯出。':'已取消匯出。')).catch(error);
$('import').onclick=()=>call('import').then(data=>{if(data){loadConfig(data);status('已匯入設定；觸發器已暫停，請檢查後恢復。');}}).catch(error);
$('save-log').onclick=()=>call('log',activeView===null?log:captureViews.get(activeView).log.text()).catch(error);
function secretMode() { return $('secret').checked||secretFromServer; }
function updateSecret() { $('command').type=secretMode()?'password':'text'; $('command').placeholder=secretMode()?'密碼輸入':'輸入指令…'; }
$('secret').onchange=updateSecret;
$('command-form').onsubmit=async event=>{
  event.preventDefault(); const input=$('command'),text=input.value;
  const secret=secretMode();
  prepareInput(input, secret);
  try {
    const result=await call('execute',{text,secret}); config=result.config;
    if(result.secret) { if(input.value===text)input.value=''; }
    else if(text){history.push(text);if(history.length>100)history.shift();historyIndex=history.length;}
    render();
  }catch(e){error(e);}
};
document.addEventListener('keydown', event => {
  const handled = handleTerminalKey(event, {
    input:$('command'), inTerminal:!!event.target?.closest?.('#terminal'), dialogOpen:!!document.querySelector('dialog[open]'),
    scrollPage: direction => {
      if (activeView === null) term.scrollPages(direction);
      else { const pane=captureViews.get(activeView).pane; pane.scrollTop += direction * Math.max(1,pane.clientHeight * 0.9); }
    }
  });
  if (handled && event.key === 'Escape') historyIndex=history.length;
}, true);
$('command').onkeydown=event=>{
  if(event.isComposing||secretMode())return;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
    event.preventDefault();historyIndex=Math.max(0,Math.min(history.length,historyIndex+(event.key==='ArrowUp'?-1:1)));$('command').value=history[historyIndex]||'';
  }else if(event.key==='Tab'){
    const alias=config.engine.aliases.find(a=>a.name.toLowerCase()===$('command').value.trim().toLowerCase());
    if(alias){event.preventDefault();$('command').value=alias.body;}
  }
};
function echoCommand(text, prefix = '› ') {
  $('welcome').hidden = true;
  const echo = output.local(prefix + text, preferences.colors.command);
  term.write(echo); log = (log + echo).slice(-2_000_000);
}
window.mud.on('command-echo', text => echoCommand(text));
window.mud.on('trigger-echo', text => echoCommand(text, '觸發 › '));
window.mud.on('capture', ({target, line}) => {
  const record = ensureCapture(target), active = activeView === target;
  const previousScroll = record.pane.scrollTop;
  const atBottom = previousScroll + record.pane.clientHeight >= record.pane.scrollHeight - 24;
  record.log.append(clean(line), active); record.pane.textContent = record.log.text();
  record.pane.scrollTop = active && atBottom ? record.pane.scrollHeight : previousScroll;
  updateCaptureLabel(target);
});
window.mud.on('output',text=>{ $('welcome').hidden=true; term.write(output.server(text)); log=(log+text).slice(-2_000_000); });
window.mud.on('notice',text=>{term.write(output.local('[系統] '+text, preferences.colors.info));status(text);});
window.mud.on('echo',enabled=>{secretFromServer=!enabled;updateSecret();});
window.mud.on('connection',value=>{
  const names={disconnected:'尚未連線',connecting:'連線中…',connected:'已連線'};
  $('connection-state').textContent=names[value];$('indicator').className=value;
  $('connect').disabled=value!=='disconnected';$('disconnect').disabled=value==='disconnected';
  for(const id of ['host','port','encoding','transport'])$(id).disabled=value!=='disconnected';
  if(value==='connecting'){output.reset();term.write('\x1b[0m');}
  status(names[value]);if(value==='connected'){$('welcome').hidden=true;$('command').focus();resize();}
});
window.mud.on('connection-info', text => status(text));
function closeMenu() { $('settings-menu').open = false; }
$('show-connection-info').onchange = async () => {
  const next = {...preferences, showConnectionInfo:$('show-connection-info').checked};
  try { config = await call('preferences', next); applyPreferences(config.preferences); }
  catch(e) { applyPreferences(config.preferences); error(e); }
};
function updateConnectionFields() {
  const web = $('transport').value === 'websocket';
  $('direct-settings').hidden = web; $('gateway-label').hidden = !web;
}
$('transport').onchange = updateConnectionFields;
$('open-connection').onclick = () => { closeMenu(); $('connection-settings').showModal(); };
$('close-connection').onclick = () => $('connection-settings').close();
$('connection-form').onsubmit = event => { event.preventDefault(); $('connection-settings').close(); };
function fillAppearance(value) {
  colorDraft = normalizePreferences(value);
  $('font-size').value = colorDraft.fontSize; $('terminal-columns').value = colorDraft.columns;
  $('bold-as-bright').checked = colorDraft.boldAsBright;
  $('color-fields').replaceChildren();
  for (const [key, name] of COLOR_FIELDS) {
    const label = document.createElement('label'); label.className='color-label'; label.textContent=name;
    const input = document.createElement('input'); input.type='color'; input.value=colorDraft.colors[key]; input.setAttribute('aria-label',name);
    input.oninput = () => { colorDraft.colors[key]=input.value; applyPreferences(colorDraft); };
    label.append(input); $('color-fields').append(label);
  }
}
$('open-appearance').onclick = () => { closeMenu(); fillAppearance(config.preferences); $('appearance-error').textContent=''; $('appearance').showModal(); };
function cancelAppearance() { applyPreferences(config.preferences); $('appearance').close(); }
$('cancel-appearance').onclick = cancelAppearance;
$('appearance').addEventListener('cancel', () => applyPreferences(config.preferences));
$('classic-colors').onclick = () => { fillAppearance({...colorDraft,colors:CLASSIC_COLORS}); applyPreferences(colorDraft); };
$('soft-colors').onclick = () => { fillAppearance({...colorDraft,colors:SOFT_COLORS}); applyPreferences(colorDraft); };
for (const id of ['font-size','terminal-columns','bold-as-bright']) $(id).oninput = () => {
  try { colorDraft=normalizePreferences({...colorDraft,fontSize:Number($('font-size').value),columns:Number($('terminal-columns').value),boldAsBright:$('bold-as-bright').checked}); applyPreferences(colorDraft); $('appearance-error').textContent=''; }
  catch(e) { $('appearance-error').textContent=e.message; }
};
$('appearance-form').onsubmit = async event => {
  event.preventDefault();
  try {
    const next=normalizePreferences({...colorDraft,fontSize:Number($('font-size').value),columns:Number($('terminal-columns').value),boldAsBright:$('bold-as-bright').checked});
    config=await call('preferences',next); applyPreferences(config.preferences); $('appearance').close();
  } catch(e) { $('appearance-error').textContent=e.message; }
};
let dismissedUpdate = '';
function showUpdate(info, force = false) {
  if (!info || (!force && info.version === dismissedUpdate)) return;
  $('update-message').textContent = `有新版本 ${info.version} 可用。`;
  $('update-notice').hidden = false;
  $('update-notice').dataset.version = info.version;
}
window.mud.on('update-available', info => showUpdate(info));
$('dismiss-update').onclick = () => { dismissedUpdate=$('update-notice').dataset.version; $('update-notice').hidden=true; };
$('download-update').onclick = () => call('open-update').catch(error);
$('check-updates').onclick = async () => {
  closeMenu(); $('check-updates').disabled=true;
  try {
    const info=await call('check-updates');
    if (info) showUpdate(info,true);
    else { $('update-notice').hidden=true; term.write(output.local('[系統] 目前已是最新版本。',preferences.colors.info)); }
  } catch(e) { error(e); }
  finally { $('check-updates').disabled=false; }
};
call('init').then(loadConfig).catch(error);
