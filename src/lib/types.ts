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

export type DataChannelControlMessage =
  | FileMetadataMessage
  | FileEndMessage
  | TransferCompleteMessage;

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
