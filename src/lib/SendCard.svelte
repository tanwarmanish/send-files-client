<script lang="ts">
  import type { TransferProgress } from './types';

  interface Props {
    isActive?: boolean;
    sendKey?: string;
    transferProgress?: TransferProgress | null;
    transferStatus?: string;
    isCompleted?: boolean;
    onSend?: (files: File[]) => void;
    onClose?: () => void;
  }

  let {
    isActive = false,
    sendKey = '',
    transferProgress = null,
    transferStatus = 'Waiting for recipient...',
    isCompleted = false,
    onSend,
    onClose
  }: Props = $props();

  let files = $state<File[]>([]);
  let isDragging = $state(false);
  let fileInput: HTMLInputElement | null = $state(null);
  let hasCopied = $state(false);
  let copyTimeout: number | undefined;

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const totalSize = $derived(
    files.reduce((acc, file) => acc + file.size, 0)
  );

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      addFiles(Array.from(target.files));
      target.value = '';
    }
  }

  function addFiles(newFiles: File[]) {
    const existingKeys = new Set(files.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
    const uniqueFiles = newFiles.filter(
      (f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`)
    );
    files = [...files, ...uniqueFiles];
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      addFiles(Array.from(event.dataTransfer.files));
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

  function clearFiles() {
    files = [];
  }

  function handleSend() {
    if (files.length > 0) {
      onSend?.(files);
    }
  }

  function handleClose() {
    hasCopied = false;
    onClose?.();
  }

  $effect(() => {
    if (!isActive) {
      hasCopied = false;
    }
  });

  async function handleCopyKey() {
    if (!sendKey) return;
    try {
      await navigator.clipboard.writeText(sendKey);
      hasCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = window.setTimeout(() => {
        hasCopied = false;
      }, 2000);
    } catch {
      const tempInput = document.createElement('input');
      tempInput.value = sendKey;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      hasCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = window.setTimeout(() => {
        hasCopied = false;
      }, 2000);
    }
  }

  function triggerFileInput() {
    fileInput?.click();
  }
</script>

<div class="panel send-panel">
  <div class="panel-header">
    <h2 class="panel-title">{isActive ? (isCompleted ? 'Sent' : 'Sending') : 'Send Files'}</h2>
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
      {#if !isCompleted}
        <div class="key-card">
          <span class="key-label">Share this 6-digit key:</span>
          <div class="key-row">
            <span class="key-text">{sendKey || '------'}</span>
            <button
              type="button"
              class="btn-copy"
              class:copied={hasCopied}
              onclick={handleCopyKey}
            >
              {hasCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span class="key-hint">Enter this key on the receiving device</span>
        </div>
      {:else}
        <div class="success-banner">
          <div class="success-text">✓ Files transferred successfully!</div>
        </div>
      {/if}

      {#if transferProgress}
        <div class="progress-section">
          <div class="progress-info">
            <span class="progress-name">{transferProgress.currentFileName}</span>
            <span class="progress-pct">{transferProgress.percentage}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar" style="width: {transferProgress.percentage}%"></div>
          </div>
          <div class="progress-sub">
            <span>{formatFileSize(transferProgress.overallTransferred)} of {formatFileSize(transferProgress.overallTotalSize)}</span>
            <span>{formatFileSize(transferProgress.speedBps)}/s</span>
          </div>
        </div>
      {:else if !isCompleted}
        <div class="status-box">
          <span class="status-dot"></span>
          <span>{transferStatus}</span>
        </div>
      {/if}

      <div class="file-summary">
        <div class="file-summary-title">
          <span>Files ({files.length})</span>
          <span>{formatFileSize(totalSize)}</span>
        </div>
        <ul class="file-list">
          {#each files as file}
            <li class="file-row">
              <span class="file-name" title={file.name}>{file.name}</span>
              <span class="file-size">{formatFileSize(file.size)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="panel-footer">
      <button
        type="button"
        class="btn-solid full-width"
        onclick={handleClose}
      >
        {isCompleted ? 'Done' : 'Cancel Transfer'}
      </button>
    </div>
  {:else}
    <input
      type="file"
      multiple
      bind:this={fileInput}
      onchange={handleFileSelect}
      class="file-input-hidden"
    />

    <div class="panel-body">
      {#if files.length === 0}
        <div
          class="drop-zone"
          class:dragging={isDragging}
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="region"
          aria-label="Drop files here"
        >
          <div class="drop-prompt">
            <p class="drop-main">Drag and drop files here</p>
            <p class="drop-or">or</p>
            <button
              type="button"
              class="btn-outline"
              onclick={triggerFileInput}
            >
              Select Files
            </button>
          </div>
        </div>
      {:else}
        <div class="files-wrapper">
          <div class="files-toolbar">
            <span class="files-count">{files.length} {files.length === 1 ? 'file' : 'files'} &middot; {formatFileSize(totalSize)}</span>
            <div class="files-actions">
              <button type="button" class="btn-link" onclick={triggerFileInput}>+ Add</button>
              <button type="button" class="btn-link text-danger" onclick={clearFiles}>Clear</button>
            </div>
          </div>

          <ul class="file-list interactive">
            {#each files as file, index}
              <li class="file-row">
                <span class="file-name" title={file.name}>{file.name}</span>
                <span class="file-size">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  class="btn-remove"
                  onclick={() => removeFile(index)}
                  aria-label="Remove file"
                  title="Remove"
                >
                  ✕
                </button>
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
        disabled={files.length === 0}
        onclick={handleSend}
      >
        Send {files.length > 0 ? `(${files.length})` : ''}
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

  /* Drop Zone */
  .drop-zone {
    flex: 1;
    border: 2px dashed var(--border-strong);
    background: var(--card-header-bg);
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    min-height: 220px;
  }

  .drop-zone.dragging {
    border-color: var(--mcmaster-green);
    background: var(--success-bg);
  }

  .drop-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
  }

  .drop-main {
    margin: 0;
    font-weight: 600;
    color: var(--text-h);
    font-size: 14px;
  }

  .drop-or {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  /* File list */
  .files-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
  }

  .files-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }

  .files-actions {
    display: flex;
    gap: 10px;
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

  .btn-link.text-danger {
    color: var(--danger);
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

  .btn-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 1;
  }

  .btn-remove:hover {
    color: var(--danger);
  }

  /* Key Display */
  .key-card {
    border: 1px solid var(--border-strong);
    background: var(--card-header-bg);
    padding: 12px;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }

  .key-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .key-text {
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: var(--mcmaster-green);
    background: var(--card-bg);
    padding: 4px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 2px;
  }

  .key-hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  .btn-copy {
    background: var(--card-bg);
    border: 1px solid var(--border-strong);
    color: var(--text-h);
    font-weight: 600;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 2px;
    cursor: pointer;
  }

  .btn-copy:hover {
    background: var(--border-subtle);
  }

  .btn-copy.copied {
    background: var(--success-bg);
    color: var(--success);
    border-color: var(--success);
  }

  /* Success & Status */
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

  .status-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--card-header-bg);
    border: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
    border-radius: 2px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: var(--mcmaster-green);
    border-radius: 50%;
  }

  /* Progress */
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

  .file-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .file-summary-title {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
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

  .btn-outline {
    background: var(--card-bg);
    color: var(--mcmaster-green);
    border: 1px solid var(--mcmaster-green);
    font-weight: 600;
    font-size: 13px;
    padding: 7px 14px;
    border-radius: 2px;
    cursor: pointer;
  }

  .btn-outline:hover {
    background: var(--mcmaster-green);
    color: #ffffff;
  }

  .full-width {
    width: 100%;
  }

  .file-input-hidden {
    display: none;
  }
</style>
