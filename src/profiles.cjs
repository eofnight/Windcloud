const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class ProfileStore {
  constructor(root) { this.root = root; this.profiles = [{ id: 'default', name: '預設角色' }]; this.pending = Promise.resolve(); }
  async load() {
    let value;
    try { value = JSON.parse(await fs.readFile(path.join(this.root, 'profiles.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (!Array.isArray(value) || !value.length || value[0].id !== 'default') throw Error('角色設定索引格式錯誤');
    const ids = new Set(), names = new Set();
    for (const p of value) {
      this.directory(p.id); this.validateName(p.name);
      if (ids.has(p.id) || names.has(p.name.toLowerCase())) throw Error('角色設定索引有重複項目');
      ids.add(p.id); names.add(p.name.toLowerCase());
    }
    this.profiles = value.map(({ id, name }) => ({ id, name }));
  }
  validateName(name) {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw Error('角色設定名稱須為 1–40 字元，不可包含控制字元');
  }
  directory(id) {
    if (id === 'default') return this.root;
    if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw Error('無效的角色設定識別碼');
    return path.join(this.root, 'profiles', id);
  }
  get(id) { const p = this.profiles.find(p => p.id === id); if (!p) throw Error('找不到角色設定'); return { ...p }; }
  list() { return this.profiles.map(p => ({ ...p })); }
  create(name) {
    const operation = this.pending.then(async () => {
      this.validateName(name);
      if (this.profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) throw Error('已有相同名稱的角色設定，請從清單選取');
      const profile = { id: randomUUID(), name }, next = [...this.profiles, profile];
      await fs.mkdir(this.root, { recursive: true });
      const temp = path.join(this.root, 'profiles.json.tmp');
      await fs.writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
      await fs.rename(temp, path.join(this.root, 'profiles.json'));
      this.profiles = next; return { ...profile };
    });
    this.pending = operation.catch(() => {}); return operation;
  }
}
module.exports = { ProfileStore };
