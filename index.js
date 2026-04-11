﻿/* ─── Config ─── */
  const TMDB_KEY  = 'f8a2a8ea141ae946e983a431a79b0c9b';
  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE  = 'https://image.tmdb.org/t/p/';

  /* ─── DOM ─── */
  const inp     = document.getElementById('search-inp');
  const btn     = document.getElementById('search-btn');
  const acDrop  = document.getElementById('ac-drop');
  const boTrack = document.getElementById('bo-track');
  const boScroll= document.getElementById('bo-scroll');
  let boxLoadToken = 0;

  /* ─── HTML escape (XSS) ─── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* 한국어 조사 을/를 자동 선택 */
  function eulReul(str) {
    if (!str) return '를';
    const last = str[str.length - 1];
    const code = last.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      return (code - 0xAC00) % 28 === 0 ? '를' : '을';
    }
    return '를';
  }

  /* ─── TMDB fetch + timeout ─── */
  async function tfetch(path) {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(TMDB_BASE + path, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    } catch(e) { clearTimeout(t); throw e; }
  }

  /* ─── Autocomplete ─── */
  let acTimer = null;
  inp.addEventListener('input', () => {
    clearTimeout(acTimer);
    const q = inp.value.trim();
    if (!q) { hideAc(); return; }
    acTimer = setTimeout(() => fetchMulti(q), 320);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(acTimer); fetchMulti(inp.value.trim()); }
    if (e.key === 'Escape') hideAc();
  });
  btn.addEventListener('click', () => fetchMulti(inp.value.trim()));
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) hideAc(); });

  function hideAc() { acDrop.style.display = 'none'; acDrop.innerHTML = ''; }

  async function fetchMulti(q) {
    if (!q) return;
    try {
      const data = await tfetch('/search/multi?api_key=' + TMDB_KEY + '&language=ko-KR&query=' + encodeURIComponent(q));
      const list = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);
      renderAc(list);
    } catch(e) { console.warn('search error', e); }
  }

  function renderAc(list) {
    if (!list.length) { hideAc(); return; }
    acDrop.innerHTML = '';
    list.forEach((r, i) => {
      if (i > 0) { const d = document.createElement('div'); d.className = 'ac-sep'; acDrop.append(d); }
      const isTV  = r.media_type === 'tv';
      const title = r.title || r.name || '—';
      const year  = (r.release_date || r.first_air_date || '').slice(0, 4);
      const thumb = r.poster_path ? IMG_BASE + 'w92' + r.poster_path : '';
      const el    = document.createElement('div');
      el.className = 'ac-item';
      el.innerHTML = `
        ${thumb
          ? `<img class="ac-thumb" src="${esc(thumb)}" alt="" loading="lazy" />`
          : `<div class="ac-thumb" style="border-radius:6px"></div>`}
        <div class="ac-info">
          <div class="ac-name">${esc(title)}</div>
          <div class="ac-meta">${esc(year) || '연도 미상'}</div>
        </div>
        <span class="ac-badge ${isTV ? 'ac-tv' : 'ac-movie'}">${isTV ? '📺 TV' : '🎬 MOVIE'}</span>
      `;
      el.addEventListener('click', () => {
        hideAc();
        location.href = 'movie-detail.html?id=' + r.id + '&type=' + r.media_type;
      });
      acDrop.append(el);
    });
    acDrop.style.display = 'block';
  }

  /* ─── Rating color ─── */
  function gcol(v) {
    if (v >= 8)  return '#ccff00';
    if (v >= 7)  return '#a3e635';
    if (v >= 6)  return '#facc15';
    if (v >= 5)  return '#f97316';
    return '#f87171';
  }

  /* ─── Popularity badge ─── */
  function gpop(p) {
    if (p > 280) return { cls:'pop-hot', txt:'🔥 TRENDING' };
    if (p > 110) return { cls:'pop-up',  txt:'📈 RISING' };
    if (p > 55)  return { cls:'pop-att', txt:'✨ NOTABLE' };
    return null;
  }

  /* ─── Genre map (TMDB IDs → labels) ─── */
  const GENRE_MAP = {
    28:'ACTION',12:'ADVENTURE',16:'ANIMATION',35:'COMEDY',80:'CRIME',
    99:'DOCUMENTARY',18:'DRAMA',10751:'FAMILY',14:'FANTASY',36:'HISTORY',
    27:'HORROR',10402:'MUSIC',9648:'MYSTERY',10749:'ROMANCE',
    878:'SCI-FI',53:'THRILLER',10752:'WAR',37:'WESTERN',
  };

  /* ─── Build card ─── */
  function makeCard(m, rank) {
    const rCls = rank === 1 ? 'bo-r1' : rank === 2 ? 'bo-r2' : rank === 3 ? 'bo-r3' : '';
    const delay = ((rank - 1) * 0.07) + 's';

    const vr  = m.vote_average || 0;
    const vc  = m.vote_count   || 0;
    const col = gcol(vr);
    const pct = Math.min(100, vr * 10);
    const pop = gpop(m.popularity || 0);
    const yr  = (m.release_date || '').slice(0, 4);

    /* genres — up to 2 tags */
    const genreTags = (m.genre_ids || []).slice(0, 2)
      .map(id => GENRE_MAP[id]).filter(Boolean)
      .map(g => `<span class="bo-genre">${g}</span>`).join('');

    /* vote count formatted */
    const vcStr = vc >= 1000 ? (vc / 1000).toFixed(1) + 'K VOTES' : vc + ' VOTES';

    const card = document.createElement('div');
    card.className = 'bo-card ' + rCls;
    card.style.animationDelay = delay;

    const poster = m.poster_path ? IMG_BASE + 'w342' + m.poster_path : '';
    card.innerHTML = `
      <div class="bo-poster-wrap">
        ${poster
          ? `<img class="bo-poster" src="${esc(poster)}" alt="${esc(m.title)}" loading="lazy" />`
          : `<div class="bo-poster"></div>`}
        <div class="rank-num">#${rank}</div>
      </div>
      <div class="bo-info">
        ${yr ? `<div class="bo-year">${yr}</div>` : ''}
        ${genreTags ? `<div class="bo-genres">${genreTags}</div>` : ''}
        <div class="bo-title">${esc(m.title || '—')}</div>
        <div style="margin-top:.32rem">
          <div class="gauge-lbl">
            <span class="gauge-key">RATING</span>
            <span class="gauge-val" style="color:${col}">${vr.toFixed(1)}</span>
          </div>
          <div class="gauge-bg">
            <div class="gauge-fill" style="width:${pct}%;background:${col};animation-delay:${delay}"></div>
          </div>
        </div>
        <div class="bo-votes">${vcStr}</div>
        ${pop ? `<div class="pop-badge ${pop.cls}">${pop.txt}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => {
      if (wasDragged) return;
      location.href = 'movie-detail.html?id=' + m.id + '&type=movie';
    });
    return card;
  }

  function resetBoxOfficeScroll() {
    boScroll.scrollLeft = 0;
  }

  function prepareBoxOfficeRender(resetScroll) {
    if (resetScroll) resetBoxOfficeScroll();
    boTrack.style.transition = 'none';
    boTrack.style.opacity = '0';
  }

  function commitBoxOfficeRender(resetScroll) {
    boTrack.offsetHeight;
    requestAnimationFrame(() => {
      if (resetScroll) resetBoxOfficeScroll();
      boTrack.style.transition = 'opacity .5s ease';
      boTrack.style.opacity = '1';
    });
  }

  /* ─── Load box office ─── */
  async function loadBox({ resetScroll = false } = {}) {
    const loadToken = ++boxLoadToken;
    prepareBoxOfficeRender(resetScroll);
    try {
      const data = await tfetch('/movie/now_playing?api_key=' + TMDB_KEY + '&language=ko-KR&region=KR');
      if (loadToken !== boxLoadToken) return;
      const list = (data.results || []).slice(0, 10);
      const fragment = document.createDocumentFragment();
      list.forEach((m, i) => fragment.append(makeCard(m, i + 1)));
      boTrack.replaceChildren(fragment);
      commitBoxOfficeRender(resetScroll);
    } catch(e) {
      if (loadToken !== boxLoadToken) return;
      if (resetScroll) resetBoxOfficeScroll();
      boTrack.style.transition = 'none';
      boTrack.style.opacity = '1';
      boTrack.innerHTML = '<p style="color:rgba(255,255,255,.2);font-size:.8rem;padding:.5rem 0">Failed to load chart data.</p>';
    }
  }

  function hydrateHomePage() {
    loadBox({ resetScroll: true });
    loadTrending();
    loadTodayPick();
    const startLogoAnim = () => requestAnimationFrame(runLogoAnim);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(startLogoAnim).catch(startLogoAnim);
    } else {
      startLogoAnim();
    }
  }

  /* ─── Load trending chips ─── */
  async function loadTrending() {
    try {
      const data = await tfetch('/trending/all/day?api_key=' + TMDB_KEY + '&language=ko-KR');
      const list = (data.results || []).slice(0, 8);
      const wrap = document.getElementById('trend-chips');
      if (!wrap) return;
      wrap.style.opacity = '0';
      const fragment = document.createDocumentFragment();
      list.forEach((r, i) => {
        const title = r.title || r.name || '';
        if (!title) return;
        const chip = document.createElement('div');
        chip.className = 'trend-chip';
        chip.innerHTML = `<span class="tc-rank">${i + 1}</span>${esc(title)}`;
        chip.addEventListener('click', () => {
          inp.value = title;
          fetchMulti(title);
        });
        fragment.append(chip);
      });
      wrap.replaceChildren(fragment);
      requestAnimationFrame(() => {
        wrap.style.transition = 'opacity .45s ease';
        wrap.style.opacity = '1';
      });
    } catch(e) {
      const row = document.getElementById('trending-row');
      if (row) row.style.display = 'none';
    }
  }

  /* ── Drag scroll ── */
  let isDragging       = false;
  let dragStartX       = 0;
  let dragStartScrollL = 0;
  let wasDragged       = false;
  const DRAG_THRESHOLD = 5;

  boScroll.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    isDragging       = true;
    dragStartX       = e.clientX;
    dragStartScrollL = boScroll.scrollLeft;
    wasDragged       = false;
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStartX;
    if (Math.abs(delta) >= DRAG_THRESHOLD) {
      wasDragged = true;
      boScroll.classList.add('is-dragging');
      boScroll.scrollLeft = dragStartScrollL - delta;
    }
  }, { passive: true });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    boScroll.classList.remove('is-dragging');
  }
  document.addEventListener('pointerup',     endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* ─── Logo ball — physics-based bounce (rAF) ─── */
  function spawnFirefly(cx, cy, container) {
    /* Soft rainbow hues — firefly glow palette */
    const HUES = [0, 35, 55, 140, 210, 280, 320];

    /* Layer 1: firefly glowing particles — slow, floaty, blurred */
    const N1 = 10;
    for (let i = 0; i < N1; i++) {
      const dot = document.createElement('div');
      dot.className = 'ff-glow';
      const angle = (Math.PI * 2 * i) / N1 + (Math.random() - .5) * .7;
      const dist  = 16 + Math.random() * 38;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - Math.random() * 12; /* slight upward drift */
      const size = 4 + Math.random() * 4;
      const delay = Math.random() * 120;
      const hue = HUES[i % HUES.length] + Math.random() * 20;
      const sat = 70 + Math.random() * 20;
      const lit = 55 + Math.random() * 15;
      dot.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
        + `background:hsla(${hue},${sat}%,${lit}%,.6);`
        + `box-shadow:0 0 ${size+8}px hsla(${hue},${sat}%,${lit-10}%,.5), 0 0 ${size+20}px hsla(${hue},${sat-15}%,${lit-15}%,.2);`
        + `opacity:0;`;
      container.appendChild(dot);
      dot.offsetWidth;
      /* Fade in → drift → fade out (firefly pulse) */
      dot.style.transition = `transform ${.8 + Math.random()*.5}s cubic-bezier(.2,.8,.3,1) ${delay}ms, `
        + `opacity ${.35 + Math.random()*.2}s ease ${delay}ms`;
      dot.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(.7)`;
      dot.style.opacity = '.75';
      /* Second phase: fade out slowly */
      setTimeout(() => {
        dot.style.transition = `opacity ${.5 + Math.random()*.3}s ease`;
        dot.style.opacity = '0';
      }, 400 + delay + Math.random() * 200);
      setTimeout(() => dot.remove(), 1300);
    }

    /* Layer 2: soft ambient rainbow trails — larger, more blurred */
    const N2 = 6;
    for (let i = 0; i < N2; i++) {
      const trail = document.createElement('div');
      trail.className = 'ff-trail';
      const angle = (Math.PI * 2 * i) / N2 + (Math.random() - .5) * .8;
      const dist  = 20 + Math.random() * 30;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 8;
      const hue = HUES[(i * 2) % HUES.length] + Math.random() * 25;
      const size = 8 + Math.random() * 6;
      trail.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
        + `background:hsla(${hue},65%,50%,.2);`
        + `box-shadow:0 0 ${size+10}px hsla(${hue},65%,45%,.25), 0 0 ${size+24}px hsla(${hue},50%,40%,.1);`
        + `opacity:0;`;
      container.appendChild(trail);
      trail.offsetWidth;
      trail.style.transition = `transform ${1 + Math.random()*.4}s cubic-bezier(.15,.85,.3,1), opacity .5s ease`;
      trail.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(.5)`;
      trail.style.opacity = '.45';
      setTimeout(() => {
        trail.style.transition = 'opacity .6s ease';
        trail.style.opacity = '0';
      }, 600 + Math.random() * 300);
      setTimeout(() => trail.remove(), 1500);
    }

    /* Layer 3: very soft warm center bloom */
    const bloom = document.createElement('div');
    bloom.style.cssText = `position:absolute;left:${cx-8}px;top:${cy-8}px;width:16px;height:16px;border-radius:50%;`
      + `background:rgba(255,220,130,.12);`
      + `box-shadow:0 0 16px rgba(255,200,100,.18), 0 0 32px rgba(180,140,255,.1);`
      + `pointer-events:none;z-index:21;filter:blur(3px);opacity:0;`;
    container.appendChild(bloom);
    bloom.offsetWidth;
    bloom.style.transition = 'transform .5s ease, opacity .4s ease';
    bloom.style.transform = 'scale(2.2)';
    bloom.style.opacity = '.5';
    setTimeout(() => {
      bloom.style.transition = 'opacity .6s ease';
      bloom.style.opacity = '0';
    }, 400);
    setTimeout(() => bloom.remove(), 1100);
  }

  function runLogoAnim() {
    const main = document.getElementById('logo-main');
    const ball = document.getElementById('logo-ball');
    const sub  = document.querySelector('.logo-sub');
    if (!main || !ball) return;

    const letters = [...main.querySelectorAll('.logo-letter')];
    /* All 7 letters: C(0) I(1) N(2) E(3) T(4) M(5) I(6) */

    const mR       = main.getBoundingClientRect();
    const letterTop = letters[0].getBoundingClientRect().top - mR.top;
    const floorY   = letterTop - 12;
    const targets  = letters.map(el => {
      const r = el.getBoundingClientRect();
      return r.left - mR.left + r.width / 2 - 5;
    });

    const G     = 1800;
    const ARC_H = [68, 52, 40, 32, 24, 18];  /* between each letter */

    let x = targets[0], y = -280;
    let vx = 0, vy = 0;
    let hit = 0, prev = 0, dead = false, exiting = false;
    let sqT = 0, sqSx = 1, sqSy = 1;
    let exitStart = 0, sparked = false;

    ball.style.opacity = '1';

    function impactLetter(el) {
      el.style.transition = 'transform 70ms cubic-bezier(.2,0,.6,1)';
      el.style.transform  = 'scaleY(.84) scaleX(1.12)';
      setTimeout(() => {
        el.style.transition = 'transform 260ms cubic-bezier(.22,.68,0,1.1)';
        el.style.transform  = '';
      }, 70);
    }

    function tick(ts) {
      if (!prev) { prev = ts; requestAnimationFrame(tick); return; }
      const dt = Math.min((ts - prev) / 1000, 0.022);
      prev = ts;

      /* ── Exit phase: bounce up-right + firework rides along + fade ── */
      if (exiting) {
        const elapsed = (ts - exitStart) / 1000;
        const dur = 0.55;
        if (elapsed >= dur) {
          ball.style.opacity = '0';
          dead = true;
          /* Start infinite loop motion on each letter with stagger */
          letters.forEach((l, li) => {
            l.style.animation = '';
            l.style.animationDelay = `${(li * 0.3).toFixed(2)}s`;
            l.classList.add('alive');
          });
        } else {
          const p = elapsed / dur;
          const ex = x + 120 * p;
          const ey = floorY - 80 * p + 100 * p * p;
          const op = Math.max(0, 1 - p * 1.6);
          ball.style.transform = `translate(${ex.toFixed(1)}px,${ey.toFixed(1)}px) scaleX(${1 - p * .3}) scaleY(${1 + p * .2})`;
          ball.style.opacity = op.toFixed(2);
          /* Spawn firefly glow once at ~60ms into exit (ball already moving) */
          if (!sparked && elapsed > 0.06) {
            sparked = true;
            spawnFirefly(ex + 5, ey + 5, main);
          }
        }
        if (!dead) requestAnimationFrame(tick);
        return;
      }

      /* ── Normal flight ── */
      vy += G * dt;
      x  += vx * dt;
      y  += vy * dt;

      const spd = Math.abs(vy);
      const s   = Math.min(0.18, spd * 0.00015);
      let bx = 1, by = 1;

      if (sqT > 0) {
        sqT -= dt;
        const p = Math.max(0, sqT) / 0.06;
        bx = 1 + (sqSx - 1) * p;
        by = 1 + (sqSy - 1) * p;
      } else if (vy > 50) {
        bx = 1 - s * 0.35; by = 1 + s;
      } else if (vy < -50) {
        bx = 1 - s * 0.2;  by = 1 + s * 0.5;
      }

      if (y >= floorY && vy > 0) {
        y = floorY;

        const impSq = Math.min(0.28, spd * 0.0002);
        sqSx = 1 + impSq; sqSy = 1 - impSq; sqT = 0.06;
        bx = sqSx; by = sqSy;

        if (hit < letters.length) {
          letters[hit].classList.add('lit');
          impactLetter(letters[hit]);
        }

        if (hit < letters.length - 1) {
          const arcH = ARC_H[hit];
          vy = -Math.sqrt(2 * G * arcH);
          const tFlight = (2 * Math.abs(vy)) / G;
          vx = (targets[hit + 1] - x) / tFlight;
          hit++;
        } else {
          /* Last letter I — bounce up-right, firework travels WITH ball */
          hit++;
          exiting = true;
          exitStart = ts;
          /* T spin */
          letters[4].style.animation = 'tSpin .65s cubic-bezier(.16,1,.3,1) forwards';
          setTimeout(() => {
            if (sub) { sub.style.transition = 'opacity .5s ease'; sub.style.opacity = '1'; }
          }, 400);
          requestAnimationFrame(tick);
          return;
        }
      }

      ball.style.transform =
        `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scaleX(${bx.toFixed(3)}) scaleY(${by.toFixed(3)})`;

      if (!dead) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ─── Today's Pick — 지능형 동적 멘트 (Cast·Director·Keywords·Genre) ─── */

  /* ── 100 명언 리스트 (키워드 매핑) ── */
  const QUOTES = [
    { text:'삶이 있는 한 희망은 있다', author:'키케로', keys:['희망','자유','탈출','감옥','꿈'] },
    { text:'산다는 것 그것은 치열한 전투이다', author:'로망 로랑', keys:['전쟁','전투','생존','투쟁','고난'] },
    { text:'하루에 3시간을 걸으면 7년 후에 지구를 한 바퀴 돌 수 있다', author:'사무엘 존슨', keys:['여행','모험','탐험','걷기','도전'] },
    { text:'언제나 현재에 집중할 수 있다면 행복할 것이다', author:'파울로 코엘료', keys:['행복','현재','명상','일상','평화'] },
    { text:'진정으로 웃으려면 고통을 참아야 하며, 나아가 고통을 즐길 줄 알아야 해', author:'찰리 채플린', keys:['코미디','웃음','고통','눈물','광대'] },
    { text:'직업에서 행복을 찾아라. 아니면 행복이 무엇인지 절대 모를 것이다', author:'엘버트 허버드', keys:['직업','일','노동','성공','열정'] },
    { text:'신은 용기 있는 자를 결코 버리지 않는다', author:'켄러', keys:['용기','신','믿음','종교','기도'] },
    { text:'행복의 문이 하나 닫히면 다른 문이 열린다', author:'헬렌 켈러', keys:['장애','극복','희망','도전','문'] },
    { text:'피할 수 없으면 즐겨라', author:'로버트 엘리엇', keys:['운명','수용','긍정','현실','체념'] },
    { text:'단순하게 살아라', author:'이드리스 샤흐', keys:['단순','미니멀','일상','현대','복잡'] },
    { text:'먼저 자신을 비웃어라. 다른 사람이 당신을 비웃기 전에', author:'엘사 맥스웰', keys:['유머','자존감','사회','웃음','비웃음'] },
    { text:'먼저 핀 꽃은 먼저 진다. 남보다 먼저 공을 세우려고 조급히 서둘 것이 아니다', author:'채근담', keys:['인내','겸손','자연','꽃','기다림'] },
    { text:'행복한 삶을 살기 위해 필요한 것은 거의 없다', author:'마르쿠스 아우렐리우스', keys:['행복','철학','단순','만족','삶'] },
    { text:'절대 어제를 후회하지 마라. 인생은 오늘의 나 안에 있고 내일은 스스로 만드는 것이다', author:'L. 론 허바드', keys:['후회','과거','오늘','내일','결단'] },
    { text:'어리석은 자는 멀리서 행복을 찾고, 현명한 자는 자신의 발치에서 행복을 키워간다', author:'제임스 오펜하임', keys:['지혜','행복','가까운','현명','어리석음'] },
    { text:'너무 소심하고 까다롭게 자신의 행동을 고민하지 말라. 모든 인생은 실험이다', author:'랄프 왈도 에머슨', keys:['실험','도전','모험','결정','두려움'] },
    { text:'한 번의 실패와 영원한 실패를 혼동하지 마라', author:'F. 스콧 핏제랄드', keys:['실패','재기','작가','다시','포기'] },
    { text:'내일은 내일의 태양이 뜬다', author:'격언', keys:['내일','태양','희망','새벽','아침'] },
    { text:'계단을 밟아야 계단 위에 올라설 수 있다', author:'터키 속담', keys:['노력','단계','성장','과정','올라'] },
    { text:'오랫동안 꿈을 그리는 사람은 마침내 그 꿈을 닮아 간다', author:'앙드레 말로', keys:['꿈','예술','상상','목표','닮다'] },
    { text:'좋은 성과를 얻으려면 한 걸음 한 걸음이 힘차고 충실하지 않으면 안 된다', author:'단테', keys:['성과','노력','걸음','충실','과정'] },
    { text:'행복은 습관이다, 그것을 몸에 지니라', author:'허버드', keys:['습관','행복','반복','일상','루틴'] },
    { text:'성공의 비결은 단 한 가지, 잘할 수 있는 일에 광적으로 집중하는 것이다', author:'톰 모나건', keys:['성공','집중','비결','광기','몰두'] },
    { text:'자신감 있는 표정을 지으면 자신감이 생긴다', author:'찰스 다윈', keys:['자신감','표정','심리','변화','태도'] },
    { text:'평생 살 것처럼 꿈을 꾸어라. 그리고 내일 죽을 것처럼 오늘을 살아라', author:'제임스 딘', keys:['꿈','오늘','죽음','열정','청춘'] },
    { text:'네 믿음은 네 생각이 되고, 네 생각은 네 말이 되고, 네 말은 네 행동이 되고, 네 행동은 네 습관이 되고, 네 습관은 네 가치가 되고, 네 가치는 네 운명이 된다', author:'간디', keys:['믿음','운명','습관','가치','신념'] },
    { text:'시간의 중요성을 이해하고 매 순간을 즐겁게 보내고 유용하게 활용하라', author:'루이사 메이 올콧', keys:['시간','순간','활용','젊음','노년'] },
    { text:'절대 포기하지 말라. 당신이 되고 싶은 무언가가 있다면, 그에 대해 자부심을 가져라', author:'마이크 맥라렌', keys:['포기','자부심','목표','인생','결심'] },
    { text:'1퍼센트의 가능성, 그것이 나의 길이다', author:'나폴레옹', keys:['가능성','전쟁','리더','전략','승리'] },
    { text:'그대 자신의 영혼을 탐구하라. 이 길은 그대만의 길이요, 그대 혼자 가야 할 길이다', author:'인디언 속담', keys:['영혼','자아','고독','길','탐구'] },
    { text:'고통이 남기고 간 뒤를 보라! 고난이 지나면 반드시 기쁨이 스며든다', author:'괴테', keys:['고통','고난','기쁨','인내','극복'] },
    { text:'삶은 소유물이 아니라 순간순간의 있음이다', author:'법정 스님', keys:['삶','순간','소유','비움','존재'] },
    { text:'꿈을 계속 간직하고 있으면 반드시 실현할 때가 온다', author:'괴테', keys:['꿈','실현','기다림','인내','믿음'] },
    { text:'화려한 일을 추구하지 말라. 중요한 것은 스스로의 재능이며, 자신의 행동에 쏟아 붓는 사랑의 정도이다', author:'머더 테레사', keys:['사랑','봉사','재능','겸손','헌신'] },
    { text:'마음만을 가지고 있어서는 안 된다. 반드시 실천하여야 한다', author:'이소룡', keys:['실천','무술','행동','의지','결단'] },
    { text:'기회는 기다리는 사람에게 잡히지 않는 법이다', author:'안창호', keys:['기회','실력','준비','노력','열중'] },
    { text:'늙고 젊은 것은 그 사람의 신념이 늙었느냐 젊었느냐 하는 데 있다', author:'맥아더', keys:['젊음','노년','신념','정신','나이'] },
    { text:'만약 우리가 할 수 있는 일을 모두 한다면 우리 자신에 깜짝 놀랄 것이다', author:'에디슨', keys:['발명','능력','잠재력','놀라움','가능'] },
    { text:'나는 누구인가 스스로 물으라. 해답은 그 물음 속에 있다', author:'법정 스님', keys:['자아','질문','수행','명상','정체성'] },
    { text:'작은 것을 가지고도 고마워하고 만족할 줄 안다면 그는 행복한 사람이다', author:'법정 스님', keys:['감사','만족','소박','행복','작은'] },
    { text:'물러나서 조용하게 구하면 배울 수 있는 스승은 많다', author:'맹자', keys:['스승','배움','겸손','지혜','교육'] },
    { text:'눈물과 더불어 빵을 먹어 보지 않은 자는 인생의 참다운 맛을 모른다', author:'괴테', keys:['눈물','고통','인생','맛','경험'] },
    { text:'진짜 문제는 사람들의 마음이다', author:'아인슈타인', keys:['마음','과학','문제','진실','인간'] },
    { text:'해야 할 것을 하라. 모든 것은 타인의 행복을 위해서, 동시에 나의 행복을 위해서이다', author:'톨스토이', keys:['행복','타인','의무','문학','실천'] },
    { text:'사람이 여행을 하는 것은 도착하기 위해서가 아니라 여행하기 위해서이다', author:'괴테', keys:['여행','과정','목적지','걷기','경험'] },
    { text:'화가 날 때는 100까지 세라. 최악일 때는 욕설을 퍼부어라', author:'마크 트웨인', keys:['분노','유머','참을성','감정','화'] },
    { text:'용기를 잃은 사람은 모든 것을 잃은 것이다', author:'세르반테스', keys:['용기','상실','친구','재산','전부'] },
    { text:'돈이란 바닷물과도 같다. 마시면 마실수록 목이 말라진다', author:'쇼펜하우어', keys:['돈','욕망','철학','탐욕','물질'] },
    { text:'이룰 수 없는 꿈을 꾸고, 이길 수 없는 적과 싸우며, 견딜 수 없는 고통을 견디자', author:'세르반테스', keys:['꿈','싸움','고통','불가능','기사'] },
    { text:'고개 숙이지 마십시오. 세상을 똑바로 정면으로 바라보십시오', author:'헬렌 켈러', keys:['용기','장애','정면','세상','당당'] },
    { text:'고난의 시기에 동요하지 않는 것, 이것은 진정 칭찬받을 만한 뛰어난 인물의 증거다', author:'베토벤', keys:['고난','음악','인내','위대','흔들림'] },
    { text:'사막이 아름다운 것은 어딘가에 샘이 숨겨져 있기 때문이다', author:'생텍쥐페리', keys:['사막','아름다움','숨겨진','샘','비행'] },
    { text:'만족할 줄 아는 사람은 진정한 부자이고, 탐욕스러운 사람은 진실로 가난한 사람이다', author:'솔론', keys:['만족','부자','가난','탐욕','절제'] },
    { text:'성공해서 만족하는 것은 아니다. 만족하고 있었기 때문에 성공한 것이다', author:'알랭', keys:['성공','만족','순서','태도','긍정'] },
    { text:'그대의 하루하루를 그대의 마지막 날이라고 생각하라', author:'호라티우스', keys:['하루','마지막','죽음','오늘','삶'] },
    { text:'자신을 내보여라. 그러면 재능이 드러날 것이다', author:'발타사르 그라시안', keys:['재능','표현','드러남','자신','보여주다'] },
    { text:'자신의 본성이 어떤 것이든 그에 충실하라', author:'시드니 스미스', keys:['본성','충실','재능','자연','성공'] },
    { text:'당신이 할 수 있다고 믿든 할 수 없다고 믿든, 믿는 대로 될 것이다', author:'헨리 포드', keys:['믿음','자동차','산업','의지','가능'] },
    { text:'당신이 인생의 주인공이기 때문이다. 그 사실을 잊지 마라', author:'바바라 홀', keys:['주인공','인생','선택','의식','주체'] },
    { text:'지금이야말로 일할 때다. 지금이야말로 나를 더 훌륭한 사람으로 만들 때다', author:'토마스 아 켐피스', keys:['지금','일','현재','성장','노력'] },
    { text:'내가 어떤 상태에 있더라도 나는 그 속에서 만족하는 법을 배운다', author:'헬렌 켈러', keys:['만족','상태','배움','어둠','침묵'] },
    { text:'작은 기회로부터 종종 위대한 업적이 시작된다', author:'데모스테네스', keys:['기회','위대','시작','업적','작은'] },
    { text:'인생이란 학교에는 불행이란 훌륭한 스승이 있다', author:'프리체', keys:['불행','스승','학교','인생','교훈'] },
    { text:'세상은 고통으로 가득하지만 그것을 극복하는 사람들로도 가득하다', author:'헬렌 켈러', keys:['고통','극복','세상','사람','가득'] },
    { text:'불가능하다고 생각했던 일이 가능해진다', author:'격언', keys:['불가능','가능','도전','곤란','극복'] },
    { text:'용기 있는 자로 살아라. 운이 따라주지 않는다면 용기 있는 가슴으로 불행에 맞서라', author:'키케로', keys:['용기','불행','운','맞서다','가슴'] },
    { text:'최고에 도달하려면 최저에서 시작하라', author:'P. 시루스', keys:['최고','최저','시작','바닥','정상'] },
    { text:'내 비장의 무기는 아직 손안에 있다. 그것은 희망이다', author:'나폴레옹', keys:['희망','무기','전쟁','비장','손'] },
    { text:'문제는 목적지에 얼마나 빨리 가느냐가 아니라 그 목적지가 어디냐는 것이다', author:'메이벨 뉴컴버', keys:['목적','방향','속도','목표','어디'] },
    { text:'인간의 삶 전체는 단지 한 순간에 불과하다. 인생을 즐기자', author:'플루타르코스', keys:['순간','인생','즐김','짧은','전체'] },
    { text:'겨울이 오면 봄이 멀지 않으리', author:'셸리', keys:['겨울','봄','계절','희망','기다림'] },
    { text:'일하여 얻으라. 그러면 운명의 바퀴를 붙들어 잡은 것이다', author:'랄프 왈도 에머슨', keys:['일','운명','바퀴','노력','얻다'] },
    { text:'당신의 행복은 무엇이 당신의 영혼을 노래하게 하는가에 따라 결정된다', author:'낸시 설리번', keys:['행복','영혼','노래','결정','음악'] },
    { text:'자신이 해야 할 일을 결정하는 사람은 세상에서 단 한 사람, 오직 나 자신뿐이다', author:'오손 웰스', keys:['결정','자신','세상','영화','감독'] },
    { text:'인생을 경계선 없이 살면 기쁨이 덜하다', author:'톰 행크스', keys:['절제','기쁨','인생','경계','배우'] },
    { text:'인생을 다시 산다면 다음번에는 더 많은 실수를 저지르리라', author:'나딘 스테어', keys:['실수','인생','다시','후회','용감'] },
    { text:'인생에서 원하는 것을 얻기 위한 첫 번째 단계는 내가 무엇을 원하는지 결정하는 것이다', author:'벤 스타인', keys:['결정','원하다','첫걸음','목표','시작'] },
    { text:'가난은 가난하다고 느끼는 곳에 존재한다', author:'에머슨', keys:['가난','느낌','마음','존재','부'] },
    { text:'삶이 그대를 속일지라도 슬퍼하거나 노하지 말아라', author:'푸쉬킨', keys:['슬픔','속임','인내','미래','그리움'] },
    { text:'문제점을 찾지 말고 해결책을 찾으라', author:'헨리 포드', keys:['해결','문제','방법','창의','산업'] },
    { text:'우선 무엇이 되고자 하는가를 자신에게 말하라. 그리고 해야 할 일을 하라', author:'에픽테토스', keys:['목표','자신','말','행동','철학'] },
    { text:'순간순간을 후회 없이 잘 살아야 한다', author:'루소', keys:['순간','후회','시간','세월','인생'] },
    { text:'인생에 뜻을 세우는 데 있어 늦은 때라곤 없다', author:'볼드윈', keys:['늦음','시작','뜻','나이','때'] },
    { text:'도중에 포기하지 말라. 최후의 성공을 거둘 때까지 밀고 나가자', author:'헨리 포드', keys:['포기','성공','끝','밀고','최후'] },
    { text:'자신의 불행을 생각하지 않게 되는 가장 좋은 방법은 일에 몰두하는 것이다', author:'베토벤', keys:['몰두','불행','일','음악','집중'] },
    { text:'우리는 두려움의 홍수에 버티기 위해서 끊임없이 용기의 둑을 쌓아야 한다', author:'마틴 루터 킹', keys:['두려움','용기','평등','인권','싸움'] },
    { text:'이미 끝나버린 일을 후회하기보다는 하고 싶었던 일들을 하지 못한 것을 후회하라', author:'탈무드', keys:['후회','할일','지혜','유대','선택'] },
    { text:'실패는 잊어라. 그러나 그것이 준 교훈은 절대 잊으면 안 된다', author:'하버트 개서', keys:['실패','교훈','잊다','배움','기억'] },
    { text:'내가 헛되이 보낸 오늘은 어제 죽어간 이들이 그토록 바라던 하루이다', author:'소포클레스', keys:['오늘','죽음','하루','헛됨','바라다'] },
    { text:'성공으로 가는 엘리베이터는 고장입니다. 당신은 계단을 이용해야만 합니다', author:'조 지라드', keys:['성공','계단','노력','한걸음','과정'] },
    { text:'길을 잃는다는 것은 곧 길을 알게 된다는 것이다', author:'동아프리카 속담', keys:['길','잃다','알다','방향','발견'] },
    { text:'삶을 사는 데는 단 두 가지 방법이 있다. 하나는 기적이 전혀 없다고 여기는 것이고, 또 다른 하나는 모든 것이 기적이라고 여기는 방식이다', author:'알베르트 아인슈타인', keys:['기적','삶','방식','과학','경이'] },
    { text:'직접 눈으로 본 일도 참인지 아닌지 염려스러운데, 등 뒤에서 남이 말하는 것을 어찌 깊이 믿을 수 있으랴', author:'명심보감', keys:['진실','소문','눈','믿음','판단'] },
  ];

  /* ── 장르 ID → 테마 키워드 매핑 (TMDB genre IDs) ── */
  const GENRE_KEYS = {
    28:['전쟁','전투','용기','싸움','맞서다'],        /* Action */
    12:['모험','여행','탐험','도전','길'],             /* Adventure */
    16:['꿈','상상','가능','놀라움','기적'],           /* Animation */
    35:['웃음','유머','코미디','비웃음','광대'],       /* Comedy */
    80:['정의','범죄','돈','사기','문제'],             /* Crime */
    99:['진실','기록','세상','인간','눈'],             /* Documentary */
    18:['인생','고통','극복','성장','삶'],             /* Drama */
    10751:['가족','사랑','행복','감사','작은'],        /* Family */
    14:['꿈','상상','기적','영혼','마음'],             /* Fantasy */
    36:['역사','위대','인내','신념','세상'],           /* History */
    27:['두려움','용기','고통','어둠','맞서다'],       /* Horror */
    10402:['음악','노래','영혼','열정','무대'],        /* Music */
    9648:['진실','질문','숨겨진','발견','판단'],       /* Mystery */
    10749:['사랑','마음','순간','그리움','행복'],      /* Romance */
    878:['가능성','미래','기적','과학','상상'],        /* SF */
    10770:['일상','현재','인생','하루','시간'],        /* TV Movie */
    53:['용기','두려움','생존','긴장','맞서다'],       /* Thriller */
    10752:['전쟁','용기','희망','인내','전투'],        /* War */
    37:['자유','길','운명','용기','정의'],             /* Western */
  };

  /* 줄거리·장르·키워드에서 테마 키워드 추출 → 명언 매칭 */
  function pickQuote(overview, genreIds, tmdbKeywords) {
    const pool = (overview || '').toLowerCase();
    const kwNames = (tmdbKeywords || []).map(k => (k.name || '').toLowerCase());
    /* 장르에서 파생된 테마 키워드 수집 */
    const genreKeys = new Set();
    (genreIds || []).forEach(gid => {
      (GENRE_KEYS[gid] || []).forEach(k => genreKeys.add(k));
    });

    let best = null, bestScore = -1;
    for (const q of QUOTES) {
      let score = 0;
      for (const k of q.keys) {
        if (pool.includes(k)) score += 2;                                      /* 줄거리 직접 매칭 */
        if (kwNames.some(n => n.includes(k) || k.includes(n))) score += 3;     /* TMDB 키워드 매칭 */
        if (genreKeys.has(k)) score += 1;                                      /* 장르 간접 매칭 */
      }
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best && bestScore > 0 ? best : null;
  }

  /* ── 엔딩 멘트 15종 (랜덤) ── */
  const ENDING_MENTORS = [
    '영화 속 인간의 여정이 당신의 오늘에 깊은 울림을 주길 바랍니다.',
    '스크린 속에 투영된 우리네 삶이 당신의 지친 마음을 따스하게 안아주길 기대합니다.',
    '영화가 남긴 긴 여운이 당신의 내일을 향한 작은 용기가 되기를 소망합니다.',
    '작품이 던지는 질문들이 당신의 세상을 조금 더 넓고 깊게 만들어줄 것입니다.',
    '침묵 속에 흐르는 영화적 사유가 당신만의 소중한 답을 찾는 이정표가 되길 바랍니다.',
    '빛과 그림자가 교차하는 찰나의 순간들이 당신의 삶에 소중한 발자국으로 남길 바랍니다.',
    '홀로 마주하는 영화적 고독이 때로는 가장 풍요로운 위로가 되어 당신을 찾아갈 것입니다.',
    '운명처럼 다가온 이 장면이 오늘 당신이 마주할 세상에 작은 빛이 되어주길 믿습니다.',
    '누군가의 꿈이 빚어낸 이 기록이 당신의 현실과 만나 새로운 이야기를 써 내려가길 바랍니다.',
    '흐르는 필름 속에 박제된 시간들이 당신의 오늘을 더욱 의미 있게 채워줄 것입니다.',
    '스크린의 떨림이 당신의 내면 깊은 곳까지 닿아 잊고 있던 설렘을 깨워주길 소망합니다.',
    '오늘이라는 당신만의 영화에서 이 문장이 가장 아름다운 대사 한 줄이 되기를 바랍니다.',
    '타인의 고통과 기쁨을 공유하는 시선이 당신의 마음을 조금 더 너그럽게 어루만져 줄 것입니다.',
    '허구 속에 숨겨진 진실의 조각들이 당신의 삶을 지탱하는 단단한 힘이 되어주길 기대합니다.',
    '복잡한 세상을 잠시 뒤로하고, 이 영화적 순간만큼은 당신에게 온전한 휴식이 되길 바랍니다.',
  ];

  function buildDynamicComment(data) {
    const director = data.director || '';
    const title    = data.movie.title || data.movie.original_title || '';
    const overview = data.movie.overview || '';
    const genreIds = data.movie.genre_ids || (data.genres || []).map(g => g.id);
    const tmdbKw   = data.keywords || [];
    const id       = data.movie.id || 0;

    /* 명언 선택 (내용만, 위인 이름 제외) */
    let q = pickQuote(overview, genreIds, tmdbKw);
    if (!q) q = QUOTES[id % QUOTES.length];

    /* 랜덤 엔딩 멘트 */
    const ending = ENDING_MENTORS[Math.floor(Math.random() * ENDING_MENTORS.length)];
    return { director, title, quote: q.text, ending };
  }
  function renderPickKeywords(keywords) {
    if (!keywords.length) return '';
    return `
      <div class="pick-keywords">
        ${keywords.map((keyword) => `<span class="pick-keyword">#${esc(keyword.name)}</span>`).join('')}
      </div>
    `;
  }

  function buildPickActionMarkup(comment) {
    return `
      <div class="pick-action">
        <div>${comment.director ? `<span class="pick-director">${esc(comment.director)}</span> 감독의 ` : ''}<span class="pick-title">${esc(comment.title)}</span>${eulReul(comment.title)} 보며 떠올릴 만한 문장입니다.</div>
        <div class="pick-quote">
          <div class="pick-quote-copy">${esc(comment.quote)}</div>
        </div>
        <div class="pick-ending">
          <div class="pick-ending-copy">${esc(comment.ending)}</div>
        </div>
      </div>
    `;
  }
  async function loadTodayPick() {
    const idle      = document.getElementById('pick-idle');
    const loader    = document.getElementById('pick-loader');
    const result    = document.getElementById('pick-result');
    const btnEl     = document.getElementById('pick-btn');
    const chancesEl = document.getElementById('pick-chances');
    if (!btnEl) return;

    const today = new Date().toISOString().slice(0, 10);
    const MAX_CHANCES = 3;

    /* ── Chance tracking (localStorage) ── */
    function getState() {
      try {
        const raw = localStorage.getItem('cinetmi_pick');
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj.date !== today) { localStorage.removeItem('cinetmi_pick'); return null; }
        /* Validate structure */
        if (!Array.isArray(obj.picks)) { localStorage.removeItem('cinetmi_pick'); return null; }
        return obj;
      } catch { localStorage.removeItem('cinetmi_pick'); return null; }
    }

    function saveState(state) {
      try { localStorage.setItem('cinetmi_pick', JSON.stringify(state)); } catch {}
    }

    function remaining(state) {
      return state ? Math.max(0, MAX_CHANCES - (state.picks || []).length) : MAX_CHANCES;
    }

    function updateChancesUI(state) {
      const left = remaining(state);
      chancesEl.innerHTML = `오늘의 남은 기회: <strong>${left}번</strong>`;
      btnEl.disabled = left <= 0;
    }

    function showResult(data) {
      const m = data.movie;
      const poster = m.poster_path ? IMG_BASE + 'w342' + m.poster_path : '';
      const title  = m.title || m.original_title || '—';
      const vr  = (m.vote_average || 0).toFixed(1);
      const col = gcol(m.vote_average || 0);
      const tagline  = data.tagline || '';
      const overview = m.overview || '';
      /* 동적 멘트 */
      const comment  = buildDynamicComment(data);
      /* 크레딧 라인 */
      const credParts = [];
      if (data.director) credParts.push(`🎬 ${esc(data.director)}`);
      if (data.actor) credParts.push(`⭐ ${esc(data.actor)}`);
      const credLine = credParts.length ? credParts.join(' · ') : '';
      /* 키워드 태그 */
      const kwTags = (data.keywords || []).slice(0, 4);

      const state = getState();
      const left  = remaining(state);
      result.innerHTML = `
        <div class="pick-tagline"><span class="pick-tagline-label">오늘의 영화적 운명</span></div>
        ${poster ? `<img class="pick-poster" src="${esc(poster)}" alt="${esc(title)}" loading="lazy" />` : ''}
        ${credLine ? `<div class="pick-credit-line">${credLine}</div>` : ''}
        ${renderPickKeywords(kwTags)}
        ${overview ? `<div class="pick-overview">${esc(overview)}</div>` : ''}
        ${buildPickActionMarkup(comment)}
        <div class="pick-rating"><span style="color:${col}">⭐ ${vr}</span><span style="color:rgba(255,255,255,.3)"> / 10</span></div>
        <br><button class="pick-retry" id="pick-retry" ${left <= 0 ? 'disabled' : ''}>🎲 다시 뽑기 <span class="pick-retry-note">(남은 기회: ${left}번)</span></button>
      `;
      idle.style.display = 'none';
      loader.classList.remove('show');
      result.classList.add('show');

      const posterEl = result.querySelector('.pick-poster');
      if (posterEl) {
        posterEl.addEventListener('click', () => {
          location.href = 'movie-detail.html?id=' + m.id + '&type=movie';
        });
      }

      const retryBtn = document.getElementById('pick-retry');
      if (retryBtn) {
        if (left <= 0) {
          retryBtn.disabled = true;
        } else {
          retryBtn.addEventListener('click', () => {
            result.classList.remove('show');
            idle.style.display = '';
            updateChancesUI(getState());
          });
        }
      }
    }

    /* ── Init: 오늘 남은 기회 표시만, 영화는 복원하지 않음 ── */
    const state = getState();
    updateChancesUI(state);
    if (state && remaining(state) <= 0 && state.last) {
      try { showResult(state.last); } catch(e) { console.warn('restore last failed', e); }
    }

/* ── Pick button click ── */
    btnEl.addEventListener('click', async () => {
      const curState = getState() || { date: today, picks: [], current: null };
      if (remaining(curState) <= 0) return;

      idle.style.display = 'none';
      loader.classList.add('show');
      try {
        /* ── 1) 장르 기반 랜덤 Discovery ── */
        const GENRE_IDS = [28,12,16,35,80,18,10751,14,36,27,9648,10749,878,53,10752,37];
        const SORT_OPTIONS = ['popularity.desc', 'vote_count.desc', 'vote_average.desc'];
        const genreId = GENRE_IDS[Math.floor(Math.random() * GENRE_IDS.length)];
        const sortBy  = SORT_OPTIONS[Math.floor(Math.random() * SORT_OPTIONS.length)];
        const rng     = Math.floor(Math.random() * 50) + 1;
        const discUrl = '/discover/movie?api_key=' + TMDB_KEY + '&language=ko-KR'
          + '&with_genres=' + genreId
          + '&sort_by=' + sortBy
          + '&vote_count.gte=200'
          + '&include_adult=false'
          + '&page=' + rng;
        let data;
        try { data = await tfetch(discUrl); } catch { data = { results: [] }; }

        /* 포스터 + 줄거리 필수 필터 */
        let pool = (data.results || []).filter(m =>
          m.poster_path && m.overview && m.overview.length > 20
        );

        /* 풀이 비었으면 같은 장르 인기 폴백 */
        if (!pool.length) {
          const fbPage = Math.floor(Math.random() * 10) + 1;
          const fb = await tfetch('/discover/movie?api_key=' + TMDB_KEY + '&language=ko-KR'
            + '&with_genres=' + genreId + '&sort_by=popularity.desc&vote_count.gte=100&page=' + fbPage);
          pool = (fb.results || []).filter(m => m.poster_path && m.overview && m.overview.length > 20);
        }
        if (!pool.length) throw new Error('no results');

        /* 이전 뽑기 영화 회피 */
        const prevIds   = (curState.picks || []).map(p => p.id || p.movie?.id);
        const fresh     = pool.filter(m => !prevIds.includes(m.id));
        const finalPool = fresh.length ? fresh : pool;

        const movie = finalPool[Math.floor(Math.random() * finalPool.length)];

        /* ── 2) 상세 + 크레딧 + 키워드 병렬 fetch ── */
        const [detailRes, creditsRes, kwRes] = await Promise.allSettled([
          tfetch('/movie/' + movie.id + '?api_key=' + TMDB_KEY + '&language=ko-KR'),
          tfetch('/movie/' + movie.id + '/credits?api_key=' + TMDB_KEY + '&language=ko-KR'),
          tfetch('/movie/' + movie.id + '/keywords?api_key=' + TMDB_KEY),
        ]);

        /* 상세 (tagline, overview, genres) */
        let tagline = '';
        let genres  = movie.genre_ids || [];
        if (detailRes.status === 'fulfilled') {
          const d = detailRes.value;
          tagline = d.tagline || '';
          if (d.title) movie.title = d.title;
          if (d.overview) movie.overview = d.overview;
          if (d.genres) genres = d.genres.map(g => g.id);
          movie.genre_ids = genres;
          if (d.vote_average != null && d.vote_average > 0) movie.vote_average = d.vote_average;
          if (d.vote_count != null) movie.vote_count = d.vote_count;
        }

        /* 크레딧 → 감독 + 주연 배우 1명 */
        let director = '', actor = '';
        if (creditsRes.status === 'fulfilled') {
          const c = creditsRes.value;
          const dir = (c.crew || []).find(p => p.job === 'Director');
          if (dir) director = dir.name;
          const lead = (c.cast || [])[0];
          if (lead) actor = lead.name;
        }

        /* 키워드 */
        let keywords = [];
        if (kwRes.status === 'fulfilled') {
          keywords = (kwRes.value.keywords || []).slice(0, 5);
        }

        const pickObj = { movie, tagline, director, actor, keywords, genres };

        /* ── 3) 상태 저장 ── */
        curState.date = today;
        if (!curState.picks) curState.picks = [];
        curState.picks.push({ id: movie.id });  /* id만 저장해 중복 방지 */
        curState.last = pickObj;  /* 마지막 결과 저장 (기회 소진 시 복원용) */
        saveState(curState);

        setTimeout(() => {
          showResult(pickObj);
          updateChancesUI(curState);
        }, 2500);
      } catch(e) {
        loader.classList.remove('show');
        idle.style.display = '';
        console.warn('pick error', e);
        const errEl = document.createElement('p');
        errEl.style.cssText = 'color:rgba(255,100,100,.7);font-size:.7rem;margin-top:.5rem;';
        errEl.textContent = '잠시 후 다시 시도해 주세요.';
        const existing = idle.querySelector('.pick-err');
        if (existing) existing.remove();
        errEl.className = 'pick-err';
        idle.appendChild(errEl);
        setTimeout(() => errEl.remove(), 4000);
      }
    });
  }

  /* ─── Scroll to top on every load ─── */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    loadBox({ resetScroll: true });
  });

  /* ─── Init ─── */
  hydrateHomePage();