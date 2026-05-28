/* Ателье Инари — все ленивые/некритичные эффекты сайта.
   Подключается через <script src="app.js" defer>:
   - грузится параллельно с парсингом HTML
   - выполняется после DOMContentLoaded (никаких race-conditions)
   - не блокирует рендеринг и LCP */
(() => {
'use strict';

const idle = window.requestIdleCallback || (cb => setTimeout(cb, 50));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Burger menu ──
const burger = document.getElementById('burger');
const navMobile = document.getElementById('navMobile');
if (burger && navMobile) {
  const closeMenu = () => {
    document.body.classList.remove('menu-open');
    navMobile.setAttribute('aria-hidden', 'true');
  };
  burger.addEventListener('click', () => {
    document.body.classList.toggle('menu-open');
    navMobile.setAttribute('aria-hidden', document.body.classList.contains('menu-open') ? 'false' : 'true');
  });
  navMobile.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
}

// ── Nav scroll style ──
const nav = document.getElementById('nav');
if (nav) {
  let scrolled = false;
  const onScroll = () => {
    const s = window.scrollY > 30;
    if (s !== scrolled) { scrolled = s; nav.classList.toggle('scrolled', s); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ── Reveal-анимации + подсветка часов ──
idle(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  const today = new Date().getDay();
  const row = document.querySelector(`#hours tr[data-day="${today}"]`);
  if (row) row.classList.add('today');
});

// ── Lazy-load Yandex Maps (грузится только когда близко к viewport) ──
idle(() => {
  const ymap = document.getElementById('ymap');
  if (!ymap || !ymap.dataset.src) return;
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      ymap.src = ymap.dataset.src;
      obs.disconnect();
    }
  }, { rootMargin: '300px' });
  obs.observe(ymap);
});

// ── Карусель ──
idle(() => {
  const carWrap  = document.getElementById('carouselWrap');
  const carTrack = document.getElementById('carouselTrack');
  if (!carWrap || !carTrack) return;

  // Галерея загружается из data/gallery.json — формат: [{file, alt}, ...]
  // Резервный список на случай ошибки fetch (например при открытии через file://).
  const GALLERY_FALLBACK = [
    ['XXXL',      'Ателье Инари — работа мастерской'],
    ['XXXL (1)',  'Швейная машина мастерской'],
    ['XXXL (2)',  'Работа мастерской'],
    ['XXXL (3)',  'Подгонка одежды'],
    ['XXXL (4)',  'Ремонт одежды'],
    ['XXXL (5)',  'Работа мастера'],
    ['XXXL (6)',  'Замена молнии'],
    ['XXXL (7)',  'Ремонт сумки'],
    ['XXXL (8)',  'Подшив брюк'],
    ['XXXL (9)',  'Работа мастерской'],
    ['XXXL (10)', 'Работа мастерской'],
    ['XXXL (11)', 'Работа мастерской'],
    ['XXXL (12)', 'Работа мастерской'],
    ['XXXL (13)', 'Работа мастерской'],
    ['XXXL (14)', 'Работа мастерской'],
    ['XXXL (15)', 'Работа мастерской'],
    ['XXXL (16)', 'Работа мастерской'],
    ['XXXL (17)', 'Работа мастерской'],
    ['XXXL (19)', 'Работа мастерской'],
    ['XXXL (20)', 'Работа мастерской'],
  ];
  let GALLERY = GALLERY_FALLBACK;

  async function loadGallery() {
    try {
      const res = await fetch('data/gallery.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        GALLERY = data.map(g => ({ file: g.file, alt: g.alt || '', noavif: !!g.noavif }));
      }
    } catch (_) { /* offline / file:// — используем fallback */ }
  }

  function buildCarousel() {
    if (carTrack.children.length) return;
    const frag = document.createDocumentFragment();
    // Двойной набор для бесшовной петли
    for (let dup = 0; dup < 2; dup++) {
      for (const item of GALLERY) {
        const name   = Array.isArray(item) ? item[0] : item.file;
        const alt    = Array.isArray(item) ? (item[1] || '') : (item.alt || '');
        const noavif = Array.isArray(item) ? false : !!item.noavif;
        const enc = encodeURIComponent(name);
        const el = document.createElement('div');
        el.className = 'car-item';
        if (dup === 1) el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
          '<picture>' +
            (noavif ? '' : `<source type="image/avif" srcset="${enc}.avif">`) +
            `<img src="${enc}.webp" alt="${dup === 1 ? '' : alt}" loading="lazy" decoding="async" width="800" height="800">` +
          '</picture>';
        frag.appendChild(el);
      }
    }
    carTrack.appendChild(frag);
  }

  const PX_PER_SEC = 60;
  let offset       = 0;
  let lastTs       = null;
  let isPaused     = false;
  let isDragging   = false;
  let dragStartX   = 0;
  let dragStartY   = 0;
  let dragStartOff = 0;
  let isHorizDrag  = null;
  let clickPaused  = false;
  let halfW        = 0;
  let inited       = false;
  let isVisible    = false;
  let rafId        = null;

  function wrap(v) { if (!halfW) return 0; return ((v % halfW) + halfW) % halfW; }

  function tick(ts) {
    if (lastTs !== null && !isPaused && !isDragging) {
      offset = wrap(offset + PX_PER_SEC * (ts - lastTs) / 1000);
    }
    lastTs = ts;
    carTrack.style.transform = `translate3d(${-offset}px,0,0)`;
    rafId = requestAnimationFrame(tick);
  }

  function startRaf() {
    if (rafId !== null) return;
    lastTs = null;
    rafId = requestAnimationFrame(tick);
  }
  function stopRaf() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId  = null;
    lastTs = null;
  }

  function measureHalf() {
    const w = carTrack.scrollWidth / 2;
    if (w > 0) halfW = w;
  }
  // Запускаем загрузку JSON сразу — не ждём попадания в viewport.
  const galleryReady = loadGallery();
  let pendingInit = false;
  function init() {
    if (inited || pendingInit) return;
    pendingInit = true;
    galleryReady.then(() => {
      pendingInit = false;
      if (inited) return;
      inited = true;
      finishInit();
    });
  }
  function finishInit() {
    buildCarousel();
    // Layout пройден к этому моменту, но scrollWidth может вернуть 0
    // если первый кадр ещё не отрисован — пробуем повторно через RAF.
    measureHalf();
    requestAnimationFrame(measureHalf);
    // После загрузки первых изображений размеры точно стабилизируются
    carTrack.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', measureHalf, { once: true, passive: true });
    });
    window.addEventListener('resize', measureHalf, { passive: true });
  }

  // Ленивый старт + пауза вне viewport — через IntersectionObserver
  const visObs = new IntersectionObserver((entries) => {
    isVisible = entries[0].isIntersecting;
    if (isVisible) { init(); if (!document.hidden) startRaf(); }
    else { stopRaf(); }
  }, { rootMargin: '400px' });
  visObs.observe(carWrap);

  // Страховка: на некоторых iOS Safari IO внутри content-visibility:auto
  // может задержаться или не сработать. Проверяем bounding rect по скроллу.
  function checkVisibility() {
    if (inited && isVisible) return;
    const r = carWrap.getBoundingClientRect();
    const nearViewport = r.top < innerHeight + 400 && r.bottom > -400;
    if (nearViewport) {
      isVisible = true;
      init();
      if (!document.hidden) startRaf();
    }
  }
  window.addEventListener('scroll', checkVisibility, { passive: true });
  // И один раз при загрузке — на случай если галерея уже в viewport (anchor link, рестор скролла)
  checkVisibility();

  // Пауза на скрытой вкладке (экономия батареи)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRaf();
    else if (isVisible && inited) startRaf();
  });

  // Применить позицию мгновенно (без ожидания tick) — для отзывчивого drag
  function applyOffset() {
    carTrack.style.transform = `translate3d(${-offset}px,0,0)`;
  }

  // Hover
  carWrap.addEventListener('mouseenter', () => { init(); startRaf(); isPaused = true; });
  carWrap.addEventListener('mouseleave', () => { if (!isDragging) isPaused = false; });

  // Mouse drag
  carWrap.addEventListener('mousedown', (e) => {
    init(); startRaf();
    isDragging = true; isPaused = true;
    dragStartX = e.pageX; dragStartOff = offset;
    carWrap.classList.add('is-dragging');
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    offset = wrap(dragStartOff + (dragStartX - e.pageX));
    applyOffset();
  });
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    isPaused = clickPaused;
    carWrap.classList.remove('is-dragging');
  });

  // Touch drag
  carWrap.addEventListener('touchstart', (e) => {
    init(); startRaf();
    dragStartX   = e.touches[0].pageX;
    dragStartY   = e.touches[0].pageY;
    dragStartOff = offset;
    isHorizDrag  = null;
  }, { passive: true });

  carWrap.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].pageX - dragStartX;
    const dy = e.touches[0].pageY - dragStartY;
    if (isHorizDrag === null) isHorizDrag = Math.abs(dx) > Math.abs(dy);
    if (!isHorizDrag) return;
    isDragging = true; isPaused = true;
    offset = wrap(dragStartOff - dx);
    applyOffset(); // мгновенно обновляем трансформацию — палец = движение
  }, { passive: true });

  carWrap.addEventListener('touchend', () => {
    isDragging  = false;
    isHorizDrag = null;
    isPaused    = clickPaused;
    // Возобновляем авто-скролл после свайпа (если он был на паузе)
    if (isVisible && !document.hidden) startRaf();
  });

  carWrap.addEventListener('click', () => {
    clickPaused = !clickPaused;
    isPaused    = clickPaused;
  });
});

})();
