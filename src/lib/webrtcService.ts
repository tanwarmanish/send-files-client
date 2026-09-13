import { socketService } from './socketService';
import type {
  SignalingData,
  FileMetadataMessage,
  DataChannelControlMessage,
  ReceivedFile,
  TransferProgress,
} from './types';

const CHUNK_SIZE = 32 * 1024; // 32 KB per chunk
const BUFFER_HIGH_WATER_MARK = 256 * 1024; // 256 KB threshold for backpressure
const BUFFER_LOW_WATER_MARK = 64 * 1024; // 64 KB threshold to resume sending

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
};

export interface WebRTCCallbacks {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelOpen?: () => void;
  onDataChannelClose?: () => void;
  onSendProgress?: (progress: TransferProgress) => void;
  onReceiveProgress?: (progress: TransferProgress) => void;
  onFileReceived?: (file: ReceivedFile) => void;
  onTransferComplete?: () => void;
  onError?: (error: Error | string) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private callbacks: WebRTCCallbacks = {};
  private pendingCandidates: RTCIceCandidateInit[] = [];

  // Transfer state
  private isSending = false;
  private shouldAbortTransfer = false;

  // Receiving state
  private currentReceivingMetadata: FileMetadataMessage | null = null;
  private currentFileChunks: ArrayBuffer[] = [];
  private currentFileReceivedBytes = 0;
  private totalTransferredBytes = 0;
  private totalExpectedBytes = 0;
  private transferStartTime = 0;

  constructor() {
    // Empty constructor
  }

  public setCallbacks(callbacks: WebRTCCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Sender initializes WebRTC when PEER_JOINED (type 5) arrives
   */
  public async initAsSender(callbacks?: WebRTCCallbacks): Promise<void> {
    if (callbacks) {
      this.setCallbacks(callbacks);
    }
    this.cleanup();

    console.log('[WebRTC] Initializing as Sender...');
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupPeerConnectionEvents();

    // Create Data Channel
    const dc = this.pc.createDataChannel('fileTransfer', {
      ordered: true,
    });
    this.setupDataChannel(dc);

    // Create and send SDP Offer
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('[WebRTC] Created and sending Offer to receiver');
      socketService.sendContract({
        type: 'offer',
        sdp: this.pc.localDescription,
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
      this.callbacks.onError?.(err instanceof Error ? err : String(err));
    }
  }

  /**
   * Receiver initializes WebRTC when ROOM_JOINED (type 4) arrives
   */
  public initAsReceiver(callbacks?: WebRTCCallbacks): void {
    if (callbacks) {
      this.setCallbacks(callbacks);
    }
    this.cleanup();

    console.log('[WebRTC] Initializing as Receiver, waiting for data channel and offer...');
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupPeerConnectionEvents();

    this.pc.ondatachannel = (event: RTCDataChannelEvent) => {
      console.log('[WebRTC] Data channel received from sender:', event.channel.label);
      this.setupDataChannel(event.channel);
    };
  }

  /**
   * Process signaling data received over socket CONTRACT (type 1)
   */
  public async handleSignalingData(data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const signal = data as SignalingData;

    try {
      if (signal.type === 'offer') {
        console.log('[WebRTC] Received offer from sender');
        if (!this.pc) {
          this.initAsReceiver();
        }
        if (!this.pc) return;

        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.flushPendingCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        console.log('[WebRTC] Created and sending Answer to sender');
        socketService.sendContract({
          type: 'answer',
          sdp: this.pc.localDescription,
        });
      } else if (signal.type === 'answer') {
        console.log('[WebRTC] Received answer from receiver');
        if (this.pc) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await this.flushPendingCandidates();
        }
      } else if (signal.type === 'ice-candidate') {
        if (signal.candidate) {
          if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
            await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            this.pendingCandidates.push(signal.candidate);
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error handling signaling data:', err);
      this.callbacks.onError?.(err instanceof Error ? err : String(err));
    }
  }

  private async flushPendingCandidates() {
    if (!this.pc) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Failed to add queued ICE candidate:', e);
        }
      }
    }
  }

