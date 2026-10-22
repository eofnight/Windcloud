// Bounded session records shared by capture tabs. Rules persist; records are exported separately.
export class CaptureLog {
  constructor({ maxLines = 5000, maxCharacters = 1_000_000 } = {}) {
    this.maxLines = maxLines; this.maxCharacters = maxCharacters;
    this.lines = []; this.characters = 0; this.unread = 0;
  }
  append(line, active = false) {
    const text = String(line).slice(-Math.max(0, this.maxCharacters - 1));
    this.lines.push(text); this.characters += text.length + 1;
    while (this.lines.length > this.maxLines || this.characters > this.maxCharacters) {
      this.characters -= this.lines.shift().length + 1;
    }
    if (!active) this.unread++;
  }
  read() { this.unread = 0; }
  clear() { this.lines = []; this.characters = 0; this.unread = 0; }
  text() { return this.lines.length ? this.lines.join('\n') + '\n' : ''; }
}
