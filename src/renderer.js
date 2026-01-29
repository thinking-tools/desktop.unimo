(async () => {
  const isDev = await window.electronAPI.env.isDev();

  if (isDev) {
    document.documentElement.classList.add('dev-mode');
    console.log('Running in development mode');
  }

  const input = document.getElementById('search-input');
  const resultsContainer = document.querySelector('.results');
  let activeIndex = 0;
  let results = [];
  let debounceTimer = null;
  const mainStartTime = await window.electronAPI.perf.getStartTime();
  const now = Date.now();
  const el = document.getElementById('app');

  const hide = () => {
    window.electronAPI.window.hide();
    results = [];
    resultsContainer.innerHTML = '';
    input.value = '';
  };

  el.dataset.startupMs = now - mainStartTime;
  el.dataset.ready = 'true';
  input.focus();

  const renderResults = () => {
    resultsContainer.innerHTML = results
      .map(
        (r, i) => `
      <div class="result-item${i === activeIndex ? ' active' : ''}" data-id="${r.id}">
        <div class="result-icon">${r.icon}</div>
        <div class="result-content">
          <div class="result-title">${r.title}</div>
          ${r.subtitle ? `<div class="result-subtitle">${r.subtitle}</div>` : ''}
        </div>
        ${r.shortcut ? `<span class="result-shortcut">${r.shortcut}</span>` : ''}
      </div>
    `,
      )
      .join('');
  };
  const doSearch = async query => {
    if (query.trim() === '') {
      results = [];
    } else {
      results = await window.electronAPI.search.query(query);
    }
    activeIndex = 0;
    renderResults();
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => doSearch(input.value), 8); // ~1 frame debounce
  });

  // input.addEventListener('blur', () => {
  //   if (results.length === 0) {
  //     setTimeout(() => {
  //       hide();
  //     }, 100);
  //   }
  // });

  document.addEventListener('mousedown', e => {
    if (!el.contains(e.target)) {
      hide();
    }
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
      } else {
        // TODO: load history here
      }
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      console.log('Selected:', results[activeIndex]);
      // TODO: execute action
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });

  resultsContainer.addEventListener('click', e => {
    const item = e.target.closest('.result-item');
    if (item) {
      const id = item.getAttribute('data-id');
      const result = results.find(r => r.id === id);
      if (result) console.log('Clicked:', result);
    }
  });

  // initial load
  doSearch('');
})();
