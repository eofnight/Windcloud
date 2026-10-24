import iconv from 'iconv-lite';
// Bounded legacy profile verified against a user-provided binary file.
// Other zMUD revisions are rejected rather than guessed from printable strings.
export const LEGACY_HEADER = Buffer.from('a7233b4021252e7e00000100000001ffff0102000000', 'hex');
const TRIGGER_FLAGS = Buffer.from('0101010000000000000100', 'hex');
export function readLegacyMud(bytes) {
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, LEGACY_HEADER.length).equals(LEGACY_HEADER)) throw Error('這個 .mud 二進位版本尚未支援；請從 zMUD 匯出文字腳本，或提供此版本的格式範例。');
  let offset = LEGACY_HEADER.length;
  const take = n => {
    if (n < 0 || offset + n > buffer.length) throw Error('不完整的 .mud 檔案：欄位超出檔案範圍。');
    const value = buffer.subarray(offset, offset + n); offset += n; return value;
  };
  const word = () => take(2).readUInt16LE();
  const decode = raw => {
    const text = iconv.decode(raw, 'big5');
    if (!iconv.encode(text, 'big5').equals(raw) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw Error('不支援的 .mud 文字編碼或控制字元。');
    return text;
  };
  const string = () => {
    const length = word();
    if (length > 32000) throw Error('.mud 文字欄位過長。');
    const value = decode(take(length));
    if (length && take(1)[0] !== 0) throw Error('.mud 文字欄位缺少結尾標記。');
    return value;
  };
  string(); // Legacy status-line template, not an executable rule.
  take(take(1)[0]); // Pascal font name.
  take(3); // Font size and legacy display flags.
  let shortcuts = 0;
  while (word()) { if (++shortcuts > 2000) throw Error('.mud 快捷鍵數量過多。'); string(); }
  const definitions = [];
  for (let i = 0; ; i++) {
    if (i > 2000) throw Error('.mud 規則數量過多。');
    const name = string(); if (!name) break;
    const body = string(), extra = string();
    definitions.push(name.startsWith('@') ? { type: 'variable', name: name.slice(1), body } : { type: 'alias', name, body, group: extra });
  }
  for (let i = 0; ; i++) {
    if (i > 2000) throw Error('.mud 觸發器數量過多。');
    const pattern = string(); if (!pattern) break;
    const body = string(), group = string();
    if (!take(11).equals(TRIGGER_FLAGS)) throw Error('這個 .mud 觸發器旗標版本尚未支援；未套用任何設定。');
    definitions.push({ type: 'trigger', name: pattern, body, group });
  }
  return { definitions, shortcuts, trailingBytes: buffer.length - offset, encoding: 'Big5（舊版二進位 .mud）' };
}
