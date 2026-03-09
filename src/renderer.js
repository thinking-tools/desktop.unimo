(async () => {
  document.body.dataset.platform = window.electronAPI.platform;

  const isDev = await window.electronAPI.env.isDev();
  if (isDev) {
    document.documentElement.classList.add('dev-mode');
    console.log('Running in development mode');
  }
  const initVelocityCaret = (inputEl, textBeforeCaret, caretEl) => {
    const BASE_TRAIL = 0.15,
      CHAR_FACTOR = 0.06,
      VELOCITY_FACTOR = 0.4,
      MAX_TRAIL = 0.4;
    let lastKeystroke = 0,
      lastLength = 0,
      lastCaretPos = 0,
      selActive = false;
    let blinkTimer, fadeTimer;

    const sync = () => {
      textBeforeCaret.textContent = inputEl.value.slice(0, inputEl.selectionStart);
    };

    const triggerVelocity = (charDelta, dir) => {
      const now = performance.now();
      const dt = now - lastKeystroke;
      lastKeystroke = now;

      caretEl.classList.remove('blinking', 'velocity', 'fading', 'reverse');
      clearTimeout(blinkTimer);
      clearTimeout(fadeTimer);

      const charContrib = Math.log1p(Math.abs(charDelta)) * CHAR_FACTOR;
      const velocityBonus = Math.max(0, 1 - dt / 150) * VELOCITY_FACTOR;
      const scale = Math.min(MAX_TRAIL, BASE_TRAIL + charContrib + velocityBonus);
      caretEl.style.setProperty('--trail-scale', scale.toFixed(3));

      if (dir < 0) caretEl.classList.add('reverse');
      caretEl.offsetHeight;
      caretEl.classList.add('velocity');

      fadeTimer = setTimeout(() => {
        caretEl.classList.remove('velocity');
        caretEl.classList.add('fading');
      }, 20);

      blinkTimer = setTimeout(() => {
        caretEl.classList.remove('fading', 'reverse');
        caretEl.classList.add('blinking');
      }, 450);
    };

    const resetBlink = () => {
      caretEl.classList.remove('blinking', 'velocity', 'fading', 'reverse');
      clearTimeout(blinkTimer);
      clearTimeout(fadeTimer);
      blinkTimer = setTimeout(() => caretEl.classList.add('blinking'), 450);
    };

    const show = () => {
      sync();
      caretEl.classList.add('visible');
      resetBlink();
    };

    const hide = () => {
      caretEl.classList.remove('visible', 'blinking', 'velocity', 'fading', 'reverse');
      clearTimeout(blinkTimer);
      clearTimeout(fadeTimer);
    };

    inputEl.addEventListener('focus', show);
    inputEl.addEventListener('blur', hide);

    inputEl.addEventListener('keydown', e => {
      selActive = inputEl.selectionStart !== inputEl.selectionEnd;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        requestAnimationFrame(() => {
          const pos = inputEl.selectionStart;
          const dir = pos - lastCaretPos;
          lastCaretPos = pos;
          sync();
          dir !== 0 ? triggerVelocity(0, dir) : resetBlink();
        });
      }
    });

    inputEl.addEventListener('input', () => {
      const len = inputEl.value.length;
      const pos = inputEl.selectionStart;
      const charDelta = len - lastLength;
      const dir = pos - lastCaretPos;
      lastLength = len;
      lastCaretPos = pos;
      sync();
      triggerVelocity(selActive && charDelta < 0 ? charDelta * 1.5 : charDelta, dir);
      selActive = false;
    });

    inputEl.addEventListener('click', () => {
      lastCaretPos = inputEl.selectionStart;
      sync();
      resetBlink();
    });

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === inputEl) {
        lastCaretPos = inputEl.selectionStart;
        sync();
      }
    });

    lastLength = inputEl.value.length;
    lastCaretPos = inputEl.selectionStart;
    if (document.activeElement === inputEl) show();
  };

  const textBefore = document.getElementById('text-before-caret');
  const caret = document.getElementById('caret');
  const selection = document.getElementById('selection');
  const measurer = document.getElementById('measurer');

  const tags = Object.freeze({ search: 'search', web: 'web', ai: 'ai', notes: 'notes' });
  let activeTag = tags.search;

  const input = document.getElementById('search-input');
  const resultsContainer = document.querySelector('.results');
  const searchBox = document.querySelector('.search-box');
  const el = document.getElementById('app');
  const actionButtons = document.querySelector('.action-buttons');

  initVelocityCaret(input, textBefore, caret);

  const updateActionButtons = () => {
    const activeBtn = actionButtons.querySelector('button.active');
    if (activeBtn) {
      const btnState = activeBtn.dataset.action;
      if (btnState !== activeTag) {
        activeBtn.classList.remove('active');
        const newActive = actionButtons.querySelector(`button[data-action="${activeTag}"]`);
        if (newActive) newActive.classList.add('active');
      }
    }
  };

  const LOCAL_DEBOUNCE = 90;
  const SUGGEST_DEBOUNCE = 250;
  const SEARCH_DEBOUNCE = 500;

  let activeIndex = 0;
  let results = [];
  let suggestions = [];
  let debounceTimer = null;
  let suggestTimer = null;
  let searchTimer = null;
  let webSeq = 0;

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const highlightMatch = (text, query) => {
    const low = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = low.indexOf(q);
    if (idx < 0 || !q) return esc(text);
    return (
      esc(text.slice(0, idx)) + '<b>' + esc(text.slice(idx, idx + q.length)) + '</b>' + esc(text.slice(idx + q.length))
    );
  };

  const hide = () => {
    window.electronAPI.window.hide();
  };

  const reset = () => {
    results = [];
    suggestions = [];
    activeIndex = 0;
    webSeq++;
    clearTimeout(debounceTimer);
    clearTimeout(suggestTimer);
    clearTimeout(searchTimer);
    resultsContainer.innerHTML = '';
    input.value = '';
    actionButtons.hidden = true;
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

  const showingSuggestions = () => activeTag === 'web' && suggestions.length > 0 && results.length === 0;

  const renderResults = () => {
    if (showingSuggestions()) {
      const q = input.value.trim();
      resultsContainer.innerHTML = suggestions
        .map(
          (s, i) => `
        <div class="result-item suggestion-item${i === activeIndex ? ' active' : ''}" data-suggestion="${esc(s)}">
          <div class="result-icon suggestion-icon">🔍</div>
          <div class="result-content">
            <div class="result-title">${highlightMatch(s, q)}</div>
          </div>
        </div>`,
        )
        .join('');
      return;
    }

    resultsContainer.innerHTML = results
      .map(
        (r, i) => `
      <div class="result-item${r.category === 'web' ? ' web-result' : ''}${i === activeIndex ? ' active' : ''}" data-id="${r.id}">
        <div class="result-icon${r.category === 'web' ? ' web-icon' : ''}" data-icon-id="${r.id}">${r.icon.startsWith('data:') ? `<img src="${r.icon}" width="24" height="24">` : r.icon}</div>
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
    const seq = webSeq;
    if (!query || query.trim() === '') {
      results = [];
      suggestions = [];
      activeIndex = 0;
      renderResults();
      return;
    }
    const isWeb = activeTag === 'web';
    const r = await window.electronAPI.search.query({
      type: activeTag,
      query,
      ...(isWeb ? { seq } : {}),
    });
    if (isWeb && seq !== webSeq) return;
    results = r || [];
    if (isWeb) suggestions = [];
    activeIndex = 0;
    renderResults();
  };

  actionButtons.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const query = input.value.trim();
    if (query.length <= 1) return;

    const action = btn.dataset.action;
    window.electronAPI.execute.action(action, query);
  });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    clearTimeout(suggestTimer);
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (activeTag === 'web') {
      if (!query) {
        suggestions = [];
        results = [];
        activeIndex = 0;
        webSeq++;
        renderResults();
        return;
      }

      const seq = ++webSeq;

      suggestTimer = setTimeout(async () => {
        try {
          const s = await window.electronAPI.search.suggest(query, seq);
          if (seq !== webSeq) return;
          suggestions = s;
          if (results.length === 0) {
            activeIndex = 0;
            renderResults();
          }
        } catch {
          /* ignore */
        }
      }, SUGGEST_DEBOUNCE);

      searchTimer = setTimeout(async () => {
        try {
          const r = await window.electronAPI.search.query({ type: 'web', query, seq });
          if (seq !== webSeq) return;
          results = r || [];
          suggestions = [];
          activeIndex = 0;
          renderResults();
        } catch {
          /* ignore */
        }
      }, SEARCH_DEBOUNCE);
    } else {
      debounceTimer = setTimeout(() => doSearch(query), LOCAL_DEBOUNCE);
    }
  });

  input.addEventListener('keydown', async e => {
    const itemCount = showingSuggestions() ? suggestions.length : results.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, itemCount - 1);
      renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex > 0) {
        activeIndex--;
        renderResults();
      }
    } else if (e.key === 'Tab') {
      if (showingSuggestions()) {
        e.preventDefault();
        const selected = suggestions[activeIndex] || suggestions[0];
        input.value = selected;
        textBefore.textContent = selected;
        suggestions = [];
        const seq = ++webSeq;
        clearTimeout(suggestTimer);
        clearTimeout(searchTimer);
        suggestTimer = setTimeout(async () => {
          try {
            const s = await window.electronAPI.search.suggest(selected, seq);
            if (seq !== webSeq) return;
            suggestions = s;
            if (results.length === 0) {
              activeIndex = 0;
              renderResults();
            }
          } catch {
            /* ignore */
          }
        }, SUGGEST_DEBOUNCE);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();

      if (activeTag === 'web') {
        clearTimeout(suggestTimer);
        clearTimeout(searchTimer);

        if (showingSuggestions()) {
          const selected = suggestions[activeIndex] || suggestions[0];
          input.value = selected;
          textBefore.textContent = selected;
          suggestions = [];
          renderResults();
          doSearch(selected);
        } else if (results.length > 0) {
          const selected = results[activeIndex];
          if (selected) execute(selected.id);
        } else {
          const q = input.value.trim();
          if (q) doSearch(q);
        }
      } else {
        const selected = results[activeIndex];
        if (selected) {
          const keepOpen = selected.category === 'command' && selected.id === 'cmd:settings';
          execute(selected.id, keepOpen);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });

  resultsContainer.addEventListener('click', e => {
    const suggestion = e.target.closest('.suggestion-item');
    if (suggestion) {
      const text = suggestion.dataset.suggestion;
      input.value = text;
      textBefore.textContent = text;
      suggestions = [];
      webSeq++;
      renderResults();
      doSearch(text);
      return;
    }

    const item = e.target.closest('.result-item');
    if (item) execute(item.dataset.id);
  });

  resultsContainer.addEventListener('mousemove', e => {
    const item = e.target.closest('.result-item');
    if (!item) return;

    if (item.classList.contains('suggestion-item')) {
      const idx = [...resultsContainer.querySelectorAll('.suggestion-item')].indexOf(item);
      if (idx !== -1 && idx !== activeIndex) {
        activeIndex = idx;
        renderResults();
      }
    } else {
      const idx = results.findIndex(r => r.id === item.dataset.id);
      if (idx !== -1 && idx !== activeIndex) {
        activeIndex = idx;
        renderResults();
      }
    }
  });

  window.electronAPI.window.onShowSearch(() => {
    input.focus();
    activeTag = tags.search;
    suggestions = [];
    webSeq++;
    clearTimeout(suggestTimer);
    clearTimeout(searchTimer);
    updateActionButtons();
    doSearch('');
  });

  window.electronAPI.window.onShowWeb(() => {
    input.focus();
    activeTag = tags.web;
    suggestions = [];
    results = [];
    webSeq++;
    clearTimeout(suggestTimer);
    clearTimeout(searchTimer);
    updateActionButtons();
    renderResults();
  });

  input.focus();
  doSearch('');
})();
