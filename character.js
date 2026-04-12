/* ═══════ Speedster Character — self-contained, remove this file to rollback ═══════
 *  Kill switch:  window.SHOW_CHARACTER = false;  (set before this script loads)
 *  Files:        character.js, character.css
 *  DOM:          all elements are created dynamically with vibe-char- prefix
 *  Cleanup:      removing the <script> tag from index.html disables everything
 *
 *  Animation phases:
 *    1. ENTER   (1.2s)  — slide in from left portal, ease-out
 *    2. IDLE    (0.8s)  — pause near logo, gentle bob, user recognises character
 *    3. CHARGE  (0.35s) — electric spark build-up
 *    4. DASH    (0.35s) — lightning bolt across screen + ghost trail → vanish
 */
(function () {
  'use strict';

  /* ── Kill switch ── */
  if (window.SHOW_CHARACTER === false) return;

  /* ── Inline SVG — Superman-style flying pose (horizontal body, fist forward, hair/cape streaming back) ── */
  var RUNNER_SRC = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 28">' +
    /* cape streaming back */
    '<path d="M14 11 Q6 6 2 12 Q4 18 8 16 Q5 22 2 26 Q10 22 14 17" fill="#00b8d4" opacity=".55"/>' +
    '<path d="M14 12 Q8 8 4 13 Q7 17 10 15" fill="#00e6ff" opacity=".3"/>' +
    /* legs trailing back */
    '<path d="M16 17 L6 20 L4 22" stroke="#3a4a50" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
    '<path d="M16 15 L8 14 L5 16" stroke="#3a4a50" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
    /* body horizontal */
    '<ellipse cx="28" cy="14" rx="14" ry="5" fill="#3a4a50"/>' +
    /* torso accent lines */
    '<line x1="18" y1="14" x2="38" y2="14" stroke="#c87533" stroke-width=".5" opacity=".5"/>' +
    '<path d="M20 11 Q28 9 36 11" stroke="#00e6ff" stroke-width=".5" fill="none" opacity=".4"/>' +
    '<path d="M20 17 Q28 19 36 17" stroke="#00e6ff" stroke-width=".5" fill="none" opacity=".4"/>' +
    /* belt */
    '<rect x="22" y="12" width="4" height="4" rx="1" fill="#2a3a40"/>' +
    '<rect x="23" y="12.5" width="2" height="3" rx=".5" fill="#00e6ff" opacity=".55"/>' +
    /* S emblem on chest */
    '<text x="32" y="16.5" text-anchor="middle" font-size="5" font-weight="bold" fill="#00e6ff" font-family="sans-serif">S</text>' +
    /* head */
    '<ellipse cx="44" cy="12" rx="5" ry="4.5" fill="#3a4a50"/>' +
    /* visor */
    '<path d="M42 10 Q44 8.5 48 10" stroke="#00e6ff" stroke-width="1.4" fill="none"/>' +
    /* eyes */
    '<ellipse cx="44" cy="10.5" rx="1.2" ry=".6" fill="#00e6ff" opacity=".9"/>' +
    '<ellipse cx="47" cy="10.5" rx="1" ry=".5" fill="#00e6ff" opacity=".8"/>' +
    /* streaming hair */
    '<path d="M40 9 Q34 5 28 6" stroke="#00e6ff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>' +
    '<path d="M40 11 Q35 7 30 8" stroke="#00e6ff" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".5"/>' +
    '<path d="M39 8 Q33 3 26 5" stroke="#00e6ff" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".4"/>' +
    /* forward arm (fist punching ahead) */
    '<path d="M48 13 L56 11 L60 10" stroke="#3a4a50" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
    '<circle cx="61" cy="9.5" r="1.8" fill="#3a4a50"/>' +
    /* back arm tucked */
    '<path d="M20 13 L16 11" stroke="#3a4a50" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    /* shoe glow */
    '<ellipse cx="4" cy="22" rx="2" ry="1" fill="#00e6ff" opacity=".3"/>' +
    '<ellipse cx="5" cy="16" rx="2" ry="1" fill="#00e6ff" opacity=".3"/>' +
    '</svg>'
  );

  /* ── Configuration ── */
  var SIZE_W = 64;
  var SIZE_H = 28;
  var ENTER_MS  = 1200;   /* phase 1 duration */
  var IDLE_MS   = 800;    /* phase 2 duration */
  var CHARGE_MS = 350;    /* phase 3 duration */
  var DASH_MS   = 350;    /* phase 4 duration */
  var GHOST_INTERVAL = 25;
  var MIN_DELAY = 1000;
  var MAX_DELAY = 15000;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* Ease-out cubic */
  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }
  /* Ease-in cubic */
  function easeIn(t) { return t * t * t; }

  /* ── Get key positions ── */
  function getPositions() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var logo = document.getElementById('logo-main');
    var search = document.querySelector('.search-wrap');
    var lr = logo ? logo.getBoundingClientRect() : { top: vh * 0.22, left: vw * 0.35, width: 220, height: 50 };
    var sr = search ? search.getBoundingClientRect() : { top: vh * 0.35, left: vw * 0.25, width: 320 };

    return {
      /* entrance: off-screen left */
      startX: -SIZE_W - 30,
      startY: lr.top + lr.height * 0.3,
      /* idle: just left of logo center */
      idleX: lr.left + lr.width * 0.25,
      idleY: lr.top + lr.height * 0.3,
      /* dash exit: off-screen right */
      exitX: vw + SIZE_W + 30,
      exitY: sr.top - 10,
      /* for portal placement */
      portalEntryX: lr.left - 10,
      portalExitX: vw - 4,
      portalY: lr.top - 4
    };
  }

  /* ── Create portal element ── */
  function makePortal(x, y) {
    var p = document.createElement('div');
    p.className = 'vibe-char-portal';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    document.body.appendChild(p);
    return p;
  }

  /* ── Spawn a ghost at position ── */
  function spawnGhost(x, y) {
    var g = document.createElement('img');
    g.src = RUNNER_SRC;
    g.className = 'vibe-char-ghost';
    g.alt = '';
    g.width = SIZE_W;
    g.height = SIZE_H;
    g.draggable = false;
    g.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    document.body.appendChild(g);
    requestAnimationFrame(function () { g.classList.add('vibe-char-fade'); });
    setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 300);
  }

  /* ── Main show ── */
  function runShow() {
    var pos = getPositions();

    /* Create runner */
    var runner = document.createElement('img');
    runner.src = RUNNER_SRC;
    runner.className = 'vibe-char-runner';
    runner.alt = '';
    runner.width = SIZE_W;
    runner.height = SIZE_H;
    runner.draggable = false;
    runner.style.transform = 'translate3d(' + pos.startX + 'px,' + pos.startY + 'px,0)';
    document.body.appendChild(runner);

    /* Entrance portal */
    var portalIn = makePortal(pos.portalEntryX, pos.portalY);

    /* Force reflow */
    runner.offsetHeight;

    /* ═══ PHASE 1: ENTER — slide from left to idle position ═══ */
    runner.classList.add('vibe-char-enter');
    portalIn.classList.add('vibe-char-portal-open');

    var enterStart = performance.now();

    function enterFrame(ts) {
      var elapsed = ts - enterStart;
      var raw = Math.min(elapsed / ENTER_MS, 1);
      var t = easeOut(raw);

      var cx = pos.startX + (pos.idleX - pos.startX) * t;
      var cy = pos.startY + (pos.idleY - pos.startY) * t;
      runner.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';

      if (raw < 1) {
        requestAnimationFrame(enterFrame);
      } else {
        /* Close entrance portal */
        portalIn.classList.remove('vibe-char-portal-open');
        portalIn.classList.add('vibe-char-portal-close');
        setTimeout(function () { if (portalIn.parentNode) portalIn.parentNode.removeChild(portalIn); }, 300);

        /* ═══ PHASE 2: IDLE — pause + float ═══ */
        /* Store idle position as CSS custom properties for the float keyframes */
        runner.style.setProperty('--vibe-ix', pos.idleX.toFixed(1) + 'px');
        runner.style.setProperty('--vibe-iy', pos.idleY.toFixed(1) + 'px');
        runner.classList.add('vibe-char-idle');

        setTimeout(function () {
          runner.classList.remove('vibe-char-idle');

          /* ═══ PHASE 3: CHARGE — spark ═══ */
          runner.classList.add('vibe-char-charge');

          setTimeout(function () {
            runner.classList.remove('vibe-char-charge');

            /* ═══ PHASE 4: DASH — lightning bolt exit ═══ */
            runner.classList.add('vibe-char-dash');

            /* Exit portal */
            var portalOut = makePortal(pos.portalExitX, pos.portalY);
            portalOut.classList.add('vibe-char-portal-open');

            var dashStart = performance.now();
            var ghostTimer = setInterval(function () {
              var dt = performance.now() - dashStart;
              if (dt > DASH_MS) { clearInterval(ghostTimer); return; }
              var r = Math.min(dt / DASH_MS, 1);
              var gx = pos.idleX + (pos.exitX - pos.idleX) * easeIn(r);
              var gy = pos.idleY + (pos.exitY - pos.idleY) * r;
              spawnGhost(gx, gy);
            }, GHOST_INTERVAL);

            function dashFrame(ts) {
              var elapsed = ts - dashStart;
              var raw = Math.min(elapsed / DASH_MS, 1);
              var t = easeIn(raw);  /* start slow, accelerate → "빛의 속도" feeling */

              var cx = pos.idleX + (pos.exitX - pos.idleX) * t;
              var cy = pos.idleY + (pos.exitY - pos.idleY) * raw;
              runner.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';

              if (raw < 1) {
                requestAnimationFrame(dashFrame);
              } else {
                /* Clean everything up */
                clearInterval(ghostTimer);
                runner.style.opacity = '0';
                portalOut.classList.remove('vibe-char-portal-open');
                portalOut.classList.add('vibe-char-portal-close');
                setTimeout(function () {
                  if (runner.parentNode) runner.parentNode.removeChild(runner);
                  if (portalOut.parentNode) portalOut.parentNode.removeChild(portalOut);
                }, 300);
              }
            }
            requestAnimationFrame(dashFrame);

          }, CHARGE_MS);
        }, IDLE_MS);
      }
    }
    requestAnimationFrame(enterFrame);
  }

  /* ── Schedule — random 1s ~ 60s, once ── */
  var delay = rand(MIN_DELAY, MAX_DELAY);
  setTimeout(runShow, delay);
})();
