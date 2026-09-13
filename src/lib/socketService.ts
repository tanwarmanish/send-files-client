import { MESSAGE_TYPE, type SocketMessage, type RoomCreatedData } from './types';

export interface SocketCallbacks {
  onOpen?: () => void;
  onRoomCreated?: (data: RoomCreatedData) => void;
  onRoomJoined?: (data: unknown) => void;
  onPeerJoined?: (data: unknown) => void;
  onPeerDisconnected?: (data: unknown) => void;
  onSessionExpired?: (data: unknown) => void;
  onContract?: (data: unknown) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

export class SocketService {
  private ws: WebSocket | null = null;
  private callbacks: SocketCallbacks = {};
  private baseUrl: string;

  constructor(customUrl?: string) {
    const rawUrl = customUrl || import.meta.env.VITE_SOCKET_URL || 'ws://send-files-server.onrender.com';
    // If page is on https and socket url starts with ws://, convert to wss:// for secure environments
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && rawUrl.startsWith('ws://')) {
      this.baseUrl = rawUrl.replace('ws://', 'wss://');
    } else {
      this.baseUrl = rawUrl;
    }
  }

  public setCallbacks(callbacks: SocketCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public connectSender(callbacks?: SocketCallbacks): WebSocket {
    if (callbacks) {
      this.setCallbacks(callbacks);
    }
    this.disconnect();

    const separator = this.baseUrl.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${separator}t=1`;
    return this.initSocket(url);
  }

  public connectReceiver(roomId: string, callbacks?: SocketCallbacks): WebSocket {
    if (callbacks) {
      this.setCallbacks(callbacks);
    }
    this.disconnect();

    const separator = this.baseUrl.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${separator}t=2&r=${encodeURIComponent(roomId)}`;
    return this.initSocket(url);
  }

  private initSocket(url: string): WebSocket {
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log(`[WebSocket] Connected to: ${url}`);
      this.callbacks.onOpen?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: SocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (err) {
        console.error('[WebSocket] Failed to parse incoming message:', event.data, err);
      }
    };

    ws.onerror = (error: Event) => {
      console.error('[WebSocket] Error occurred:', error);
      this.callbacks.onError?.(error);
    };

    ws.onclose = (event: CloseEvent) => {
      console.log('[WebSocket] Connection closed:', event.code, event.reason);
      this.callbacks.onClose?.(event);
      if (this.ws === ws) {
        this.ws = null;
      }
    };

    return ws;
  }

  private handleMessage(message: SocketMessage) {
    console.log('[WebSocket] Received message:', message);

    switch (message.type) {
      case MESSAGE_TYPE.ROOM_CREATED:
        this.callbacks.onRoomCreated?.(message.data as RoomCreatedData);
        break;

      case MESSAGE_TYPE.ROOM_JOINED:
        this.callbacks.onRoomJoined?.(message.data);
        break;

      case MESSAGE_TYPE.PEER_JOINED:
        this.callbacks.onPeerJoined?.(message.data);
        break;

      case MESSAGE_TYPE.PEER_DISCONNECTED:
        this.callbacks.onPeerDisconnected?.(message.data);
        break;

      case MESSAGE_TYPE.SESSION_EXPIRED:
        this.callbacks.onSessionExpired?.(message.data);
        break;

      case MESSAGE_TYPE.CONTRACT:
        this.callbacks.onContract?.(message.data);
        break;

      case MESSAGE_TYPE.PING:
        // PING is not currently in active use
        break;

      default:
        console.warn('[WebSocket] Unknown message type received:', message);
        break;
    }
  }

  public sendContract(data: unknown) {
    this.sendMessage({
      type: MESSAGE_TYPE.CONTRACT,
      data,
    });
  }

  public sendMessage(message: SocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message, socket is not open:', message);
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Default singleton instance for convenience
export const socketService = new SocketService();
