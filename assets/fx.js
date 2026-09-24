/* fx.js — efeitos e interações para sites single-file. Zero dependência.
   Tudo é ligado por atributo data-*. Ver references/04-efeitos.md.
   Respeita prefers-reduced-motion e ponteiros de toque. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  root.classList.add('fx');

  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function fmt(n, dec) { return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

  /* ---------- laço único de scroll ---------- */
  var scrollJobs = [], ticking = false;
  function onScroll(fn) { scrollJobs.push(fn); }
  function runScroll() { ticking = false; for (var i = 0; i < scrollJobs.length; i++) scrollJobs[i](); }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(runScroll); } }
  addEventListener('scroll', requestTick, { passive: true });
  addEventListener('resize', requestTick);

  /* ---------- data-split: título entra linha a linha ---------- */
  function splitWords(el) {
    var out = [];
    (function walk(node, wrappers) {
      Array.prototype.forEach.call(node.childNodes, function (ch) {
        if (ch.nodeType === 3) {
          ch.textContent.split(/([ \t\n\r\f]+)/).forEach(function (w) {
            if (!w) return;
            if (/^[ \t\n\r\f]+$/.test(w)) { out.push({ space: true }); return; }
            var span = d.createElement('span'); span.className = 'fx-w'; span.textContent = w;
            var node2 = span;
            for (var i = wrappers.length - 1; i >= 0; i--) { var c = wrappers[i].cloneNode(false); c.appendChild(node2); node2 = c; }
            out.push({ node: node2 });
          });
        } else if (ch.nodeType === 1) {
          if (ch.tagName === 'BR') out.push({ br: true });
          else if (ch.classList.contains('fx-keep')) {       /* grupo que não pode quebrar */
            var k = d.createElement('span'); k.className = 'fx-w'; k.appendChild(ch.cloneNode(true));
            var node3 = k;
            for (var j = wrappers.length - 1; j >= 0; j--) { var c2 = wrappers[j].cloneNode(false); c2.appendChild(node3); node3 = c2; }
            out.push({ node: node3 });
          }
          else walk(ch, wrappers.concat([ch]));
        }
      });
    })(el, []);
    return out;
  }
  function buildSplit(el) {
    if (!el.__fxSrc) el.__fxSrc = el.innerHTML; else el.innerHTML = el.__fxSrc;
    var parts = splitWords(el);
    el.innerHTML = '';
    var holder = d.createElement('span'); holder.className = 'fx-measure';
    parts.forEach(function (p) {
      if (p.space) holder.appendChild(d.createTextNode(' '));
      else if (p.br) { var b = d.createElement('br'); b.className = 'fx-br'; holder.appendChild(b); }
      else holder.appendChild(p.node);
    });
    el.appendChild(holder);
    /* mede com as palavras inline: o navegador quebra (e equilibra, com text-wrap:balance)
       exatamente como faria sem o efeito. O topo vem sempre do span da palavra, nunca do
       <em>/<strong> em volta — caixas diferentes dariam topos diferentes na mesma linha. */
    var lines = [], cur = null, lastTop = null;
    var tol = parseFloat(getComputedStyle(el).fontSize) * 0.45;
    Array.prototype.forEach.call(holder.childNodes, function (n) {
      if (n.nodeType === 1 && n.classList.contains('fx-br')) { cur = null; lastTop = null; return; }
      if (n.nodeType === 3) { if (cur) cur.push(n); return; }
      var w = n.classList && n.classList.contains('fx-w') ? n : n.querySelector('.fx-w');
      var rs = (w || n).getClientRects(), top = rs.length ? rs[0].top : 0;
      if (lastTop === null || Math.abs(top - lastTop) > tol) { cur = []; lines.push(cur); lastTop = top; }
      cur.push(n);
    });
    el.innerHTML = '';
    lines.forEach(function (ln, i) {
      var o = d.createElement('span'); o.className = 'fx-line';
      var inn = d.createElement('span'); inn.className = 'fx-line-in';
      inn.style.setProperty('--i', i);
      while (ln.length && ln[ln.length - 1].nodeType === 3) ln.pop();
      ln.forEach(function (n) { inn.appendChild(n); });
      if (i < lines.length - 1) inn.appendChild(d.createTextNode(' '));
      o.appendChild(inn); el.appendChild(o);
    });
    el.classList.add('fx-split-ready');
  }
  function initSplit() {
    var els = $$('[data-split]');
    if (!els.length) return;
    var run = function () { els.forEach(buildSplit); };
    var t; function later(ms) { clearTimeout(t); t = setTimeout(run, ms); }
    if (!d.fonts || !d.fonts.load) { run(); return; }
    /* fonts.ready pode resolver antes de a fonte começar a baixar: pede cada fonte usada nos
       títulos (normal e itálico) e só então mede as linhas. Timeout de 2,5 s para não travar. */
    var wants = [];
    els.forEach(function (el) {
      var cs = getComputedStyle(el), f = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      wants.push(d.fonts.load(f, el.textContent), d.fonts.load('italic ' + f, el.textContent));
    });
    Promise.race([Promise.all(wants).catch(function () {}), new Promise(function (r) { setTimeout(r, 2500); })])
      .then(function () { return d.fonts.ready; }).then(run);
    d.fonts.addEventListener && d.fonts.addEventListener('loadingdone', function () { later(60); });
    addEventListener('resize', function () { later(200); });
  }

  /* ---------- data-reveal / data-stagger ---------- */
  function initReveal() {
    $$('[data-stagger]').forEach(function (p) {
      var step = parseFloat(p.getAttribute('data-stagger')) || 0.08;
      Array.prototype.forEach.call(p.children, function (c, i) {
        if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', p.getAttribute('data-reveal-type') || '');
        c.style.setProperty('--d', (Math.min(i, 6) * step).toFixed(2) + 's');
      });
    });
    var els = $$('[data-reveal],[data-split],[data-count]');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); if (e.hasAttribute('data-count')) count(e, true); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        if (e.target.hasAttribute('data-count')) count(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------- data-count ---------- */
  function count(el, instant) {
    if (el.__fxCounted) return; el.__fxCounted = true;
    var to = parseFloat(el.getAttribute('data-count')) || 0;
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
    var dur = parseFloat(el.getAttribute('data-duration') || '1.6') * 1000;
    if (instant) { el.textContent = pre + fmt(to, dec) + suf; return; }
    var t0 = performance.now();
    (function tick(t) {
      var p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(to * e, dec) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ---------- data-nav ---------- */
  function initNav() {
    var nav = d.querySelector('[data-nav]'); if (!nav) return;
    var last = scrollY, hide = nav.getAttribute('data-nav') === 'hide';
    onScroll(function () {
      var y = scrollY;
      nav.classList.toggle('is-scrolled', y > 24);
      if (hide) nav.classList.toggle('is-hidden', y > 400 && y > last + 2);
      if (hide && y < last - 2) nav.classList.remove('is-hidden');
      last = y;
    });
    var btn = nav.querySelector('[data-nav-toggle]');
    if (btn) btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      root.classList.toggle('fx-lock', open);
    });
    $$('a[href^="#"]', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('is-open'); root.classList.remove('fx-lock'); if (btn) btn.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- data-progress ---------- */
  function initProgress() {
    var bar = d.querySelector('[data-progress]'); if (!bar) return;
    onScroll(function () {
      var h = root.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? clamp(scrollY / h, 0, 1) : 0) + ')';
    });
  }

  /* ---------- data-parallax ---------- */
  function initParallax() {
    var els = $$('[data-parallax]'); if (!els.length || REDUCED) return;
    onScroll(function () {
      if (innerWidth < 900) { els.forEach(function (e) { e.style.transform = ''; }); return; }
      els.forEach(function (e) {
        var r = e.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        var f = parseFloat(e.getAttribute('data-parallax')) || 0.12;
        var off = (r.top + r.height / 2 - innerHeight / 2) * -f;
        e.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
      });
    });
  }

  /* ---------- data-scrub: expõe --p (0..1) ---------- */
  function initScrub() {
    var els = $$('[data-scrub]'); if (!els.length) return;
    onScroll(function () {
      els.forEach(function (e) {
        var r = e.getBoundingClientRect(), p;
        if (e.getAttribute('data-scrub') === 'pin') p = r.height > innerHeight ? -r.top / (r.height - innerHeight) : 0;
        else p = (innerHeight - r.top) / (innerHeight + r.height);
        p = clamp(p, 0, 1);
        if (REDUCED) p = 1;
        e.style.setProperty('--p', p.toFixed(4));
      });
    });
  }

  /* ---------- data-hscroll: seção horizontal presa ---------- */
  function initHScroll() {
    $$('[data-hscroll]').forEach(function (sec) {
      var track = sec.querySelector('.fx-htrack'); if (!track) return;
      function size() {
        if (innerWidth < 768 || REDUCED) { sec.style.height = ''; track.style.transform = ''; sec.classList.add('is-native'); return; }
        sec.classList.remove('is-native');
        sec.style.height = (track.scrollWidth - innerWidth + innerHeight) + 'px';
      }
      size(); addEventListener('resize', size);
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(size);
      addEventListener('load', size);
      onScroll(function () {
        if (sec.classList.contains('is-native')) return;
        var r = sec.getBoundingClientRect();
        var max = track.scrollWidth - innerWidth;
        var p = clamp(-r.top / (r.height - innerHeight || 1), 0, 1);
        track.style.transform = 'translate3d(' + (-p * max).toFixed(1) + 'px,0,0)';
      });
    });
  }

  /* ---------- data-scenes: cenas que trocam presas na tela durante o scroll ---------- */
  function initScenes() {
    $$('[data-scenes]').forEach(function (sec) {
      var scenes = $$('.fx-scene', sec); if (!scenes.length) return;
      var n = scenes.length, counter = sec.querySelector('.fx-scenes-count'), last = -1;
      sec.style.setProperty('--n', n);
      function show(i) {
        if (i === last) return; last = i;
        scenes.forEach(function (sc, k) { sc.classList.toggle('is-active', k === i); sc.classList.toggle('is-past', k < i); sc.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
        if (counter) counter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
        sec.setAttribute('data-scene', i);
      }
      show(0);
      onScroll(function () {
        var r = sec.getBoundingClientRect();
        var p = clamp(-r.top / ((r.height - innerHeight) || 1), 0, 1);
        sec.style.setProperty('--p', p.toFixed(4));
        var i = Math.min(n - 1, Math.floor(p * n * 0.999));
        sec.style.setProperty('--sp', clamp(p * n - i, 0, 1).toFixed(4));   /* progresso dentro da cena */
        show(i);
      });
    });
  }

  /* ---------- data-marquee ---------- */
  function initMarquee() {
    $$('[data-marquee]').forEach(function (m) {
      var inner = m.querySelector('.fx-marquee-in'); if (!inner || inner.__fxDone) return;
      inner.__fxDone = true;
      var kids = Array.prototype.slice.call(inner.children);
      kids.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); inner.appendChild(c); });
      function dur() {
        var speed = parseFloat(m.getAttribute('data-marquee')) || 60;
        m.style.setProperty('--fx-marquee-dur', (inner.scrollWidth / 2 / speed).toFixed(2) + 's');
      }
      dur(); addEventListener('resize', dur); addEventListener('load', dur);
    });
  }

  /* ---------- data-magnetic ---------- */
  function initMagnetic() {
    if (!FINE || REDUCED) return;
    $$('[data-magnetic]').forEach(function (b) {
      var s = parseFloat(b.getAttribute('data-magnetic')) || 0.3;
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * s, y = (e.clientY - r.top - r.height / 2) * s;
        b.style.transform = 'translate(' + clamp(x, -12, 12) + 'px,' + clamp(y, -10, 10) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- data-tilt ---------- */
  function initTilt() {
    if (!FINE || REDUCED) return;
    $$('[data-tilt]').forEach(function (c) {
      var max = parseFloat(c.getAttribute('data-tilt')) || 8;
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        c.style.setProperty('--rx', (-py * max).toFixed(2) + 'deg');
        c.style.setProperty('--ry', (px * max).toFixed(2) + 'deg');
        c.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(1) + '%');
        c.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(1) + '%');
      });
      c.addEventListener('pointerleave', function () { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- data-cursor-reveal ---------- */
  function initCursorReveal() {
    $$('[data-cursor-reveal]').forEach(function (box) {
      var R0 = parseFloat(box.getAttribute('data-cursor-reveal')) || 140;
      function set(x, y, r) { box.style.setProperty('--x', x + 'px'); box.style.setProperty('--y', y + 'px'); box.style.setProperty('--r', r + 'px'); }
      set(0, 0, 0);
      if (FINE && !REDUCED) {
        box.addEventListener('pointermove', function (e) { var r = box.getBoundingClientRect(); set(e.clientX - r.left, e.clientY - r.top, R0); });
        box.addEventListener('pointerleave', function () { box.style.setProperty('--r', '0px'); });
      } else {
        box.addEventListener('click', function () {
          var on = box.classList.toggle('is-revealed');
          var r = box.getBoundingClientRect();
          set(r.width / 2, r.height / 2, on ? Math.hypot(r.width, r.height) : 0);
        });
      }
    });
  }

  /* ---------- data-compare (antes/depois) ---------- */
  function initCompare() {
    $$('[data-compare]').forEach(function (c) {
      var input = c.querySelector('input[type=range]'); if (!input) return;
      function upd() { c.style.setProperty('--pos', input.value + '%'); }
      input.addEventListener('input', upd); upd();
    });
  }

  /* ---------- data-stamp: selo de texto circular ---------- */
  function initStamp() {
    $$('[data-stamp]').forEach(function (s, i) {
      if (s.querySelector('svg')) return;
      var txt = s.getAttribute('data-stamp'), id = 'fxc' + i + Math.random().toString(36).slice(2, 6);
      s.insertAdjacentHTML('afterbegin',
        '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><path id="' + id + '" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs>' +
        '<text><textPath href="#' + id + '" textLength="486" lengthAdjust="spacing">' + txt.replace(/</g, '&lt;') + '</textPath></text></svg>');
      s.setAttribute('role', 'img'); if (!s.getAttribute('aria-label')) s.setAttribute('aria-label', txt);
    });
  }

  /* ---------- data-accordion ---------- */
  function initAccordion() {
    $$('[data-accordion]').forEach(function (acc) {
      var single = acc.getAttribute('data-accordion') !== 'multi';
      var items = $$('.fx-acc-item', acc);
      function setOpen(it, open) {
        var a = it.querySelector('.fx-acc-a'), q = it.querySelector('.fx-acc-q');
        it.classList.toggle('is-open', open);
        q.setAttribute('aria-expanded', open ? 'true' : 'false');
        a.style.maxHeight = open ? a.scrollHeight + 'px' : '0px';
      }
      items.forEach(function (it, i) {
        var q = it.querySelector('.fx-acc-q'), a = it.querySelector('.fx-acc-a');
        var id = 'fxa' + Math.random().toString(36).slice(2, 8);
        a.id = id; q.setAttribute('aria-controls', id);
        setOpen(it, it.classList.contains('is-open'));
        q.addEventListener('click', function () {
          var open = !it.classList.contains('is-open');
          if (single) items.forEach(function (o) { if (o !== it) setOpen(o, false); });
          setOpen(it, open);
        });
      });
      addEventListener('resize', function () { items.forEach(function (it) { if (it.classList.contains('is-open')) it.querySelector('.fx-acc-a').style.maxHeight = it.querySelector('.fx-acc-a').scrollHeight + 'px'; }); });
    });
  }

  /* ---------- data-tabs: filtro de cardápio/serviços ---------- */
  function initTabs() {
    $$('[data-tabs]').forEach(function (box) {
      var btns = $$('[data-tab]', box), items = $$('[data-tab-item]', box);
      function show(key) {
        btns.forEach(function (b) { var on = b.getAttribute('data-tab') === key; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
        items.forEach(function (it) {
          var keys = it.getAttribute('data-tab-item').split(/\s+/);
          var on = key === 'all' || keys.indexOf(key) > -1;
          it.hidden = !on;
          if (on && !REDUCED) { it.classList.remove('fx-pop'); void it.offsetWidth; it.classList.add('fx-pop'); }
        });
      }
      btns.forEach(function (b) { b.setAttribute('role', 'tab'); b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
      var first = box.querySelector('[data-tab].is-active') || btns[0];
      if (first) show(first.getAttribute('data-tab'));
    });
  }

  /* ---------- data-hours: "aberto agora" ---------- */
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function toMin(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function hhmm(s) { var p = s.split(':'); return +p[0] + 'h' + (p[1] && p[1] !== '00' ? p[1] : ''); }
  function hoursStatus(h, now) {
    var day = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
    var prev = h[(day + 6) % 7];
    if (prev && toMin(prev[1]) < toMin(prev[0]) && min < toMin(prev[1])) return { open: true, text: 'Aberto agora · fecha às ' + hhmm(prev[1]) };
    var t = h[day];
    if (t) {
      var o = toMin(t[0]), c = toMin(t[1]);
      var openNow = c > o ? (min >= o && min < c) : (min >= o);
      if (openNow) return { open: true, text: 'Aberto agora · fecha às ' + hhmm(t[1]) };
      if (min < o) return { open: false, text: 'Fechado · abre hoje às ' + hhmm(t[0]) };
    }
    for (var k = 1; k <= 7; k++) {
      var nd = (day + k) % 7;
      if (h[nd]) return { open: false, text: 'Fechado · abre ' + (k === 1 ? 'amanhã' : DIAS[nd]) + ' às ' + hhmm(h[nd][0]) };
    }
    return { open: false, text: 'Fechado' };
  }
  function initHours() {
    $$('[data-hours]').forEach(function (el) {
      var h; try { h = JSON.parse(el.getAttribute('data-hours')); } catch (e) { return; }
      function upd() { var s = hoursStatus(h, new Date()); el.textContent = s.text; el.classList.toggle('is-open', s.open); el.classList.toggle('is-closed', !s.open); }
      upd(); setInterval(upd, 60000);
    });
  }

  /* ---------- data-wa: formulário que abre o WhatsApp ---------- */
  function initWaForm() {
    $$('form[data-wa]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (f.reportValidity && !f.reportValidity()) return;
        var lines = [f.getAttribute('data-wa-intro') || 'Olá! Vim pelo site.'];
        $$('input,select,textarea', f).forEach(function (i) {
          if (!i.name || i.type === 'submit' || (i.type === 'radio' && !i.checked) || (i.type === 'checkbox' && !i.checked)) return;
          var v = (i.value || '').trim(); if (!v) return;
          if (i.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = v.split('-').reverse().join('/');
          if (i.tagName === 'SELECT' && i.selectedOptions[0]) v = i.selectedOptions[0].textContent.trim();
          var lab = i.getAttribute('data-label') || i.name;
          lines.push(lab + ': ' + v);
        });
        var url = 'https://wa.me/' + f.getAttribute('data-wa').replace(/\D/g, '') + '?text=' + encodeURIComponent(lines.join('\n'));
        window.__fxLastWa = url;
        window.open(url, '_blank', 'noopener');
      });
    });
  }

  /* ---------- data-lightbox ---------- */
  function initLightbox() {
    var links = $$('[data-lightbox] a[href]'); if (!links.length) return;
    var dlg = d.createElement('dialog'); dlg.className = 'fx-lb';
    dlg.innerHTML = '<button class="fx-lb-x" aria-label="Fechar">×</button><button class="fx-lb-prev" aria-label="Anterior">‹</button><img alt=""><button class="fx-lb-next" aria-label="Próxima">›</button><p class="fx-lb-cap"></p>';
    d.body.appendChild(dlg);
    var img = dlg.querySelector('img'), cap = dlg.querySelector('.fx-lb-cap'), idx = 0;
    function show(i) {
      idx = (i + links.length) % links.length;
      var a = links[idx], th = a.querySelector('img');
      img.src = a.href; img.alt = th ? th.alt : ''; cap.textContent = a.getAttribute('data-caption') || (th ? th.alt : '');
    }
    links.forEach(function (a, i) { a.addEventListener('click', function (e) { e.preventDefault(); show(i); dlg.showModal(); }); });
    dlg.querySelector('.fx-lb-x').onclick = function () { dlg.close(); };
    dlg.querySelector('.fx-lb-prev').onclick = function () { show(idx - 1); };
    dlg.querySelector('.fx-lb-next').onclick = function () { show(idx + 1); };
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
  }

  /* ---------- data-year ---------- */
  function initYear() { $$('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); }); }

  function boot() {
    initSplit(); initReveal(); initNav(); initProgress(); initParallax(); initScrub(); initHScroll(); initScenes();
    initMarquee(); initMagnetic(); initTilt(); initCursorReveal(); initCompare(); initStamp();
    initAccordion(); initTabs(); initHours(); initWaForm(); initLightbox(); initYear();
    runScroll();
    root.classList.add('fx-ready');
  }
  window.FX = { hoursStatus: hoursStatus, refresh: runScroll };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
