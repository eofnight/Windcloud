const IAC = 255, DO = 253, DONT = 254, WILL = 251, WONT = 252, SB = 250, SE = 240;
export class Telnet {
  constructor({ reply = () => {}, echo = () => {}, prompt = () => {} } = {}) {
    this.reply = reply; this.echo = echo; this.prompt = prompt;
    this.state = 'data'; this.command = 0; this.sub = []; this.width = 100; this.height = 30;
    this.local = new Set(); this.remote = new Set();
  }
  resize(cols, rows) {
    this.width = Math.min(65535, Math.max(1, cols)); this.height = Math.min(65535, Math.max(1, rows));
    if (this.local.has(31)) this.sendSize();
  }
  sendSize() {
    const bytes = [this.width >> 8, this.width & 255, this.height >> 8, this.height & 255];
    this.reply(Uint8Array.from([IAC, SB, 31, ...bytes.flatMap(b => b === IAC ? [IAC,IAC] : [b]), IAC, SE]));
  }
  negotiate(option) {
    if (this.command === DO) {
      if ([24,31,3].includes(option)) {
        if (!this.local.has(option)) {
          this.local.add(option); this.reply(Uint8Array.from([IAC,WILL,option]));
          if (option === 31) this.sendSize();
        }
      } else this.reply(Uint8Array.from([IAC,WONT,option]));
    } else if (this.command === WILL) {
      if ([1,3,25].includes(option)) {
        if (!this.remote.has(option)) { this.remote.add(option); this.reply(Uint8Array.from([IAC,DO,option])); }
        if (option === 1) this.echo(false);
      } else this.reply(Uint8Array.from([IAC,DONT,option]));
    } else if (this.command === WONT) {
      this.remote.delete(option); if (option === 1) this.echo(true);
    } else if (this.command === DONT) this.local.delete(option);
  }
  feed(bytes) {
    const output = []; let endedPrompt = false;
    for (const b of bytes) {
      if (this.state === 'data') {
        if (b === IAC) this.state = 'iac'; else output.push(b);
      } else if (this.state === 'iac') {
        if (b === IAC) { output.push(b); this.state = 'data'; }
        else if ([DO,DONT,WILL,WONT].includes(b)) { this.command = b; this.state = 'option'; }
        else if (b === SB) { this.sub = []; this.state = 'sub'; }
        else { if (b === 249 || b === 239) endedPrompt = true; this.state = 'data'; }
      } else if (this.state === 'option') { this.negotiate(b); this.state = 'data';
      } else if (this.state === 'sub') {
        if (b === IAC) this.state = 'sub-iac';
        else if (this.sub.length < 4096) this.sub.push(b);
      } else if (this.state === 'sub-iac') {
        if (b === SE) {
          if (this.sub[0] === 24 && this.sub[1] === 1 && this.local.has(24)) {
            this.reply(Uint8Array.from([IAC,SB,24,0,...new TextEncoder().encode('WINDCLOUD'),IAC,SE]));
          }
          this.sub = []; this.state = 'data';
        } else { if (b === IAC && this.sub.length < 4096) this.sub.push(b); this.state = 'sub'; }
      }
    }
    if (endedPrompt) this.prompt();
    return Uint8Array.from(output);
  }
}

// Stateful ANSI removal for trigger text, including escape sequences split across packets.
export class LineStream {
  constructor(line, prompt) { this.line = line; this.prompt = prompt; this.buffer = ''; this.escape = ''; this.lastPrompt = ''; }
  feed(text) {
    for (const c of text) {
      if (this.escape) {
        if (this.escape === 'esc') {
          this.escape = c === '[' ? 'csi' : c === ']' ? 'osc' : '';
        } else if (this.escape === 'csi') {
          if (/[\x40-\x7e]/.test(c)) this.escape = '';
        } else if (this.escape === 'osc') {
          if (c === '\x07') this.escape = ''; else if (c === '\x1b') this.escape = 'osc-esc';
        } else if (this.escape === 'osc-esc') this.escape = c === '\\' ? '' : 'osc';
        continue;
      }
      if (c === '\x1b') { this.escape = 'esc'; continue; }
      if (c === '\n') {
        this.line(this.buffer); this.buffer = ''; this.lastPrompt = '';
      } else if (c === '\b') this.buffer = this.buffer.slice(0,-1);
      else if (c >= ' ' || c === '\t') this.buffer = (this.buffer + c).slice(-16384);
    }
  }
  flushPrompt() {
    if (this.buffer && this.buffer !== this.lastPrompt) {
      this.lastPrompt = this.buffer; this.prompt(this.buffer);
    }
  }
}
