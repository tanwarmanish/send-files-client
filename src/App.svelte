<script lang="ts">
  import Header from './lib/Header.svelte';
  import SendCard from './lib/SendCard.svelte';
  import ReceiveCard from './lib/ReceiveCard.svelte';
  import { socketService } from './lib/socketService';
  import { webrtcService } from './lib/webrtcService';
  import type { RoomCreatedData, ReceivedFile, TransferProgress } from './lib/types';

  type TransferMode = 'idle' | 'sending' | 'receiving';

  const appTitle = import.meta.env.VITE_APP_TITLE || 'Send Files';

  let mode = $state<TransferMode>('idle');
  let activeReceiveKey = $state('');
  let activeSendKey = $state('');
  let selectedFiles = $state<File[]>([]);

  // Transfer states
  let sendProgress = $state<TransferProgress | null>(null);
  let receiveProgress = $state<TransferProgress | null>(null);
  let receivedFiles = $state<ReceivedFile[]>([]);
  let sendStatus = $state('Waiting for recipient to connect...');
  let receiveStatus = $state('Connecting with peer...');
  let isSendCompleted = $state(false);
  let isReceiveCompleted = $state(false);

  function handleSendFiles(files: File[]) {
    console.log('[App] Initiating send with files:', files);
    selectedFiles = files;
    mode = 'sending';
    activeSendKey = '';
    sendProgress = null;
    isSendCompleted = false;
    sendStatus = 'Generating 6-digit key...';

    // 1. Connect WebSocket as sender (URL?t=1)
    socketService.connectSender({
      onRoomCreated: (data: RoomCreatedData) => {
        console.log('[App] Room created from server (type 3):', data);
        if (data && data.roomId !== undefined) {
          activeSendKey = String(data.roomId);
          sendStatus = 'Waiting for recipient to connect...';
        }
      },
      // 2. When PEER_JOINED (type 5) arrives, initialize WebRTC as Sender
      onPeerJoined: async (data: unknown) => {
        console.log('[App] Peer joined room (type 5) -> Initializing WebRTC Offer:', data);
        sendStatus = 'Recipient joined! Connecting P2P...';

        await webrtcService.initAsSender({
          onConnectionStateChange: (state) => {
            console.log('[App] WebRTC Sender state:', state);
            if (state === 'connected') {
              sendStatus = 'P2P Connected! Sending files...';
            } else if (state === 'disconnected' || state === 'failed') {
              sendStatus = 'P2P connection lost.';
            }
          },
          onDataChannelOpen: async () => {
            console.log('[App] Data Channel Open! Streaming files in chunks...');
            sendStatus = 'Transferring files...';
            try {
              await webrtcService.sendFiles(selectedFiles);
            } catch (err) {
              console.error('[App] Failed to send files:', err);
              sendStatus = 'Transfer failed.';
            }
          },
          onSendProgress: (progress) => {
            sendProgress = progress;
            sendStatus = `Sending ${progress.currentFileName} (${progress.percentage}%)`;
          },
          onTransferComplete: () => {
            console.log('[App] Sender transfer complete!');
            isSendCompleted = true;
            sendStatus = 'All files delivered successfully!';
          },
          onError: (err) => {
            console.error('[App] WebRTC Sender error:', err);
            sendStatus = 'Connection error occurred.';
          }
        });
      },
      onPeerDisconnected: (data: unknown) => {
        console.log('[App] Peer disconnected (type 6):', data);
        if (!isSendCompleted) {
          sendStatus = 'Peer disconnected.';
        }
      },
      onSessionExpired: (data: unknown) => {
        console.warn('[App] Session expired (type 7):', data);
        handleCloseConnection();
      },
      // 3. WebRTC signaling contract messages (type 1)
      onContract: async (data: unknown) => {
        console.log('[App] Received signaling contract (type 1):', data);
        await webrtcService.handleSignalingData(data);
      },
      onClose: () => {
        console.log('[App] WebSocket closed');
        if (mode !== 'idle' && !isSendCompleted) {
          handleCloseConnection();
        }
      },
      onError: (err) => {
        console.error('[App] WebSocket error:', err);
        sendStatus = 'Socket connection failed.';
      }
    });
  }

  function handleReceiveKey(key: string) {
    console.log('[App] Initiating receive with key:', key);
    activeReceiveKey = key;
    mode = 'receiving';
    receiveProgress = null;
    receivedFiles = [];
    isReceiveCompleted = false;
    receiveStatus = 'Connecting to room...';

    // 1. Connect WebSocket as receiver (URL?t=2&r=...)
    socketService.connectReceiver(key, {
      // 2. When ROOM_JOINED (type 4) arrives, initialize WebRTC as Receiver
      onRoomJoined: (data: unknown) => {
        console.log('[App] Room joined (type 4) -> Initializing WebRTC Receiver:', data);
        receiveStatus = 'Joined room! Waiting for sender offer...';

        webrtcService.initAsReceiver({
          onConnectionStateChange: (state) => {
            console.log('[App] WebRTC Receiver state:', state);
            if (state === 'connected') {
              receiveStatus = 'P2P Connected! Waiting for files...';
            } else if (state === 'disconnected' || state === 'failed') {
              receiveStatus = 'P2P connection lost.';
            }
          },
          onDataChannelOpen: () => {
            console.log('[App] Receiver Data Channel open, ready for file chunks');
            receiveStatus = 'Receiving files...';
          },
          onReceiveProgress: (progress) => {
            receiveProgress = progress;
            receiveStatus = `Receiving ${progress.currentFileName} (${progress.percentage}%)`;
          },
          onFileReceived: (file) => {
            console.log('[App] File received:', file.name);
            receivedFiles = [...receivedFiles, file];
          },
          onTransferComplete: () => {
            console.log('[App] All files received!');
            isReceiveCompleted = true;
            receiveStatus = 'All files received successfully!';
          },
          onError: (err) => {
            console.error('[App] WebRTC Receiver error:', err);
            receiveStatus = 'Connection error occurred.';
          }
        });
      },
      onPeerDisconnected: (data: unknown) => {
        console.log('[App] Peer disconnected (type 6):', data);
        if (!isReceiveCompleted) {
          receiveStatus = 'Peer disconnected.';
        }
      },
      onSessionExpired: (data: unknown) => {
        console.warn('[App] Session expired (type 7):', data);
        handleCloseConnection();
      },
      // 3. WebRTC signaling contract messages (type 1)
      onContract: async (data: unknown) => {
        console.log('[App] Received signaling contract (type 1):', data);
        await webrtcService.handleSignalingData(data);
      },
      onClose: () => {
        console.log('[App] WebSocket closed');
        if (mode !== 'idle' && !isReceiveCompleted) {
          handleCloseConnection();
        }
      },
      onError: (err) => {
        console.error('[App] WebSocket error:', err);
        receiveStatus = 'Socket connection failed.';
      }
    });
  }

  function handleCloseConnection() {
    console.log('[App] Closing connection and resetting all state');
    webrtcService.cleanup();
    socketService.disconnect();
    mode = 'idle';
    activeReceiveKey = '';
    activeSendKey = '';
    selectedFiles = [];
    sendProgress = null;
    receiveProgress = null;
    receivedFiles = [];
    isSendCompleted = false;
    isReceiveCompleted = false;
  }
