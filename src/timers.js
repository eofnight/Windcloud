// Runtime schedules are intentionally separate from persisted timer definitions.
export function validateTimers(value = []) {
  if (!Array.isArray(value) || value.length > 3) throw Error('最多可設定 3 個計時器');
  const names = new Set();
  return value.map(rule => {
    if (!rule || typeof rule.name !== 'string' || !rule.name.trim() || rule.name !== rule.name.trim() || rule.name.length > 40 || /[\x00-\x1f\x7f{}]/.test(rule.name)) throw Error('計時器名稱須為 1–40 字元，不可包含控制字元或大括號');
    const key = rule.name.toLowerCase();
    if (names.has(key)) throw Error('計時器名稱不可重複');
    names.add(key);
    if (!Number.isInteger(rule.seconds) || rule.seconds < 1 || rule.seconds > 2147483) throw Error('計時時間須為 1–2147483 的整數秒');
    if (!['once', 'repeat'].includes(rule.mode)) throw Error('計時模式須為單次或循環');
    if (typeof rule.body !== 'string' || !rule.body.trim() || rule.body.length > 32000) throw Error('計時器指令須為 1–32000 字元');
    return { name: rule.name, seconds: rule.seconds, mode: rule.mode, body: rule.body };
  });
}
export class Timers {
  constructor({ fire, stopped, changed, canStart }) {
    this.fire = fire; this.stopped = stopped; this.changed = changed; this.canStart = canStart;
    this.rules = []; this.running = new Map();
  }
  replace(rules, preserve = false) {
    for (const old of this.rules) {
      const next = rules.find(r => r.name === old.name);
      if (!preserve || JSON.stringify(old) !== JSON.stringify(next)) this.stop(old.name);
    }
    this.rules = rules;
    this.changed();
  }
  state() {
    return this.rules.map(rule => ({ name: rule.name, running: this.running.has(rule.name), dueAt: this.running.get(rule.name)?.dueAt ?? null }));
  }
  control(enabled, name) {
    const targets = name === undefined ? this.rules : this.rules.filter(r => r.name.toLowerCase() === name.toLowerCase());
    if (name !== undefined && !targets.length) throw Error('找不到計時器：' + name);
    if (enabled && targets.length && !this.canStart()) throw Error('請先連線，再啟動計時器');
    for (const rule of targets) enabled ? this.start(rule) : this.stop(rule.name);
  }
  start(rule) {
    if (this.running.has(rule.name)) return;
    const entry = {};
    this.running.set(rule.name, entry);
    this.schedule(rule, entry);
  }
  schedule(rule, entry) {
    entry.dueAt = Date.now() + rule.seconds * 1000;
    entry.handle = setTimeout(() => {
      if (this.running.get(rule.name) !== entry) return;
      if (rule.mode === 'once') this.running.delete(rule.name);
      else this.schedule(rule, entry); // No catch-up burst after sleep or a blocked event loop.
      this.changed();
      this.fire(rule);
    }, rule.seconds * 1000);
    this.changed();
  }
  stop(name) {
    clearTimeout(this.running.get(name)?.handle);
    this.running.delete(name);
    this.stopped(name); // Also cancels a completed single-shot timer's pending WAIT.
    this.changed();
  }
  stopAll() { for (const rule of this.rules) this.stop(rule.name); }
}
