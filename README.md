# send-files-client

Browser-to-browser file transfer and a shared notepad, built with Svelte 5, TypeScript and Vite. Files move directly between devices over WebRTC; the [signaling server](https://github.com/tanwarmanish/send-files-server) only introduces the two sides.

## Features

- Send any number of files of any size. Files are streamed in 32 KB chunks with backpressure, so nothing is loaded into memory whole.
- Pair devices with a 6-digit code.
- **Shared notepad:** once two devices are connected, a live notepad appears on both. Typing on one device shows up on the other within a fraction of a second. You can also start a session with no files ("Open a shared notepad") to just share text.
- Works with the `filedrop` command line client in the server repo's `cli/` folder.

## Run

```bash
cp .env.example .env     # set VITE_SOCKET_URL to your signaling server
npm install
npm run dev
npm run check            # type check
npm run build
```

## How it fits together

- `src/lib/socketService.ts` talks to the signaling server (create or join a room, relay WebRTC messages).
- `src/lib/webrtcService.ts` owns the `RTCPeerConnection` and data channel: file framing, chunking, backpressure and notepad messages.
- `src/lib/noteState.ts` is the notepad's merge rule. Each edit sends the full text with a revision number; the highest revision wins and the room creator wins ties, so both sides always converge. Notes are limited to 100 KB.
- `src/App.svelte` ties the UI to the services. The signaling socket is only needed to set up the connection, so a dropped socket does not end a session whose P2P link is still up.
