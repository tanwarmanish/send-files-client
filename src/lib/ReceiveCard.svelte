<script lang="ts">
  import type { ReceivedFile, TransferProgress } from './types';

  interface Props {
    isActive?: boolean;
    receiveKey?: string;
    transferProgress?: TransferProgress | null;
    transferStatus?: string;
    receivedFiles?: ReceivedFile[];
    isCompleted?: boolean;
    onReceive?: (key: string) => void;
    onClose?: () => void;
  }

  let {
    isActive = false,
    receiveKey = '',
    transferProgress = null,
    transferStatus = 'Connecting to sender...',
    receivedFiles = [],
    isCompleted = false,
    onReceive,
    onClose
  }: Props = $props();

  let inputKey = $state('');
  let isInputFocused = $state(false);

  const isValidKey = $derived(/^\d{6}$/.test(inputKey));

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  $effect(() => {
    const sanitized = receiveKey.replace(/\D/g, '').slice(0, 6);
    inputKey = sanitized;
  });

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const sanitized = target.value.replace(/\D/g, '').slice(0, 6);
    inputKey = sanitized;
    target.value = sanitized;
  }

  function handleReceive() {
    if (isValidKey) {
      onReceive?.(inputKey);
    }
  }

  function handleClose() {
    onClose?.();
  }

  function downloadAllFiles() {
    receivedFiles.forEach((file) => {
      if (file.downloadUrl) {
        const a = document.createElement('a');
        a.href = file.downloadUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  }

  async function handlePaste(event?: ClipboardEvent) {
    if (event) {
      event.preventDefault();
      const pastedData = event.clipboardData?.getData('text') || '';
      const digitsOnly = pastedData.replace(/\D/g, '').slice(0, 6);
      inputKey = digitsOnly;
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        inputKey = text.replace(/\D/g, '').slice(0, 6);
      }
    } catch {
      // Clipboard blocked
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      event.key === 'Backspace' ||
      event.key === 'Delete' ||
      event.key === 'Tab' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.ctrlKey ||
      event.metaKey
    ) {
      if (event.key === 'Enter' && isValidKey) {
        handleReceive();
      }
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      return;
    }

    const target = event.target as HTMLInputElement;
    const selectedLength = (target.selectionEnd ?? 0) - (target.selectionStart ?? 0);
    if (inputKey.length >= 6 && selectedLength === 0) {
      event.preventDefault();
    }
  }
</script>

<div class="panel receive-panel">
  <div class="panel-header">
    <h2 class="panel-title">{isActive ? (isCompleted ? 'Received' : 'Receiving') : 'Receive Files'}</h2>
    <div class="header-right">
      {#if isActive}
        <button
          type="button"
          class="btn-close"
          onclick={handleClose}
          aria-label="Close"
          title="Cancel"
        >
          Cancel
        </button>
      {/if}
    </div>
  </div>

  {#if isActive}
    <div class="panel-body">
      {#if !transferProgress && receivedFiles.length === 0}
        <div class="status-card">
          <span class="status-label">Receiving with key</span>
          <div class="key-badge">{inputKey}</div>
          <span class="status-sub">{transferStatus}</span>
        </div>
      {:else if isCompleted && receivedFiles.length > 0}
        <div class="success-banner">
          <div class="success-text">✓ Files ready for download</div>
        </div>
      {/if}

      {#if transferProgress && !isCompleted}
        <div class="progress-section">
          <div class="progress-info">
            <span class="progress-name">{transferProgress.currentFileName}</span>
            <span class="progress-pct">{transferProgress.percentage}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar" style="width: {transferProgress.percentage}%"></div>
          </div>
          <div class="progress-sub">
            <span>{formatFileSize(transferProgress.currentFileTransferred)} of {formatFileSize(transferProgress.currentFileSize)}</span>
            <span>{formatFileSize(transferProgress.speedBps)}/s</span>
          </div>
        </div>
      {/if}

      {#if receivedFiles.length > 0}
        <div class="file-summary">
          <div class="file-summary-title">
            <span>Received Files ({receivedFiles.length})</span>
            {#if receivedFiles.length > 1}
              <button type="button" class="btn-link" onclick={downloadAllFiles}>
                Download All
              </button>
            {/if}
          </div>
          <ul class="file-list">
            {#each receivedFiles as file}
              <li class="file-row">
                <span class="file-name" title={file.name}>{file.name}</span>
                <span class="file-size">{formatFileSize(file.size)}</span>
                {#if file.downloadUrl}
                  <a
                    href={file.downloadUrl}
                    download={file.name}
                    class="btn-save"
                  >
                    Save
                  </a>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <div class="panel-footer">
      <button
        type="button"
        class="btn-solid full-width"
        onclick={handleClose}
      >
        {isCompleted ? 'Done' : 'Cancel'}
      </button>
    </div>
  {:else}
    <div class="panel-body">
      <div class="entry-box">
        <label for="key-input" class="entry-label">Enter 6-digit key</label>
        
        <div class="entry-input-row" class:focused={isInputFocused}>
          <input
            id="key-input"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            placeholder="000000"
            value={inputKey}
            oninput={handleInput}
            onpaste={handlePaste}
            onfocus={() => (isInputFocused = true)}
            onblur={() => (isInputFocused = false)}
            onkeydown={handleKeydown}
            class="key-input-field"
            maxlength="6"
            autocomplete="off"
          />
          {#if !inputKey}
            <button
              type="button"
              class="btn-paste"
              onclick={() => handlePaste()}
              title="Paste from clipboard"
            >
              Paste
            </button>
          {:else}
            <button
              type="button"
              class="btn-clear"
              onclick={() => (inputKey = '')}
              title="Clear"
            >
              ✕
            </button>
          {/if}
        </div>

        <div class="entry-hint">
          {#if inputKey.length > 0 && inputKey.length < 6}
            <span class="text-hint">{6 - inputKey.length} more digit{6 - inputKey.length === 1 ? '' : 's'} needed</span>
          {:else}
            <span class="text-hint">Enter the key provided by the sender</span>
          {/if}
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <button
        type="button"
        class="btn-solid full-width"
        disabled={!isValidKey}
        onclick={handleReceive}
      >
        Receive Files
      </button>
    </div>
  {/if}
</div>

<style>
  .panel {
    background: var(--card-bg);
    border: 1px solid var(--border-strong);
    border-radius: 2px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    min-height: 400px;
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

  .btn-close {
    background: none;
    border: none;
    color: var(--danger);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
  }

  .btn-close:hover {
    text-decoration: underline;
  }

  .panel-body {
    padding: 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-footer {
    padding: 10px 14px 14px;
    border-top: 1px solid var(--border-subtle);
  }

  /* Key Entry Form */
  .entry-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 1rem;
  }

  .entry-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-h);
  }

  .entry-input-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--border-strong);
    background: var(--card-bg);
    border-radius: 2px;
    padding: 4px 6px 4px 12px;
  }

  .entry-input-row.focused {
    border-color: var(--mcmaster-green);
    box-shadow: 0 0 0 1px var(--mcmaster-green);
  }

  .key-input-field {
    flex: 1;
    border: none;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--text-h);
    outline: none;
  }

  .key-input-field::placeholder {
    color: var(--border-strong);
    opacity: 0.6;
  }

  .btn-paste {
    background: var(--card-header-bg);
    border: 1px solid var(--border-strong);
    color: var(--text-h);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 2px;
    cursor: pointer;
  }

  .btn-paste:hover {
    background: var(--border-subtle);
  }

  .btn-clear {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 13px;
  }

  .btn-clear:hover {
    color: var(--danger);
  }

  .entry-hint {
    font-size: 12px;
    color: var(--text-muted);
  }

  .text-hint {
    color: var(--text-muted);
  }

  /* Active Status Card */
  .status-card {
    border: 1px solid var(--border-strong);
    background: var(--card-header-bg);
    padding: 14px;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }

  .status-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }

  .key-badge {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: var(--mcmaster-green);
    background: var(--card-bg);
    padding: 4px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 2px;
  }

  .status-sub {
    font-size: 12px;
    color: var(--text-muted);
  }

  .success-banner {
    background: var(--success-bg);
    border: 1px solid var(--success);
    padding: 10px;
    text-align: center;
    border-radius: 2px;
  }

  .success-text {
    color: var(--success);
    font-weight: 700;
    font-size: 13px;
  }

  /* Progress Section */
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--card-header-bg);
    border: 1px solid var(--border);
    padding: 10px;
    border-radius: 2px;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
  }

  .progress-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .progress-pct {
    font-family: var(--font-mono);
    color: var(--mcmaster-green);
  }

  .progress-track {
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--mcmaster-green);
    transition: width 0.1s linear;
  }

  .progress-sub {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  /* File list */
  .file-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-summary-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--mcmaster-green);
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    font-size: 12px;
  }

  .btn-link:hover {
    text-decoration: underline;
  }

  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    max-height: 220px;
    overflow-y: auto;
    background: var(--card-bg);
  }

  .file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 13px;
    gap: 8px;
  }

  .file-row:last-child {
    border-bottom: none;
  }

  .file-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    color: var(--text-h);
  }

  .file-size {
    color: var(--text-muted);
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .btn-save {
    background: var(--mcmaster-green);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 2px;
    text-decoration: none;
  }

  .btn-save:hover {
    background: var(--mcmaster-green-hover);
  }

  /* Clean Buttons */
  .btn-solid {
    background: var(--mcmaster-green);
    color: #ffffff;
    border: 1px solid #00361f;
    font-weight: 700;
    font-size: 14px;
    padding: 9px 16px;
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-solid:hover:not(:disabled) {
    background: var(--mcmaster-green-hover);
  }

  .btn-solid:disabled {
    background: var(--border);
    border-color: var(--border-strong);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .full-width {
    width: 100%;
  }
</style>
