const ESC = '\x1b';
// Keep server graphic attributes separate from locally styled echoes/notices.
export class TerminalOutput {
  constructor() { this.attributes = new Map(); this.saved = new Map(); this.pending = ''; this.state = ''; }
  sgr(parameters) {
    const parts = parameters.split(';');
    for (let i=0;i<parts.length;i++) {
      const token = parts[i], code = Number(token.split(':')[0] || 0);
      if (code === 0) this.attributes.clear();
      else if ([38,48,58].includes(code)) {
        let value = token;
        if (!token.includes(':')) {
          const count = parts[i+1] === '2' ? 4 : parts[i+1] === '5' ? 2 : 0;
          if (!count || i + count >= parts.length) continue;
          value = parts.slice(i,i+count+1).join(';'); i += count;
        }
        this.attributes.set(code === 38 ? 'foreground' : code === 48 ? 'background' : 'underlineColor',value);
      } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) this.attributes.set('foreground',token);
      else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) this.attributes.set('background',token);
      else if (code === 39) this.attributes.delete('foreground');
      else if (code === 49) this.attributes.delete('background');
      else if (code === 59) this.attributes.delete('underlineColor');
      else if (code === 22) { this.attributes.delete('bold'); this.attributes.delete('faint'); }
      else if (code === 1) this.attributes.set('bold',token);
      else if (code === 2) this.attributes.set('faint',token);
      else if (code === 10) this.attributes.delete('font');
      else if (code >= 11 && code <= 19) this.attributes.set('font',token);
      else {
        const attrs = {3:['italic',23],4:['underline',24],21:['underline',24],5:['blink',25],6:['blink',25],7:['inverse',27],8:['conceal',28],9:['strike',29],51:['frame',54],52:['frame',54],53:['overline',55]};
        if (attrs[code]) {
          if (token === '4:0') this.attributes.delete('underline');
          else this.attributes.set(attrs[code][0],token);
        } else for (const [key,reset] of Object.values(attrs)) if (code === reset) this.attributes.delete(key);
      }
    }
  }
  sequence(value) {
    const match = /^(?:\x1b\[|\x9b)([0-9;:]*)m$/.exec(value);
    if (match) this.sgr(match[1]);
    else if (value === ESC+'c') { this.attributes.clear(); this.saved.clear(); }
    else if (value === ESC+'7' || value === ESC+'[s') this.saved = new Map(this.attributes);
    else if (value === ESC+'8' || value === ESC+'[u') this.attributes = new Map(this.saved);
    return value;
  }
  server(text) {
    let output = '';
    for (const c of text) {
      if (!this.state) {
        if (c === ESC) { this.pending=c; this.state='esc'; }
        else if (c === '\x9b') { this.pending=c; this.state='csi'; }
        else if (c === '\n') { this.attributes.clear(); output += ESC+'[0m'+c; }
        else output += c;
        continue;
      }
      this.pending += c;
      if (this.pending.length > 8192) { this.pending=''; this.state=''; continue; }
      if (this.state === 'esc') {
        if (c === '[') this.state='csi';
        else if (']PX^_'.includes(c)) this.state=c === ']' ? 'osc' : 'string';
        else if (c >= ' ' && c <= '/') this.state='esc-intermediate';
        else { output += this.sequence(this.pending); this.pending=''; this.state=''; }
      } else if (this.state === 'csi' || this.state === 'esc-intermediate') {
        if (c >= '@' && c <= '~') { output += this.sequence(this.pending); this.pending=''; this.state=''; }
      } else if (this.state === 'osc' || this.state === 'string') {
        if (c === '\x07' && this.state === 'osc') { output += this.pending; this.pending=''; this.state=''; }
        else if (c === ESC) this.state += '-esc';
      } else if (this.state.endsWith('-esc')) {
        if (c === '\\') { output += this.pending; this.pending=''; this.state=''; }
        else this.state=this.state.slice(0,-4);
      }
    }
    return output;
  }
  local(text, color) {
    const safe = String(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
    if (!/^#[a-f0-9]{6}$/i.test(color)) throw Error('無效的本機訊息顏色');
    const rgb = [1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16));
    this.attributes.clear();
    const lines = safe.replace(/\n/g, ESC+'[0m\n');
    return `${ESC}[0m\r\n${ESC}[38;2;${rgb.join(';')}m${lines}${ESC}[0m\r\n`;
  }
  reset() { this.attributes.clear(); this.saved.clear(); this.pending=''; this.state=''; }
}
