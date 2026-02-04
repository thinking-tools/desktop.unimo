(async () => {
  const isDev = await window.electronAPI.env.isDev();
  if (isDev) {
    document.documentElement.classList.add('dev-mode');
    console.log('Running in development mode');
  }
  const initVelocityCaret = (inputEl, caretEl, selEl, measurerEl, padding = 20) => {
    const BASE_TRAIL = 0.15,
      CHAR_FACTOR = 0.06,
      VELOCITY_FACTOR = 0.4,
      MAX_TRAIL = 0.4;
    let lastKeystroke = 0,
      lastCaretX = padding,
      lastLength = 0,
      hadSelection = false;
    let blinkTimer, fadeTimer;

    const measure = t => ((measurerEl.textContent = t || ''), measurerEl.offsetWidth);
    const caretX = () => padding + measure(inputEl.value.slice(0, inputEl.selectionStart));

    const updateCaret = () => {
      const x = caretX();
      caretEl.style.transform = `translate3d(${x}px, -50%, 0)`;
      lastCaretX = x;
    };

    const updateSelection = () => {
      const { selectionStart: s, selectionEnd: e, value } = inputEl;
      const hasSel = s !== e;
      if (!hasSel) {
        if (hadSelection) {
          selEl.classList.remove('visible');
          selEl.classList.add('hiding');
          setTimeout(() => selEl.classList.remove('hiding'), 120);
        }
        hadSelection = false;
        return false;
      }
      const x = padding + measure(value.slice(0, s));
      const w = measure(value.slice(s, e));
      selEl.style.setProperty('--sel-x', `${x}px`);
      selEl.style.width = `${w}px`;
      selEl.classList.remove('hiding');
      selEl.classList.add('visible');
      hadSelection = true;
      return true;
    };

    const triggerVelocity = (charDelta, direction) => {
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

      if (direction < 0) caretEl.classList.add('reverse');
      caretEl.offsetHeight; // reflow
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

    const show = () => {
      caretEl.classList.add('visible');
      updateCaret();
      updateSelection();
      clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => caretEl.classList.add('blinking'), 450);
    };

    const hide = () => {
      caretEl.classList.remove('visible', 'blinking', 'velocity', 'fading', 'reverse');
      selEl.classList.remove('visible', 'hiding');
      clearTimeout(blinkTimer);
      clearTimeout(fadeTimer);
    };

    inputEl.addEventListener('focus', show);
    inputEl.addEventListener('blur', hide);

    inputEl.addEventListener('input', () => {
      const len = inputEl.value.length;
      const x = caretX();
      const charDelta = len - lastLength;
      const dir = x - lastCaretX;
      const wasSelectionDelete = hadSelection && charDelta < 0;
      lastLength = len;
      updateCaret();
      updateSelection();
      triggerVelocity(wasSelectionDelete ? charDelta * 1.5 : charDelta, dir);
    });

    inputEl.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        requestAnimationFrame(() => {
          updateCaret();
          updateSelection();
        });
      }
    });

    inputEl.addEventListener('click', () => {
      updateCaret();
      updateSelection();
    });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === inputEl) {
        updateCaret();
        updateSelection();
      }
    });

    lastLength = inputEl.value.length;
    if (document.activeElement === inputEl) show();

    return { show, hide, update: updateCaret };
  };

  const input = document.getElementById('search-input');
  const resultsContainer = document.querySelector('.results');
  const searchBox = document.querySelector('.search-box');
  const el = document.getElementById('app');
  const actionButtons = document.querySelector('.action-buttons');
  const caret = document.getElementById('caret');
  const selection = document.getElementById('selection');
  const measurer = document.getElementById('measurer');
  const velocityCaret = initVelocityCaret(input, caret, selection, measurer, 20);

  const updateActionButtons = query => {
    actionButtons.hidden = query.trim().length <= 1;
  };

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
    updateActionButtons(query);
    results = query.trim() === '' ? [] : await window.electronAPI.search.query(query);
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
