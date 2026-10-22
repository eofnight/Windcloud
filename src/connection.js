import { EventEmitter } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';

const gateway = {
  kind: 'websocket', url: 'wss://windcloud.muds.me/websocket/',
  origin: 'https://windcloud.muds.me', label: 'WSS windcloud.muds.me:443', encoding: 'utf8'
};
export function connectionPlan({ host, port, transport = 'websocket', encoding = 'big5' }) {
  const windcloud = ['125.228.186.144', 'windcloud.muds.me'].includes(host.toLowerCase());
  if (!['auto', 'telnet', 'websocket'].includes(transport)) throw Error('不支援的連線方式');
  if (transport === 'websocket') {
    if (!windcloud) throw Error('網頁 WSS 入口僅適用於風雲再起');
    return [{ ...gateway }];
  }
  const direct = { kind: 'telnet', host, port, encoding, label: `Telnet ${host}:${port}` };
  return transport === 'auto' && windcloud && port === 8000 ? [direct, { ...gateway }] : [direct];
}

// TCP and WSS share a byte stream at the Telnet layer. WSS game commands use text frames.
export class GameConnection extends EventEmitter {
  constructor(options, { attempts = connectionPlan(options), timeout = 10000 } = {}) {
    super();
    this.attempts = attempts; this.timeout = timeout; this.index = -1;
    this.destroyed = false; this.ready = false; this.current = null; this.timer = null;
  }
  get kind() { return this.attempts[this.index]?.kind; }
  get encoding() { return this.attempts[this.index]?.encoding; }
  get label() { return this.attempts[this.index]?.label; }
  connect() { this.next(); }
  next(previousError) {
    if (this.destroyed) return;
    const attempt = this.attempts[++this.index];
    if (!attempt) { this.finish(previousError || Error('無可用連線入口')); return; }
    if (previousError) this.emit('fallback', `${previousError.message}；改試 ${attempt.label}`);
    this.emit('attempt', attempt.label);
    let socket;
    try {
      socket = attempt.kind === 'telnet' ? new net.Socket() : new WebSocket(attempt.url, { origin: attempt.origin, handshakeTimeout: this.timeout, maxPayload: 2 * 1024 * 1024 });
    } catch (error) { this.next(error); return; }
    this.current = socket;
    const live = () => !this.destroyed && this.current === socket;
    const fail = error => {
      if (!live()) return;
      clearTimeout(this.timer); this.current = null;
      if (attempt.kind === 'telnet') socket.destroy(); else socket.terminate();
      const detail = error.code === 'ETIMEDOUT' ? `逾時（${this.timeout / 1000} 秒）` : error.message;
      const failure = Error(`${attempt.label}：${detail}`);
      if (!this.ready && this.index + 1 < this.attempts.length) this.next(failure);
      else this.finish(failure);
    };
    socket.on('error', fail);
    socket.on('close', () => {
      if (!live()) return;
      if (!this.ready) fail(Error('伺服器在完成連線前關閉連線'));
      else this.finish();
    });
    const opened = () => {
      if (!live()) return;
      clearTimeout(this.timer); this.ready = true; this.emit('connect');
    };
    this.timer = setTimeout(() => fail(Object.assign(Error('連線逾時'), { code: 'ETIMEDOUT' })), this.timeout);
    if (attempt.kind === 'telnet') {
      socket.once('connect', opened);
      socket.on('data', data => { if (live()) this.emit('data', data); });
      socket.connect(attempt.port, attempt.host);
    } else {
      socket.once('open', opened);
      socket.on('message', data => { if (live()) this.emit('data', Buffer.from(data)); });
    }
  }
  write(bytes) {
    if (!this.ready || this.destroyed) throw Error('尚未連線');
    if (this.kind === 'websocket') this.current.send(bytes); else this.current.write(bytes);
  }
  sendText(text) {
    if (!this.ready || this.destroyed || this.kind !== 'websocket') throw Error('網頁連線尚未就緒');
    this.current.send(text ? text + '\n' : '\r\n');
  }
  finish(error) {
    if (this.destroyed) return;
    this.destroyed = true; this.ready = false; clearTimeout(this.timer);
    if (error) this.emit('error', error);
    this.emit('close');
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.ready = false; clearTimeout(this.timer);
    const current = this.current; this.current = null;
    if (current) { if (this.kind === 'websocket') current.terminate(); else current.destroy(); }
    this.emit('close');
  }
}
