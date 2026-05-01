import net from 'net';
import { EventEmitter } from 'events';
import { RLEvent } from './events';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class RLSocketClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private readonly port: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;
  private shouldReconnect = true;
  public status: SocketStatus = 'disconnected';

  constructor(port: number) {
    super();
    this.port = port;
  }

  connect(): void {
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect(): void {
    this.status = 'connecting';
    this.emit('status', this.status);

    this.socket = new net.Socket();

    this.socket.connect(this.port, '127.0.0.1', () => {
      this.status = 'connected';
      this.reconnectDelay = 3000;
      this.emit('status', this.status);
      this.socket!.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      this._parseBuffer();
    });

    this.socket.on('close', () => {
      this.status = 'disconnected';
      this.buffer = '';
      this.emit('status', this.status);
      if (this.shouldReconnect) this._scheduleReconnect();
    });

    this.socket.on('error', () => {
      this.status = 'error';
      this.emit('status', this.status);
    });
  }

  // Scan buffer for complete JSON objects using brace depth — works whether
  // RL uses '\n', '\r\n', or no delimiter at all between messages.
  private _parseBuffer(): void {
    let i = 0;
    while (i < this.buffer.length) {
      const start = this.buffer.indexOf('{', i);
      if (start === -1) break;

      let depth = 0;
      let inString = false;
      let escape = false;
      let end = -1;

      for (let j = start; j < this.buffer.length; j++) {
        const c = this.buffer[j];
        if (escape) { escape = false; continue; }
        if (c === '\\' && inString) { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }

      if (end === -1) break; // incomplete — wait for more data

      const jsonStr = this.buffer.substring(start, end + 1);
      i = end + 1;

      try {
        const raw = JSON.parse(jsonStr) as { Event: string; Data: unknown };
        // RL double-encodes Data as a JSON string — parse it a second time
        const data = typeof raw.Data === 'string' ? JSON.parse(raw.Data) : raw.Data;
        this.emit('rl_event', { Event: raw.Event, Data: data } as RLEvent);
      } catch {
        // skip malformed frame
      }
    }

    this.buffer = this.buffer.substring(i);
  }

  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this._connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
  }
}
