// ==UserScript==
// @name         NeTubeSwipe
// @namespace    netube-swipe
// @version      1.3
// @description  ב-NeTube: עוברים סרטון בהחלקה בלוח המגע / במסך מגע (גם במסך מלא ובפלייליסטים), או עם החצים. מותאם לחסכון במשאבים.
// @match        https://netube.co.il/*
// @match        https://*.netube.co.il/*
// @match        https://www.youtube.com/embed/*
// @match        https://www.youtube-nocookie.com/embed/*
// @icon         https://www.google.com/s2/favicons?sz=512&domain=netube.co.il
// @updateURL    https://raw.githubusercontent.com/Tzadikvtovlo/NeTubeSwipe/main/NeTubeSwipe.user.js
// @downloadURL  https://raw.githubusercontent.com/Tzadikvtovlo/NeTubeSwipe/main/NeTubeSwipe.user.js
// @run-at       document-start
// @sandbox      JavaScript
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';
  var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  var host = location.hostname;

  // ===== תפריט ההגדרות (לחיצה על האייקון של Tampermonkey) =====
  if (window.top === window && /(^|\.)netube\.co\.il$/.test(host)) {
    var ids = [];
    var menu = function () {
      ids.forEach(function (id) { try { GM_unregisterMenuCommand(id); } catch (e) {} });
      ids = [];
      var hide = GM_getValue('hideUi', true) !== false;
      var arr = GM_getValue('arrows', false) === true;
      ids.push(GM_registerMenuCommand((hide ? '✅' : '⬜') + ' הסתר את הכפתורים של יוטיוב במעבר', function () { GM_setValue('hideUi', !hide); menu(); }));
      var si = GM_getValue('siteInfo', true) !== false;
      ids.push(GM_registerMenuCommand((si ? '✅' : '⬜') + ' כותרת וסמל הערוץ מהאתר', function () { GM_setValue('siteInfo', !si); menu(); }));
      ids.push(GM_registerMenuCommand((arr ? '✅' : '⬜') + ' ניווט עם החצים ימינה / שמאלה', function () { GM_setValue('arrows', !arr); menu(); }));
    };
    menu();
  }

  // ===== בדף של NeTube =====
  if (/(^|\.)netube\.co\.il$/.test(host) && window.top === window) {
    var runPage = function () {
(function () {
  if (window.__ntSwipe) return;
  window.__ntSwipe = true;

  var st = document.createElement('style');
  st.textContent = 'html,body{overscroll-behavior-x:none !important}';
  (document.head || document.documentElement).appendChild(st);

  var back = [];
  var fwd = [];
  var cur = { url: location.pathname, title: titleNow() };

  function titleNow() {
    var h = document.querySelector('h1.video-page-title');
    return h ? h.textContent.trim() : document.title.replace(/ - NeTube$/, '');
  }
  function remember() {
    if (/^\/video\//.test(cur.url)) back.push(cur);
    if (back.length > 100) back.shift();
  }

  setInterval(function () {
    var p = location.pathname;
    if (p !== cur.url && !W._vtPendingUrl && !W._vtNavigating) {
      fwd = [];
      remember();
      cur = { url: p, title: titleNow() };
    }
  }, 1000);

  var busy = false, queue = [], lastGo = 0;
  function vidNow() { try { return W._ytMainPlayer.getVideoData().video_id || ''; } catch (eV) { return ''; } }

  function fallbackNext() {
    var seen = {};
    seen[location.pathname] = 1;
    seen[cur.url] = 1;
    back.slice(-30).forEach(function (b) { seen[b.url] = 1; });
    var list = Array.isArray(W._relatedActive) ? W._relatedActive : [];
    for (var i = 0; i < list.length; i++) {
      var u = list[i] && String(list[i].url || '').split('?')[0];
      if (u && /^\/video\//.test(u) && !seen[u]) return list[i];
    }
    var cards = document.querySelectorAll('a.related-card[href^="/video/"]');
    for (var j = 0; j < cards.length; j++) {
      var h = cards[j].getAttribute('href').split('?')[0];
      if (!seen[h]) return { url: h, title: (cards[j].getAttribute('title') || '').trim() };
    }
    return null;
  }

  var plBack = [], plFwd = [];
  function plActive() { var a = document.querySelector('.pl-item.active'); return a ? parseInt(a.getAttribute('data-index'), 10) : -1; }
  function plClick(i) {
    var el = document.querySelector('.pl-item[data-index="' + i + '"]');
    if (!el) return false;
    el.click();
    return true;
  }
  function goPlaylist(dir) {
    var cur0 = plActive();
    if (cur0 < 0) return;
    var f = document.getElementById('pl-yt-iframe');
    try { if (f && f.contentWindow) f.contentWindow.postMessage({ ntClean: 1 }, '*'); } catch (eC) {}
    var moved = false;
    if (dir === 'next') {
      var fw = plFwd.pop();
      if (fw != null) moved = plClick(fw);
      else {
        var btn = document.getElementById('pl-play-next-now');
        if (btn) { btn.click(); moved = plActive() !== cur0; }
        if (!moved) moved = plClick(cur0 + 1);
      }
      if (moved) { plBack.push(cur0); if (plBack.length > 100) plBack.shift(); }
    } else {
      var b = plBack.pop();
      moved = plClick(b != null ? b : cur0 - 1);
      if (moved) plFwd.push(cur0);
    }
    if (moved) lastGo = Date.now();
  }

  function go(dir) {
    if (qActive()) { qGo(dir); return; }
    if (location.pathname === '/playlist' && document.querySelector('.pl-item')) { goPlaylist(dir); return; }
    if (busy) { if (queue.length < 3) queue.push(dir); return; }
    if (!/^\/video\//.test(location.pathname)) return;
    if (typeof W._doAutoplayNav !== 'function') return;
    var target;
    if (dir === 'next') {
      var fw = fwd.pop();
      var n = fw || W._vtAutoplayNext || fallbackNext();
      if (!n) return;
      remember();
      cur = { url: String(n.url).split('?')[0], title: n.title || '' };
      target = fw ? { url: fw.url, title: fw.title } : n;
    } else {
      var p = back.pop();
      if (!p) return;
      fwd.push(cur);
      cur = p;
      target = { url: p.url, title: p.title };
    }

    W._vtNavigating = false;
    var f = document.getElementById('yt-iframe');
    function toFrame(msg) { try { if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*'); } catch (eC) {} }
    toFrame({ ntClean: 1 });
    var pl = W._ytMainPlayer, rate = 1;
    try { rate = pl.getPlaybackRate(); } catch (eR) {}
    var id0 = vidNow(), t0 = Date.now();
    busy = true;
    lastGo = Date.now();

    var changedAt = 0;
    var wait = setInterval(function () {
      var id = vidNow();
      var st = -1;
      try { st = pl.getPlayerState(); } catch (eSt) {}
      if (id && id !== id0 && !changedAt) changedAt = Date.now();
      if ((changedAt && (st === 1 || st === 2 || Date.now() - changedAt > 2000)) || Date.now() - t0 > 4000) {
        clearInterval(wait);
        busy = false;
        if (queue.length) go(queue.shift());
      }
    }, 60);
    W._doAutoplayNav(target);
    [800, 2000, 4000].forEach(function (ms) { setTimeout(sendTitles, ms); });

    [700, 1800].forEach(function (ms) {
      setTimeout(function () {
        try { if (pl.getPlaybackRate() === 2 && rate !== 2) pl.setPlaybackRate(rate); } catch (eS) {}
      }, ms);
    });
  }

  var sx = 0, sy = 0, fired = 0, rx = 0, idle = 0;
  function onSwipe(dx, dy) {
    clearTimeout(idle);
    idle = setTimeout(function () { sx = 0; sy = 0; fired = 0; rx = 0; }, 350);
    if (fired) {
      if (dx * fired < 0) {
        rx += dx;
        if (Math.abs(rx) >= 70) { fired = rx > 0 ? 1 : -1; rx = 0; go(fired > 0 ? 'prev' : 'next'); }
      } else if (dx * fired > 0) rx = 0;
      return;
    }
    sx += dx; sy += dy;
    if (Math.abs(sx) >= 70 && Math.abs(sx) > Math.abs(sy) * 0.6) {
      fired = sx > 0 ? 1 : -1;
      go(fired > 0 ? 'prev' : 'next');
    }
  }

  var vy = 0, vDone = false, vIdle = 0;
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }

  var vx = 0;
  function onVert(dy, dx) {
    clearTimeout(vIdle);
    vIdle = setTimeout(function () { vy = 0; vx = 0; vDone = false; }, 350);
    if (vDone || !fsEl() || Date.now() - lastGo < 1500) return;
    vy += dy; vx += dx || 0;
    if (Math.abs(vy) >= 120 && Math.abs(vy) >= Math.abs(vx) * 2.5) { vDone = true; (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  }

  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.shiftKey) return;
    var horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6;
    if (!horiz && sx === 0 && !fired) {
      if (fsEl()) { e.preventDefault(); onVert(e.deltaY * (e.deltaMode === 1 ? 16 : 1), e.deltaX * (e.deltaMode === 1 ? 16 : 1)); }
      return;
    }
    e.preventDefault();
    var k = e.deltaMode === 1 ? 16 : 1;
    onSwipe(e.deltaX * k, e.deltaY * k);
  }, { capture: true, passive: false });

  function touchSwipe(dx, dy) {
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 0.8) go(dx < 0 ? 'prev' : 'next');
    else if (Math.abs(dy) >= 120 && Math.abs(dy) >= Math.abs(dx) * 2.5 && fsEl() && Date.now() - lastGo >= 1500) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  var t0 = null;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { capture: true, passive: true });

  function inHScroller(el) {
    for (; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2) {
        var ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
    }
    return false;
  }
  var tMode = '';
  window.addEventListener('touchmove', function (e) {
    if (!t0 || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
    if (!tMode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      tMode = Math.abs(dx) > Math.abs(dy) * 0.8 ? (inHScroller(e.target) ? 'list' : 'h') : 'v';
    }
    if (tMode === 'h' && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener('touchstart', function () { tMode = ''; }, { capture: true, passive: true });

  window.addEventListener('touchend', function (e) {
    if (!t0 || e.touches.length) { t0 = null; return; }
    if (tMode === 'list') { t0 = null; return; }
    var c = e.changedTouches[0], s = t0;
    t0 = null;
    if (Date.now() - s.t > 1000) return;
    touchSwipe(c.clientX - s.x, c.clientY - s.y);
  }, { capture: true, passive: true });

  function editable(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')); }
  window.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editable(e.target)) return;
    if (qActive() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else qGo(e.key === 'ArrowDown' ? 'next' : 'prev');
      return;
    }
    if (!/^\/(video\/|playlist)/.test(location.pathname)) return;
    if (e.key === ' ' && document.activeElement && document.activeElement.tagName !== 'IFRAME') {
      var pl = W._ytMainPlayer;
      if (!pl || typeof pl.getPlayerState !== 'function') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try { if (pl.getPlayerState() === 1) pl.pauseVideo(); else pl.playVideo(); } catch (eP) {}
      return;
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && GM_getValue('arrows', false) === true) {
      e.preventDefault();
      e.stopImmediatePropagation();
      go(e.key === 'ArrowRight' ? 'prev' : 'next');
    }
  }, true);

  window.addEventListener('message', function (e) {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    var d = e.data;
    if (typeof d === 'string' && d.indexOf('onError') >= 0) {
      var ev = null;
      try { ev = JSON.parse(d); } catch (eJ) {}
      if (ev && ev.event === 'onError') skipUnavailable(e.source);
      return;
    }
    if (d && d.ntFsToggle === 1) { fsToggle(e.source); return; }
    if (d && d.ntNeedTitle === 1) { [0, 300, 1000, 2000].forEach(function (ms) { setTimeout(sendTitles, ms); }); return; }
    if (d && typeof d.ntOpenChan === 'string') {
      if (/^\/channel\b/.test(d.ntOpenChan)) {
        if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (eX) {} }
        location.href = d.ntOpenChan;
      }
      return;
    }
    if (d && d.ntUpDown === 1) {
      if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (qActive()) qGo(d.dir === 'next' ? 'next' : 'prev');
      return;
    }
    if (d && d.ntEnded === 1) { if (qActive() && qFrame() && e.source === qFrame().contentWindow) qGo('next'); return; }
    if (d && d.ntVert === 1) { onVert(+d.dy || 0, +d.dx || 0); return; }
    if (d && d.ntKey === 1) { go(d.dir === 'next' ? 'next' : 'prev'); return; }
    if (d && d.ntTouch === 1) { touchSwipe(+d.dx || 0, +d.dy || 0); return; }
    if (!d || d.ntSwipe !== 1) return;
    onSwipe(+d.dx || 0, +d.dy || 0);
  });

  var q = { on: false, token: '', at: 0 };
  function qModal() { return document.getElementById('v2-video-modal'); }
  function qFrame() { return document.getElementById('v2-modal-iframe'); }
  function qOpen() { var m = qModal(); return !!(m && m.classList.contains('open')); }
  function qActive() { return q.on && (qOpen() || Date.now() - q.at < 4000); }
  function qCards(scope) {
    return Array.prototype.filter.call((scope || document).querySelectorAll('.v2-card'), function (c) {
      return c.offsetParent !== null && c.querySelector('a.v2-thumb-link[href^="/video/"]');
    });
  }
  function qInfo(c) {
    var a = c.querySelector('a.v2-thumb-link[href^="/video/"]');
    return { token: a.getAttribute('href').replace(/^\/video\//, '').split(/[?#]/)[0], title: a.getAttribute('aria-label') || '' };
  }
  function qMark(c) {
    Array.prototype.forEach.call(document.querySelectorAll('.nt-q-cur'), function (x) { x.classList.remove('nt-q-cur'); });
    if (c) {
      c.classList.add('nt-q-cur');
      if (!qOpen()) { try { c.scrollIntoView({ block: 'center' }); } catch (e) {} }
    }
  }

  // מרווח ל-1,000ms במקום 300ms
  setInterval(function () {
    var f = qFrame();
    if (!f || !/youtube(-nocookie)?\.com\/embed\//.test(f.src) || /[?&]enablejsapi=1/.test(f.src)) return;
    if (document.fullscreenElement) return;
    f.src = f.src + (f.src.indexOf('?') >= 0 ? '&' : '?') + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  }, 1000);

  function qSwap(c) {
    var f = qFrame();
    var inf = qInfo(c);
    if (!qOpen() || !f || !/[?&]enablejsapi=1/.test(f.src)) return false;
    fetch('/ajax/video_yt_id.php?token=' + encodeURIComponent(inf.token))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.yt) { skipUnavailable(f.contentWindow); return; }
        try {
          f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
          f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'loadVideoById', args: [d.yt] }), '*');
        } catch (e) {}
        var t = document.getElementById('v2-modal-title');
        if (t) t.textContent = inf.title;
      })
      .catch(function () {});
    try { f.contentWindow.postMessage({ ntClean: 1 }, '*'); } catch (e) {}
    return true;
  }
  function qPlay(c, swap) {
    if (!c || typeof W.modalPlay !== 'function') return;
    var inf = qInfo(c);
    q.on = true; q.token = inf.token; q.at = Date.now();
    qMark(c);
    qBar();
    qArrows();
    if (swap && qSwap(c)) { [400, 1500, 3000].forEach(function (ms) { setTimeout(sendTitles, ms); }); return; }
    W.modalPlay(inf.title, inf.token);
    [400, 1500, 3000].forEach(function (ms) { setTimeout(sendTitles, ms); });
  }

  function qPos() {
    var curEl = document.querySelector('.nt-q-cur');
    var scope = (curEl && curEl.closest('.v2-grid')) || document;
    var list = qCards(scope);
    var i = -1;
    for (var k = 0; k < list.length; k++) if (qInfo(list[k]).token === q.token) { i = k; break; }
    return { scope: scope, list: list, i: i };
  }

  function qSentinel(scope) {
    var p = scope && scope !== document && scope.parentNode;
    if (!p) return null;
    for (var i = 0; i < p.children.length; i++) if (/sentinel$/.test(p.children[i].id || '')) return p.children[i];
    return null;
  }
  function qBase() {
    var m = null;
    Array.prototype.some.call(document.scripts, function (sc) { m = !sc.src && /var baseUrl\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(sc.textContent); return !!m; });
    if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) {} }
    return location.pathname + location.search;
  }
  function qTok(c) { var a = c.querySelector('a.v2-thumb-link[href^="/video/"]'); return a ? a.getAttribute('href').replace(/^\/video\//, '').split(/[?#]/)[0] : ''; }
  var qMore = { grid: null, busy: false, done: false, per: 0 };

  function qDedupe(grid) {
    if (grid.getAttribute('data-nt-dd')) return;
    grid.setAttribute('data-nt-dd', '1');
    new MutationObserver(function (muts) {
      var seen = {}, removed = 0, added = 0;
      Array.prototype.forEach.call(grid.querySelectorAll('.v2-card'), function (c) {
        var t = qTok(c);
        if (!t) return;
        if (seen[t]) { c.remove(); removed++; } else seen[t] = 1;
      });
      muts.forEach(function (m) { added += m.addedNodes.length; });
      if (removed && removed >= added / 2) {
        var sn = qSentinel(grid);
        if (sn) { var d = sn.style.display; sn.style.display = 'none'; setTimeout(function () { sn.style.display = d; }, 50); }
      }
    }).observe(grid, { childList: true });
  }
  function qCanMore(scope) {
    if (!scope || scope === document || !qSentinel(scope)) return false;
    return !(qMore.grid === scope && qMore.done);
  }
  function qLoadMore(scope, cb) {
    if (!qCanMore(scope)) return false;
    if (qMore.grid !== scope) qMore = { grid: scope, busy: false, done: false, per: +scope.getAttribute('data-nt-per') || 12 };
    if (qMore.busy) return true;
    qMore.busy = true;
    qDedupe(scope);
    var st = qMore;
    var page = Math.floor(scope.querySelectorAll('.v2-card').length / st.per) + 1;
    var base = qBase();
    fetch(base + (base.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page + '&ajax_page=1', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        st.busy = false;
        if (!d) return;
        if (d.html) {
          var t = document.createElement('template');
          t.innerHTML = d.html;
          var have = {};
          Array.prototype.forEach.call(scope.querySelectorAll('.v2-card'), function (c) { have[qTok(c)] = 1; });
          Array.prototype.forEach.call(t.content.querySelectorAll('.v2-card'), function (c) { var k = qTok(c); if (k && have[k]) c.remove(); });
          scope.appendChild(t.content);
        }
        if (!d.hasMore) st.done = true;
        if (cb) cb();
      })
      .catch(function () { st.busy = false; });
    return true;
  }
  var qWait = 0;
  function qStopWait() { if (qWait) { clearInterval(qWait); qWait = 0; } }
  function qGo(dir) {
    qStopWait();
    var p = qPos(), list = p.list, i = p.i;
    var j = dir === 'next' ? i + 1 : i - 1;
    if (j < 0) return;
    if (j < list.length) { qPlay(list[j], true); return; }

    var before = list.length, scope = p.scope, tok = q.token, tries = 0;
    if (!qLoadMore(scope)) return;
    qWait = setInterval(function () {
      if (!qOpen() || q.token !== tok || ++tries > 30) { qStopWait(); return; }
      var l2 = qCards(scope);
      if (l2.length > before) { qStopWait(); qPlay(l2[before], true); }
      else if (!qMore.busy && !qMore.done) qLoadMore(scope);
    }, 300);
  }

  function qArrows() {
    var pr = document.getElementById('nt-q-prev'), nx = document.getElementById('nt-q-next');
    if (!pr || !nx || !q.on) return;
    var p = qPos();
    var more = qCanMore(p.scope);
    pr.style.display = p.i > 0 ? '' : 'none';
    nx.style.display = (p.i >= 0 && p.i < p.list.length - 1) || more ? '' : 'none';
    if (more && p.i >= 0 && p.i >= p.list.length - 3) qLoadMore(p.scope);
  }

  function qBar() {
    var bar = document.querySelector('#v2-video-modal .v2-modal-bar');
    if (!bar || document.getElementById('nt-q-prev')) return;
    function mk(id, icon, dir, title) {
      var b = document.createElement('button');
      b.id = id; b.type = 'button'; b.className = 'nt-q-btn'; b.title = title;
      b.innerHTML = '<i class="fas ' + icon + '"></i>';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); b.blur(); qGo(dir); });
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      return b;
    }
    bar.insertBefore(mk('nt-q-next', 'fa-chevron-left', 'next', 'הבא'), bar.firstChild);
    bar.insertBefore(mk('nt-q-prev', 'fa-chevron-right', 'prev', 'הקודם'), bar.firstChild);
    qArrows();
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.v2-modal-play');
    if (b) {
      var c = b.closest('.v2-card');
      if (c && c.querySelector('a.v2-thumb-link')) { q.on = true; q.token = qInfo(c).token; q.at = Date.now(); qMark(c); qBar(); }
      return;
    }
    var g = e.target && e.target.closest && e.target.closest('#v2-modal-goto');
    if (g && qActive() && q.token) { e.preventDefault(); e.stopImmediatePropagation(); location.href = '/video/' + q.token; }
  }, true);

  var qStyle = document.createElement('style');
  qStyle.textContent =
    '.nt-playall-btn{display:inline-flex;align-items:center;gap:6px;cursor:pointer;text-decoration:none}' +
    '.nt-playall-hdr{margin-inline-start:auto;margin-inline-end:12px}' +
    '.nt-q-cur{outline:3px solid var(--primary,#0EA5E9);outline-offset:3px;border-radius:12px}' +
    '.nt-q-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:30px;background:rgba(255,255,255,.1);color:#fff;' +
    'border:1px solid rgba(255,255,255,.18);border-radius:8px;cursor:pointer;margin-inline-end:6px}' +
    '.nt-q-btn:hover{background:rgba(255,255,255,.2)}' +
    '.nt-q-btn:focus,.nt-q-btn:focus-visible,.nt-q-btn:active{outline:none !important;box-shadow:none !important}';
  (document.head || document.documentElement).appendChild(qStyle);

  function qButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.v2-grid'), function (g) {
      if (g.getAttribute('data-nt-pa') || !qCards(g).length) return;
      g.setAttribute('data-nt-per', String(g.querySelectorAll('.v2-card').length));
      var sec = g.closest('.v2-section');
      var hdr = sec && sec.querySelector('.v2-section-header');
      var filters = !hdr && document.querySelector('.filters');
      var b = document.createElement('a');
      b.href = '#';
      b.setAttribute('role', 'button');
      b.className = 'sort-btn nt-playall-btn' + (hdr ? ' nt-playall-hdr' : '');
      b.title = 'ניגון ברצף של כל הסרטונים ברשימה, בחלונית';
      b.innerHTML = 'נגן הכל <i class="fas fa-play"></i>';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); qPlay(qCards(g)[0]); });
      if (hdr) {
        var seeAll = Array.prototype.find.call(hdr.children, function (x) { return /ראה הכל/.test(x.textContent); });
        if (seeAll) hdr.insertBefore(b, seeAll); else hdr.appendChild(b);
      } else if (filters) {
        var dd = filters.querySelector('.dur-dropdown');
        if (dd && dd.nextSibling) filters.insertBefore(b, dd.nextSibling); else filters.appendChild(b);
      } else {
        g.parentNode.insertBefore(b, g);
      }
      g.setAttribute('data-nt-pa', '1');
    });
  }
  setInterval(function () {
    qButtons();
    if (q.on) {
      if (!qOpen() && q.wasOpen) { q.wasOpen = false; qStopWait(); var cc = document.querySelector('.nt-q-cur'); if (cc) { try { cc.scrollIntoView({ block: 'center' }); } catch (eS) {} } }
      if (qOpen()) q.wasOpen = true;
      if (!qOpen() && Date.now() - q.at > 4000) { q.on = false; qMark(null); return; }
      qArrows();
      try {
        var fr = qFrame();
        if (fr && fr.contentWindow) {
          fr.contentWindow.postMessage({ ntQueue: 1 }, '*');
          if (/[?&]enablejsapi=1/.test(fr.src)) fr.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
        }
      } catch (e) {}
    }
  }, 800);

  var skips = [];
  function skipUnavailable(src) {
    var now = Date.now();
    skips = skips.filter(function (t) { return now - t < 30000; });
    if (skips.length >= 6) return;
    skips.push(now);
    var mf = qFrame(), main = document.getElementById('yt-iframe');
    if (qActive() && mf && src === mf.contentWindow) { setTimeout(function () { qGo('next'); }, 600); return; }
    if (main && src === main.contentWindow && /^\/video\//.test(location.pathname)) setTimeout(function () { go('next'); }, 1200);
  }

  function ytFrames() {
    return ['yt-iframe', 'v2-modal-iframe', 'pl-yt-iframe', 'mini-player-iframe']
      .map(function (id) { return document.getElementById(id); })
      .filter(function (x) { return x && x.contentWindow; });
  }
  document.addEventListener('fullscreenchange', function () {
    ytFrames().forEach(function (fr) {
      try { fr.contentWindow.postMessage({ ntTitle: siteTitle(fr), ntChan: siteChan(fr), ntFs: document.fullscreenElement === fr }, '*'); } catch (e) {}
    });
  });
  function fsToggle(src) {
    if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var fr = ytFrames().filter(function (x) { return x.contentWindow === src; })[0];
    if (fr) { try { (fr.requestFullscreen || fr.webkitRequestFullscreen).call(fr); } catch (e) {} }
  }
  function sendTitles() {
    ytFrames().forEach(function (fr) {
      try { fr.contentWindow.postMessage({ ntTitle: siteTitle(fr), ntChan: siteChan(fr), ntFs: document.fullscreenElement === fr }, '*'); } catch (e) {}
    });
  }
  function siteChan(fr) {
    var a = null, name = '';
    if (fr.id === 'v2-modal-iframe') {
      var card = document.querySelector('.nt-q-cur');
      a = card && card.querySelector('.v2-channel-name a.v2-avatar, a.v2-avatar');
      var sp = card && card.querySelector('.v2-channel-name span');
      name = sp ? sp.textContent : '';
    } else if (fr.id === 'yt-iframe') {
      a = document.getElementById('video-ch-avatar-main');
      name = a ? (a.getAttribute('title') || '').split(',').pop() : '';
    }
    var img = a && a.querySelector('img');
    if (!a || !img) return null;
    return { href: a.getAttribute('href') || '', img: img.currentSrc || img.src || '', name: (name || '').replace(/\s+/g, ' ').trim() };
  }
  function siteTitle(fr) {
    var t = '';
    if (fr.id === 'v2-modal-iframe') { var m = document.getElementById('v2-modal-title'); t = m ? m.textContent : ''; }
    else if (fr.id === 'pl-yt-iframe') { var a = document.querySelector('.pl-item.active'); t = a ? a.getAttribute('data-title') || '' : ''; }
    else if (fr.id === 'mini-player-iframe') { var mt = document.getElementById('mini-player-title'); t = mt ? mt.textContent : ''; }
    else { var h = document.querySelector('h1.video-page-title'); t = h ? h.textContent : ''; }
    return (t || '').replace(/\s+/g, ' ').trim();
  }
  setInterval(function () {
    ytFrames().forEach(function (fr) {
      try { fr.contentWindow.postMessage({ ntTitle: siteTitle(fr), ntChan: siteChan(fr), ntFs: document.fullscreenElement === fr }, '*'); } catch (e) {}
    });
  }, 1000);
})();

    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runPage); else runPage();
  }

  // ===== בתוך נגן היוטיוב שמוטמע ב-NeTube =====
  if (/(^|\.)youtube(-nocookie)?\.com$/.test(host) && window.top !== window) {
    var runFrame = function () {
(function () {
  if (window.top === window) return;
  var anc = (location.ancestorOrigins && location.ancestorOrigins[0]) || '';
  if (!/^https:\/\/([a-z0-9-]+\.)?netube\.co\.il$/.test(anc)) return;

  var st = document.createElement('style');
  st.textContent =
    'html,body{overscroll-behavior:none !important;touch-action:pan-y pinch-zoom !important}' +
    'html.nt-clean body *:not(video):not(:has(video)):not(#nt-spin):not(#nt-title):not(#nt-chan):not(#nt-chan *):not(#nt-avatar):not([class*="caption"]):not([class*="caption"] *)' +
    '{opacity:0 !important;transition:none !important}' +
    '#nt-spin{position:fixed;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;z-index:2147483647;' +
    'pointer-events:none;display:none;border-radius:50%;border:3px solid rgba(255,255,255,.22);border-top-color:#fff;' +
    'box-sizing:border-box;animation:nt-spin .8s linear infinite;filter:drop-shadow(0 0 1px rgba(0,0,0,.6))}' +
    'html.nt-clean.nt-loading #nt-spin{display:block}' +
    '@keyframes nt-spin{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(st);

  var spin = document.createElement('div');
  spin.id = 'nt-spin';
  var switchPending = false, switchAt = 0, newMedia = false, waiting = false, lastT = -1, loadingSince = 0;
  function startSwitch() { switchPending = true; switchAt = Date.now(); newMedia = false; waiting = false; }
  function isVideo(e) { return e.target && e.target.tagName === 'VIDEO'; }
  ['loadstart', 'emptied', 'durationchange', 'loadedmetadata'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (isVideo(e) && Date.now() - switchAt > 50) newMedia = true; }, true);
  });
  document.addEventListener('waiting', function (e) { if (isVideo(e)) waiting = true; }, true);
  document.addEventListener('playing', function (e) {
    if (!isVideo(e)) return;
    waiting = false;
    if (switchPending && (newMedia || Date.now() - switchAt > 1200)) switchPending = false;
  }, true);
  document.addEventListener('timeupdate', function (e) {
    var v = e.target;
    if (!isVideo(e) || v.paused) return;
    if (v.currentTime !== lastT) {
      waiting = false;
      if (switchPending && ((newMedia && v.currentTime > 0.05) || Date.now() - switchAt > 1500)) switchPending = false;
    }
    lastT = v.currentTime;
  }, true);

  setInterval(function () {
    var root = document.documentElement;
    var host = document.fullscreenElement || document.webkitFullscreenElement || root;
    if (host.tagName === 'VIDEO' || host.tagName === 'IFRAME') host = root;
    if (spin.parentNode !== host) host.appendChild(spin);
    if (switchPending && Date.now() - switchAt > 10000) switchPending = false;
    var v = document.querySelector('video');
    var loading = root.classList.contains('nt-clean') && (switchPending || (waiting && v && !v.paused));
    if (!loading) { loadingSince = 0; root.classList.remove('nt-loading'); return; }
    if (!loadingSince) loadingSince = Date.now();
    if (Date.now() - loadingSince > 3000) root.classList.add('nt-loading');
  }, 200);

  var hideUi = true, arrows = false, siteInfo = true;
  hideUi = GM_getValue('hideUi', true) !== false;
  arrows = GM_getValue('arrows', false) === true;
  siteInfo = GM_getValue('siteInfo', true) !== false;
  try {
    GM_addValueChangeListener('siteInfo', function (k, o, v) { siteInfo = v !== false; });
    GM_addValueChangeListener('hideUi', function (k, o, v) { hideUi = v !== false; if (!hideUi) unclean(); });
    GM_addValueChangeListener('arrows', function (k, o, v) { arrows = v === true; });
  } catch (eS) {}
  function clean() { if (hideUi) { document.documentElement.classList.add('nt-clean'); startSwitch(); } }
  function unclean() { document.documentElement.classList.remove('nt-clean'); }
  window.addEventListener('mousemove', function (e) {
    if (e.movementX || e.movementY) unclean();
  }, true);
  window.addEventListener('mousedown', unclean, true);
  window.addEventListener('keydown', unclean, true);

  function editable(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')); }
  window.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || editable(e.target)) return;
    if (arrows && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      clean();
      window.top.postMessage({ ntKey: 1, dir: e.key === 'ArrowRight' ? 'prev' : 'next' }, anc);
      return;
    }
    if (e.key === ' ') {
      var v = document.querySelector('video');
      if (!v) return;
      var was = v.paused;
      setTimeout(function () {
        if (v.paused === was) { if (was) v.play().catch(function () {}); else v.pause(); }
      }, 150);
    }
  }, true);

  var ntTitle = '', ntChan = null, pageFs = false;
  window.addEventListener('dblclick', function (e) {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.top.postMessage({ ntFsToggle: 1 }, anc);
  }, true);

  var iSt = document.createElement('style');
  iSt.textContent =
    '[class*="ytmVideoInfo"],.ytp-chrome-top .ytp-title,.ytp-chrome-top .ytp-title-channel{visibility:hidden !important}' +
    '#nt-info{position:fixed;top:0;right:0;z-index:2147483646;display:none;align-items:center;gap:10px;direction:rtl;' +
    'box-sizing:border-box;max-width:calc(100% - 200px);padding:12px 16px 0 0;pointer-events:none;color:#fff;' +
    'font-family:Roboto,Arial,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.5);background:none}' +
    '#nt-info img{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;pointer-events:auto}' +
    '#nt-info img.link{cursor:pointer}' +
    '#nt-info div{min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '#nt-info b{font-size:clamp(14px,1.5vw,19px);font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#nt-info span{font-size:clamp(12px,1.1vw,14px);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  (document.head || document.documentElement).appendChild(iSt);
  var info = document.createElement('div');
  info.id = 'nt-info';
  var iImg = document.createElement('img'); iImg.alt = '';
  var iTxt = document.createElement('div');
  var iT = document.createElement('b'), iC = document.createElement('span');
  iTxt.appendChild(iT); iTxt.appendChild(iC);
  info.appendChild(iImg); info.appendChild(iTxt);
  iImg.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (siteInfo) { if (ntChan && ntChan.href) window.top.postMessage({ ntOpenChan: ntChan.href }, anc); return; }
    var url = ytChanUrl();
    if (url) { var l = document.createElement('a'); l.href = url; l.target = '_blank'; l.rel = 'noopener'; document.body.appendChild(l); l.click(); l.remove(); }
  }, true);
  function ytChanUrl() {
    var a = document.querySelector('a.ytmVideoInfoChannelTitle[href],a.ytp-title-channel-logo[href],a.ytp-title-channel-name[href]');
    var h = a ? a.getAttribute('href') : '';
    if (h) return new URL(h, 'https://www.youtube.com').href;
    var m = ntChan && ntChan.href && /[?&]id=(UC[\w-]+)/.exec(ntChan.href);
    return m ? 'https://www.youtube.com/channel/' + m[1] : '';
  }
  ['mousedown', 'pointerdown', 'mouseup', 'dblclick'].forEach(function (n) { iImg.addEventListener(n, function (e) { e.stopPropagation(); }, true); });

  function shown(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 0;
    var op = 1;
    for (var x = el, k = 0; x && x.nodeType === 1 && k < 15; x = x.parentElement, k++) {
      var cs = getComputedStyle(x);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      op *= parseFloat(cs.opacity || '1');
    }
    return op;
  }

  function controlsShown() {
    var best = 0;
    var els = document.querySelectorAll('.player-controls-background,.ytmCuedOverlayGradient,.ytp-chrome-top,.ytp-chrome-bottom');
    for (var i = 0; i < els.length; i++) best = Math.max(best, shown(els[i]));
    return best;
  }
  function ytOwnTitle() {
    var a = document.querySelector('.ytmVideoInfoVideoTitle,.ytp-title-link');
    var t = a ? a.textContent : '';
    if (!t) t = (document.title || '').replace(/\s*-\s*YouTube\s*$/, '');
    return t.replace(/\s+/g, ' ').trim();
  }
  function ytOwnChan() {
    var a = document.querySelector('.ytmVideoInfoChannelTitle,.ytp-title-channel-name,.ytp-title-expanded-title');
    return a ? a.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  var oldTitle = null, oldUntil = 0;
  document.addEventListener('loadstart', function (e) {
    if (!isVideo(e)) return;
    oldTitle = ntTitle; oldUntil = Date.now() + 4000;
    window.top.postMessage({ ntNeedTitle: 1 }, anc);
  }, true);

  // אופטימיזציה: עודכן מ-150ms ל-1000ms (חוסך שחיקת מעבד כבדה)
  setInterval(function () {
    var op = document.documentElement.classList.contains('nt-clean') ? 0 : controlsShown();
    var title, chan, img = ntChan && ntChan.img;
    if (siteInfo) {
      title = ntTitle;
      if (oldTitle !== null && title === oldTitle && Date.now() < oldUntil) title = '';
      chan = ntChan ? ntChan.name : '';
    } else {
      title = ytOwnTitle();
      chan = ytOwnChan();
    }
    if (op < 0.05 || (!title && !img)) { info.style.display = 'none'; return; }
    var host = document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
    if (host.tagName === 'VIDEO' || host.tagName === 'IFRAME') host = document.documentElement;
    if (info.parentNode !== host) host.appendChild(info);
    if (iT.textContent !== title) iT.textContent = title || '';
    if (iC.textContent !== (chan || '')) iC.textContent = chan || '';
    iC.style.display = chan ? '' : 'none';
    if (img) { if (iImg.getAttribute('src') !== img) iImg.src = img; iImg.style.display = ''; } else iImg.style.display = 'none';
    iImg.className = 'link';
    iImg.title = chan || '';
    info.style.opacity = String(Math.min(1, op));
    info.style.display = 'flex';
  }, 1000);

  var queueMode = false;
  window.addEventListener('message', function (e) {
    if (e.origin !== anc || !e.data) return;
    if (e.data.ntClean === 1) clean();
    if (e.data.ntQueue === 1) queueMode = true;
    if (typeof e.data.ntTitle === 'string') {
      ntTitle = e.data.ntTitle;
      ntChan = e.data.ntChan || null;
      if (typeof e.data.ntFs === 'boolean') pageFs = e.data.ntFs;
    }
  });

  document.addEventListener('ended', function (e) {
    if (e.target && e.target.tagName === 'VIDEO') window.top.postMessage({ ntEnded: 1 }, anc);
  }, true);

  window.addEventListener('keydown', function (e) {
    if (!queueMode || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    window.top.postMessage({ ntUpDown: 1, dir: e.key === 'ArrowDown' ? 'next' : 'prev' }, anc);
  }, true);

  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }

  var t0 = null, swiping = false;
  window.addEventListener('touchstart', function (e) {
    swiping = false;
    if (e.touches.length !== 1) { t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { capture: true, passive: true });

  window.addEventListener('touchmove', function (e) {
    if (!t0 || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
    if (!swiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.8) { swiping = true; clean(); }
    if (swiping && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });

  var lastNav = 0;
  function exitFsIf(vx, vy) {
    if (!fsEl()) return false;
    if (Date.now() - lastNav < 1500) return false;
    if (Math.abs(vy) < 120 || Math.abs(vy) < Math.abs(vx) * 2.5) return false;
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return true;
  }

  window.addEventListener('touchend', function (e) {
    if (!t0 || e.touches.length) { t0 = null; return; }
    var c = e.changedTouches[0], s = t0;
    t0 = null;
    var dx = c.clientX - s.x, dy = c.clientY - s.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { unclean(); return; }
    if (Date.now() - s.t > 1000) { if (swiping) unclean(); return; }
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) { if (swiping) unclean(); return; }
    if (Math.abs(dx) > Math.abs(dy) * 0.8) {
      clean();
      lastNav = Date.now();
      window.top.postMessage({ ntTouch: 1, dx: dx, dy: dy }, anc);
      return;
    }
    if (!exitFsIf(dx, dy) && !fsEl()) window.top.postMessage({ ntTouch: 1, dx: dx, dy: dy }, anc);
  }, { capture: true, passive: false });

  var gx = 0, gy = 0, mode = '', vDone = false, idle = 0;
  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.shiftKey) return;
    clearTimeout(idle);
    idle = setTimeout(function () { gx = 0; gy = 0; mode = ''; vDone = false; }, 350);
    var k = e.deltaMode === 1 ? 16 : 1;
    var dx = e.deltaX * k, dy = e.deltaY * k;
    gx += dx; gy += dy;
    if (!mode) {
      if (Math.abs(gx) + Math.abs(gy) < 30) {
        if (fsEl() || Math.abs(dx) > Math.abs(dy) * 0.6) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      mode = Math.abs(gx) > Math.abs(gy) * 0.6 ? 'h' : 'v';
      if (mode === 'h') {
        e.preventDefault();
        e.stopImmediatePropagation();
        clean();
        lastNav = Date.now();
        window.top.postMessage({ ntSwipe: 1, dx: gx, dy: gy }, anc);
        return;
      }
    }
    if (mode === 'h') {
      e.preventDefault();
      e.stopImmediatePropagation();
      lastNav = Date.now();
      window.top.postMessage({ ntSwipe: 1, dx: gx, dy: dy }, anc);
      return;
    }
    if (fsEl()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!vDone && exitFsIf(gx, gy)) vDone = true;
    } else {
      window.top.postMessage({ ntVert: 1, dx: dx, dy: dy }, anc);
    }
  }, { capture: true, passive: false });
})();

    };
    if (document.documentElement) runFrame();
    else new MutationObserver(function (m, o) { if (document.documentElement) { o.disconnect(); runFrame(); } }).observe(document, { childList: true });
  }
})();
