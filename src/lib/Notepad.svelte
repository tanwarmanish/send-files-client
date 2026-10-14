<script lang="ts">
  import { untrack } from 'svelte';
  import { MAX_NOTE_BYTES, noteByteLength } from './noteState';

  interface Props {
    /** Latest text received from the peer. `seq` changes on every update, even if the text repeats. */
    remote?: { text: string; seq: number };
    /** True while the P2P data channel is open. */
    connected?: boolean;
    onChange?: (text: string) => void;
  }

  let { remote = { text: '', seq: 0 }, connected = false, onChange }: Props = $props();

  const SEND_DELAY_MS = 150;

  let draft = $state('');
  let textarea: HTMLTextAreaElement | null = $state(null);
  let error = $state('');
  let hasCopied = $state(false);
  let sendTimer: number | undefined;
  let copyTimer: number | undefined;

  const usedBytes = $derived(noteByteLength(draft));
  const usedPct = $derived(Math.min(100, Math.round((usedBytes / MAX_NOTE_BYTES) * 100)));

  // Apply updates from the peer. Only `remote` is tracked, so typing never triggers this.
  $effect(() => {
    const incoming = remote;
    if (incoming.seq === 0) return;
    untrack(() => {
      const el = textarea;
      const start = el?.selectionStart ?? incoming.text.length;
      const end = el?.selectionEnd ?? incoming.text.length;
      draft = incoming.text;
      error = '';
      // Keep the caret roughly where it was instead of jumping to the end.
      queueMicrotask(() => {
        if (el && document.activeElement === el) {
          el.setSelectionRange(Math.min(start, draft.length), Math.min(end, draft.length));
        }
      });
    });
  });

  function flush() {
    window.clearTimeout(sendTimer);
    sendTimer = undefined;
    if (usedBytes > MAX_NOTE_BYTES) {
      error = `Too large to sync (limit ${MAX_NOTE_BYTES / 1024} KB).`;
      return;
    }
    try {
      onChange?.(draft);
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not sync the note.';
    }
  }

  function handleInput(event: Event) {
    draft = (event.target as HTMLTextAreaElement).value;
    window.clearTimeout(sendTimer);
    sendTimer = window.setTimeout(flush, SEND_DELAY_MS);
  }

  function handleClear() {
    draft = '';
    flush();
    textarea?.focus();
  }

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      hasCopied = true;
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => (hasCopied = false), 2000);
    } catch {
      error = 'Copy was blocked by the browser.';
    }
  }
</script>

<div class="panel notepad-panel">
  <div class="panel-header">
    <h2 class="panel-title">Shared Notepad</h2>
    <span class="live" class:offline={!connected}>
      <span class="live-dot"></span>
      {connected ? 'Live' : 'Offline'}
    </span>
  </div>

  <div class="panel-body">
    <textarea
      bind:this={textarea}
      class="note-input"
      value={draft}
      oninput={handleInput}
      onblur={() => sendTimer !== undefined && flush()}
      disabled={!connected}
      placeholder={connected ? 'Type or paste text here. The other device sees it instantly.' : 'Waiting for the connection...'}
      spellcheck="false"
      aria-label="Shared notepad"
    ></textarea>

    <div class="note-meta">
      {#if error}
        <span class="note-error" role="alert">{error}</span>
      {:else}
        <span class="note-hint">{draft.length.toLocaleString()} characters{usedPct >= 80 ? ` · ${usedPct}% of limit` : ''}</span>
      {/if}
    </div>
  </div>

  <div class="panel-footer">
    <button type="button" class="btn-outline" onclick={handleCopy} disabled={!draft}>
      {hasCopied ? 'Copied' : 'Copy'}
    </button>
    <button type="button" class="btn-outline" onclick={handleClear} disabled={!draft || !connected}>Clear</button>
  </div>
</div>

<style>
  .panel {
    background: var(--card-bg);
    border: 1px solid var(--border-strong);
    border-radius: 2px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }

  .panel-header {
    background: var(--card-header-bg);
    border-bottom: 1px solid var(--border);
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-h);
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--success);
  }

  .live.offline {
    color: var(--text-muted);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .panel-body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note-input {
    width: 100%;
    box-sizing: border-box;
    min-height: 180px;
    resize: vertical;
    padding: 10px 12px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-h);
    background: var(--card-bg);
    border: 1px solid var(--border-strong);
    border-radius: 2px;
  }

  .note-input:focus {
    outline: 2px solid var(--mcmaster-green);
    outline-offset: -1px;
  }

  .note-input:disabled {
    background: var(--card-header-bg);
    cursor: not-allowed;
  }

  .note-meta {
    min-height: 16px;
    font-size: 12px;
  }

  .note-hint {
    color: var(--text-muted);
  }

  .note-error {
    color: var(--danger);
    font-weight: 600;
  }

  .panel-footer {
    padding: 10px 14px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-outline {
    background: var(--card-bg);
    color: var(--text-h);
    border: 1px solid var(--border-strong);
    border-radius: 2px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-outline:hover:not(:disabled) {
    background: var(--card-header-bg);
  }

  .btn-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
