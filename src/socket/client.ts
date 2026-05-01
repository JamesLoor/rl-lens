import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { RLEvent } from './events';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class RLSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
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

    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

    this.ws.on('open', () => {
      this.status = 'connected';
      this.reconnectDelay = 3000;
      this.emit('status', this.status);
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      const text = raw.toString();
      this.emit('raw_data', text);
      try {
        const msg = JSON.parse(text) as RLEvent;
        this.emit('rl_event', msg);
      } catch {
        // malformed frame, ignore
      }
    });

    this.ws.on('close', () => {
      this.status = 'disconnected';
      this.emit('status', this.status);
      if (this.shouldReconnect) this._scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      this.status = 'error';
      this.emit('ws_error', err.message);
      this.emit('status', this.status);
    });
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
    this.ws?.close();
  }
}
