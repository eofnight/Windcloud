import { CaptureLog } from './capture-log.js';
// Session-only shared archive. Definitions and trigger execution remain per profile.
export class SharedCaptures {
  constructor({ maxTargets = 256, ...limits } = {}) { this.targets = new Map(); this.maxTargets = maxTargets; this.limits = limits; this.revision = 0; }
  append(target, line) {
    let record = this.targets.get(target);
    if (!record) {
      if (this.targets.size >= this.maxTargets) throw Error('共用擷取分頁已達上限，請清除不用的分頁紀錄');
      record = { log: new CaptureLog(this.limits), seen: new Set(), version: 0 }; this.targets.set(target, record);
    }
    const text = String(line).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').slice(-Math.max(0, record.log.maxCharacters - 1));
    if (record.seen.has(text)) return null;
    record.log.append(text, true); record.seen = new Set(record.log.lines); record.version = ++this.revision;
    return this.snapshot(target);
  }
  snapshot(target) {
    const record = this.targets.get(target);
    return { target, lines: record ? [...record.log.lines] : [], version: record?.version ?? this.revision };
  }
  clear(target) {
    this.targets.delete(target); this.revision++;
    return this.snapshot(target);
  }
}
