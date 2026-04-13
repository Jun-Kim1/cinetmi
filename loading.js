/* ═══════ CineTMI — Cold-Start Wake-Up Overlay ═══════
 * Self-contained IIFE. No globals are mutated.
 * Kill switch: set  window.CT_SKIP_WAKEUP = true  before this script loads.
 */
(function () {
  'use strict';

  if (window.CT_SKIP_WAKEUP === true) return;

  /* ── Configuration ── */
  var HEALTH_URL      = '/api/health';
  var GRACE_MS        = 1500;   /* ms — if no health response by this point → server sleeping  */
  var LIMIT_SECS      = 90;     /* countdown seconds; expiry → switch to usage-limit screen   */
  var TRIVIA_INTERVAL = 7000;   /* ms between trivia rotations */

  /* ── Movie trivia list ── */
  var movieTrivia = [
    '영화 《죠스》(1975) 촬영 중 기계 상어가 자꾸 고장 나서 스필버그 감독은 상어를 거의 보여주지 않았어요. 덕분에 더 무서운 영화가 탄생했죠.',
    '《타이타닉》(1997)의 제작비는 실제 타이타닉호를 건조하는 데 든 비용보다 더 많았습니다.',
    '《반지의 제왕》 시리즈에서 간달프 역의 이언 맥켈런은 촬영 내내 실제 호빗 세트에서 일했기 때문에 허리가 자주 아팠다고 합니다.',
    '《매트릭스》(1999)에서 네오가 총알을 피하는 "불릿 타임" 장면을 찍기 위해 카메라 120대를 원형으로 배치했습니다.',
    '《인터스텔라》(1973)의 블랙홀 장면 시각 효과를 만들기 위해 물리학자들이 참여해 새로운 렌더링 소프트웨어를 개발했고, 실제 학술 논문이 출판되었습니다.',
    '《라이온 킹》(1994) 오리지널의 "심바가 쓰러질 때 먼지로 보이는 글자"는 도시 전설이지만, 실제로 제작팀이 SEX가 아닌 SFX(특수효과 팀 약어)를 새겨 넣었다고 밝혔습니다.',
    '《다크 나이트》(2008)에서 히스 레저는 조커 캐릭터에 몰입하기 위해 호텔 방에 홀로 6주간 틀어박혀 일기를 쓰며 캐릭터를 개발했습니다.',
    '《클레오파트라》(1963)는 당시 역사상 가장 비싼 영화였으며, 오늘날 인플레이션을 감안하면 약 3,300억 원에 달하는 제작비가 들었습니다.',
    '《어벤져스: 인피니티 워》에서 타노스의 딸깍 소리는 실제 물리적 효과를 위해 배우의 손가락 소리와 레이저 효과음을 합성해 만들었습니다.',
    '《기생충》(2019)은 칸 영화제 황금종려상과 아카데미 작품상을 동시에 수상한 최초의 작품입니다.',
    '영화 역사상 최초의 작품은 뤼미에르 형제가 1895년에 공개한 《열차의 도착》으로, 스크린에서 열차가 달려오자 관객이 겁에 질려 도망쳤다는 일화가 있습니다.',
    '《쇼생크 탈출》(1994)은 개봉 당시 흥행에 실패했지만, 비디오 출시 이후 꾸준히 입소문을 타며 오늘날 IMDB 최고 평점 작품이 되었습니다.',
    '《스타워즈》의 광선검 소리는 오래된 영사기 모터 소리와 TV 신호 간섭음을 합성해 만들었습니다.',
    '배우 짐 캐리는 《마스크》 촬영 시 분장에만 매일 평균 4시간이 걸렸습니다.',
    '《겨울왕국》(2013)의 Let It Go 장면은 약 50명의 애니메이터가 2.5년에 걸쳐 작업한 결과물입니다.',
    '《인셉션》(2010)에서 꿈 속 도시가 접히는 장면은 CG가 아닌 실제로 제작된 거대 세트를 기울여 촬영했습니다.',
    '영화 《1917》(2019)은 단 하나의 숨겨진 컷만 사용해 전체가 원 테이크인 것처럼 보이도록 편집되었습니다.',
    '할리우드 황금기의 배우 진 켈리는 《사랑은 비를 타고》에서 빗속 댄스 장면을 39도의 고열 상태에서 촬영했습니다.',
    '《조커》(2019)에서 호아킨 피닉스는 촬영을 위해 약 24kg을 감량했으며, 계단 춤 장면은 즉흥적으로 만들어진 것입니다.',
    '한국 영화 《올드보이》(2003)의 복도 격투 장면은 단 이틀 만에 촬영됐으며, 편집된 컷이 거의 없는 롱 테이크로 유명합니다.',
    '《2001: 스페이스 오디세이》(1968)의 HAL 9000 컴퓨터 목소리는 배우 더글러스 레인이 완전히 감정 없이 읽도록 지시받았으며, 그 결과 영화 역사상 가장 소름 돋는 목소리 중 하나가 됐습니다.',
    '영화 《ET》에 나오는 외계인의 얼굴은 알버트 아인슈타인, 어니스트 헤밍웨이, 시인 칼 샌드버그의 얼굴을 합성해 만들었습니다.',
    '《레옹》(1994)의 감독 뤽 베송은 시나리오를 단 30일 만에 완성했습니다.',
    '세계 최초의 컬러 영화는 1902년 영국에서 제작된 《A Visit to the Seaside》로, 수작업으로 각 프레임을 색칠했습니다.',
  ];

  /* ── Inline SVG: sleeping film-projector character ── */
  var PROJECTOR_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 115" width="150" height="115" aria-hidden="true">' +
    /* Ground shadow */
    '<ellipse cx="74" cy="110" rx="44" ry="5" fill="rgba(0,0,0,.3)"/>' +
    /* Film reel on top (with zzz face) */
    '<g transform="translate(46,22)">' +
      '<circle r="20" fill="#161616" stroke="#2c2c2c" stroke-width="1.5"/>' +
      '<line x1="-20" y1="0" x2="20" y2="0" stroke="#222" stroke-width="2.5"/>' +
      '<line x1="-10" y1="-17" x2="10" y2="17" stroke="#222" stroke-width="2.5"/>' +
      '<line x1="10" y1="-17" x2="-10" y2="17" stroke="#222" stroke-width="2.5"/>' +
      '<circle r="14" fill="none" stroke="#1c1c1c" stroke-width="5"/>' +
      '<circle r="5" fill="#1d1d1d" stroke="#333"/>' +
      '<text text-anchor="middle" y="4" font-size="6" fill="rgba(232,224,208,.4)" font-family="Georgia,serif" font-style="italic">zzz</text>' +
    '</g>' +
    /* Main body */
    '<rect x="14" y="38" width="92" height="56" rx="9" fill="#171717" stroke="#252525" stroke-width="1.5"/>' +
    /* Vent slots */
    '<rect x="24" y="42" width="3" height="9" rx="1.5" fill="#111"/>' +
    '<rect x="31" y="42" width="3" height="9" rx="1.5" fill="#111"/>' +
    '<rect x="38" y="42" width="3" height="9" rx="1.5" fill="#111"/>' +
    /* Lens housing */
    '<rect x="100" y="48" width="26" height="34" rx="7" fill="#121212" stroke="#222" stroke-width="1.5"/>' +
    /* Lens rings */
    '<circle cx="113" cy="65" r="12" fill="#0e0e0e" stroke="#222" stroke-width="1.2"/>' +
    '<circle cx="113" cy="65" r="8"  fill="#090909" stroke="#1a1a1a"/>' +
    '<circle cx="113" cy="65" r="4.5" fill="#050505"/>' +
    '<circle cx="110" cy="62" r="2"  fill="rgba(232,224,208,.07)"/>' +
    /* Film slot */
    '<rect x="26" y="70" width="46" height="5.5" rx="2.5" fill="#101010" stroke="#1e1e1e"/>' +
    '<text x="49" y="74.5" text-anchor="middle" font-size="3.5" fill="rgba(232,224,208,.18)" font-family="monospace" letter-spacing="0.8">EMPTY</text>' +
    /* Power button (red = off) */
    '<circle cx="26" cy="85" r="5"   fill="#200e0e" stroke="#2e1414"/>' +
    '<circle cx="26" cy="85" r="2.8" fill="#7a1111"/>' +
    /* Legs */
    '<rect x="22" y="92" width="17" height="11" rx="3" fill="#131313" stroke="#1e1e1e"/>' +
    '<rect x="66" y="92" width="17" height="11" rx="3" fill="#131313" stroke="#1e1e1e"/>' +
    /* Rubber feet */
    '<circle cx="25" cy="102" r="2.2" fill="#0d0d0d"/>' +
    '<circle cx="36" cy="102" r="2.2" fill="#0d0d0d"/>' +
    '<circle cx="69" cy="102" r="2.2" fill="#0d0d0d"/>' +
    '<circle cx="80" cy="102" r="2.2" fill="#0d0d0d"/>' +
    /* Floating ZZZ */
    '<text x="128" y="48" font-size="13" fill="rgba(232,224,208,.55)" font-family="Georgia,serif" font-style="italic">Z</text>' +
    '<text x="137" y="36" font-size="10" fill="rgba(232,224,208,.32)" font-family="Georgia,serif" font-style="italic">z</text>' +
    '<text x="144" y="26" font-size="7"  fill="rgba(232,224,208,.18)" font-family="Georgia,serif" font-style="italic">z</text>' +
    '</svg>'
  );

  /* ── State machine ──
   *  INIT      → probe fires, no overlay shown
   *  COUNTDOWN → Case B: server sleeping, countdown + trivia visible
   *  ENDED     → Case A: usage limit / hard error, closing-credits screen
   *  DONE      → dismissed (200 OK received)
   */
  var state          = 'INIT';
  var dismissed      = false;
  var overlayEl      = null;
  var contentEl      = null;
  var numberEl       = null;
  var ringEl         = null;
  var triviaEl       = null;
  var triviaIndex    = 0;
  var secondsLeft    = LIMIT_SECS;
  var abortCtrl      = null;

  /* Timers — all tracked so cleanupTimers() can clear every one */
  var gracePeriodTimer = null;
  var countdownTimer   = null;
  var triviaTimer      = null;
  var triviaFadeTimer  = null;   /* inner setTimeout within rotateTriviaWithFade */
  var swapTimer        = null;   /* inner setTimeout within swapContent */
  var pollTimer        = null;

  /* ── Clear all timers ── */
  function cleanupTimers() {
    clearTimeout(gracePeriodTimer);
    clearTimeout(triviaFadeTimer);
    clearTimeout(swapTimer);
    clearInterval(countdownTimer);
    clearInterval(triviaTimer);
    clearInterval(pollTimer);
  }

  /* ── Build countdown panel HTML ── */
  function buildCountdownContent() {
    var C = 628; /* 2π × r=100 */
    return [
      '<div class="ct-countdown-wrap">',
        '<svg viewBox="0 0 220 220" width="220" height="220">',
          '<circle class="ct-countdown-ring-bg" cx="110" cy="110" r="100"/>',
          '<circle class="ct-countdown-ring" id="ct-ring" cx="110" cy="110" r="100"',
            ' stroke-dasharray="' + C + '" stroke-dashoffset="0"/>',
        '</svg>',
        '<div class="ct-countdown-inner">',
          '<div class="ct-crosshair"></div>',
          '<span class="ct-number" id="ct-number">' + LIMIT_SECS + '</span>',
        '</div>',
      '</div>',
      '<p class="ct-status">서버를 깨우는 중 · WAKING UP SERVER</p>',
      '<div class="ct-trivia-wrap">',
        '<span class="ct-trivia-label">기다리는 동안 영화 TMI</span>',
        '<p class="ct-trivia-text" id="ct-trivia"></p>',
      '</div>',
    ].join('');
  }

  /* ── Build usage-limit / ended panel HTML ── */
  function buildEndedContent() {
    return [
      '<div class="ct-ended-wrap">',
        '<div class="ct-the-end">',
          '<span class="ct-the-end-line"></span>',
          '<span>THE&nbsp;END</span>',
          '<span class="ct-the-end-line"></span>',
        '</div>',
        '<div class="ct-end-char">' + PROJECTOR_SVG + '</div>',
        '<p class="ct-end-title">이달의 필름이 소진되었습니다</p>',
        '<p class="ct-end-sub">CineTMI는 Render 무료 서버로 운영됩니다.<br>이번 달 사용량 한도에 도달했어요. 😴</p>',
        '<div class="ct-credits-outer">',
          '<div class="ct-credits-track">',
            '<p class="ct-credit-head">A CineTMI Production</p>',
            '<p class="ct-credit-dim">· · ·</p>',
            '<p>서버 제공&emsp;<span class="ct-credit-val">Render.com FREE TIER</span></p>',
            '<p>영화 데이터&emsp;<span class="ct-credit-val">TMDB API v3</span></p>',
            '<p>지식 베이스&emsp;<span class="ct-credit-val">Supabase</span></p>',
            '<p class="ct-credit-dim">· · ·</p>',
            '<p>다음 개봉일&emsp;<span class="ct-credit-val">매월 1일</span></p>',
            '<p class="ct-credit-dim">· · ·</p>',
            '<p class="ct-credit-head">관람해 주셔서 감사합니다 🎬</p>',
          '</div>',
        '</div>',
        '<button class="ct-retry-btn" id="ct-retry">🔄 다시 시도하기</button>',
      '</div>',
    ].join('');
  }

  /* ── Create the shell overlay (called once on first use) ── */
  function initOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'ct-wake-overlay';
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.setAttribute('role', 'status');
    overlayEl.innerHTML = [
      '<div class="ct-reel-strip"></div>',
      '<div class="ct-reel-strip-b"></div>',
      '<div class="ct-frame-dot"></div>',
      '<div class="ct-standby" id="ct-standby">PLEASE STAND BY</div>',
      '<div id="ct-content"></div>',
    ].join('');
    document.body.appendChild(overlayEl);
    contentEl = overlayEl.querySelector('#ct-content');
  }

  /* ── Cross-fade the content panel ── */
  function swapContent(htmlStr, afterSwap) {
    if (!contentEl) return;
    contentEl.style.opacity = '0';
    swapTimer = setTimeout(function () {
      if (!contentEl) return;
      contentEl.innerHTML = htmlStr;
      if (afterSwap) afterSwap();
      requestAnimationFrame(function () { if (contentEl) contentEl.style.opacity = '1'; });
    }, 360);
  }

  /* ── Attach retry button listener ── */
  function attachRetryBtn() {
    var btn = document.getElementById('ct-retry');
    if (btn) btn.addEventListener('click', function () { window.location.reload(); });
  }

  /* ── Update ring arc + number ── */
  function updateCountdownDisplay() {
    if (!numberEl || !ringEl) return;
    numberEl.textContent = secondsLeft;
    ringEl.style.strokeDashoffset = ((1 - secondsLeft / LIMIT_SECS) * 628).toFixed(2);
  }

  /* ── Trivia cross-fade ── */
  function rotateTriviaWithFade() {
    if (!triviaEl) return;
    triviaEl.classList.add('ct-fade');
    triviaFadeTimer = setTimeout(function () {
      if (!triviaEl) return;
      triviaIndex = (triviaIndex + 1) % movieTrivia.length;
      triviaEl.textContent = movieTrivia[triviaIndex];
      triviaEl.classList.remove('ct-fade');
    }, 520);
  }

  /* ════════════════════════════════════════════════
   *  CASE B — Show countdown (server is sleeping)
   * ════════════════════════════════════════════════ */
  function showCountdown() {
    state = 'COUNTDOWN';
    initOverlay();
    swapContent(buildCountdownContent(), function () {
      numberEl = contentEl.querySelector('#ct-number');
      ringEl   = contentEl.querySelector('#ct-ring');
      triviaEl = contentEl.querySelector('#ct-trivia');

      triviaIndex = Math.floor(Math.random() * movieTrivia.length);
      triviaEl.textContent = movieTrivia[triviaIndex];
      updateCountdownDisplay();

      /* Tick every second; switch to ended when limit reached */
      countdownTimer = setInterval(function () {
        secondsLeft--;
        updateCountdownDisplay();
        if (secondsLeft <= 0) { clearInterval(countdownTimer); switchToEnded(); }
      }, 1000);

      /* Trivia rotation */
      triviaTimer = setInterval(rotateTriviaWithFade, TRIVIA_INTERVAL);

      /* Poll every 5 s — dismiss the moment the server answers */
      pollTimer = setInterval(function () {
        if (dismissed) { clearInterval(pollTimer); return; }
        fetch(HEALTH_URL, { method: 'GET', cache: 'no-store' })
          .then(function (r) { if (r.ok) { clearInterval(pollTimer); dismiss(); } })
          .catch(function () { /* still sleeping */ });
      }, 5000);
    });
  }

  /* ════════════════════════════════════════════════
   *  CASE A — Show ended (immediate error / limit)
   * ════════════════════════════════════════════════ */
  function showEnded() {
    if (state === 'ENDED' || state === 'DONE') return;
    state = 'ENDED';
    cleanupTimers();
    initOverlay();
    var sb = document.getElementById('ct-standby');
    if (sb) sb.style.display = 'none';
    swapContent(buildEndedContent(), attachRetryBtn);
  }

  /* ─ Transition COUNTDOWN → ENDED (90 s limit or late error) ─ */
  function switchToEnded() {
    if (state === 'ENDED' || state === 'DONE') return;
    state = 'ENDED';
    cleanupTimers();
    if (abortCtrl) abortCtrl.abort();
    var sb = document.getElementById('ct-standby');
    if (sb) sb.style.display = 'none';
    swapContent(buildEndedContent(), attachRetryBtn);
  }

  /* ─ Dismiss overlay (200 OK received) ─ */
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    state = 'DONE';
    cleanupTimers();
    if (abortCtrl) abortCtrl.abort();
    if (!overlayEl) return;
    overlayEl.style.opacity       = '0';
    overlayEl.style.pointerEvents = 'none';
    overlayEl.style.touchAction   = 'auto';
    overlayEl.addEventListener('transitionend', function handler() {
      overlayEl.removeEventListener('transitionend', handler);
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null; contentEl = null;
    });
  }

  /* ── Main health probe ── */
  function probe() {
    abortCtrl  = window.AbortController ? new AbortController() : null;
    var signal = abortCtrl ? abortCtrl.signal : undefined;
    var graceFired = false;

    /* If no response within GRACE_MS → server is sleeping → Case B */
    gracePeriodTimer = setTimeout(function () {
      graceFired = true;
      showCountdown();
    }, GRACE_MS);

    fetch(HEALTH_URL, { method: 'GET', cache: 'no-store', signal: signal })
      .then(function (res) {
        clearTimeout(gracePeriodTimer);
        if (dismissed) return;
        if (res.ok) {
          /* ✅ Healthy — cancel/dismiss any overlay */
          dismiss();
        } else {
          /* ❌ 4xx / 5xx: usage limit or hard server error */
          graceFired ? switchToEnded() : showEnded();
        }
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return; /* intentional — ignore */
        clearTimeout(gracePeriodTimer);
        if (dismissed) return;
        /* ❌ "Failed to fetch": no internet or server hard-down */
        graceFired ? switchToEnded() : showEnded();
      });
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', probe);
  } else {
    probe();
  }
})();
