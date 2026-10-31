(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var stage = $('#stage');
  var LOG = window.__jahsehLog = []; window.__jahsehVersion = 'v9-rsvp';
  function log(m) { LOG.push(Date.now() + ' ' + m); }

  /* ---------- tamaño de página 9:16 ---------- */
  function fit() {
    var w = stage.clientWidth, h = stage.clientHeight;
    var pw = Math.min(w, h * 9 / 16);
    document.documentElement.style.setProperty('--pw', pw + 'px');
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });

  /* ---------- audio (Web Audio API) ---------- */
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master, musicGain, sfxGain;
  var raw = {}, buffers = {}, decoding = {};
  var muted = false, unlocked = false;
  var MUSIC_INTRO = 0.85, MUSIC_LOOP = 0.32, DUCK = 0.22;
  var musicBase = MUSIC_INTRO, activeSfx = 0, sfxNodes = {};
  var AUDIO = {
    intro: 'audio/intro.mp3', fondo: 'audio/fondo.mp3', sobre: 'audio/sobre.mp3',
    s1_piolin: 'audio/s1_piolin.mp3', s4_lucas: 'audio/s4_lucas.mp3', s5_taz: 'audio/s5_taz.mp3',
    s6_silvestre: 'audio/s6_silvestre.mp3', s7_lola: 'audio/s7_lola.mp3', s8_cierre: 'audio/s8_cierre.mp3'
  };
  window.__jahsehAudio = { buffers: buffers, plays: [] };

  function fetchRaw(k) {
    if (!raw[k]) {
      raw[k] = fetch(AUDIO[k]).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + AUDIO[k]);
        return r.arrayBuffer();
      });
      raw[k].catch(function (e) { log('fetch error ' + k + ' ' + e); });
    }
    return raw[k];
  }
  function getBuffer(k) {
    if (buffers[k]) return Promise.resolve(buffers[k]);
    if (!ctx) return Promise.reject(new Error('sin contexto'));
    if (!decoding[k]) {
      decoding[k] = fetchRaw(k).then(function (ab) {
        return new Promise(function (res, rej) {
          var p = ctx.decodeAudioData(ab.slice(0), res, rej); // forma con callbacks para Safari antiguo
          if (p && p.catch) p.catch(rej);
        });
      }).then(function (b) { buffers[k] = b; log('decoded ' + k + ' ' + b.duration.toFixed(2)); return b; },
        function (e) { log('decode error ' + k + ' ' + e); delete decoding[k]; throw e; });
    }
    return decoding[k];
  }
  function setMusicLevel(t) {
    if (!ctx) return;
    var v = musicBase * (activeSfx > 0 ? DUCK : 1);
    var now = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(v, now + (t || 0.25));
  }
  function unlock() {
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = MUSIC_INTRO; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 1; sfxGain.connect(master);
      log('ctx created ' + ctx.state);
    }
    if (ctx.state !== 'running') ctx.resume();
    // buffer silencioso dentro del gesto (desbloqueo iOS)
    var s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    unlocked = true;
    Object.keys(AUDIO).forEach(function (k) { getBuffer(k).catch(function () {}); });
  }

  var musicStarted = false, loopSrc = null;
  function startMusic() {
    if (musicStarted || !ctx) return;
    musicStarted = true;
    getBuffer('intro').then(function (b) {
      var s = ctx.createBufferSource(); s.buffer = b; s.connect(musicGain);
      musicBase = MUSIC_INTRO; setMusicLevel(0.05);
      s.onended = startLoop; s.start(0);
      window.__jahsehAudio.plays.push('intro');
      log('intro start');
    }).catch(startLoop);
  }
  function startLoop() {
    if (loopSrc) return;
    getBuffer('fondo').then(function (b) {
      if (loopSrc) return;
      loopSrc = ctx.createBufferSource(); loopSrc.buffer = b; loopSrc.loop = true; loopSrc.connect(musicGain);
      musicBase = MUSIC_LOOP;
      musicGain.gain.setValueAtTime(0, ctx.currentTime);
      setMusicLevel(1.5);
      loopSrc.start(0);
      window.__jahsehAudio.plays.push('fondo');
      log('loop start');
    }).catch(function () {});
  }
  function playSfx(k, gain) {
    if (!ctx || !unlocked) return Promise.resolve(false);
    return getBuffer(k).then(function (b) {
      Object.keys(sfxNodes).forEach(function (o) {
        if (o === k || (k !== 'sobre' && o !== 'sobre')) { // un personaje a la vez
          try { sfxNodes[o].onended = null; sfxNodes[o].stop(); } catch (e) {}
          delete sfxNodes[o]; activeSfx = Math.max(0, activeSfx - 1);
        }
      });
      var g = ctx.createGain(); g.gain.value = gain || 1; g.connect(sfxGain);
      var s = ctx.createBufferSource(); s.buffer = b; s.connect(g);
      sfxNodes[k] = s; activeSfx++; setMusicLevel(0.2);
      s.onended = function () { if (sfxNodes[k] === s) delete sfxNodes[k]; activeSfx = Math.max(0, activeSfx - 1); setMusicLevel(0.6); };
      s.start(0);
      window.__jahsehAudio.plays.push(k);
      log('sfx ' + k);
      return true;
    }).catch(function () { return false; });
  }

  function stopSfx() {
    Object.keys(sfxNodes).forEach(function (o) {
      if (o === 'sobre') return;
      try { sfxNodes[o].onended = null; sfxNodes[o].stop(); } catch (e) {}
      delete sfxNodes[o]; activeSfx = Math.max(0, activeSfx - 1);
    });
    setMusicLevel(0.6);
  }

  /* silencio */
  var muteBtn = $('#muteBtn');
  function renderMute() {
    $('#icoOn').style.display = muted ? 'none' : ''; $('#icoOff').style.display = muted ? '' : 'none';
    muteBtn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
  }
  muteBtn.addEventListener('click', function () {
    muted = !muted; renderMute();
    if (!ctx) { unlock(); }
    if (ctx) { master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); if (!muted && ctx.state !== 'running') ctx.resume(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (unlocked) ctx.resume();
  });


  /* ---------- carga diferida: WebP con alfa, GIF de respaldo ---------- */
  var WEBP = false;
  try { WEBP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) {}
  function charUrl(im) {
    var src = im.parentNode && im.parentNode.querySelector('source[data-srcset]');
    return (WEBP && src) ? src.getAttribute('data-srcset') : im.getAttribute('data-src');
  }
  var blobs = {};
  function loadBg(sec) {
    $$('#' + sec.id + ' img[data-src]:not(.char)').forEach(function (im) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); });
  }
  function loadChars(sec) {
    return Promise.all($$('#' + sec.id + ' img.char').map(function (im) {
      var url = charUrl(im);
      if (!blobs[url]) {
        blobs[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .catch(function (e) { log('img error ' + url + ' ' + e); return null; });
      }
      return blobs[url].then(function (b) {
        if (!b) { if (!im.src) im.src = url; return; }
        if (!im._loaded) { im._loaded = true; im._blob = b; restartImg(im); }
      });
    }));
  }
  function restartImg(im) {
    if (!im._blob) return;
    var old = im._url; im._url = URL.createObjectURL(im._blob); im.src = im._url;
    if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
  }
  function restartSection(sec) { $$('#' + sec.id + ' img.char').forEach(restartImg); }

  var sections = $$('.sec');
  loadBg(sections[0]); loadChars(sections[0]); loadBg(sections[1]); loadChars(sections[1]);
  ['intro', 'sobre', 's1_piolin'].forEach(fetchRaw);

  /* ---------- visor por toques (tipo historia) ---------- */
  var opened = false, played = {}, idx = 0, current = sections[0], navLock = 0;
  var hint = $('#hint'), again = $('#againBtn'), bars = $$('#progress i'), progress = $('#progress');
  var NAV_MS = 450;
  window.__jahsehNav = { navs: [], goTo: function (i) { navLock = 0; return goTo(i, 'qa'); } };

  function layout(instant) {
    sections.forEach(function (s, i) {
      if (instant) s.classList.add('instant');
      s.classList.toggle('active', i === idx);
      s.classList.toggle('left', i < idx);
      s.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
      if (instant) { void s.offsetWidth; s.classList.remove('instant'); }
    });
    bars.forEach(function (b, i) { b.classList.toggle('on', i <= idx); });
    progress.classList.toggle('show', opened);
    var last = idx === sections.length - 1;
    hint.classList.toggle('show', opened && !last);
    again.classList.toggle('show', opened && last);
    document.body.setAttribute('data-screen', String(idx + 1));
  }
  function goTo(i, why) {
    if (i < 0 || i >= sections.length || i === idx) return false;
    var now = Date.now();
    if (now < navLock) return false;
    navLock = now + NAV_MS;
    stopSfx();
    idx = i; current = sections[i];
    window.__jahsehNav.navs.push((why || '') + '>' + (i + 1));
    loadBg(current); loadChars(current);
    if (sections[i + 1]) { loadBg(sections[i + 1]); loadChars(sections[i + 1]); }
    layout(false);
    onSectionVisible(current);
    return true;
  }
  function next(why) { return goTo(idx + 1, why || 'next'); }
  function prev(why) { return goTo(idx - 1, why || 'prev'); }

  function onSectionVisible(sec) {
    // cada pantalla reinicia su animación al entrar; el sonido suena una vez (solo después del primer toque)
    loadChars(sec).then(function () {
      if (current !== sec) return;
      restartSection(sec);
      var k = sec.getAttribute('data-sound');
      if (unlocked && k && sec.getAttribute('data-auto') === '1' && !played[sec.id]) { played[sec.id] = true; playSfx(k); }
    });
    if (sec.id === 's5') maybeParty();
  }

  var NO_NAV = '.hot, a, button, img.char, #muteBtn, #againBtn';
  function replay(sec, el) {
    if (!unlocked) unlock();
    if (el) { el.classList.remove('boing'); void el.offsetWidth; el.classList.add('boing'); }
    restartSection(sec);
    var k = sec.getAttribute('data-sound');
    if (k) playSfx(k);
  }
  function bindTap(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(e); }); }
  $$('img.char').forEach(function (im) {
    bindTap(im, function () {
      if (!opened && im.closest('#s1')) { openEnvelope(); return; }
      replay(im.closest('.sec'), im);
    });
    im.addEventListener('animationend', function () { im.classList.remove('boing'); });
    im.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  $$('a.hot').forEach(function (a) { a.addEventListener('click', function (e) { e.stopPropagation(); log('link ' + a.id); }); });
  function verDeNuevo() {
    Object.keys(played).forEach(function (k) { played[k] = false; });
    navLock = 0; goTo(1, 'again');
  }
  bindTap($('#volverBtn'), verDeNuevo);
  bindTap(again, verDeNuevo);

  var swipe = null, swallowClick = 0;
  stage.addEventListener('click', function (e) {
    if (Date.now() < swallowClick) return;
    if (e.target.closest && e.target.closest(NO_NAV)) return;
    if (!opened) { openEnvelope(); return; }
    var x = e.clientX, w = stage.clientWidth;
    if (x < w * 0.25) prev('tapL'); else if (idx < sections.length - 1) next('tapR');
  });
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { swipe = null; return; }
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!swipe || !opened) return;
    var t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - swipe.t < 800) {
      swallowClick = Date.now() + 400;
      if (dx < 0) next('swipeL'); else prev('swipeR');
    }
    swipe = null;
  }, { passive: true });
  function enForm(e) { return document.body.classList.contains('rsvp-open') || (e.target && e.target.closest && e.target.closest('#rsvp')); }
  document.addEventListener('touchmove', function (e) { if (enForm(e)) return; if (e.touches.length === 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  window.addEventListener('wheel', function (e) { if (enForm(e)) return; e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if (enForm(e)) return;
    if (!opened) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope(); } return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next('key'); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev('key'); }
  });

  /* ---------- abrir el sobre (el fondo no se mueve: destello + confeti azul) ---------- */
  var flash = $('#flash');
  function openEnvelope() {
    unlock();
    playSfx('sobre', 0.9);
    startMusic();
    if (opened) { navLock = 0; goTo(1, 'sobre'); return; }
    opened = true;
    played.s1 = true;
    document.body.classList.add('opened');
    $('#abrirSobre').classList.remove('pulse');
    sections.forEach(function (s, i) { if (i > 1) loadBg(s); });
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
    confetti($('#confettiTop'), 1600, 140);
    setTimeout(function () { navLock = 0; goTo(1, 'open'); }, 900);
  }
  bindTap($('#abrirSobre'), openEnvelope);
  layout(true);

  /* ---------- contador ---------- */
  var TARGET = Date.parse('2026-11-28T10:00:00-05:00');
  var s5 = $('#s5'), partyShown = false;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var ms = TARGET - Date.now();
    if (ms <= 0) { s5.classList.add('party'); return; }
    var s = Math.floor(ms / 1000);
    $('#cdD').textContent = Math.floor(s / 86400);
    $('#cdH').textContent = pad(Math.floor(s % 86400 / 3600));
    $('#cdM').textContent = pad(Math.floor(s % 3600 / 60));
    $('#cdS').textContent = pad(s % 60);
  }
  tick(); setInterval(tick, 1000);
  function maybeParty() {
    if (Date.now() >= TARGET && !partyShown) { partyShown = true; confetti($('#confetti5'), 6000, 160); }
  }

  /* ---------- confeti (azules y amarillos) ---------- */
  function confetti(cv, dur, n) {
    var r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    var c = cv.getContext('2d'); c.scale(dpr, dpr);
    var cols = ['#163AB0', '#FFD23F', '#667ECA', '#ffffff', '#e3241b', '#43b047'];
    var ps = [];
    for (var i = 0; i < n; i++) ps.push({ x: r.width * (0.2 + Math.random() * 0.6), y: r.height * 0.45, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4,
      s: 5 + Math.random() * 6, a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.3, col: cols[i % cols.length] });
    var t0 = performance.now();
    (function frame(t) {
      var el = t - t0; c.clearRect(0, 0, r.width, r.height);
      ps.forEach(function (p) {
        p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.globalAlpha = Math.max(0, 1 - el / dur);
        c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
      });
      if (el < dur) requestAnimationFrame(frame); else c.clearRect(0, 0, r.width, r.height);
    })(t0);
  }

  if (/[?&]debug=1/.test(location.search)) document.body.classList.add('debug');
  var m = /[?&]p=(\d)/.exec(location.search);   // solo para revisión: ?p=3 abre directo la pantalla 3
  if (m) { opened = true; layout(true); navLock = 0; goTo(+m[1] - 1, 'url'); }
  renderMute();
})();
