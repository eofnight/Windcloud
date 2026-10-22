import { argumentsOf, splitCommands, expand } from './parser.js';
import { compilePattern } from './pattern.js';
import { evaluate } from './expression.js';
export class Engine {
  constructor({ send = () => {}, notice = () => {}, capture = () => {} } = {}) {
    this.send = send; this.notice = notice; this.capture = capture;
    this.aliases = []; this.triggers = []; this.captures = []; this.variables = Object.create(null);
    this.groups = Object.create(null); this.paused = false; this.steps = 0;
  }
  snapshot() {
    return structuredClone({ aliases: this.aliases, triggers: this.triggers, captures: this.captures, variables: this.variables, groups: this.groups });
  }
  restore(state) {
    if (!state || typeof state !== 'object') throw Error('無效的設定');
    const aliases = state.aliases ?? [], triggers = state.triggers ?? [], captures = state.captures ?? [];
    if (!Array.isArray(aliases) || !Array.isArray(triggers) || !Array.isArray(captures) || aliases.length + triggers.length + captures.length > 2000) throw Error('無效的規則清單');
    const rules = (list, trigger) => list.map(rule => {
      const key = trigger ? 'pattern' : 'name';
      if (!rule || typeof rule[key] !== 'string' || typeof rule.body !== 'string' || !rule[key] || rule.body.length > 32000) throw Error('規則格式錯誤');
      if (trigger) compilePattern(rule.pattern, state.variables ?? {}, !!rule.caseSensitive);
      else if (!/^[\w-]+$/.test(rule.name)) throw Error('Alias 名稱只能使用英文、數字、底線、連字號');
      splitCommands(rule.body);
      if (rule.group !== undefined && typeof rule.group !== 'string') throw Error('群組格式錯誤');
      return { [key]: rule[key], body: rule.body, group: rule.group || '', enabled: rule.enabled !== false,
        ...(trigger ? { mode: rule.mode === 'prompt' ? 'prompt' : 'line', caseSensitive: !!rule.caseSensitive } : {}) };
    });
    const vars = Object.create(null), groups = Object.create(null);
    for (const [k, v] of Object.entries(state.variables ?? {})) {
      if (!/^\w+$/.test(k) || typeof v !== 'string') throw Error('變數格式錯誤');
      vars[k] = v;
    }
    for (const [k,v] of Object.entries(state.groups ?? {})) groups[k] = !!v;
    const a = rules(aliases, false), t = rules(triggers, true);
    const c = captures.map(rule => {
      validateCapture(rule);
      return { text: rule.text, target: rule.target, enabled: rule.enabled !== false, group: rule.group || '' };
    });
    if (new Set(c.map(rule => rule.target)).size > 64) throw Error('最多可設定 64 個擷取分頁');
    this.aliases = a; this.triggers = t; this.captures = c; this.variables = vars; this.groups = groups;
  }
  active(rule) { return rule.enabled !== false && this.groups[rule.group] !== false; }
  execute(source) {
    this.steps = 0;
    this.run(source, [], false, 0);
  }
  run(source, params, script, depth) {
    if (depth > 24) throw Error('Alias 遞迴過深，已停止');
    for (let raw of splitCommands(source)) {
      // Accept both #CAP {text} tab and the requested #cap【系統】連線精靈： system.
      raw = raw.replace(/^#(un)?cap(?=[^A-Za-z0-9_\s-])/i, '#$1cap ');
      if (++this.steps > 200) throw Error('單次執行超過 200 個指令，已停止');
      const tokens = argumentsOf(raw);
      if (!tokens.length) continue;
      if (raw.startsWith('#')) {
        this.command(raw, tokens, params, depth, script);
        continue;
      }
      const text = script ? expand(raw, this.variables, params) : raw;
      const parsed = argumentsOf(text);
      const alias = this.aliases.find(a => a.name.toLowerCase() === parsed[0]?.value.toLowerCase() && this.active(a));
      if (alias) {
        const values = parsed.slice(1).map(p => p.value);
        const used = [...alias.body.matchAll(/(?<![%~])%(-?\d{1,2})/g)].map(m => Number(m[1]));
        const consumed = used.some(n => n < 0) ? values.length : Math.max(0, ...used);
        const remaining = values.slice(consumed).join(' ');
        // Expansion is once per execution level. Parse the template before interpolation,
        // so server-provided captures cannot introduce new command separators.
        let body = alias.body;
        if (remaining) body += ' ' + remaining.replaceAll(';', '~;');
        this.run(body, values, true, depth + 1);
      } else {
        this.send(text.replace(/~(.)/gs, '$1'));
      }
    }
  }
  command(raw, tokens, params, depth, script) {
    const name = tokens[0].value.toUpperCase();
    const args = tokens.slice(1);
    const value = i => args[i] ? (args[i].quoted ? args[i].value : expand(args[i].value, this.variables, params)) : '';
    const body = i => script ? expand(args[i]?.value ?? '', {}, params) : (args[i]?.value ?? '');
    const requireArgs = n => { if (args.length < n) throw Error(`${name} 缺少參數`); };
    if (name === '#CAP') {
      if (!args.length) { this.notice(this.captures.map(rule => `${rule.text} → ${rule.target}`).join('\n') || '尚無擷取規則'); return; }
      requireArgs(2);
      if (args.length > 2) throw Error('格式：#CAP {觸發文字} {分頁名稱}；含空白時請用大括號');
      const rule = { text: body(0), target: value(1), enabled: true, group: '' };
      validateCapture(rule);
      const next = this.snapshot();
      const index = next.captures.findIndex(c => c.text === rule.text && c.target === rule.target);
      if (index < 0) next.captures.push(rule); else next.captures[index] = rule;
      this.restore(next);
    } else if (name === '#UNCAP') {
      requireArgs(1);
      this.captures = this.captures.filter(rule => !(rule.text === body(0) && (!args[1] || rule.target === value(1))));
    } else if (['#ALIAS', '#AL'].includes(name)) {
      if (!args.length) { this.notice(this.aliases.map(a => `${a.name} → ${a.body}`).join('\n') || '尚無 Alias'); return; }
      if (args.length === 1) { this.notice(this.aliases.find(a => a.name === value(0))?.body ?? '找不到 Alias'); return; }
      const alias = { name: value(0), body: body(1), group: value(2), enabled: true };
      if (!/^[\w-]+$/.test(alias.name)) throw Error('Alias 名稱只能使用英文、數字、底線、連字號');
      splitCommands(alias.body);
      const index = this.aliases.findIndex(a => a.name.toLowerCase() === alias.name.toLowerCase());
      if (index < 0) this.aliases.push(alias); else this.aliases[index] = alias;
    } else if (['#TRIGGER', '#TR', '#ACTION', '#AC'].includes(name)) {
      requireArgs(2);
      const trigger = { pattern: body(0), body: body(1), group: value(2), enabled: true, mode: 'line', caseSensitive: false };
      compilePattern(trigger.pattern, this.variables); splitCommands(trigger.body);
      const index = this.triggers.findIndex(t => t.pattern === trigger.pattern && t.group === trigger.group);
      if (index < 0) this.triggers.push(trigger); else this.triggers[index] = trigger;
    } else if (['#VAR', '#VARIABLE', '#VA'].includes(name)) {
      requireArgs(2);
      const key = value(0);
      if (!/^\w+$/.test(key)) throw Error('變數名稱只能使用英文、數字與底線');
      const rawValue = value(1);
      this.variables[key] = !args[1].quoted && rawValue.startsWith('[') && rawValue.endsWith(']') ? String(evaluate(rawValue.slice(1,-1), this.variables, params)) : rawValue;
    } else if (name === '#T+' || name === '#T-') {
      requireArgs(1); this.groups[value(0)] = name === '#T+';
    } else if (name === '#SHOW' || name === '#SAY') {
      this.notice(args.map((_, i) => value(i)).join(' '));
    } else if (name === '#UNALIAS') {
      requireArgs(1); this.aliases = this.aliases.filter(a => a.name !== value(0));
    } else if (name === '#UNTRIGGER') {
      requireArgs(1); this.triggers = this.triggers.filter(t => t.pattern !== body(0));
    } else if (name === '#UNVAR') {
      requireArgs(1); delete this.variables[value(0)];
    } else if (name === '#SEND') {
      requireArgs(1); this.send(value(0));
    } else if (name === '#IF') {
      requireArgs(2);
      const result = evaluate(args[0].value, this.variables, params);
      const condition = Number.isFinite(Number(result)) ? Number(result) !== 0 : !!result;
      const branch = args[condition ? 1 : 2];
      if (branch) this.run(branch.value, params, true, depth + 1);
    } else if (name === '#MATH') {
      requireArgs(2); const key = value(0);
      if (!/^\w+$/.test(key)) throw Error('變數名稱格式錯誤');
      this.variables[key] = String(evaluate(args[1].value, this.variables, params));
    } else throw Error(`尚未支援 ${name}，指令未送出`);
  }
  receive(line, mode = 'line') {
    if (this.paused) return;
    this.steps = 0;
    if (mode === 'line') {
      const targets = new Set();
      for (const rule of this.captures) {
        if (this.active(rule) && line.includes(rule.text)) targets.add(rule.target);
      }
      for (const target of targets) this.capture({ target, line });
    }
    for (const trigger of [...this.triggers]) {
      if (!this.active(trigger) || (trigger.mode || 'line') !== mode) continue;
      const result = compilePattern(trigger.pattern, this.variables, trigger.caseSensitive).exec(line.slice(0, 16384));
      if (result) this.run(trigger.body, result.slice(1), true, 0);
    }
  }
}

function validateCapture(rule) {
  if (!rule || typeof rule.text !== 'string' || !rule.text.trim() || rule.text.length > 1024 || /[\r\n\0]/.test(rule.text)) throw Error('擷取文字必須為 1–1024 字元的單行文字');
  if (typeof rule.target !== 'string' || !rule.target.trim() || rule.target.length > 40 || /[\x00-\x1f\x7f]/.test(rule.target)) throw Error('分頁名稱必須為 1–40 字元，且不能包含控制字元');
  if (rule.group !== undefined && typeof rule.group !== 'string') throw Error('群組格式錯誤');
}
