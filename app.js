(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var stage = $('#stage');
  var LOG = window.__jahsehLog = []; window.__jahsehVersion = 'v12-ligero';
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
    s1_piolin: 'audio/s1_piolin.mp3', s4_lucas: 'audio/s4_lucas.mp3', s5_taz: 'audio/s5_taz.mp3', s5_comer: 'audio/s5_taz_comer.mp3',
    s5_ent: 'audio/s5_taz_entrada_der.mp3', s5_sal: 'audio/s5_taz_salida_remolino.mp3',
    s6_silvestre_a2: 'audio/s6_silvestre_a2.mp3',
    s7_lola: 'audio/s7_lola.mp3', s8_cierre: 'audio/s8_cierre_eso_es_todo_vaquero.mp3',
    s8_porky: 'audio/s8_porky_eso_es_todo.mp3',
    p2_piolin: 'audio/p2_piolin_frase01.mp3',  // Baby Piolín: «¡Ay, abuela! ¡Ven a ver esto de prisa!»
    p2_piolin_f04: 'audio/p2_piolin_frase04.mp3', // Baby Piolín arriba: «¡Este es el mejor cumpleaños que he tenido!» (frase 04, animación v4)
    // P7 Lola al tocar (MP3 originales del doblaje latino; carga perezosa: solo cuando la pantalla 7 está cerca)
    s7_lola_01: 'audio/s7_lola_01.mp3', s7_lola_02: 'audio/s7_lola_02.mp3', s7_lola_03: 'audio/s7_lola_03.mp3', s7_lola_11: 'audio/s7_lola_11.mp3',
    // v12: P4 Lucas «Después de dormir un poco.» (frase_03 sync5) y P6 Silvestre f14 «crujientes esponjositos bocadillos» / f09 «chocolate» (carga perezosa)
    s4_lucas_f03: 'audio/s4_lucas_f03.mp3', s6_silvestre_f14: 'audio/s6_silvestre_f14.mp3', s6_silvestre_f09: 'audio/s6_silvestre_f09.mp3'
  };
  var LAZY = { s7_lola_01: 1, s7_lola_02: 1, s7_lola_03: 1, s7_lola_11: 1, s4_lucas_f03: 1, s6_silvestre_f14: 1, s6_silvestre_f09: 1 };
  window.__jahsehAudio = { buffers: buffers, plays: [], at: [] };

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
    Object.keys(AUDIO).forEach(function (k) { if (!LAZY[k] || raw[k]) getBuffer(k).catch(function () {}); });
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
  /* offset (s): empieza el sonido más adentro (para calzarlo con un video ya en marcha, portada Piolín f04);
     dur (s): toca solo un tramo [offset, offset+dur] con un fundido de 30 ms al final (pantalla 5, Taz) */
  function playSfx(k, gain, offset, dur) {
    if (!ctx || !unlocked) return Promise.resolve(false);
    return getBuffer(k).then(function (b) {
      Object.keys(sfxNodes).forEach(function (o) {
        if (o === k || (k !== 'sobre' && o !== 'sobre')) { // un personaje a la vez
          try { sfxNodes[o].onended = null; sfxNodes[o].stop(); } catch (e) {}
          delete sfxNodes[o]; activeSfx = Math.max(0, activeSfx - 1);
        }
      });
      var g = ctx.createGain(), gv = gain || 1; g.gain.value = gv; g.connect(sfxGain);
      var s = ctx.createBufferSource(); s.buffer = b; s.connect(g);
      offset = Math.min(Math.max(0, offset || 0), Math.max(0, b.duration - 0.05));
      if (dur) { var te = ctx.currentTime + dur; g.gain.setValueAtTime(gv, Math.max(ctx.currentTime, te - 0.03)); g.gain.linearRampToValueAtTime(0, te); }
      sfxNodes[k] = s; activeSfx++; setMusicLevel(0.2);
      s.onended = function () { if (sfxNodes[k] === s) delete sfxNodes[k]; activeSfx = Math.max(0, activeSfx - 1); setMusicLevel(0.6); };
      if (dur) s.start(0, offset, dur); else s.start(0, offset);
      window.__jahsehAudio.plays.push(k);
      window.__jahsehAudio.at.push({ k: k, off: offset, dur: dur || (b.duration - offset), t: performance.now() });
      log('sfx ' + k + (offset ? ' +' + offset.toFixed(3) : ''));
      return dur || (b.duration - offset) || true;   // duración en s (para no pisar el sonido en curso)
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
  /* v12: Safari/iOS no CODIFICA WebP en canvas aunque sí MUESTRA WebP animado con alfa (Safari 14+ / iOS 14+). Si la prueba del canvas
     falla se prueba la decodificación real de un WebP animado de 1x1 (la misma prueba de la frase 04 de Piolín); así el iPhone también
     recibe los WebP aprobados (Taz, Lola, Lucas, Silvestre…) y no los GIF de respaldo. Toda carga de personajes espera esta prueba (ms). */
  var webpReady = WEBP ? Promise.resolve(true) : new Promise(function (res) {
    var done = false, fin = function (ok) { if (done) return; done = true; if (ok) WEBP = true; log('webp ' + (ok ? 'decodifica' : 'no')); res(WEBP); };
    var t = new Image();
    t.onload = function () { fin(t.width === 1 && t.height === 1); };
    t.onerror = function () { fin(false); };
    setTimeout(function () { fin(false); }, 1500);
    t.src = 'data:image/webp;base64,UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA';
  });
  function charUrl(im) {
    var src = im.parentNode && im.parentNode.querySelector('source[data-srcset]');
    return (WEBP && src) ? src.getAttribute('data-srcset') : im.getAttribute('data-src');
  }
  var blobs = {};
  function loadBg(sec) {
    $$('#' + sec.id + ' img[data-src]:not(.char)').forEach(function (im) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); });
  }
  function loadChars(sec) {
    return webpReady.then(function () { return loadChars2(sec); });
  }
  function loadChars2(sec) {
    return Promise.all($$('#' + sec.id + ' img.char').map(function (im) {
      var url = charUrl(im);
      if (!blobs[url]) {
        blobs[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .catch(function (e) { log('img error ' + url + ' ' + e); return null; });
      }
      return blobs[url].then(function (b) {
        if (!b) { if (!im.src) im.src = url; return; }
        if (!im._loaded) { im._loaded = true; im._blob = b; restartImg(im); }
        if (im.hasAttribute('data-tap-webp')) loadTapBlob(im);
        if (im.id === 'lola7') preloadLola();
        if (im.hasAttribute('data-rota')) rotaPreload(im);
      });
    }));
  }
  function restartImg(im, blob) {
    blob = blob || im._blob;
    if (!blob) return;
    im._restarts = (im._restarts || 0) + 1;
    var old = im._url; im._url = URL.createObjectURL(blob); im.src = im._url;
    if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
    // data-rest (de site_v9_tap_p6): animación de una pasada (Silvestre a2 habla una vez); al terminar queda en su cuadro de reposo
    var rest = im.getAttribute('data-rest');
    clearTimeout(im._restT);
    if (rest) {
      if (!im._restImg) { im._restImg = new Image(); im._restImg.src = rest; }
      im._restT = setTimeout(function () { im.src = rest; }, +im.getAttribute('data-rest-ms') || 2000);
    }
  }
  function restartSection(sec) { $$('#' + sec.id + ' img.char').forEach(function (im) { restartImg(im); }); }

  /* fotos animadas de la portada (video mudo en bucle, recortado a la ventana de cada marco) */
  function loadFotos(sec) {
    $$('#' + sec.id + ' video.foto[data-src]').forEach(function (v) {
      v.src = v.getAttribute('data-src'); v.removeAttribute('data-src');
      v.addEventListener('canplay', function () { v.classList.add('lista'); });
      v.addEventListener('error', function () { log('video error ' + v.src); });
    });
  }
  function playFotos(sec) {
    $$('video.foto').forEach(function (v) {
      if (v.closest('.sec') === sec) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else { try { v.pause(); } catch (e) {} }
    });
  }

  /* pantalla 8: cada bebé tiene su propia zona de toque y se anima solo él (salto vertical, sin 'boing') */
  function tapUrl(im) { return WEBP ? im.getAttribute('data-tap-webp') : im.getAttribute('data-tap-gif'); }
  function loadTapBlob(im) {
    var url = tapUrl(im);
    if (!url) return Promise.resolve(null);
    if (!blobs[url]) {
      blobs[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .catch(function (e) { log('img error ' + url + ' ' + e); return null; });
    }
    return blobs[url];
  }
  var TAPS = window.__jahsehTaps = { log: [], busy: {}, count: {} };
  function tapChar(im) {
    if (!im) return;
    if (!unlocked) unlock();
    var now = Date.now();
    if (now < (im._busyUntil || 0)) { TAPS.log.push(im.id + ':ignorado'); log('tap ignorado ' + im.id); return; } // no se reinicia a mitad
    im._busyUntil = now + (+im.getAttribute('data-tap-ms') || 600);
    im.classList.remove('salto'); void im.offsetWidth; im.classList.add('salto');
    var k = im.getAttribute('data-tap-sound');
    loadTapBlob(im).then(function (b) {
      restartImg(im, b);                 // solo este bebé vuelve a empezar su animación
      if (k) playSfx(k);                 // y suena lo suyo, si tiene sonido
    });
    TAPS.log.push(im.id + ':anima' + (k ? '+' + k : ''));
    log('tap ' + im.id);
  }

  /* ---------- Portada: Piolín arriba, frase 04 (animación aprobada «frase_04 v4», con alfa) ----------
     Cada toque a Piolín arriba alterna: frase 01 (su capa de reposo vuelve al cuadro 0 con «¡Ay, abuela!…», como antes)
     y frase 04 (esta capa, encima y en la misma caja, con «¡Este es el mejor cumpleaños que he tenido!»). Al terminar
     la frase 04 se vuelve al reposo (que arranca en su cuadro 0, el mismo dibujo que el último cuadro de la frase 04).
     Formato: WebM VP9 con alfa en Chromium (Chrome/Edge/Samsung/Android); WebP animado (alfa, una sola pasada) en
     Safari/iOS, Firefox y el resto. Sin ninguno de los dos (navegadores muy viejos) Piolín se queda solo con la frase 01.
     Sincronía: en WebM el audio arranca en el primer cuadro que se pinta (requestVideoFrameCallback) y entra en el punto
     del video + la latencia de salida de audio; en WebP el audio arranca en el mismo cuadro en que se muestra la capa,
     ya decodificada. Revisión: ?p2f04=webm|webp|no fuerza un formato. */
  var F04 = (function () {
    var box = document.getElementById('c_piolin_f04');
    if (!box) return null;
    var ua = navigator.userAgent || '';
    var iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var chromium = !iOS && /(Chrome|Chromium|CriOS|EdgA?|SamsungBrowser|OPR)\//.test(ua) && !/Firefox|FxiOS/.test(ua);
    var vt = document.createElement('video');
    var canWebm = !!(vt.canPlayType && vt.canPlayType('video/webm; codecs="vp9"'));
    var forced = (/[?&]p2f04=(webm|webp|no)/.exec(location.search) || [])[1];
    var DUR = +box.getAttribute('data-ms') || 3124;
    /* WEBP (arriba) prueba si el canvas CODIFICA WebP: Safari/iOS no lo hace aunque sí MUESTRA WebP animado (Safari 14+ / iOS 14+).
       Para la frase 04 se prueba la decodificación real con un WebP animado de 1x1; si falla, se queda solo la frase 01. */
    var webpAnim = WEBP ? Promise.resolve(true) : new Promise(function (res) {
      var t = new Image();
      t.onload = function () { res(t.width === 1 && t.height === 1); };
      t.onerror = function () { res(false); };
      t.src = 'data:image/webp;base64,UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA';
    });
    var st = { mode: forced || (chromium && canWebm ? 'webm' : 'webp'), ready: null, el: null, gen: 0,
               running: false, timer: 0, onEnd: null, med: [] };
    window.__jahsehPiolin = st;
    function lat() { return ctx ? Math.min(0.1, ctx.outputLatency || ctx.baseLatency || 0) : 0; }
    function load() {
      if (st.mode === 'no') return Promise.reject(new Error('sin formato'));
      if (st.ready) return st.ready;
      var mode = st.mode, url = box.getAttribute(mode === 'webm' ? 'data-webm' : 'data-webp');
      st.ready = (mode === 'webp' && forced !== 'webp' ? webpAnim : Promise.resolve(true)).then(function (ok) {
        if (!ok) { st.mode = 'no'; throw new Error('sin WebP animado'); }
        return fetch(url);
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(function (b) {
        st.blob = b;
        if (mode === 'webm') {
          var v = document.createElement('video');
          v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = false; v.preload = 'auto';
          ['muted', 'playsinline', 'webkit-playsinline', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (a) { v.setAttribute(a, ''); });
          v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
          box.appendChild(v); st.el = v;
          return new Promise(function (res, rej) {
            v.addEventListener('loadeddata', function () { res(); }, { once: true });
            v.addEventListener('error', function () { rej(new Error('video')); }, { once: true });
            v.src = URL.createObjectURL(b);
          });
        }
        var im = document.createElement('img'); im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.draggable = false;
        box.appendChild(im); st.el = im;
      }).catch(function (e) {
        log('f04 error ' + mode + ' ' + e);
        if (st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
        st.el = null; st.ready = null;
        st.mode = (mode === 'webm') ? 'webp' : 'no';    // si el WebM falla, queda el WebP animado (si el navegador lo muestra)
        if (st.mode === 'webp') return load();
        throw e;
      });
      return st.ready;
    }
    function terminar(g, idle, ok) {   // vuelve al reposo: su primer cuadro ya decodificado y el cambio de capa en el mismo cuadro
      if (g !== st.gen) return;
      clearTimeout(st.timer);
      restartImg(idle);
      var swap = function () {
        requestAnimationFrame(function () {
          if (g !== st.gen) return;
          idle.classList.remove('oculto'); box.classList.remove('on');
          if (st.mode === 'webm' && st.el) { try { st.el.pause(); st.el.currentTime = 0; } catch (e) {} }
          st.running = false; var cb = st.onEnd; st.onEnd = null; if (cb) cb(ok);
        });
      };
      if (idle.decode) idle.decode().then(swap, swap); else setTimeout(swap, 30);
    }
    function play(idle, onEnd) {
      var g = ++st.gen, t0 = performance.now();
      st.running = true; st.onEnd = onEnd;
      return load().then(function () { return getBuffer('p2_piolin_f04').catch(function () { return null; }); }).then(function () {
        if (g !== st.gen) return;
        var m = { modo: st.mode, t_toque: t0 };
        st.med.push(m);
        if (st.mode === 'webm') {
          var v = st.el, started = false;
          var arranca = function (mt) {
            if (started || g !== st.gen) return; started = true;
            var l = lat(), off = Math.max(0, mt || 0) + l;
            m.t_inicio = performance.now(); m.media_time = mt; m.latencia_audio = l; m.offset_audio = off; m.ctx_t = ctx ? ctx.currentTime : 0;
            playSfx('p2_piolin_f04', 1, off);
          };
          if (v.currentTime !== 0) { try { v.currentTime = 0; } catch (e) {} }
          box.classList.add('on'); idle.classList.add('oculto');       // cuadro 0 de la frase 04 ya pintado (el video está quieto en 0)
          if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(function (now, md) { arranca(md.mediaTime); });
          else v.addEventListener('playing', function () { requestAnimationFrame(function () { arranca(v.currentTime); }); }, { once: true });
          v.onended = function () { m.t_fin = performance.now(); terminar(g, idle, true); };
          var p = v.play();
          if (p && p.catch) p.catch(function (e) { log('f04 play ' + e); terminar(g, idle, false); });
          st.timer = setTimeout(function () { terminar(g, idle, true); }, DUR + 1500);   // seguro, por si «ended» no llega
        } else {
          var im = st.el, old = im._url;
          im._url = URL.createObjectURL(st.blob); im.src = im._url;           // URL nueva = la animación vuelve al cuadro 0
          if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
          var go = function () {
            requestAnimationFrame(function () {
              if (g !== st.gen) return;
              box.classList.add('on'); idle.classList.add('oculto');
              var l = lat(); m.t_inicio = performance.now(); m.latencia_audio = l; m.offset_audio = l;
              playSfx('p2_piolin_f04', 1, l);
              st.timer = setTimeout(function () { m.t_fin = performance.now(); terminar(g, idle, true); }, DUR + 60); // el WebP da una sola pasada y se queda en el último cuadro
            });
          };
          if (im.decode) im.decode().then(go, go); else im.onload = go;
        }
      }, function () { st.running = false; var cb = st.onEnd; st.onEnd = null; if (cb) cb(false); });
    }
    function reset() {   // al salir de la portada: corta la frase 04 y deja a Piolín en reposo
      if (!st.running) return;
      st.gen++; clearTimeout(st.timer);
      var idle = document.getElementById('c_piolin_arriba');
      if (st.mode === 'webm' && st.el) { try { st.el.pause(); st.el.currentTime = 0; } catch (e) {} }
      box.classList.remove('on'); if (idle) idle.classList.remove('oculto');
      st.running = false; var cb = st.onEnd; st.onEnd = null; if (cb) cb(false);
    }
    st.load = load; st.play = play; st.reset = reset;
    return st;
  })();

  /* ---------- P7: Lola — 4 animaciones aprobadas al tocar (v16) ----------
     Reposo/entrada: s7_lola.webp en bucle (pose aprobada, con su sonido de escena al entrar).
     Toque corto: una de lola_01/02/03/11 (nunca la misma dos veces seguidas; las 4 salen en cada ronda de 4),
     WebP desde el cuadro 0 con URL nueva + su MP3 a la vez (ambos precargados antes de arrancar).
     Mientras dura la pasada (ms = máx(WebP, MP3)) los toques se ignoran. Al terminar vuelve al bucle de reposo
     empezando en la pose «arriba» (s7_lola_reposo.webp = los mismos cuadros de s7_lola.webp, desde el cuadro 18),
     que es el primer y último cuadro de las 4 animaciones: el cambio no salta. */
  var LOLA = [{ id: '01', ms: 3240 }, { id: '02', ms: 3950 }, { id: '03', ms: 2300 }, { id: '11', ms: 3370 }];
  var LOLA_REPOSO = 'anim/s7_lola_reposo.webp?v=19';   // ?v=19: versión aligerada (mismo nombre de archivo)
  var lolaPre = null, lolaBag = [], lolaLast = null, lolaTimer = 0, lolaRun = 0;
  window.__jahsehLola = [];
  function lolaUrl(a) { return 'anim/s7_lola_' + a.id + '.webp?v=19'; }
  function getBlob(url) {
    if (!blobs[url]) {
      blobs[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .catch(function (e) { log('img error ' + url + ' ' + e); return null; });
    }
    return blobs[url];
  }
  function preloadLola() {             // solo cuando la pantalla 7 está cerca (loadChars de p7)
    if (!WEBP || lolaPre) return;
    lolaPre = true;
    LOLA.forEach(function (a) { getBlob(lolaUrl(a)); fetchRaw('s7_lola_' + a.id); if (ctx) getBuffer('s7_lola_' + a.id).catch(function () {}); });
    getBlob(LOLA_REPOSO);
  }
  function nextLola() {
    if (!lolaBag.length) {
      lolaBag = LOLA.slice();
      for (var i = lolaBag.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = lolaBag[i]; lolaBag[i] = lolaBag[j]; lolaBag[j] = t; }
      if (lolaLast && lolaBag[0] === lolaLast) { lolaBag.push(lolaBag.shift()); }   // nunca la misma dos veces seguidas
    }
    lolaLast = lolaBag.shift();
    return lolaLast;
  }
  function lolaBusy() {
    return LOLA.some(function (a) { return !!sfxNodes['s7_lola_' + a.id]; });
  }
  function lolaReset() {             // al entrar a p7: reposo normal
    clearTimeout(lolaTimer); lolaRun++;
    var an = $('#lola7anim'), im = $('#lola7');
    if (an) an.classList.remove('on');
    if (im) im.classList.remove('oculta');
  }
  function lolaTap(sec) {
    if (document.body.classList.contains('rsvp-open')) return;      // con el formulario abierto, Lola no reacciona
    if (!unlocked) unlock();
    if (secBusy(sec) || lolaBusy()) { TAPS.log.push('s7:ignorado'); log('tap ignorado s7'); return; }
    if (!WEBP || !AC) { replay(sec); return; }                       // sin WebP: comportamiento anterior (reinicia el bucle con su sonido)
    preloadLola();
    var a = nextLola(), key = 's7_lola_' + a.id, run = ++lolaRun;
    lockUntil[sec.id] = Date.now() + a.ms + 1500;                   // bloqueado también mientras se termina de cargar
    TAPS.log.push('s7:lola_' + a.id); TAPS.count.s7 = (TAPS.count.s7 || 0) + 1;
    var an = $('#lola7anim'), im = $('#lola7');
    Promise.all([getBlob(lolaUrl(a)), getBuffer(key)]).then(function (r) {
      if (!r[0] || run !== lolaRun) { if (run === lolaRun) lockUntil[sec.id] = 0; return; }
      var old = an._url; an._url = URL.createObjectURL(r[0]);
      an.src = an._url;
      var dec = an.decode ? an.decode() : Promise.resolve();
      return dec.catch(function () {}).then(function () {
        if (run !== lolaRun || current !== sec || document.body.classList.contains('rsvp-open')) { lockUntil[sec.id] = 0; return; }
        // arranque conjunto: se muestra el cuadro 0 y suena su MP3 en el mismo instante
        an.classList.add('on'); im.classList.add('oculta');
        playSfx(key);
        lockUntil[sec.id] = Date.now() + a.ms;
        window.__jahsehLola.push({ anim: 'lola_' + a.id, audio: AUDIO[key], webp: lolaUrl(a), ms: a.ms, t: Date.now() });
        log('lola ' + a.id);
        if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
        clearTimeout(lolaTimer);
        lolaTimer = setTimeout(function () { endLola(run); }, a.ms);
      });
    }).catch(function (e) { log('lola error ' + e); lockUntil[sec.id] = 0; });
  }
  function endLola(run) {
    if (run !== lolaRun) return;
    var an = $('#lola7anim'), im = $('#lola7');
    getBlob(LOLA_REPOSO).then(function (b) {
      if (run !== lolaRun) return;
      restartImg(im, b || im._blob);                 // reposo desde la pose «arriba» (= último cuadro de la animación)
      var dec = im.decode ? im.decode() : Promise.resolve();
      dec.catch(function () {}).then(function () {
        if (run !== lolaRun) return;
        im.classList.remove('oculta'); an.classList.remove('on');
        log('lola reposo');
      });
    });
  }

  /* ---------- v12 · P4 Lucas y P6 Silvestre: varias animaciones por personaje, alternadas al tocar ----------
     El personaje de la escena (img.char con data-rota) es la animación «base» (la de la pantalla, con el sonido de la sección).
     data-rota = ids de las capas extra (div.clip), cada una con su WebM VP9 con alfa (Chromium) o WebP animado (Safari/iOS y resto),
     su duración (data-ms) y su sonido (data-sound). Orden fijo base → capa 1 → capa 2 → base…, así nunca se repite la misma dos
     veces seguidas (al entrar a la pantalla suena la base, por eso el primer toque da la capa 1).
     Mientras dura una pasada los toques se ignoran. La capa se muestra encima, en la caja calculada para que el cuadro 0 calce con
     la base (sin escala ni movimiento del contenedor); .clip.esp la espeja con scaleX(-1) (solo la imagen; el audio no cambia).
     Al terminar: Lucas vuelve a su bucle desde el cuadro 0; Silvestre queda en su cuadro de reposo (data-rest).
     Revisión: ?clip=webm|webp fuerza un formato. */
  var ROTA = window.__jahsehRota = { log: [], med: [] };
  var CLIP_MODE = (function () {
    var forced = (/[?&]clip=(webm|webp)/.exec(location.search) || [])[1];
    if (forced) return forced;
    var ua = navigator.userAgent || '';
    var iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var chromium = !iOS && /(Chrome|Chromium|CriOS|EdgA?|SamsungBrowser|OPR)\//.test(ua) && !/Firefox|FxiOS/.test(ua);
    var vt = document.createElement('video');
    var canWebm = !!(vt.canPlayType && vt.canPlayType('video/webm; codecs="vp9"'));
    return chromium && canWebm ? 'webm' : 'webp';
  })();
  function clipLat() { return ctx ? Math.min(0.1, ctx.outputLatency || ctx.baseLatency || 0) : 0; }
  function clipOf(box) {
    if (box._clip) return box._clip;
    var c = box._clip = { box: box, mode: CLIP_MODE, ready: null, el: null };
    c.load = function () {
      if (c.ready) return c.ready;
      var mode = c.mode, url = box.getAttribute(mode === 'webm' ? 'data-webm' : 'data-webp');
      c.ready = (mode === 'webp' ? webpReady : Promise.resolve(true)).then(function (ok) {
        if (!ok) throw new Error('sin WebP animado');
        return fetch(url);
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.blob(); }).then(function (b) {
        c.blob = b;
        if (mode === 'webm') {
          var v = document.createElement('video');
          v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = false; v.preload = 'auto';
          ['muted', 'playsinline', 'webkit-playsinline', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (a) { v.setAttribute(a, ''); });
          v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
          box.appendChild(v); c.el = v;
          return new Promise(function (res, rej) {
            v.addEventListener('loadeddata', function () { res(); }, { once: true });
            v.addEventListener('error', function () { rej(new Error('video')); }, { once: true });
            v.src = URL.createObjectURL(b);
          });
        }
        var im = document.createElement('img'); im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.draggable = false;
        box.appendChild(im); c.el = im;
      }).catch(function (e) {
        log('clip error ' + box.id + ' ' + mode + ' ' + e);
        if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
        c.el = null; c.ready = null;
        if (mode === 'webm') { c.mode = 'webp'; return c.load(); }   // si el WebM falla, queda el WebP
        c.mode = 'no'; throw e;
      });
      return c.ready;
    };
    return c;
  }
  function rotaList(base) {
    return ['base'].concat((base.getAttribute('data-rota') || '').split(/\s+/).filter(Boolean));
  }
  function rotaPreload(base) {   // cuando la pantalla está cerca: capas y sonidos (los WebM/WebP y MP3 de cada capa)
    if (base._rotaPre) return; base._rotaPre = true;
    rotaList(base).slice(1).forEach(function (id) {
      var box = document.getElementById(id); if (!box) return;
      clipOf(box).load().catch(function () {});
      var k = box.getAttribute('data-sound'); if (k) { fetchRaw(k); if (ctx) getBuffer(k).catch(function () {}); }
    });
  }
  var rotaRun = { gen: 0, base: null, box: null, timer: 0 };
  function rotaBusy() { return !!rotaRun.base; }
  function rotaEnter(sec) {      // al entrar a la pantalla: la base ya está sonando/animándose; el próximo toque da la capa 1
    $$('#' + sec.id + ' img.char[data-rota]').forEach(function (b) { b._ri = 0; });
  }
  function rotaReset() {         // al cambiar de pantalla: corta la capa en curso y deja la base visible
    if (!rotaRun.base) return;
    rotaRun.gen++; clearTimeout(rotaRun.timer);
    var c = rotaRun.box && rotaRun.box._clip;
    if (c && c.mode === 'webm' && c.el) { try { c.el.pause(); c.el.currentTime = 0; } catch (e) {} }
    if (rotaRun.box) rotaRun.box.classList.remove('on');
    rotaRun.base.classList.remove('oculta');
    rotaRun.base = rotaRun.box = null;
  }
  function rotaTap(base) {
    var sec = base.closest('.sec');
    if (document.body.classList.contains('rsvp-open')) return;
    if (!unlocked) unlock();
    if (rotaBusy() || secBusy(sec)) { TAPS.log.push(sec.id + ':ignorado'); ROTA.log.push(sec.id + ':ignorado'); log('tap ignorado ' + sec.id); return; }
    var list = rotaList(base), i = ((base._ri || 0) + 1) % list.length, id = list[i];
    var box = id === 'base' ? null : document.getElementById(id), c = box && clipOf(box);
    if (!box || c.mode === 'no' || !AC) {           // la base: el replay de siempre (cuadro 0 + sonido de la escena)
      base._ri = i; ROTA.log.push(sec.id + ':base');
      replay(sec); return;
    }
    base._ri = i;
    var k = box.getAttribute('data-sound'), ms = +box.getAttribute('data-ms') || 3000, g = ++rotaRun.gen;
    rotaRun.base = base; rotaRun.box = box;
    lockUntil[sec.id] = Date.now() + ms + 1500;
    TAPS.log.push(sec.id + ':' + id); TAPS.count[sec.id] = (TAPS.count[sec.id] || 0) + 1; ROTA.log.push(sec.id + ':' + id);
    var m = { clip: id, modo: c.mode, t_toque: performance.now() }; ROTA.med.push(m);
    function fin() {
      if (g !== rotaRun.gen) return;
      clearTimeout(rotaRun.timer);
      var rest = base.getAttribute('data-rest');
      if (rest) { clearTimeout(base._restT); base.src = rest; }   // Silvestre: cuadro de reposo (= último cuadro de la capa)
      else restartImg(base);                                    // Lucas: su bucle desde el cuadro 0 (misma pose que el último cuadro)
      var swap = function () {
        requestAnimationFrame(function () {
          if (g !== rotaRun.gen) return;
          base.classList.remove('oculta'); box.classList.remove('on');
          if (c.mode === 'webm' && c.el) { try { c.el.pause(); c.el.currentTime = 0; } catch (e) {} }
          m.t_fin = performance.now(); log('clip fin ' + id);
          rotaRun.base = rotaRun.box = null; lockUntil[sec.id] = 0;
        });
      };
      if (base.decode) base.decode().then(swap, swap); else setTimeout(swap, 30);
    }
    Promise.all([c.load(), k ? getBuffer(k).catch(function () { return null; }) : null]).then(function () {
      if (g !== rotaRun.gen || current !== sec) return;
      if (c.mode === 'webm') {
        var v = c.el, started = false;
        var arranca = function (mt) {
          if (started || g !== rotaRun.gen) return; started = true;
          var l = clipLat(); m.t_inicio = performance.now(); m.media_time = mt; m.offset_audio = Math.max(0, mt || 0) + l;
          if (k) playSfx(k, 1, m.offset_audio);
        };
        if (v.currentTime !== 0) { try { v.currentTime = 0; } catch (e) {} }
        box.classList.add('on'); base.classList.add('oculta');        // cuadro 0 de la capa (el video está quieto en 0)
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(function (now, md) { arranca(md.mediaTime); });
        else v.addEventListener('playing', function () { requestAnimationFrame(function () { arranca(v.currentTime); }); }, { once: true });
        v.onended = function () { fin(); };
        var p = v.play();
        if (p && p.catch) p.catch(function (e) { log('clip play ' + e); fin(); });
        lockUntil[sec.id] = Date.now() + ms;
        rotaRun.timer = setTimeout(fin, ms + 1500);                     // seguro, por si «ended» no llega
      } else {
        var im = c.el, old = im._url;
        im._url = URL.createObjectURL(c.blob); im.src = im._url;         // URL nueva = la animación vuelve al cuadro 0
        if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
        var go = function () {
          requestAnimationFrame(function () {
            if (g !== rotaRun.gen) return;
            box.classList.add('on'); base.classList.add('oculta');
            m.t_inicio = performance.now(); m.offset_audio = clipLat();
            if (k) playSfx(k, 1, m.offset_audio);
            lockUntil[sec.id] = Date.now() + ms;
            rotaRun.timer = setTimeout(fin, ms);                         // el WebP vuelve a empezar: se corta justo al terminar la pasada
          });
        };
        if (im.decode) im.decode().then(go, go); else im.onload = go;
      }
      log('clip ' + id + ' ' + c.mode);
    }, function (e) { log('clip falla ' + id + ' ' + e); if (g === rotaRun.gen) { rotaRun.base = rotaRun.box = null; lockUntil[sec.id] = 0; base.classList.remove('oculta'); } });
  }

  var sections = $$('.sec');
  loadBg(sections[0]); loadChars(sections[0]); loadBg(sections[1]); loadChars(sections[1]); loadFotos(sections[1]);
  if (F04 && F04.mode !== 'no') F04.load().catch(function () {});   // la frase 04 de Piolín queda lista con la portada
  ['intro', 'sobre', 's1_piolin'].forEach(fetchRaw);

  /* ---------- visor por toques (tipo historia) ---------- */
  var opened = false, played = {}, idx = 0, current = sections[0], navLock = 0;
  var hint = $('#hint'), again = $('#againBtn'), bars = $$('#progress i'), progress = $('#progress');
  var NAV_MS = 450;
  /* v11 «Desliza»: se avanza deslizando de abajo hacia arriba (y se vuelve deslizando de arriba hacia abajo).
     El toque suelto en la pantalla ya no avanza (TAP_NAV = false); el toque en el indicador «Deslice ▲» sí, como respaldo.
     Para recuperar el avance por toque (v10: derecha avanza, 25 % izquierdo retrocede) basta poner TAP_NAV = true. */
  var TAP_NAV = false;
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
    if (F04) F04.reset();
    rotaReset();
    stopSfx(); t5Stop();
    idx = i; current = sections[i];
    window.__jahsehNav.navs.push((why || '') + '>' + (i + 1));
    loadBg(current); loadChars(current); loadFotos(current);
    if (sections[i + 1]) { loadBg(sections[i + 1]); loadChars(sections[i + 1]); loadFotos(sections[i + 1]); }
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
      if (sec.id === 's7') lolaReset();
      restartSection(sec); lockSec(sec); rotaEnter(sec);
      if (sec.id === 's5') t5Intro();
      var k = sec.getAttribute('data-sound');
      var auto = unlocked && k && sec.getAttribute('data-auto') === '1' && !played[sec.id];
      $$('#' + sec.id + ' img.char[data-tap-ms]').forEach(function (im) {
        // mientras suena la voz de la escena, el toque a ese bebé espera (no la corta)
        im._busyUntil = auto && im.hasAttribute('data-entry-lock-ms') ? Date.now() + (+im.getAttribute('data-entry-lock-ms')) : 0;
      });
      if (auto) { played[sec.id] = true; playSfx(k); }
    });
    playFotos(sec);
    if (sec.id === 's5') maybeParty();
  }

  var NO_NAV = '.hot, a, button, img.char, #muteBtn, #againBtn';
  /* pantallas con data-lock-ms (4 Lucas, 5 Taz, 6 Silvestre, 7 Lola): mientras dura una pasada de su
     animación o su sonido, un nuevo toque se ignora; al terminar, el toque la reinicia desde el cuadro 0 con su sonido.
     Sin efecto «boing» (escala): no se deforma a ningún personaje. */
  var lockUntil = {};
  function lockSec(sec) { var ms = +sec.getAttribute('data-lock-ms') || 0; if (ms) lockUntil[sec.id] = Date.now() + ms; }
  function secBusy(sec) {
    if (!sec.getAttribute('data-lock-ms')) return false;
    var k = sec.getAttribute('data-sound');
    return Date.now() < (lockUntil[sec.id] || 0) || !!(k && sfxNodes[k]);
  }
  function replay(sec) {
    if (document.body.classList.contains('rsvp-open')) return; // con el formulario abierto, nadie capta toques
    if (!unlocked) unlock();
    if (secBusy(sec)) { TAPS.log.push(sec.id + ':ignorado'); log('tap ignorado ' + sec.id); return; }
    TAPS.log.push(sec.id + ':replay'); TAPS.count[sec.id] = (TAPS.count[sec.id] || 0) + 1;
    lockSec(sec);
    restartSection(sec);
    var k = sec.getAttribute('data-sound');
    if (k) playSfx(k);
  }
  function bindTap(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); fn(e); }); }
  $$('img.char').forEach(function (im) {
    im.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    im.addEventListener('animationend', function () { im.classList.remove('salto'); });
    if (im.classList.contains('p2c')) return;   // la portada usa sus propias zonas táctiles (abajo)
    bindTap(im, function () {
      if (Date.now() < swallowClick) return;    // fue un deslizamiento, no un toque
      if (im.closest('#s1')) { p1Tap(); return; } // P1: Piolín ya no abre el sobre (ver bloque «P1: toque Piolín»)
      if (im.closest('#s8')) { tapChar(im); return; }
      if (im.id === 'lola7') { lolaTap(im.closest('.sec')); return; }
      if (im.hasAttribute('data-rota')) { rotaTap(im); return; }
      replay(im.closest('.sec'));
    });
  });
  /* P1: toque Piolín — al tocarlo (antes o después de abrir el sobre) reinicia su animación con su sonido.
     Mientras suena (duración del buffer, ~4,9 s) se ignoran nuevos toques; no corta 'sobre' ni la música. */
  var P1_MS = 4900, p1Until = 0, p1Nav = -1;
  function p1Tap() {
    var now = Date.now(), navs = window.__jahsehNav.navs.length;
    if (now < p1Until && p1Nav === navs) { TAPS.log.push('s1:ignorado'); log('p1 ignorado'); return; }
    p1Until = now + P1_MS; p1Nav = navs;
    TAPS.log.push('s1:replay'); TAPS.count.s1 = (TAPS.count.s1 || 0) + 1;
    if (!unlocked) unlock();
    restartSection($('#s1')); playSfx('s1_piolin');
    getBuffer('s1_piolin').then(function (b) { if (p1Nav === navs) p1Until = now + Math.round(b.duration * 1000); }, function () {});
  }
  (function () { // área táctil algo mayor que la img (288x500): solo hacia los lados y abajo, sin tapar #abrirSobre
    var hit = document.createElement('span');
    hit.className = 'el'; hit.setAttribute('aria-hidden', 'true'); hit.id = 'p1Hit';
    hit.style.cssText = '--x:700;--y:1388;--w:380;--h:532;z-index:2;cursor:pointer';
    $('#s1 .page').appendChild(hit);
    bindTap(hit, function () { if (Date.now() < swallowClick) return; p1Tap(); });
  })();
  /* fin P1 */

  /* Portada: tocar a un bebé reinicia SU animación desde el cuadro 0 (y su frase, si tiene) */
  var P2_MS = 4000;   // cada capa de la portada: 60 cuadros a 15 fps
  /* Los dos Piolín comparten voz: mientras uno habla, el toque al otro se ignora (no se corta una frase con la otra). */
  var VOZ_PIOLIN = ['c_piolin_arriba', 'c_piolin_abajo'];
  TAPS.piolinTurno = 0;   // Piolín arriba: 0 = toca la frase 01, 1 = toca la frase 04 (alternan en cada toque aceptado)
  $$('#s2 .hot.tap').forEach(function (b) {
    var id = b.getAttribute('data-char'), im = document.getElementById(id), k = b.getAttribute('data-sound');
    bindTap(b, function () {
      if (Date.now() < swallowClick) return;          // fue un deslizamiento, no un toque
      if (!unlocked) unlock();
      if (TAPS.busy[id]) { TAPS.log.push(id + ':ignorado'); return; }   // no pisar la animación/sonido en curso
      if (VOZ_PIOLIN.indexOf(id) >= 0 && VOZ_PIOLIN.some(function (o) { return o !== id && TAPS.busy[o]; })) { TAPS.log.push(id + ':ignorado-voz'); return; }
      if (!im || !im._blob) { TAPS.log.push(id + ':sin-cargar'); loadChars($('#s2')); return; }
      if (id === 'c_piolin_arriba' && F04 && F04.mode !== 'no') {
        var turno = TAPS.piolinTurno; TAPS.piolinTurno = 1 - turno;
        if (turno === 1) {                                     // frase 04 con su animación
          TAPS.busy[id] = Date.now(); TAPS.count[id] = (TAPS.count[id] || 0) + 1;
          TAPS.log.push(id + ':anima+p2_piolin_f04');
          F04.play(im, function () { delete TAPS.busy[id]; });
          return;
        }
      }
      var t0 = Date.now(), until = t0 + P2_MS;
      TAPS.busy[id] = t0; TAPS.count[id] = (TAPS.count[id] || 0) + 1;
      restartImg(im);
      TAPS.log.push(id + ':anima' + (k ? '+' + k : ''));
      if (k) playSfx(k).then(function (d) { if (typeof d === 'number') until = Math.max(until, t0 + Math.ceil(d * 1000)); });
      (function liberar() {
        var falta = until - Date.now();
        if (falta > 0) { setTimeout(liberar, falta); return; }
        delete TAPS.busy[id];
      })();
    });
  });
  // zona táctil sobre Taz del contador (vive en una tira ancha): mismo replay que tocar al bebé
  $$('.hot.tapchar').forEach(function (b) {
    bindTap(b, function () {
      if (Date.now() < swallowClick) return;              // fue un deslizamiento, no un toque
      if (b.id === 'tapTaz' && T5) { t5Tap(); return; }
      replay(b.closest('.sec'));
    });
  });

  /* ---------- pantalla 5: Taz asomado que, al tocarlo, entra en remolino, dice «¡Comer! ¡Comer! ¡Comer!» y se va en remolino ----------
     entrada = remolino v6 desde la derecha (1,10 s; acaba en el cuadro 0 de la frase); frase = taz_01_v2 con taz_01.mp3 (arrancan juntos desde
     el cuadro 0, sin el sonido de la escena encima); salida = remolino v6 (1,20 s; empieza en el último cuadro de la frase);
     asomado = cuadro 0 de taz_01_v2 en el borde derecho (la página lo recorta). Cada tramo lleva su duración y su sonido en el HTML
     (data-ms, data-sfx, data-sfx-off, data-sfx-dur). Sin WebP (GIF de respaldo) se mantiene el replay anterior. */
  var T5 = false, t5Token = 0, t5Timers = [], t5Blobs = {};
  var T5_SFX_TRAMOS = true;   // false = entrada y salida sin sonido (solo suena la frase)
  function t5Sfx(name) {
    var im = t5El[name], k = im.getAttribute('data-sfx');
    if (!k || (name !== 'comer' && !T5_SFX_TRAMOS)) return;
    var off = +im.getAttribute('data-sfx-off') || 0, dur = +im.getAttribute('data-sfx-dur') || 0;
    if (dur) playSfx(k, 1, off, dur); else playSfx(k);
  }
  var T5LOG = window.__jahsehT5 = { log: [], count: 0 };
  var t5El = { asoma: $('#t5Asoma'), entrada: $('#t5Entrada'), comer: $('#t5Comer'), salida: $('#t5Salida') };
  // v12: T5 se decide con la prueba de WebP (también Safari/iOS); sin WebP (GIF de respaldo) se mantiene el replay anterior
  webpReady.then(function (ok) { T5 = ok; if (!T5) { var tt = $('#tapTaz'); tt.setAttribute('style', tt.getAttribute('data-old-style')); } });
  function t5Ev(ev) { T5LOG.log.push({ ev: ev, t: Math.round(performance.now()) }); log('t5 ' + ev); }
  function t5Blob(name) {
    var url = t5El[name].getAttribute('data-webp');
    if (!t5Blobs[url]) t5Blobs[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .catch(function (e) { log('img error ' + url + ' ' + e); delete t5Blobs[url]; return null; });
    return t5Blobs[url];
  }
  function t5Preload() { if (T5) Object.keys(t5El).forEach(t5Blob); }
  function t5Later(fn, ms) { var tok = t5Token; t5Timers.push(setTimeout(function () { if (tok === t5Token && current === s5) fn(); }, ms)); }
  function t5Stop() { t5Token++; t5Timers.forEach(clearTimeout); t5Timers = []; }
  function t5State(st) { s5.setAttribute('data-t5', st); t5Ev(st); }
  // carga el tramo con URL nueva (vuelve a empezar desde el cuadro 0) y espera a tenerlo decodificado antes de mostrarlo
  function t5Prep(name) {
    var im = t5El[name], tok = t5Token;
    return t5Blob(name).then(function (b) {
      if (!b || tok !== t5Token) return false;
      var old = im._url; im._url = URL.createObjectURL(b); im.src = im._url;
      if (old) setTimeout(function () { URL.revokeObjectURL(old); }, 3000);
      return (im.decode ? im.decode() : Promise.resolve()).then(function () { return tok === t5Token; }, function () { return tok === t5Token; });
    });
  }
  function t5ToAsoma() {
    t5Prep('asoma').then(function (ok) {
      if (!ok || current !== s5) return;
      t5State('asoma');
      t5Later(function () { t5Ev('listo'); }, 360);   // fin del deslizamiento: ya acepta toques
    });
  }
  function t5Intro() {           // al entrar a la pantalla: la animación aprobada completa (una pasada) y luego se queda asomado
    if (!T5) return;
    t5Stop(); t5Preload();
    s5.setAttribute('data-t5', 'intro'); t5Ev('intro');
    t5Later(t5ToAsoma, +s5.getAttribute('data-lock-ms') || 5532);
  }
  function t5Busy() { return s5.getAttribute('data-t5') !== 'asoma' || !T5LOG.log.length || T5LOG.log[T5LOG.log.length - 1].ev !== 'listo'; }
  function t5Tap() {
    if (document.body.classList.contains('rsvp-open')) return;
    if (!unlocked) unlock();
    if (t5Busy()) { TAPS.log.push('s5:ignorado'); log('tap ignorado s5'); return; }
    TAPS.log.push('s5:frase'); TAPS.count.s5 = (TAPS.count.s5 || 0) + 1; T5LOG.count++;
    t5Stop();
    var tok = t5Token;
    s5.setAttribute('data-t5', 'prep');   // bloquea mientras se prepara el primer tramo
    function paso(name, then) {
      t5Prep(name).then(function (ok) {
        if (!ok || tok !== t5Token || current !== s5) return;
        t5State(name);
        t5Sfx(name);                      // imagen y sonido del tramo arrancan en el mismo instante
        t5Later(then, +t5El[name].getAttribute('data-ms'));
      });
    }
    // los tramos ya están descargados (t5Preload al entrar a la pantalla): cada cambio solo espera a decodificar el cuadro 0
    paso('entrada', function () { paso('comer', function () { paso('salida', t5ToAsoma); }); });
  }
  // pantalla 8: zonas de toque por bebé
  $$('.tap8').forEach(function (z) { bindTap(z, function () { if (Date.now() < swallowClick) return; tapChar(document.getElementById(z.getAttribute('data-for'))); }); });
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
    if (!TAP_NAV) return;   // v11: el avance es por deslizamiento (o tocando «Deslice ▲»)
    var x = e.clientX, w = stage.clientWidth;
    if (x < w * 0.25) prev('tapL'); else if (idx < sections.length - 1) next('tapR');
  });
  /* respaldo: tocar el indicador «Deslice ▲» avanza */
  hint.addEventListener('click', function (e) {
    e.stopPropagation();
    if (Date.now() < swallowClick || !opened || document.body.classList.contains('rsvp-open')) return;
    next('hint');
  });
  /* v11: gesto vertical (en todo el documento, para que también cuente si empieza sobre «Desliza» o el botón de sonido) */
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || enForm(e)) { swipe = null; return; }
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!swipe || enForm(e)) { swipe = null; return; }
    var t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, fast = Date.now() - swipe.t < 1000;
    swipe = null;
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.2 && fast) {        // vertical (principal)
      swallowClick = Date.now() + 400;                                            // no cuenta como toque a un personaje
      if (dy < 0) { if (!opened) openEnvelope(); else next('swipeUp'); }          // de abajo hacia arriba: siguiente
      else if (opened) prev('swipeDown');                                         // de arriba hacia abajo: anterior
    } else if (opened && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && fast) { // horizontal (como v10)
      swallowClick = Date.now() + 400;
      if (dx < 0) next('swipeL'); else prev('swipeR');
    }
  }, { passive: true });
  function enForm(e) { return document.body.classList.contains('rsvp-open') || (e.target && e.target.closest && e.target.closest('#rsvp')); }
  document.addEventListener('touchmove', function (e) { if (enForm(e)) return; if (e.touches.length === 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  var wheelUntil = 0;   // v11: rueda del ratón / trackpad: hacia abajo avanza, hacia arriba retrocede (un paso por gesto)
  window.addEventListener('wheel', function (e) {
    if (enForm(e)) return; e.preventDefault();
    var now = Date.now(), wasIdle = now > wheelUntil;
    wheelUntil = now + 250;                    // la inercia del trackpad sigue enviando eventos: se esperan 250 ms de calma
    if (!opened || !wasIdle || Math.abs(e.deltaY) < 8) return;
    if (e.deltaY > 0) next('wheel'); else prev('wheel');
  }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if (enForm(e)) return;
    if (!opened) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope(); } return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next('key'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev('key'); }
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
