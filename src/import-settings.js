import iconv from 'iconv-lite';
import { argumentsOf, splitCommands } from './parser.js';
import { Engine } from './engine.js';
import { readLegacyMud } from './legacy-mud.js';

const binaryMessage = '無法辨識此二進位 .mud 版本，請先在 zMUD 匯出純文字腳本（.txt）後匯入。';
export function decodeScript(bytes) {
  const buffer = Buffer.from(bytes);
  let text, encoding;
  try {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) { text = new TextDecoder('utf-16le', { fatal: true }).decode(buffer); encoding = 'UTF-16LE'; }
    else if (buffer[0] === 0xfe && buffer[1] === 0xff) { text = new TextDecoder('utf-16be', { fatal: true }).decode(buffer); encoding = 'UTF-16BE'; }
    else { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); encoding = 'UTF-8'; }
  } catch {
    text = iconv.decode(buffer, 'big5'); encoding = 'Big5';
    if (!iconv.encode(text, 'big5').equals(buffer)) throw Error('文字編碼無法辨識；請另存為 UTF-8 後匯入。');
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw Error(binaryMessage);
  return { text: text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), encoding };
}

// Parse definitions as data. Never run an imported script, even in a temporary engine.
export function importScript(bytes, current) {
  if (bytes.length > 2_000_000) throw Error('設定檔超過 2 MB');
  const buffer = Buffer.from(bytes);
  const utf16 = (buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff);
  if (buffer.includes(0) && !utf16) return importBinaryMud(buffer, current);
  const { text, encoding } = decodeScript(bytes);
  const candidate = structuredClone(current);
  candidate.aliases ??= []; candidate.triggers ??= []; candidate.variables ??= {};
  let aliases = 0, triggers = 0, variables = 0, replaced = 0;
  const commands = splitCommands(text);
  if (!commands.length) throw Error('檔案沒有可匯入的規則。');
  for (const source of commands) {
    const tokens = argumentsOf(source), name = tokens[0]?.value.toUpperCase(), args = tokens.slice(1).map(t => t.value);
    if (name === '#NOP') continue;
    const alias = ['#ALIAS', '#AL'].includes(name), trigger = ['#TRIGGER', '#TRI', '#TR', '#ACTION', '#AC'].includes(name);
    const variable = ['#VAR', '#VARIABLE', '#VA'].includes(name);
    if (!alias && !trigger && !variable) throw Error(`不支援匯入的設定項目：${name || '未知'}。僅接受 Alias、Trigger、變數與 #NOP 註解；檔案未套用。`);
    if (args.length < 2 || args.length > (variable ? 2 : 3)) throw Error(`${name} 參數格式不支援；檔案未套用。`);
    if (variable) {
      if (!/^\w+$/.test(args[0])) throw Error('變數名稱只能使用英文、數字與底線');
      if (Object.hasOwn(candidate.variables, args[0])) replaced++;
      Object.defineProperty(candidate.variables, args[0], { value: args[1], enumerable: true, writable: true, configurable: true });
      variables++;
    } else {
      const list = alias ? candidate.aliases : candidate.triggers;
      const key = alias ? 'name' : 'pattern';
      const rule = { [key]: args[0], body: args[1], group: args[2] || '', enabled: false,
        ...(trigger ? { mode: 'line', caseSensitive: false } : {}) };
      const index = list.findIndex(r => alias ? r.name.toLowerCase() === rule.name.toLowerCase() : r.pattern === rule.pattern && r.group === rule.group);
      if (index >= 0) { list[index] = rule; replaced++; } else list.push(rule);
      if (alias) aliases++; else triggers++;
    }
  }
  if (!aliases && !triggers && !variables) throw Error('檔案沒有可匯入的規則。');
  const validation = new Engine(); validation.restore(candidate);
  return { engine: validation.snapshot(), summary: { aliases, triggers, variables, replaced, encoding } };
}

export function importBinaryMud(bytes, current) {
  if (bytes.length > 2_000_000) throw Error('設定檔超過 2 MB');
  const parsed = readLegacyMud(bytes), candidate = structuredClone(current);
  candidate.aliases ??= []; candidate.triggers ??= []; candidate.variables ??= {};
  const summary = { aliases: 0, triggers: 0, variables: 0, replaced: 0, encoding: parsed.encoding, warnings: [] };
  if (parsed.shortcuts) summary.warnings.push(`未匯入 ${parsed.shortcuts} 個舊版快捷鍵。`);
  if (parsed.trailingBytes) summary.warnings.push(`未匯入尾端 ${parsed.trailingBytes} bytes 的尚未解析的設定資料。`);
  for (const [index, definition] of parsed.definitions.entries()) {
    const next = structuredClone(candidate), { type, name, body, group } = definition;
    try {
      if (type === 'variable') {
        if (!/^\w+$/.test(name)) throw Error('變數名稱格式不支援');
        Object.defineProperty(next.variables, name, { value: body, enumerable: true, writable: true, configurable: true });
      } else {
        const list = type === 'alias' ? next.aliases : next.triggers;
        const rule = type === 'alias' ? { name, body, group, enabled: false } : { pattern: name, body, group, enabled: false, mode: 'line', caseSensitive: false };
        const match = list.findIndex(r => type === 'alias' ? r.name.toLowerCase() === name.toLowerCase() : r.pattern === name && r.group === group);
        if (match < 0) list.push(rule); else list[match] = rule;
      }
      const validation = new Engine(); validation.restore(next);
      if (type === 'variable' ? Object.hasOwn(candidate.variables, name) : (type === 'alias' ? candidate.aliases : candidate.triggers).some(r => type === 'alias' ? r.name.toLowerCase() === name.toLowerCase() : r.pattern === name && r.group === group)) summary.replaced++;
      Object.assign(candidate, validation.snapshot()); summary[type === 'alias' ? 'aliases' : type === 'trigger' ? 'triggers' : 'variables']++;
    } catch (error) { summary.warnings.push(`第 ${index + 1} 項未匯入：${error.message}`); }
  }
  if (!summary.aliases && !summary.triggers && !summary.variables) throw Error('此 .mud 沒有能匯入的規則；未變更任何設定。');
  const reviewCommands = new Set();
  for (const d of parsed.definitions) if (d.type !== 'variable') {
    for (const match of d.body.matchAll(/#(?:\d+|[A-Za-z]+)[+-]?/g)) {
      const name = match[0].toUpperCase();
      if (/^#\d/.test(name) || ['#TS', '#ALARM', '#GAG', '#COLOR', '#CAP'].includes(name)) reviewCommands.add(name);
    }
  }
  if (reviewCommands.size) summary.warnings.push(`腳本需人工檢查：${[...reviewCommands].join('、')} 等命令可能不支援，或與 zMUD 語意不同；未自動轉換。`);
  summary.warnings.push('只轉入規則與變數；原版的腳本語意、觸發旗標與預設變數值不保證完全相容。');
  return { engine: candidate, summary };
}
