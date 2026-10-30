(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var scroller = $('#scroller');
  var LOG = window.__jahsenLog = [];
  function log(m) { LOG.push(Date.now() + ' ' + m); }

  /* ---------- tamaño de página 9:16 ---------- */
  function fit() {
    var w = scroller.clientWidth, h = scroller.clientHeight;
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
    p1_piolin: 'audio/p1_piolin.mp3', p2_bugs: 'audio/p2_bugs.mp3', p3_lucas: 'audio/p3_lucas.mp3',
    p4_correcaminos: 'audio/p4_correcaminos.mp3', p5_silvestre: 'audio/p5_silvestre.mp3',
    p6_porky: 'audio/p6_porky.mp3', p7_taz_bugs: 'audio/p7_taz_bugs.mp3'
  };
  window.__jahsenAudio = { buffers: buffers, plays: [] };

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
      window.__jahsenAudio.plays.push('intro');
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
      window.__jahsenAudio.plays.push('fondo');
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
      window.__jahsenAudio.plays.push(k);
      log('sfx ' + k);
      return true;
    }).catch(function () { return false; });
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

  /* ---------- carga diferida de imágenes y animaciones ---------- */
  var blobs = {};
  function loadBg(sec) {
    $$('#' + sec.id + ' img.bg[data-src]').forEach(function (im) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); });
  }
  function loadChars(sec) {
    return Promise.all($$('#' + sec.id + ' img.char').map(function (im) {
      var url = im.getAttribute('data-src');
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
  ['intro', 'sobre', 'p2_bugs'].forEach(fetchRaw);

  var opened = false, played = {}, current = sections[0];
  function onSectionVisible(sec) {
    current = sec;
    if (!opened) return;
    if (sec.getAttribute('data-auto') === '1' && !played[sec.id]) {
      played[sec.id] = true;
      loadChars(sec).then(function () {
        if (current !== sec) return;
        restartSection(sec);
        playSfx(sec.getAttribute('data-sound'));
      });
    }
    if (sec.id === 's4') maybeParty();
  }
  if ('IntersectionObserver' in window) {
    var pre = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { loadBg(e.target); if (opened) loadChars(e.target); } });
    }, { root: scroller, rootMargin: '150% 0px 150% 0px' });
    var vis = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.6) onSectionVisible(e.target); });
    }, { root: scroller, threshold: [0.6] });
    sections.forEach(function (s) { pre.observe(s); vis.observe(s); });
  } else {
    sections.forEach(function (s) { loadBg(s); loadChars(s); });
  }

  /* toques en personajes */
  $$('img.char').forEach(function (im) {
    im.addEventListener('click', function () {
      if (!unlocked) unlock();
      var sec = im.closest('.sec');
      restartSection(sec);
      playSfx(sec.getAttribute('data-sound'));
    });
    im.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  $('#escucharBtn').addEventListener('click', function () {
    if (!unlocked) unlock();
    restartSection($('#s2')); playSfx('p2_bugs');
  });
  $('#volverBtn').addEventListener('click', function () {
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- abrir el sobre ---------- */
  var sobre = $('#sobre'), flash = $('#flash'), hint = $('#hint');
  function openEnvelope() {
    unlock();
    playSfx('sobre', 0.9);
    startMusic();
    if (opened) { $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    opened = true;
    played.s2 = false;
    document.body.classList.add('opened');
    $('#abrirBtn').classList.remove('pulse');
    sobre.classList.add('wiggle');
    sections.forEach(function (s, i) { if (i > 1) loadBg(s); });
    setTimeout(function () {
      sobre.classList.remove('wiggle'); sobre.classList.add('fly');
      flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
      confetti($('#confettiTop'), 1600, 140);
    }, 500);
    setTimeout(function () {
      scroller.classList.remove('locked');
      $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { hint.classList.add('show'); }, 900);
    }, 1150);
    setTimeout(function () { sobre.classList.remove('fly'); }, 2600);
  }
  $('#abrirSobre').addEventListener('click', openEnvelope);
  $('#abrirBtn').addEventListener('click', openEnvelope);
  scroller.addEventListener('scroll', function () {
    if (hint.classList.contains('show') && scroller.scrollTop > scroller.clientHeight * 1.5) hint.classList.remove('show');
  }, { passive: true });
  setTimeout(function () { hint.classList.remove('show'); }, 15000);

  /* ---------- contador ---------- */
  var TARGET = Date.parse('2026-11-28T10:00:00-05:00');
  var cd = $('#countdown'), partyShown = false;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var ms = TARGET - Date.now();
    if (ms <= 0) {
      if (!cd.classList.contains('party')) { cd.classList.add('party'); $('#cdTitle').textContent = '¡Hoy es la fiesta!'; }
      return;
    }
    var s = Math.floor(ms / 1000);
    $('#cdD').textContent = Math.floor(s / 86400);
    $('#cdH').textContent = pad(Math.floor(s % 86400 / 3600));
    $('#cdM').textContent = pad(Math.floor(s % 3600 / 60));
    $('#cdS').textContent = pad(s % 60);
  }
  tick(); setInterval(tick, 1000);
  function maybeParty() {
    if (Date.now() >= TARGET && !partyShown) { partyShown = true; confetti($('#confetti4'), 6000, 160); }
  }

  /* ---------- confeti ---------- */
  function confetti(cv, dur, n) {
    var r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    var c = cv.getContext('2d'); c.scale(dpr, dpr);
    var cols = ['#e3241b', '#ffd23f', '#1d5fa8', '#ffffff', '#ff8c00', '#43b047'];
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
  renderMute();
})();