</script>

<div class="app-layout">
  <Header title={appTitle} />

  <main class="main-content">
    <div class="container-wrapper" class:single={mode !== 'idle'}>
      <div class="cards-grid" class:single={mode !== 'idle'}>
        {#if mode === 'idle' || mode === 'sending'}
          <SendCard
            isActive={mode === 'sending'}
            sendKey={activeSendKey}
            transferProgress={sendProgress}
            transferStatus={sendStatus}
            isCompleted={isSendCompleted}
            onSend={handleSendFiles}
            onClose={handleCloseConnection}
          />
        {/if}

        {#if mode === 'idle' || mode === 'receiving'}
          <ReceiveCard
            isActive={mode === 'receiving'}
            receiveKey={activeReceiveKey}
            transferProgress={receiveProgress}
            transferStatus={receiveStatus}
            receivedFiles={receivedFiles}
            isCompleted={isReceiveCompleted}
            onReceive={handleReceiveKey}
            onClose={handleCloseConnection}
          />
        {/if}
      </div>
    </div>
  </main>

  <footer class="app-footer">
    <div class="footer-inner">
      <span>Direct browser-to-browser peer transfer</span>
      <span>No file size limits &middot; End-to-end encrypted</span>
    </div>
  </footer>
</div>

<style>
  .app-layout {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background-color: var(--bg);
  }

  .main-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    box-sizing: border-box;
    width: 100%;
  }

  .container-wrapper {
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
    transition: max-width 0.25s ease;
  }

  .container-wrapper.single {
    max-width: 440px;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: stretch;
    transition: all 0.25s ease;
    width: 100%;
  }

  .cards-grid.single {
    grid-template-columns: 1fr;
  }

  @media (max-width: 768px) {
    .cards-grid {
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    .main-content {
      padding: 1.25rem 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .main-content {
      padding: 1rem 0.5rem;
      align-items: flex-start;
    }

    .cards-grid {
      gap: 1rem;
    }
  }

  .app-footer {
    border-top: 1px solid var(--border);
    background: var(--card-bg);
    padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom, 0.75rem));
    font-size: 12px;
    color: var(--text-muted);
  }

  .footer-inner {
    max-width: 840px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  @media (max-width: 600px) {
    .footer-inner {
      flex-direction: column;
      text-align: center;
      gap: 2px;
    }
  }
</style>


