/**
 * Page Transition Router — Circular expanding transitions
 * A smooth, circular clip-path animation that expands from click
 * point and reveals on arrival for internal page navigation.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var EXPAND_DURATION = 650;   // ms — circle expand
  var REVEAL_DURATION = 600;   // ms — circle shrink (reveal)
  var REVEAL_DELAY = 130;      // ms — tiny pause before reveal

  // ============================================================
  // BUILD OVERLAY
  // ============================================================
  var overlay = document.createElement('div');
  overlay.id = 'pageTransitionOverlay';

  var styles = document.createElement('style');
  styles.textContent = [
    '#pageTransitionOverlay {',
    '  position: fixed;',
    '  top: 0; left: 0;',
    '  width: 100%; height: 100%;',
    '  z-index: 99999;',
    '  pointer-events: none;',
    '  display: none;',
    '  background: #16213e;',
    '  clip-path: circle(0 at 50% 50%);',
    '  will-change: clip-path;',
    '}',
    '',
    '/* Center glow when expanding */',
    '#pageTransitionOverlay::before {',
    '  content: "";',
    '  position: absolute;',
    '  inset: 0;',
    '  background: radial-gradient(',
    '    circle at var(--cx, 50%) var(--cy, 50%),',
    '    rgba(99, 102, 241, 0.18) 0%,',
    '    rgba(118, 75, 162, 0.08) 30%,',
    '    transparent 65%',
    '  );',
    '  pointer-events: none;',
    '}',
    '',
    '/* Subtle ring flash at center peak */',
    '#pageTransitionOverlay::after {',
    '  content: "";',
    '  position: absolute;',
    '  inset: 0;',
    '  background: radial-gradient(',
    '    circle at var(--cx, 50%) var(--cy, 50%),',
    '    rgba(255, 255, 255, 0.06) 0%,',
    '    transparent 40%',
    '  );',
    '  pointer-events: none;',
    '}'
  ].join('\n');

  document.head.appendChild(styles);
  document.body.appendChild(overlay);

  // ============================================================
  // HELPERS
  // ============================================================
  /** Compute the radius needed to cover the viewport from (cx, cy). */
  function coverRadius(cx, cy, vw, vh) {
    return Math.ceil(Math.sqrt(
      Math.max(
        cx * cx + cy * cy,
        (vw - cx) * (vw - cx) + cy * cy,
        cx * cx + (vh - cy) * (vh - cy),
        (vw - cx) * (vw - cx) + (vh - cy) * (vh - cy)
      )
    ));
  }

  /** Safe style setter with reflow. */
  function setClip(el, clip, transition) {
    if (transition) {
      el.style.transition = 'clip-path ' + transition;
    } else {
      el.style.transition = 'none';
    }
    el.style.clipPath = clip;
  }

  // ============================================================
  // ANIMATIONS
  // ============================================================

  /**
   * EXPAND — circle grows from (x, y) to cover the entire screen.
   * @param {number} x  ClientX of the click
   * @param {number} y  ClientY of the click
   * @param {Function} done  Callback after animation completes
   */
  function expand(x, y, done) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cx = typeof x === 'number' ? x : vw / 2;
    var cy = typeof y === 'number' ? y : vh / 2;
    var radius = coverRadius(cx, cy, vw, vh);

    overlay.style.setProperty('--cx', cx + 'px');
    overlay.style.setProperty('--cy', cy + 'px');
    overlay.style.display = 'block';

    // Start at zero
    setClip(overlay, 'circle(0 at ' + cx + 'px ' + cy + 'px)');
    overlay.getBoundingClientRect(); // force reflow

    // Animate outward with a slight overshoot bounce
    setClip(
      overlay,
      'circle(' + radius + 'px at ' + cx + 'px ' + cy + 'px)',
      EXPAND_DURATION + 'ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    );

    setTimeout(done, EXPAND_DURATION + 50);
  }

  /**
   * REVEAL — circle starts covering the screen and shrinks to zero.
   * @param {Function} done  Callback after animation completes
   */
  function reveal(done) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cx = vw / 2;
    var cy = vh / 2;
    var radius = coverRadius(cx, cy, vw, vh);

    overlay.style.setProperty('--cx', cx + 'px');
    overlay.style.setProperty('--cy', cy + 'px');
    overlay.style.display = 'block';

    // Start fully expanded
    setClip(overlay, 'circle(' + radius + 'px at ' + cx + 'px ' + cy + 'px)');
    overlay.getBoundingClientRect(); // force reflow

    // Shrink to center
    setClip(
      overlay,
      'circle(0 at ' + cx + 'px ' + cy + 'px)',
      REVEAL_DURATION + 'ms cubic-bezier(0.65, 0, 0.35, 1)'
    );

    setTimeout(function () {
      overlay.style.display = 'none';
      dispatchRevealComplete();
      if (done) done();
    }, REVEAL_DURATION + 30);
  }

  // ============================================================
  // LINK INTERCEPTION
  // ============================================================

  function isExternal(href) {
    if (!href) return true;
    // Internal anchors
    if (href.startsWith('#')) return false;
    // Absolute external
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return true;
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return true;
    return false;
  }

  document.addEventListener('click', function (e) {
    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var link = e.target.closest('a');
    if (!link) return;

    var href = link.getAttribute('href');

    // Skip external, blank-target, download
    if (isExternal(href)) return;
    if (link.hasAttribute('target')) return;
    if (link.hasAttribute('download')) return;
    if (href.startsWith('#')) return; // anchor links — handled smoothly by native scroll

    // Only intercept navigations to HTML pages or directory paths
    // This catches: index.html, karya/index.html, ../index.html, karya/, etc.
    if (
      !href.endsWith('.html') &&
      !href.endsWith('/') &&
      href !== '' &&
      href.indexOf('.') === -1
    ) return;

    e.preventDefault();

    expand(e.clientX, e.clientY, function () {
      window.location.href = href;
    });
  });

  // ============================================================
  // PAGE LOAD REVEAL
  // ============================================================

  function onPageReady() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      overlay.style.display = 'none';
      dispatchRevealComplete();
      return;
    }
    // Small delay so the browser paints first
    setTimeout(function () {
      reveal();
    }, REVEAL_DELAY);
  }

  function dispatchRevealComplete() {
    document.dispatchEvent(new CustomEvent('revealComplete'));
  }

  // Run as early as possible but after paint
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageReady);
  } else {
    onPageReady();
  }
})();
