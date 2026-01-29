(async () => {
  const isDev = await window.electronAPI.env.isDev();
  if (isDev) {
    document.documentElement.classList.add('dev-mode');
    console.log('Running in development mode');
  }

  const input = document.getElementById('search-input');
  const resultsContainer = document.querySelector('.results');
  const searchBox = document.querySelector('.search-box');
  const el = document.getElementById('app');

  // Track state to avoid redundant IPC and detect desync
  let ignoreMouseState = true;
  const setClickThrough = ignore => {
    if (ignore === ignoreMouseState) return;
    ignoreMouseState = ignore;
    window.electronAPI.window.setIgnoreMouse(ignore);
  };

  // Use a single interactive zone - wrap searchBox + results in one container
  // or track hover count for overlapping regions
  let hoverCount = 0;
  const onEnterInteractive = () => {
    hoverCount++;
    setClickThrough(false);
  };
  const onLeaveInteractive = () => {
    hoverCount--;
    if (hoverCount <= 0) {
      hoverCount = 0;
      setClickThrough(true);
    }
  };

  setClickThrough(true);
  [searchBox, resultsContainer].forEach(target => {
    target.addEventListener('mouseenter', onEnterInteractive);
    target.addEventListener('mouseleave', onLeaveInteractive);
  });

  let activeIndex = 0;
  let results = [];
  let debounceTimer = null;

  const hide = () => {
    // Reset state before hiding
    hoverCount = 0;
    setClickThrough(true);
    window.electronAPI.window.hide();
  };

  const reset = () => {
    results = [];
    activeIndex = 0;
    resultsContainer.innerHTML = '';
    input.value = '';
  };

  const execute = async (id, keepOpen = false) => {
    if (!id) return;
    const success = await window.electronAPI.execute.command(id);
    if (success && !keepOpen) {
      reset();
      hide();
    } else if (!success) console.error('Failed to execute:', id);
  };

  const mainStartTime = await window.electronAPI.perf.getStartTime();
  el.dataset.startupMs = Date.now() - mainStartTime;
  el.dataset.ready = 'true';

  const renderResults = () => {
    resultsContainer.innerHTML = results
      .map(
        (r, i) => `
      <div class="result-item${i === activeIndex ? ' active' : ''}" data-id="${r.id}">
        <div class="result-icon" data-icon-id="${r.id}">${r.icon.startsWith('data:') ? `<img src="${r.icon}" width="24" height="24">` : r.icon}</div>
        <div class="result-content">
          <div class="result-title">${r.title}</div>
          ${r.subtitle ? `<div class="result-subtitle">${r.subtitle}</div>` : ''}
        </div>
        ${r.shortcut ? `<span class="result-shortcut">${r.shortcut}</span>` : ''}
      </div>
    `,
      )
      .join('');

    results.forEach(r => {
      if (!r.icon.startsWith('data:') && r.id.startsWith('app:')) {
        window.electronAPI.apps.getIcon(r.id).then(icon => {
          if (icon) {
            r.icon = icon;
            const el = resultsContainer.querySelector(`[data-icon-id="${r.id}"]`);
            if (el) el.innerHTML = `<img src="${icon}" width="24" height="24">`;
          }
        });
      }
    });
  };

  const doSearch = async query => {
    results = query.trim() === '' ? [] : await window.electronAPI.search.query(query);
    activeIndex = 0;
    renderResults();
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value), 8);
  });

  document.addEventListener('mousedown', e => {
    const isInteractive = e.target.closest('.search-box, .results');
    if (!isInteractive) hide();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, results.length - 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex > 0) {
        activeIndex--;
        renderResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[activeIndex];
      if (selected) {
        const keepOpen = selected.category === 'command' && selected.id === 'cmd:settings';
        execute(selected.id, keepOpen);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });

  resultsContainer.addEventListener('click', e => {
    const item = e.target.closest('.result-item');
    if (item) execute(item.dataset.id);
  });

  resultsContainer.addEventListener('mousemove', e => {
    const item = e.target.closest('.result-item');
    if (item) {
      const idx = results.findIndex(r => r.id === item.dataset.id);
      if (idx !== -1 && idx !== activeIndex) {
        activeIndex = idx;
        renderResults();
      }
    }
  });

  window.electronAPI.window.onShow(() => {
    hoverCount = 0;
    setClickThrough(true);
    input.focus();
  });

  requestAnimationFrame(() => {
    hoverCount = 0;
    setClickThrough(true);
  });

  input.focus();
  doSearch('');
})();
