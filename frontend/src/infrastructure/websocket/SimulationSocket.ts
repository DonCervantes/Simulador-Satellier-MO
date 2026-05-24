/**
 * WebSocket client for the FastAPI simulation_ws endpoint.
 * Handles reconnection, message routing, and subscribe/control messages.
 */

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

export type PositionMap = Record<number, { r: [number, number, number] }>;

export interface PositionsUpdateMessage {
  type: 'positions_update';
  sim_time_unix: number;
  positions: PositionMap;
}

export type ServerMessage = PositionsUpdateMessage | { type: 'pong' } | { type: 'error'; code: string; message: string };

type OnPositions = (msg: PositionsUpdateMessage) => void;
type OnError = (code: string, message: string) => void;

export class SimulationSocket {
  private ws: WebSocket | null = null;
  private reconnectMs = 2_000;
  private destroyed = false;
  private onPositions: OnPositions;
  private onError: OnError;

  constructor(onPositions: OnPositions, onError: OnError = () => {}) {
    this.onPositions = onPositions;
    this.onError = onError;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const url = `${WS_URL}/ws/simulation`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      console.info('[WS] Connected to', url);
      this.reconnectMs = 2_000;
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === 'positions_update') {
          this.onPositions(msg);
        } else if (msg.type === 'error') {
          this.onError(msg.code, msg.message);
        }
      } catch (err) {
        console.warn('[WS] Failed to parse message:', err);
      }
    };
    this.ws.onclose = () => {
      if (!this.destroyed) {
        console.info(`[WS] Disconnected — reconnecting in ${this.reconnectMs}ms`);
        setTimeout(() => this.connect(), this.reconnectMs);
        this.reconnectMs = Math.min(this.reconnectMs * 2, 30_000);
      }
    };
    this.ws.onerror = (ev) => {
      console.warn('[WS] Error:', ev);
    };
  }

  subscribe(satelliteIds: number[]): void {
    this.send({ type: 'subscribe', satellite_ids: satelliteIds });
  }

  setTime(simTimeUnix: number): void {
    this.send({ type: 'set_time', sim_time_unix: simTimeUnix });
  }

  setSpeed(multiplier: number): void {
    this.send({ type: 'set_speed', multiplier });
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  resume(): void {
    this.send({ type: 'resume' });
  }

  ping(): void {
    this.send({ type: 'ping' });
  }

  private send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}
