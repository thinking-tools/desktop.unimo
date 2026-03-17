/**
 * Velocity Caret — a typing-speed-aware animated caret overlay for <input> elements.
 *
 * Renders a custom caret with a directional trail whose length scales with
 * typing velocity. Supports forward/reverse trails, glow, and blink-on-idle.
 *
 * Requires `velocity-caret.css` to be loaded for visual styles.
 *
 * @example
 * ```ts
 * import { initVelocityCaret } from './velocity-caret.js';
 * const caret = initVelocityCaret(document.querySelector('input')!);
 * // later: caret.destroy();
 * ```
 */

interface VelocityCaretHandle {
  /** Remove all DOM elements and event listeners. */
  destroy(): void;
}

const BASE_TRAIL = 0.15;
const CHAR_FACTOR = 0.06;
const VELOCITY_FACTOR = 0.4;
const MAX_TRAIL = 0.4;
const BLINK_DELAY = 450;
const FADE_DELAY = 20;

export const initVelocityCaret = (inputEl: HTMLInputElement): VelocityCaretHandle => {
  // ── build DOM overlay ──────────────────────────────────────
  const mirror = document.createElement('div');
  mirror.className = 'vc-mirror';
  mirror.setAttribute('aria-hidden', 'true');

  const textSpan = document.createElement('span');
  textSpan.className = 'vc-text';

  const caretEl = document.createElement('span');
  caretEl.className = 'vc-caret';

  mirror.append(textSpan, caretEl);

  const parent = inputEl.parentElement!;
  parent.style.position ||= 'relative';
  parent.insertBefore(mirror, inputEl);
  inputEl.classList.add('vc-input');

  // ── state ──────────────────────────────────────────────────
  let lastKeystroke = 0;
  let lastLength = inputEl.value.length;
  let lastCaretPos = inputEl.selectionStart ?? 0;
  let selActive = false;
  let blinkTimer: ReturnType<typeof setTimeout>;
  let fadeTimer: ReturnType<typeof setTimeout>;

  const sync = () => {
    textSpan.textContent = inputEl.value.slice(0, inputEl.selectionStart ?? 0);
  };

  const triggerVelocity = (charDelta: number, dir: number) => {
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
    void caretEl.offsetHeight; // force reflow
    caretEl.classList.add('velocity');

    fadeTimer = setTimeout(() => {
      caretEl.classList.remove('velocity');
      caretEl.classList.add('fading');
    }, FADE_DELAY);

    blinkTimer = setTimeout(() => {
      caretEl.classList.remove('fading', 'reverse');
      caretEl.classList.add('blinking');
    }, BLINK_DELAY);
  };

  const resetBlink = () => {
    caretEl.classList.remove('blinking', 'velocity', 'fading', 'reverse');
    clearTimeout(blinkTimer);
    clearTimeout(fadeTimer);
    blinkTimer = setTimeout(() => caretEl.classList.add('blinking'), BLINK_DELAY);
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

  // ── event handlers ─────────────────────────────────────────
  const onFocus = () => show();
  const onBlur = () => hide();

  const onKeydown = (e: KeyboardEvent) => {
    selActive = (inputEl.selectionStart ?? 0) !== (inputEl.selectionEnd ?? 0);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      requestAnimationFrame(() => {
        const pos = inputEl.selectionStart ?? 0;
        const dir = pos - lastCaretPos;
        lastCaretPos = pos;
        sync();
        dir !== 0 ? triggerVelocity(0, dir) : resetBlink();
      });
    }
  };

  const onInput = () => {
    const len = inputEl.value.length;
    const pos = inputEl.selectionStart ?? 0;
    const charDelta = len - lastLength;
    const dir = pos - lastCaretPos;
    lastLength = len;
    lastCaretPos = pos;
    sync();
    triggerVelocity(selActive && charDelta < 0 ? charDelta * 1.5 : charDelta, dir);
    selActive = false;
  };

  const onClick = () => {
    lastCaretPos = inputEl.selectionStart ?? 0;
    sync();
    resetBlink();
  };

  const onSelectionChange = () => {
    if (document.activeElement === inputEl) {
      lastCaretPos = inputEl.selectionStart ?? 0;
      sync();
    }
  };

  inputEl.addEventListener('focus', onFocus);
  inputEl.addEventListener('blur', onBlur);
  inputEl.addEventListener('keydown', onKeydown);
  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('click', onClick);
  document.addEventListener('selectionchange', onSelectionChange);

  if (document.activeElement === inputEl) show();

  // ── cleanup ────────────────────────────────────────────────
  return {
    destroy() {
      clearTimeout(blinkTimer);
      clearTimeout(fadeTimer);
      inputEl.removeEventListener('focus', onFocus);
      inputEl.removeEventListener('blur', onBlur);
      inputEl.removeEventListener('keydown', onKeydown);
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('click', onClick);
      document.removeEventListener('selectionchange', onSelectionChange);
      inputEl.classList.remove('vc-input');
      mirror.remove();
    },
  };
};
