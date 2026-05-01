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
      // Send an HTTP-like request — RL responds to this by streaming JSON events
      this.socket!.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.emit('raw_chunk', chunk.toString('utf-8').substring(0, 200));
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

  private _parseBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as RLEvent;
        this.emit('rl_event', msg);
      } catch {
        // non-JSON line (e.g. HTTP headers), ignore
      }
    }
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
