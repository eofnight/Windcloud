import { argumentsOf, splitCommands, expand } from './parser.js';
import { compilePattern } from './pattern.js';
import { Timers, validateTimers } from './timers.js';
import { evaluate } from './expression.js';
export class Engine {
  constructor({ send = () => {}, notice = () => {}, capture = () => {}, changed = () => {}, echo = () => {}, timerChanged = () => {}, canStartTimers = () => false } = {}) {
    this.send = send; this.notice = notice; this.capture = capture; this.changed = changed; this.echo = echo;
    this.pendingWait = null;
    this.timers = new Timers({ canStart: canStartTimers, changed: timerChanged,
      stopped: name => { if (this.pendingWait?.context?.timerName === name) this.cancelPending(); },
      fire: rule => {
        const context = { budget: { steps: 0 }, trigger: true, timerName: rule.name };
        try { this.advance(this.run(rule.body, [], true, 0, context), false, context); }
        catch (error) { this.timerError(rule.name, error); }
        this.changed();
      }
    });
    this.aliases = []; this.triggers = []; this.captures = []; this.variables = Object.create(null);
    this.groups = Object.create(null); this.triggerGroups = Object.create(null); this.paused = false;
  }
  timerError(name, error) {
    this.timers.stop(name);
    this.notice(`計時器「${name}」錯誤：${error.message}`);
  }
  get paused() { return this._paused; }
  set paused(value) { this._paused = !!value; if (this._paused && !this.pendingWait?.context?.timerName) this.cancelPending(); }
  cancelPending() {
    const pending = this.pendingWait;
    this.pendingWait = null;
    if (pending) { clearTimeout(pending.timer); pending.iterator.return(); }
  }
  advance(iterator, deferred = false, context) {
    try {
      const next = iterator.next();
      if (!next.done) {
        // Legacy zMUD has a single WAIT queue. A new WAIT replaces the old one.
        this.cancelPending();
        const pending = { iterator, timer: null, milliseconds: next.value, context };
        this.pendingWait = pending;
        if (next.value !== null) pending.timer = setTimeout(() => this.resume(pending), next.value);
      }
    } catch (error) {
      if (!deferred) throw error;
      if (context?.timerName) this.timerError(context.timerName, error);
      else this.notice('延遲指令錯誤：' + error.message);
    } finally { if (deferred) this.changed(); }
  }
  resume(pending = this.pendingWait) {
    if (!pending || pending !== this.pendingWait) return;
    clearTimeout(pending.timer); this.pendingWait = null;
    this.advance(pending.iterator, true, pending.context);
  }
  snapshot() {
    return structuredClone({ aliases: this.aliases, triggers: this.triggers, captures: this.captures, variables: this.variables, groups: this.groups, triggerGroups: this.triggerGroups, timers: this.timers.rules });
  }
  restore(state, { preserveTimers = false } = {}) {
    if (!state || typeof state !== 'object') throw Error('無效的設定');
    const timers = validateTimers(state.timers);
    for (const rule of timers) splitCommands(rule.body);
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
    const vars = Object.create(null), groups = Object.create(null), triggerGroups = Object.create(null);
    for (const [k, v] of Object.entries(state.variables ?? {})) {
      if (!/^\w+$/.test(k) || typeof v !== 'string') throw Error('變數格式錯誤');
      vars[k] = v;
    }
    for (const [k,v] of Object.entries(state.groups ?? {})) groups[k] = !!v;
    for (const [k,v] of Object.entries(state.triggerGroups ?? {})) triggerGroups[k] = !!v;
    const a = rules(aliases, false), t = rules(triggers, true);
    const c = captures.map(rule => {
      validateCapture(rule);
      if (rule.match === 'pattern') compilePattern(rule.text, state.variables ?? {}, !!rule.caseSensitive);
      return { text: rule.text, target: rule.target, enabled: rule.enabled !== false, group: rule.group || '',
        ...(rule.match === 'pattern' ? { match: 'pattern', caseSensitive: !!rule.caseSensitive } : {}) };
    });
    if (new Set(c.map(rule => rule.target)).size > 64) throw Error('最多可設定 64 個擷取分頁');
    const pendingName = this.pendingWait?.context?.timerName;
    const keepWait = preserveTimers && pendingName && JSON.stringify(this.timers.rules.find(r => r.name === pendingName)) === JSON.stringify(timers.find(r => r.name === pendingName));
    if (!keepWait) this.cancelPending();
    this.timers.replace(timers, preserveTimers);
    this.aliases = a; this.triggers = t; this.captures = c; this.variables = vars; this.groups = groups; this.triggerGroups = triggerGroups;
  }
  active(rule, trigger = false) { return rule.enabled !== false && this.groups[rule.group] !== false && (!trigger || this.triggerGroups[rule.group] !== false); }
  dispatch(text, context) { if (context.trigger) this.echo(text, context.timerName); this.send(text); }
  execute(source) {
    const context = { budget: { steps: 0 }, trigger: false };
    this.advance(this.run(source, [], false, 0, context), false, context);
  }
  *run(source, params, script, depth, context) {
    if (depth > 24) throw Error('Alias 遞迴過深，已停止');
    for (let raw of splitCommands(source)) {
      // Accept both #CAP {text} tab and the requested #cap【系統】連線精靈： system.
      raw = raw.replace(/^#(un)?cap(?=[^A-Za-z0-9_\s-])/i, '#$1cap ');
      if (++context.budget.steps > 200) throw Error('單次執行超過 200 個指令，已停止');
      const tokens = argumentsOf(raw);
      if (!tokens.length) continue;
      if (raw.startsWith('#')) {
        yield* this.command(raw, tokens, params, depth, script, context);
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
        yield* this.run(body, values, true, depth + 1, context);
      } else {
        this.dispatch(text.replace(/~(.)/gs, '$1'), context);
      }
    }
  }
  *command(raw, tokens, params, depth, script, context) {
    const name = tokens[0].value.toUpperCase();
    const args = tokens.slice(1);
    const value = i => args[i] ? (args[i].quoted ? args[i].value : expand(args[i].value, this.variables, params)) : '';
    const body = i => script ? expand(args[i]?.value ?? '', {}, params) : (args[i]?.value ?? '');
    const requireArgs = n => { if (args.length < n) throw Error(`${name} 缺少參數`); };
    if (name === '#WA' || name === '#WAIT') {
      if (args.length > 1) throw Error('格式：#WA [毫秒]');
      const duration = args.length ? value(0) : null;
      if (duration !== null && (!/^\d+$/.test(duration) || !Number.isSafeInteger(Number(duration)) || Number(duration) > 2147483647)) throw Error('等待時間必須為 0–2147483647 的整數毫秒');
      yield duration === null ? null : Number(duration);
    } else if (name === '#TI+' || name === '#TI-') {
      if (args.length > 1 || (args.length && !value(0).trim())) throw Error('格式：#ti+ [計時器名稱] 或 #ti- [計時器名稱]');
      this.timers.control(name === '#TI+', args.length ? value(0) : undefined);
    } else if (name === '#CAP') {
      if (!args.length) { this.notice(this.captures.map(rule => `${rule.text} → ${rule.target}`).join('\n') || '尚無擷取規則'); return; }
      requireArgs(2);
      if (args.length > 2) throw Error('格式：#CAP {觸發文字} {分頁名稱}；含空白時請用大括號');
      const rule = { text: body(0), target: value(1), enabled: true, group: '' };
      validateCapture(rule);
      const next = this.snapshot();
      const index = next.captures.findIndex(c => c.text === rule.text && c.target === rule.target && c.match !== 'pattern');
      if (index < 0) next.captures.push(rule); else next.captures[index] = rule;
      this.restore(next, { preserveTimers: true });
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
    } else if (['#TRIGGER', '#TRI', '#TR', '#ACTION', '#AC'].includes(name)) {
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
    } else if (name === '#ADD') {
      requireArgs(2);
      const key = value(0);
      if (!/^\w+$/.test(key)) throw Error('變數名稱只能使用英文、數字與底線');
      const numeric = raw => {
        const text = String(raw).trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) throw Error('#ADD 需要有效數字');
        const number = Number(text);
        if (Number.isInteger(number) && !Number.isSafeInteger(number)) throw Error('#ADD 數值超過安全範圍');
        return number;
      };
      let sum = Object.hasOwn(this.variables, key) ? numeric(this.variables[key]) : 0;
      const increments = args.slice(1).map((_, i) => numeric(value(i + 1)));
      for (const increment of increments) {
        sum += increment;
        if (!Number.isFinite(sum) || (Number.isInteger(sum) && !Number.isSafeInteger(sum))) throw Error('#ADD 運算結果超過安全數值範圍');
      }
      this.variables[key] = String(sum);
      this.changed();
    } else if (/^#(?:TR|TRI|TRIGGER)[+-]$/.test(name)) {
      requireArgs(1);
      if (args.length !== 1 || !value(0).trim()) throw Error('格式：#TR+ {群組} 或 #TR- {群組}');
      const group = value(0);
      this.triggerGroups[group] = name.endsWith('+');
      if (name.endsWith('-') && this.pendingWait?.context?.trigger && this.pendingWait.context.group === group) this.cancelPending();
    } else if (name === '#T+' || name === '#T-') {
      requireArgs(1); this.groups[value(0)] = name === '#T+';
      if (name === '#T-' && this.pendingWait?.context?.trigger && this.pendingWait.context.group === value(0)) this.cancelPending();
    } else if (name === '#SHOW' || name === '#SAY') {
      this.notice(args.map((_, i) => value(i)).join(' '));
    } else if (name === '#UNALIAS') {
      requireArgs(1); this.aliases = this.aliases.filter(a => a.name !== value(0));
    } else if (name === '#UNTRIGGER') {
      requireArgs(1); this.triggers = this.triggers.filter(t => t.pattern !== body(0));
    } else if (name === '#UNVAR') {
      requireArgs(1); delete this.variables[value(0)];
    } else if (name === '#SEND') {
      requireArgs(1); this.dispatch(value(0), context);
    } else if (name === '#IF') {
      requireArgs(2);
      const result = evaluate(args[0].value, this.variables, params);
      const condition = Number.isFinite(Number(result)) ? Number(result) !== 0 : !!result;
      const branch = args[condition ? 1 : 2];
      if (branch) yield* this.run(branch.value, params, true, depth + 1, context);
    } else if (name === '#MATH') {
      requireArgs(2); const key = value(0);
      if (!/^\w+$/.test(key)) throw Error('變數名稱格式錯誤');
      this.variables[key] = String(evaluate(args[1].value, this.variables, params));
    } else throw Error(`尚未支援 ${name}，指令未送出`);
  }
  receive(line, mode = 'line') {
    if (this.pendingWait?.milliseconds === null && (!this.paused || this.pendingWait.context?.timerName)) this.resume();
    if (this.paused) return;
    const budget = { steps: 0 };
    if (mode === 'line') {
      const targets = new Set();
      for (const rule of this.captures) {
        if (this.active(rule) && (rule.match === 'pattern' ? compilePattern(rule.text, this.variables, rule.caseSensitive).test(line.slice(0, 16384)) : line.includes(rule.text))) targets.add(rule.target);
      }
      for (const target of targets) this.capture({ target, line });
    }
    for (const trigger of [...this.triggers]) {
      if (!this.active(trigger, true) || (trigger.mode || 'line') !== mode) continue;
      const expression = compilePattern(trigger.pattern, this.variables, trigger.caseSensitive);
      const result = expression.exec(line.slice(0, 16384));
      if (result) {
        const context = { budget, trigger: true, group: trigger.group };
        const params = [];
        expression.captureSlots.forEach((slot, index) => { params[slot - 1] = result[index + 1]; });
        this.advance(this.run(trigger.body, params, true, 0, context), false, context);
      }
    }
  }
}

function validateCapture(rule) {
  if (rule?.match !== undefined && !['literal', 'pattern'].includes(rule.match)) throw Error('無效的擷取比對模式');
  if (!rule || typeof rule.text !== 'string' || !rule.text.trim() || rule.text.length > 1024 || /[\r\n\0]/.test(rule.text)) throw Error('擷取文字必須為 1–1024 字元的單行文字');
  if (typeof rule.target !== 'string' || !rule.target.trim() || rule.target.length > 40 || /[\x00-\x1f\x7f]/.test(rule.target)) throw Error('分頁名稱必須為 1–40 字元，且不能包含控制字元');
  if (rule.group !== undefined && typeof rule.group !== 'string') throw Error('群組格式錯誤');
}
