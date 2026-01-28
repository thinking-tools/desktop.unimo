(async () => {
  const isDev = await window.electronAPI.env.isDev();

  if (isDev) {
    document.documentElement.classList.add('dev-mode');
    console.log('Running in development mode');
  }
  const mainStartTime = await window.electronAPI.perf.getStartTime();
  const now = Date.now();
  const el = document.getElementById('app');
  el.dataset.startupMs = now - mainStartTime;
  el.dataset.ready = 'true';
  el.textContent = 'Ready';
})();
