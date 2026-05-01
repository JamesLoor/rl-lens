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

    this.ws = new WebSocket(`ws://localhost:${this.port}`);

    this.ws.on('open', () => {
      this.status = 'connected';
      this.reconnectDelay = 3000;
      this.emit('status', this.status);
      this._subscribe();
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as RLEvent;
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

    this.ws.on('error', () => {
      this.status = 'error';
      this.emit('status', this.status);
    });
  }

  private _subscribe(): void {
    // SOS-plugin compatible subscription
    const msg = JSON.stringify({
      event: 'wsRelay:register',
      data: [
        'game:match_created',
        'game:initialized',
        'game:pre_countdown_begin',
        'game:post_countdown_begin',
        'game:update_state',
        'game:statfeed_event',
        'game:goal_scored',
        'game:match_ended',
        'game:podium_start',
      ],
    });
    this.ws?.send(msg);
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
