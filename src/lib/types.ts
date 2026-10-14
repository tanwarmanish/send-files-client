export enum MESSAGE_TYPE {
  CONTRACT = 1,
  PING,
  ROOM_CREATED,
  ROOM_JOINED,
  PEER_JOINED,
  PEER_DISCONNECTED,
  SESSION_EXPIRED,
}

export interface RoomCreatedData {
  roomId: number | string;
}

export interface RoomJoinedData {
  roomId?: number | string;
  [key: string]: unknown;
}

export interface PeerJoinedData {
  peerId?: string;
  [key: string]: unknown;
}

export interface ContractMessage<T = unknown> {
  type: MESSAGE_TYPE.CONTRACT;
  data: T;
}

export interface SocketMessage<T = unknown> {
  type: MESSAGE_TYPE;
  data?: T;
}

export type SocketEventHandler = (message: SocketMessage) => void;

// WebRTC Signaling Types exchanged via CONTRACT (type: 1)
export type SignalingData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

// Data Channel Protocol Types
export interface FileMetadataMessage {
  action: 'file-metadata';
  id: string;
  name: string;
  size: number;
  mimeType: string;
  totalFiles: number;
  fileIndex: number;
}

export interface FileEndMessage {
  action: 'file-end';
  id: string;
}

export interface TransferCompleteMessage {
  action: 'transfer-complete';
}

/** Sent by the receiver after `transfer-complete` so a CLI sender knows it can exit safely. */
export interface TransferAckMessage {
  action: 'transfer-ack';
}

/** Which side of the room a peer is on. The room creator ("sender") is the WebRTC initiator. */
export type PeerRole = 'sender' | 'receiver';

/**
 * Full snapshot of the shared notepad. Last write wins, ordered by `rev`;
 * ties are broken in favour of the room creator (`role: 'sender'`).
 */
export interface NoteUpdateMessage {
  action: 'note-update';
  text: string;
  rev: number;
  role: PeerRole;
}

export type DataChannelControlMessage =
  | FileMetadataMessage
  | FileEndMessage
  | TransferCompleteMessage
  | TransferAckMessage
  | NoteUpdateMessage;

export interface ReceivedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  blob?: Blob;
  downloadUrl?: string;
  progress: number;
  status: 'receiving' | 'completed' | 'error';
}

export interface TransferProgress {
  fileIndex: number;
  totalFiles: number;
  currentFileName: string;
  currentFileSize: number;
  currentFileTransferred: number;
  overallTransferred: number;
  overallTotalSize: number;
  percentage: number;
  speedBps: number;
}