  private setupPeerConnectionEvents() {
    if (!this.pc) return;

    this.pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        socketService.sendContract({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      console.log('[WebRTC] Connection state:', this.pc.connectionState);
      this.callbacks.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  private setupDataChannel(dc: RTCDataChannel) {
    this.dataChannel = dc;
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = BUFFER_LOW_WATER_MARK;

    dc.onopen = () => {
      console.log('[WebRTC] Data channel OPEN');
      this.callbacks.onDataChannelOpen?.();
    };

    dc.onclose = () => {
      console.log('[WebRTC] Data channel CLOSED');
      this.callbacks.onDataChannelClose?.();
    };

    dc.onerror = (event) => {
      console.error('[WebRTC] Data channel error:', event);
      this.callbacks.onError?.('Data channel error');
    };

    dc.onmessage = (event: MessageEvent) => {
      this.handleIncomingDataChannelMessage(event);
    };
  }

  /**
   * Stream files in chunks using slice() to avoid loading full files in memory.
   */
  public async sendFiles(files: File[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }
    if (this.isSending) {
      throw new Error('Transfer already in progress');
    }

    this.isSending = true;
    this.shouldAbortTransfer = false;

    const totalFiles = files.length;
    const overallTotalSize = files.reduce((sum, f) => sum + f.size, 0);
    let overallTransferred = 0;
    const startTime = performance.now();

    try {
      for (let i = 0; i < totalFiles; i++) {
        if (this.shouldAbortTransfer) break;

        const file = files[i];
        const fileId = `${Date.now()}-${i}-${file.name}`;

        // 1. Send file metadata message
        const metadata: FileMetadataMessage = {
          action: 'file-metadata',
          id: fileId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          totalFiles,
          fileIndex: i,
        };
        this.sendControlMessage(metadata);

        // 2. Stream chunks via file.slice()
        let offset = 0;
        while (offset < file.size) {
          if (this.shouldAbortTransfer) break;

          // Backpressure: wait if buffer is too full
          if (this.dataChannel.bufferedAmount > BUFFER_HIGH_WATER_MARK) {
            await this.waitForBufferDrain();
          }

          const end = Math.min(offset + CHUNK_SIZE, file.size);
          const chunkBlob = file.slice(offset, end);
          const chunkBuffer = await chunkBlob.arrayBuffer();

          this.dataChannel.send(chunkBuffer);

          const chunkSize = end - offset;
          offset += chunkSize;
          overallTransferred += chunkSize;

          const elapsedTimeSec = Math.max((performance.now() - startTime) / 1000, 0.001);
          const speedBps = overallTransferred / elapsedTimeSec;
          const percentage = overallTotalSize > 0 ? (overallTransferred / overallTotalSize) * 100 : 100;

          this.callbacks.onSendProgress?.({
            fileIndex: i,
            totalFiles,
            currentFileName: file.name,
            currentFileSize: file.size,
            currentFileTransferred: offset,
            overallTransferred,
            overallTotalSize,
            percentage: Math.min(Math.round(percentage * 10) / 10, 100),
            speedBps,
          });
        }

        // 3. Send file end marker
        if (!this.shouldAbortTransfer) {
          this.sendControlMessage({ action: 'file-end', id: fileId });
        }
      }

      // 4. Send all transfer complete message
      if (!this.shouldAbortTransfer) {
        this.sendControlMessage({ action: 'transfer-complete' });
        this.callbacks.onTransferComplete?.();
      }
    } catch (err) {
      console.error('[WebRTC] Error during file sending:', err);
      this.callbacks.onError?.(err instanceof Error ? err : String(err));
      throw err;
    } finally {
      this.isSending = false;
    }
  }

  private sendControlMessage(msg: DataChannelControlMessage) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  private waitForBufferDrain(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.dataChannel || this.dataChannel.bufferedAmount <= BUFFER_LOW_WATER_MARK) {
        resolve();
        return;
      }

      const onBufferedAmountLow = () => {
        if (this.dataChannel) {
          this.dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
        }
        resolve();
      };

      this.dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
    });
  }

  private handleIncomingDataChannelMessage(event: MessageEvent) {
    if (typeof event.data === 'string') {
      try {
        const msg: DataChannelControlMessage = JSON.parse(event.data);
        this.handleControlMessage(msg);
      } catch (err) {
        console.error('[WebRTC] Error parsing data channel control JSON:', event.data, err);
      }
    } else if (event.data instanceof ArrayBuffer) {
      this.handleIncomingChunk(event.data);
    }
  }

  private handleControlMessage(msg: DataChannelControlMessage) {
    switch (msg.action) {
      case 'file-metadata': {
        this.currentReceivingMetadata = msg;
        this.currentFileChunks = [];
        this.currentFileReceivedBytes = 0;
        if (msg.fileIndex === 0) {
          this.totalTransferredBytes = 0;
          this.totalExpectedBytes = 0;
          this.transferStartTime = performance.now();
        }
        this.totalExpectedBytes += msg.size;
        console.log(`[WebRTC] Starting receipt of file ${msg.fileIndex + 1}/${msg.totalFiles}: ${msg.name}`);
        break;
      }

      case 'file-end': {
        if (this.currentReceivingMetadata) {
          const meta = this.currentReceivingMetadata;
          const blob = new Blob(this.currentFileChunks, { type: meta.mimeType });
          const downloadUrl = URL.createObjectURL(blob);

          const receivedFile: ReceivedFile = {
            id: meta.id,
            name: meta.name,
            size: meta.size,
            mimeType: meta.mimeType,
            blob,
            downloadUrl,
            progress: 100,
            status: 'completed',
          };

          console.log(`[WebRTC] Completed receipt of file: ${meta.name} (${meta.size} bytes)`);
          this.callbacks.onFileReceived?.(receivedFile);

          // Reset chunks to free memory
          this.currentFileChunks = [];
          this.currentReceivingMetadata = null;
        }
        break;
      }

      case 'transfer-complete': {
        console.log('[WebRTC] All files transferred successfully!');
        this.callbacks.onTransferComplete?.();
        break;
      }
    }
  }

  private handleIncomingChunk(chunk: ArrayBuffer) {
    this.currentFileChunks.push(chunk);
    this.currentFileReceivedBytes += chunk.byteLength;
    this.totalTransferredBytes += chunk.byteLength;

    if (this.currentReceivingMetadata) {
      const meta = this.currentReceivingMetadata;
      const elapsedTimeSec = Math.max((performance.now() - this.transferStartTime) / 1000, 0.001);
      const speedBps = this.totalTransferredBytes / elapsedTimeSec;
      const percentage = meta.size > 0 ? (this.currentFileReceivedBytes / meta.size) * 100 : 100;

      this.callbacks.onReceiveProgress?.({
        fileIndex: meta.fileIndex,
        totalFiles: meta.totalFiles,
        currentFileName: meta.name,
        currentFileSize: meta.size,
        currentFileTransferred: this.currentFileReceivedBytes,
        overallTransferred: this.totalTransferredBytes,
        overallTotalSize: this.totalExpectedBytes,
        percentage: Math.min(Math.round(percentage * 10) / 10, 100),
        speedBps,
      });
    }
  }

  public abortTransfer() {
    this.shouldAbortTransfer = true;
    this.isSending = false;
  }

  public cleanup() {
    this.abortTransfer();
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.currentFileChunks = [];
    this.currentReceivingMetadata = null;
  }
}

export const webrtcService = new WebRTCService();
