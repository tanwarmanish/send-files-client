import type { NoteUpdateMessage, PeerRole } from './types';

/** Notepad snapshots must fit comfortably inside one data-channel message (browsers allow ~256 KB). */
export const MAX_NOTE_BYTES = 100 * 1024;

const encoder = new TextEncoder();

export function noteByteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * State for the shared notepad. Every edit sends a full snapshot with a Lamport-style
 * revision; the highest revision wins and ties go to the room creator ("sender").
 * Mirrors `SharedNote` in the CLI (send-files-server/cli) so both sides converge identically.
 */
export class NoteState {
  text = '';
  rev = 0;

  constructor(private readonly role: PeerRole) {}

  /** Record a local edit and return the message to send to the peer. */
  edit(text: string): NoteUpdateMessage {
    if (noteByteLength(text) > MAX_NOTE_BYTES) {
      throw new Error(`Note is too large (limit ${MAX_NOTE_BYTES / 1024} KB)`);
    }
    this.text = text;
    this.rev += 1;
    return this.snapshot();
  }

  snapshot(): NoteUpdateMessage {
    return { action: 'note-update', text: this.text, rev: this.rev, role: this.role };
  }

  /** Apply a remote snapshot. Returns true when it replaced the local text. */
  receive(message: NoteUpdateMessage): boolean {
    if (typeof message.text !== 'string' || !Number.isFinite(message.rev)) return false;
    if (noteByteLength(message.text) > MAX_NOTE_BYTES) return false;

    const remoteWins =
      message.rev > this.rev || (message.rev === this.rev && message.role === 'sender' && this.role !== 'sender');
    if (!remoteWins) return false;

    const changed = message.text !== this.text;
    this.text = message.text;
    this.rev = message.rev;
    return changed;
  }
}
