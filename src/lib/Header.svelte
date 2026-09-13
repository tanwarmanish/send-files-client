<script lang="ts">
  interface Props {
    title?: string;
  }

  let { title = 'Send Files' }: Props = $props();

  let isDark = $state(false);

  $effect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        isDark = true;
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        isDark = false;
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
  });

  function toggleTheme() {
    isDark = !isDark;
    const themeName = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);
  }
</script>

<header class="top-nav">
  <div class="nav-container">
    <div class="brand">
      <div class="brand-badge">SF</div>
      <h1 class="brand-title">{title}</h1>
    </div>

    <div class="nav-controls">
      <button
        type="button"
        class="btn-theme"
        onclick={toggleTheme}
        aria-label="Toggle light or dark theme"
      >
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
    </div>
  </div>
</header>

<style>
  .top-nav {
    background: var(--header-bg);
    color: var(--header-text);
    border-bottom: 3px solid var(--mcmaster-yellow);
    width: 100%;
  }

  .nav-container {
    max-width: 900px;
    margin: 0 auto;
    padding: max(0.6rem, env(safe-area-inset-top, 0.6rem)) 1rem 0.6rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    user-select: none;
  }

  .brand-badge {
    background: var(--mcmaster-yellow);
    color: #000;
    font-weight: 800;
    font-size: 13px;
    padding: 2px 6px;
    border-radius: 2px;
    font-family: var(--font-mono);
    line-height: 1.2;
  }

  .brand-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.01em;
  }

  .nav-controls {
    display: flex;
    align-items: center;
  }

  .btn-theme {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #ffffff;
    padding: 4px 10px;
    border-radius: 2px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-theme:hover {
    background: rgba(255, 255, 255, 0.15);
  }
</style>
