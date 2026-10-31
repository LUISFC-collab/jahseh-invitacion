(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var stage = $('#stage');
  var LOG = window.__jahsehLog = []; window.__jahsehVersion = 'v15-cierre';
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
  var musicBase = MUSIC_INTRO, activeSfx = 0, sfxNodes = {}, sfxGains = {};
  var AUDIO = {
    intro: 'audio/intro.mp3', fondo: 'audio/fondo.mp3', sobre: 'audio/sobre.mp3',
    s1_piolin: 'audio/s1_piolin.mp3',
    // v13: P3 Lucas frase_15 «¡Cuidado allá abajo, mi peludo amigo!» (doblaje latino original, U5ltngXeOQQ 66,02-68,85 s) y golpe de la caída (efecto, sin voz)
    s3_lucas_f15: 'audio/s3_lucas_f15.mp3', s3_lucas_caida: 'audio/s3_lucas_caida.mp3',
    // v13: P3 cuadro de fotos, pasar página (efecto sin voz, CC0: «10 Book Page Flips» de StarNinjas, OpenGameArt; ver creditos.txt)
    s3_foto_pagina: 'audio/s3_foto_pagina.mp3',
    // v13: P3 rebote de la pelota (sin voz, CC0: Kenney «Impact Sounds»; ver creditos.txt)
    s3_pelota_rebote: 'audio/s3_pelota_rebote.mp3',
    s4_lucas: 'audio/s4_lucas.mp3', s5_taz: 'audio/s5_taz.mp3', s5_comer: 'audio/s5_taz_comer.mp3',
    s5_ent: 'audio/s5_taz_entrada_der.mp3', s5_sal: 'audio/s5_taz_salida_remolino.mp3',
    s6_silvestre_a2: 'audio/s6_silvestre_a2.mp3',
    s7_lola: 'audio/s7_lola.mp3', s8_cierre: 'audio/s8_cierre_eso_es_todo_vaquero.mp3?v=27',   // v15: recortado a 5,64 s (0-3,75 s intacto: Porky sigue sincronizado)
    s8_porky: 'audio/s8_porky_eso_es_todo.mp3',
    // v15: despedida de Warner (audio de Luis): Porky «¡Eso es todo, amigos!» + música final, recortado y a -14 LUFS. Suena UNA vez por sesión,
    // en el primer toque del invitado en la pantalla 8. Bugs bebé al tocarlo (doblaje latino, baby_bugs/frases/frase_02/03/04, alterna en cada toque)
    s8_despedida: 'audio/s8_despedida_eso_es_todo.mp3?v=27',
    s8_bugs_02: 'audio/s8_bugs_02.mp3?v=27', s8_bugs_03: 'audio/s8_bugs_03.mp3?v=27', s8_bugs_04: 'audio/s8_bugs_04.mp3?v=27',
    p2_piolin: 'audio/p2_piolin_frase01.mp3',  // Baby Piolín: «¡Ay, abuela! ¡Ven a ver esto de prisa!»
    p2_piolin_f04: 'audio/p2_piolin_frase04.mp3', // Baby Piolín arriba: «¡Este es el mejor cumpleaños que he tenido!» (frase 04, animación v4)
    // P7 Lola al tocar (MP3 originales del doblaje latino; carga perezosa: solo cuando la pantalla 7 está cerca)
    s7_lola_01: 'audio/s7_lola_01.mp3', s7_lola_02: 'audio/s7_lola_02.mp3', s7_lola_03: 'audio/s7_lola_03.mp3', s7_lola_11: 'audio/s7_lola_11.mp3',
    // v12: P4 Lucas «Después de dormir un poco.» (frase_03 sync5) y P6 Silvestre f14 «crujientes esponjositos bocadillos» / f09 «chocolate» (carga perezosa)
    s4_lucas_f03: 'audio/s4_lucas_f03.mp3', s6_silvestre_f14: 'audio/s6_silvestre_f14.mp3', s6_silvestre_f09: 'audio/s6_silvestre_f09.mp3',
    // v14: formulario de confirmación, Bugs adulto (paquete de Luis /workspace/bugs_adulto_pkg/): entrada = fanfarria + pasos SIN voz
    // (sonido_escena_una_vez.mp3 0-1,60 s, la voz empieza en 1,653 s); al tocarlo, «Ehh... ¿Qué hay de nuevo, viejo?» (doblaje latino, voz sola del paquete)
    s7_bugs_entra: 'audio/s7_bugs_entra_pasos.mp3', s7_bugs_voz: 'audio/s7_bugs_que_hay_de_nuevo_viejo.mp3'
  };
  var LAZY = { s7_lola_01: 1, s7_lola_02: 1, s7_lola_03: 1, s7_lola_11: 1, s4_lucas_f03: 1, s6_silvestre_f14: 1, s6_silvestre_f09: 1, s7_bugs_entra: 1, s7_bugs_voz: 1,
    s8_despedida: 1, s8_bugs_02: 1, s8_bugs_03: 1, s8_bugs_04: 1 };   // v15: se bajan cuando la 7 o la 8 está a la vista (s8Audio)
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
    // v13: si se llegó a una pantalla con sonido de escena antes del primer toque, ese primer toque la arranca (imagen y voz juntas)
    if (pendingAuto) {
      var ps = pendingAuto; pendingAuto = null;
      // v15: en la 8, el primer toque (audio antes bloqueado) es el de la despedida: no se encima la voz de la escena
      if (ps.id === 's8' && !S8D.despedida) S8D.sinEntrada = true;
      if (ps === current) syncEnter(ps);
    }
  }
  var pendingAuto = null;

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
  /* enPerf (opcional, v13 P3): instante exacto en reloj performance.now() en que debe empezar a sonar (se agenda en el reloj
     del AudioContext, sin depender de la precisión de setTimeout). */
  function playSfx(k, gain, offset, dur, enPerf, fadeIn) {
    if (!ctx || !unlocked) return Promise.resolve(false);
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }   // reintenta reanudar antes de cada sonido
    return getBuffer(k).then(function (b) {
      Object.keys(sfxNodes).forEach(function (o) {
        // v15: la música final de la despedida (ya terminada su voz) no se corta por la voz de un bebé: baja de volumen y sigue
        if (o === 's8_despedida' && k !== o && k !== 'sobre' && sfxGains[o]) {
          try { var gg = sfxGains[o].gain; gg.cancelScheduledValues(ctx.currentTime); gg.setValueAtTime(gg.value, ctx.currentTime); gg.linearRampToValueAtTime(S8_DESP_DUCK, ctx.currentTime + 0.08); } catch (e) {}
          return;
        }
        if (o === k || (k !== 'sobre' && o !== 'sobre')) { // un personaje a la vez
          try { sfxNodes[o].onended = null; sfxNodes[o].stop(); } catch (e) {}
          delete sfxNodes[o]; activeSfx = Math.max(0, activeSfx - 1);
        }
      });
      var g = ctx.createGain(), gv = gain || 1; g.gain.value = gv; g.connect(sfxGain);
      var s = ctx.createBufferSource(); s.buffer = b; s.connect(g);
      offset = Math.min(Math.max(0, offset || 0), Math.max(0, b.duration - 0.05));
      if (fadeIn) { g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(gv, ctx.currentTime + fadeIn); }   // v15b
      if (dur) { var te = ctx.currentTime + dur; g.gain.setValueAtTime(gv, Math.max(ctx.currentTime, te - 0.03)); g.gain.linearRampToValueAtTime(0, te); }
      sfxNodes[k] = s; sfxGains[k] = g; activeSfx++; setMusicLevel(0.2);
      s.onended = function () { if (sfxNodes[k] === s) delete sfxNodes[k]; activeSfx = Math.max(0, activeSfx - 1); setMusicLevel(0.6); };
      var ahora = performance.now(), espera = enPerf ? Math.max(0, (enPerf - ahora) / 1000) : 0, cuando = espera ? ctx.currentTime + espera : 0;
      if (dur) s.start(cuando, offset, dur); else s.start(cuando, offset);
      window.__jahsehAudio.plays.push(k);
      window.__jahsehAudio.at.push({ k: k, off: offset, dur: dur || (b.duration - offset), t: ahora + espera * 1000, pedido: enPerf || null,
        ctxEstado: ctx.state, latencia: Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000) });
      log('sfx ' + k + (offset ? ' +' + offset.toFixed(3) : ''));
      return dur || (b.duration - offset) || true;   // duración en s (para no pisar el sonido en curso)
    }).catch(function () { return false; });
  }

  /* v14: acceso para rsvp.js (Bugs adulto del formulario): precarga perezosa y sonido por el mismo mezclador (respeta el botón de silencio) */
  window.__jahsehSfx = {
    pre: function (k) { if (!AUDIO[k]) return; fetchRaw(k); if (ctx) getBuffer(k).catch(function () {}); },
    play: function (k, off) { return playSfx(k, 1, off || 0); }
  };
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
  /* v13: el primer gesto del usuario (incluido el deslizamiento que entra a una pantalla) crea/reanuda el AudioContext */
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (!AC) return;
      if (!unlocked) unlock(); else if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    }, true);
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
  window.__jahsehWebp = webpReady;   // v14: rsvp.js muestra a Bugs adulto solo si el navegador muestra WebP animado (sin GIF de respaldo)
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
        if (!im._loaded) { im._loaded = true; im._blob = b; if (isSync(im)) prepImg(im); else restartImg(im); }
        if (im.id === 'lola7') s8Primero(preloadLola);   // v13: primero lo principal de la pantalla 8, después las 4 animaciones de Lola
        if (im.hasAttribute('data-rota')) rotaPreload(im);
      });
    }));
  }
  /* v13 (pantalla 8): la URL del próximo arranque se crea y decodifica antes (mientras se ve la pantalla 7),
     así al entrar el primer cuadro ya está listo y la animación arranca desde el cuadro 0 sin espera */
  function isSync(im) { var sec = im.closest('.sec'); return !!(sec && sec.hasAttribute('data-sync')); }
  function prepImg(im) {
    if (!im._blob || im._prep) return;
    im._prep = URL.createObjectURL(im._blob);
    var pi = new Image(); pi.src = im._prep; im._prepImg = pi;
    im._prepDec = (pi.decode ? pi.decode() : Promise.resolve()).catch(function () {});
    var t = performance.now(); im._prepDec.then(function () { PERF.push(im.id + ' decode ' + Math.round(performance.now() - t) + 'ms'); });
  }
  function prepSec(sec) { $$('#' + sec.id + ' img.char').forEach(function (im) { if (im._loaded) prepImg(im); }); }
  var PERF = window.__jahsehPerf = [];
  function restartImg(im, blob) {
    var prep = !blob && im._prep; if (prep) { im._prep = null; im._prepImg = null; }
    blob = blob || im._blob;
    if (!blob) return;
    im._restarts = (im._restarts || 0) + 1;
    var old = im._url; im._url = prep || URL.createObjectURL(blob); im.src = im._url;
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
  /* v15 · pantalla 8: despedida y voces al tocar
     - DESPEDIDA (s8_despedida, 3,76 s, audio de Luis: Porky «¡Eso es todo, amigos!» + música final de Warner): suena UNA sola vez por sesión,
       en el primer toque del invitado en la 8 (a un bebé, a su zona o al fondo; no cuentan «Volver al inicio», «Ver de nuevo», el silencio
       ni un deslizamiento). Si la voz de la escena (s8_cierre) aún está diciendo «¡Eso es todo, amigos!», la despedida entra justo cuando
       esa voz termina (S8_VOZ_FIN_MS desde que empezó) y corta el resto de efectos de la escena: nunca se pisan. Con el audio bloqueado
       (enlace ?p=8 sin gesto), ese primer toque desbloquea y suena directamente la despedida, sin la voz de la escena encima.
     - VOCES AL TOCAR (Porky, Bugs): mientras habla la escena o la VOZ de la despedida (sus primeros S8_DESP_VOZ_MS), el bebé salta al
       instante y su voz (con el reinicio de su animación) espera a que esa voz termine; solo queda una en espera (la del último toque).
       Durante la música final de la despedida la voz del bebé sí entra: la música baja a S8_DESP_DUCK y sigue (no se corta).
       Bugs alterna frase_02, 03 y 04 en cada toque. */
  var S8_VOZ_FIN_MS = 3600, S8_DESP_MS = 3760, S8_DESP_VOZ_MS = 1600, S8_DESP_DUCK = 0.35;
  /* v15b · que NO se repita «¡Eso es todo, amigos!»: si la voz de la escena lo acaba de decir (o lo está diciendo) cuando llega el
     primer toque —hasta S8_ECO_MS después de que termina—, la despedida entra al terminar esa voz SOLO con su música final
     (desde S8_DESP_MUSICA_S, justo después de la voz de Porky en el audio de Luis, con un fundido corto de entrada): la frase
     suena una sola vez y la música de Warner la remata. Pasado ese margen, el primer toque trae la despedida completa (frase + música).
     Porky al tocarlo tampoco repite la frase si acaba de sonar (o va a sonar) una: salta y se anima, sin voz. */
  var S8_ECO_MS = 3000, S8_DESP_MUSICA_S = 1.62, S8_DESP_FADE_S = 0.06;
  var S8D = window.__jahsehS8 = { despedida: false, sonada: false, sinEntrada: false, vozHasta: 0, escenaFin: 0, fraseFin: 0, soloMusica: false, log: [], timers: [], pend: null };
  function s8Audio() { ['s8_despedida', 's8_bugs_02', 's8_bugs_03', 's8_bugs_04'].forEach(function (k) { fetchRaw(k); if (ctx) getBuffer(k).catch(function () {}); }); }
  function s8Reset() {
    S8D.timers.forEach(clearTimeout); S8D.timers = []; S8D.pend = null; S8D.vozHasta = 0; S8D.escenaFin = 0; S8D.sinEntrada = false;
    if (S8D.despedida && !S8D.sonada) S8D.despedida = false;   // se salió de la 8 antes de que sonara: queda para el próximo toque
  }
  function s8Later(fn, ms) { S8D.timers.push(setTimeout(function () { if (current && current.id === 's8') fn(); }, Math.max(0, ms))); }
  function s8Disparar(por) {
    if (S8D.despedida || !current || current.id !== 's8' || document.body.classList.contains('rsvp-open')) return;
    if (!unlocked) unlock();
    S8D.despedida = true;
    var ahora = performance.now(), espera = Math.max(0, S8D.vozHasta - ahora);
    var soloMusica = S8D.soloMusica = !!S8D.escenaFin && ahora < S8D.escenaFin + S8_ECO_MS;   // v15b: la escena acaba de decir la frase
    var vozDesp = soloMusica ? 150 : S8_DESP_VOZ_MS;   // solo música: las voces de los bebés esperan apenas a que arranque
    S8D.vozHasta = ahora + espera + vozDesp;
    if (!soloMusica) S8D.fraseFin = ahora + espera + S8_DESP_VOZ_MS;
    S8D.log.push('despedida:' + por + (soloMusica ? ':solo-musica' : '') + (espera ? ':espera' + Math.round(espera) : ''));
    s8Later(function () {
      var p = soloMusica ? playSfx('s8_despedida', 1, S8_DESP_MUSICA_S, 0, 0, S8_DESP_FADE_S) : playSfx('s8_despedida');
      p.then(function (d) {
        if (!d) { S8D.log.push('despedida:sin-sonido'); return; }
        var t = performance.now();
        S8D.sonada = true; S8D.vozHasta = Math.max(S8D.vozHasta, t + (soloMusica ? 0 : S8_DESP_VOZ_MS));
        if (!soloMusica) S8D.fraseFin = t + S8_DESP_VOZ_MS;
        S8D.despHasta = t + (typeof d === 'number' ? d * 1000 : S8_DESP_MS);
        S8D.log.push('despedida:suena' + (soloMusica ? ':solo-musica' : ''));
      });
    }, espera);
  }
  // primer toque en la 8 (también al fondo): se decide cuando ya pasó el touchend (para saber si fue un deslizamiento)
  ['touchend', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (S8D.despedida || !current || current.id !== 's8') return;
      var t = e.target;
      if (!t || !t.closest || t.closest('#volverBtn, #againBtn, #muteBtn, #hint, #rsvp') || !(t.closest('#s8') )) return;
      setTimeout(function () { if (Date.now() >= swallowClick) s8Disparar(ev); }, 0);
    }, true);
  });
  function tapChar(im) {
    if (!im) return;
    if (!unlocked) unlock();
    var now = Date.now();
    if (now < (im._busyUntil || 0)) { TAPS.log.push(im.id + ':ignorado'); log('tap ignorado ' + im.id); return; } // no se reinicia a mitad
    var ks = (im.getAttribute('data-tap-sounds') || '').split(',').filter(Boolean);
    var k = ks.length ? ks[(im._turno = ((im._turno == null ? -1 : im._turno) + 1) % ks.length)] : im.getAttribute('data-tap-sound');
    if (k && im.closest('#s8')) s8Disparar('toque-' + im.id);           // v15: el primer toque de la 8 es la despedida
    if (k === 's8_porky' && performance.now() < Math.max(S8D.fraseFin, S8D.escenaFin) + S8_ECO_MS) {   // v15b: la frase acaba de sonar (o va a sonar)
      TAPS.log.push(im.id + ':sin-voz(eco)'); k = null; var mudo = true;   // solo salta: su animación de hablar no corre sin su voz
    }
    var espera = k && im.closest('#s8') ? Math.max(0, S8D.vozHasta - performance.now()) : 0;
    im._busyUntil = now + espera + (+im.getAttribute('data-tap-ms') || 600);
    im.classList.remove('salto'); void im.offsetWidth; im.classList.add('salto');
    var hacer = function () {
      if (mudo) return;
      loadTapBlob(im).then(function (b) {
        restartImg(im, b);                 // solo este bebé vuelve a empezar su animación
        if (k) playSfx(k).then(function (d) {   // y suena lo suyo; mientras habla no se le reinicia
          if (typeof d === 'number') im._busyUntil = Math.max(im._busyUntil, Date.now() + Math.ceil(d * 1000));
        });
      });
    };
    if (espera > 0) {
      if (S8D.pend) { S8D.pend.im._busyUntil = 0; TAPS.log.push(S8D.pend.im.id + ':reemplazado'); }
      var p = S8D.pend = { im: im, k: k };
      s8Later(function () { if (S8D.pend === p) { S8D.pend = null; hacer(); } }, espera);
      TAPS.log.push(im.id + ':anima+' + k + ':espera' + Math.round(espera));
    } else {
      hacer();
      TAPS.log.push(im.id + ':anima' + (k ? '+' + k : ''));
    }
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
  var s8Pre = null;
  function s8Primero(cb) {
    var s8 = $('#s8');
    if (!s8) { cb(); return; }
    if (!s8Pre) { loadBg(s8); s8Pre = Promise.race([loadChars(s8), new Promise(function (r) { setTimeout(r, 8000); })]); }
    s8Pre.then(function () { cb(); });
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
    stopSfx(); t5Stop(); s3Clear(); s8Reset();
    if (i >= 6) s8Audio();   // v15: audios de la 8 (despedida y Bugs) desde la 7
    if (ctx && unlocked && !muted && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }   // v13: dentro del gesto (iOS)
    if (pendingAuto && pendingAuto !== sections[i]) pendingAuto = null;
    idx = i; current = sections[i];
    window.__jahsehNav.navs.push((why || '') + '>' + (i + 1));
    loadBg(current); loadChars(current); loadFotos(current);
    precargaSig(i);
    if (sections[i + 1] && sections[i + 1].hasAttribute('data-sync')) prepSec(sections[i + 1]);   // v13: re-entrada a la 8
    layout(false);
    onSectionVisible(current);
    return true;
  }
  /* v13 final · peso: la escena de la pantalla 3 (~5 MB) ya no compite con la pantalla 2. Se precarga recién cuando la 2 terminó
     de bajar lo suyo (personajes, fondo y videos de las fotos) y el navegador queda libre (idle), o como tarde a los S3_PRE_MAX_MS.
     Si el invitado llega a la 3 antes, goTo la carga en el momento (como cualquier pantalla actual). Las demás pantallas siguen igual. */
  var S3_PRE_MAX_MS = 8000;
  function cargaPropia(sec) {
    var tope = function (p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]); };
    var imgs = $$('#' + sec.id + ' img:not(.char)').filter(function (im) { return im.getAttribute('src') && !im.complete; }).map(function (im) {
      return new Promise(function (r) { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); });
    });
    var vids = $$('#' + sec.id + ' video.foto').filter(function (v) { return v.getAttribute('src') && v.readyState < 4 && !v.error; }).map(function (v) {
      return new Promise(function (r) { v.addEventListener('canplaythrough', r, { once: true }); v.addEventListener('error', r, { once: true }); });
    });
    return tope(Promise.all([loadChars(sec)].concat(imgs, vids)), S3_PRE_MAX_MS);
  }
  function precargaSig(i) {
    var n = sections[i + 1];
    if (!n) return;
    var go = function () { loadBg(n); loadChars(n); loadFotos(n); if (n === s3) s3FotosInit(); };
    if (n !== s3 || n._precargada) { if (n === s3) go(); else { loadBg(n); loadChars(n); loadFotos(n); } return; }
    var cur = sections[i], t0 = performance.now(), hecho = false;
    var run = function (por) {
      if (hecho) return; hecho = true; n._precargada = true;
      PERF.push('s3 precarga ' + por + ' ' + Math.round(performance.now() - t0)); log('s3 precarga (' + por + ')');
      go();
    };
    cargaPropia(cur).then(function () {
      if (window.requestIdleCallback) requestIdleCallback(function () { run('idle'); }, { timeout: 1500 });
      else setTimeout(function () { run('idle'); }, 300);
    });
    setTimeout(function () { run('tope'); }, S3_PRE_MAX_MS + 2000);
  }
  function next(why) { return goTo(idx + 1, why || 'next'); }
  function prev(why) { return goTo(idx - 1, why || 'prev'); }

  function onSectionVisible(sec) {
    if (sec.hasAttribute('data-sync')) { syncEnter(sec); playFotos(sec); return; }   // v13: pantalla 8
    // cada pantalla reinicia su animación al entrar; el sonido suena una vez (solo después del primer toque)
    loadChars(sec).then(function () {
      if (current !== sec) return;
      if (sec.id === 's7') lolaReset();
      restartSection(sec); lockSec(sec); rotaEnter(sec);
      if (sec.id === 's5') t5Intro();
      if (sec === s3) s3Intro();
      var k = sec.getAttribute('data-sound');
      var auto = unlocked && k && sec.getAttribute('data-auto') === '1' && !played[sec.id];
      $$('#' + sec.id + ' img.char[data-tap-ms]').forEach(function (im) {
        // mientras suena la voz de la escena, el toque a ese bebé espera (no la corta)
        im._busyUntil = auto && im.hasAttribute('data-entry-lock-ms') ? Date.now() + (+im.getAttribute('data-entry-lock-ms')) : 0;
      });
      if (auto) { played[sec.id] = true; playSfx(k); }
    });
    playFotos(sec);
    if (sec === s3 || sec.id === 's4') s3FotosInit();   // v13 P3: cuadro de fotos (desde la 2 lo prepara precargaSig, diferido)   // v13 P3: cuadro de fotos (se prepara desde la vecina)
    if (sec.id === 's5') maybeParty();
  }

  /* v13 · pantalla 8 (cierre): la voz «¡Eso es todo, amigos!» y la animación de Porky (data-sync) arrancan juntas en cuanto
     Porky y el sonido están decodificados. Taz y Bugs arrancan cada uno apenas está listo: ya no se espera a los tres.
     Si Porky tarda más de SYNC_MAX_MS, la voz suena igual (que nunca falte el audio). Suena en cada entrada (data-auto-siempre).
     El _toque de Porky se baja después (TOQUE_MS) o al primer toque. */
  var SYNC_MAX_MS = 2500, TOQUE_MS = 3000, syncRun = 0;
  function charBlob(im) {
    return webpReady.then(function () { var u = charUrl(im); if (!blobs[u]) loadChars2(im.closest('.sec')); return blobs[u]; });
  }
  function syncEnter(sec) {
    var run = ++syncRun, t0 = performance.now();
    var lead = document.getElementById(sec.getAttribute('data-sync'));
    var k = sec.getAttribute('data-sound');
    var always = sec.hasAttribute('data-auto-siempre');
    var auto = !!k && sec.getAttribute('data-auto') === '1' && (always || !played[sec.id]);
    var alive = function () { return run === syncRun && current === sec; };
    var chars = $$('#' + sec.id + ' img.char');
    chars.forEach(function (im) {
      im._busyUntil = auto && im.hasAttribute('data-entry-lock-ms') ? Date.now() + (+im.getAttribute('data-entry-lock-ms')) : 0;
    });
    if (auto && !unlocked) pendingAuto = sec;   // sin gesto todavía: el primer toque la arranca (unlock → syncEnter)
    var started = false, leadOn = false;
    chars.forEach(function (im) {
      if (im === lead) return;
      charBlob(im).then(function (b) { if (b && alive()) { restartImg(im); PERF.push(im.id + ' on ' + Math.round(performance.now() - t0)); } });
    });
    var leadReady = charBlob(lead).then(function (b) { return b ? (lead._prepDec || Promise.resolve()) : null; });
    var sndReady = auto && unlocked ? getBuffer(k).catch(function () { return null; }) : Promise.resolve(null);
    function start(withLead) {
      if (started || !alive()) return; started = true;
      if (withLead) { restartImg(lead); leadOn = true; }
      var go = function () {
        if (!alive()) return;
        PERF.push('sync ' + (withLead ? 'porky+voz' : 'voz sola') + ' ' + Math.round(performance.now() - t0));
        if (auto && unlocked && sec.id === 's8' && S8D.sinEntrada) {   // v15: la despedida reemplaza a la voz de la escena
          S8D.sinEntrada = false; played[sec.id] = true; S8D.log.push('entrada-omitida'); s8Disparar('desbloqueo');
        } else if (auto && unlocked) {
          played[sec.id] = true; playSfx(k);
          if (sec.id === 's8') { S8D.vozHasta = S8D.escenaFin = S8D.fraseFin = performance.now() + S8_VOZ_FIN_MS; S8D.log.push('entrada'); }
          if (lead.hasAttribute('data-entry-lock-ms')) lead._busyUntil = Date.now() + (+lead.getAttribute('data-entry-lock-ms'));
        }
        setTimeout(function () { if (current === sec) loadTapBlob(lead); }, TOQUE_MS);
      };
      if (withLead && lead.decode) Promise.race([lead.decode().catch(function () {}), new Promise(function (r) { setTimeout(r, 300); })])
        .then(function () { requestAnimationFrame(go); });
      else go();
    }
    Promise.all([leadReady, sndReady]).then(function (r) {
      if (!alive()) return;
      if (r[0] === null) { start(false); if (!lead.src) lead.src = charUrl(lead); return; }
      if (!started) start(true);
      else if (!leadOn) { restartImg(lead); leadOn = true; PERF.push('porky tarde ' + Math.round(performance.now() - t0)); }
    });
    setTimeout(function () { if (alive() && !started) start(false); }, SYNC_MAX_MS);
  }
  // v13: primer gesto en una pantalla con sonido pendiente (se abrió sin tocar antes, p. ej. ?p=8)
  ['touchend', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (pendingAuto && !unlocked) unlock(); }, true);
  });

  var NO_NAV = '.hot, a, button, img.char, #muteBtn, #againBtn, .s3fotos';
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
    if (im.classList.contains('layer')) return; // v13 P3: capas sin toque (lo reciben #tapLucas / #tapBugs)
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

  /* ---------- v13: pantalla 3 — escena de Lucas y Bugs (clips finales) ----------
     MODO TOQUE (S3L.toque, más abajo): al entrar solo asoman los pies de Lucas (A) y quedan colgando en bucle (B) hasta que
     los tocan; recién entonces: voz → caída C → camina → reposo, y Bugs + escalera arrancan 1117 ms después del impacto.
     Tiempos en ms. LUCAS: anclados al cuadro 0 del clip C (s3LucasDesde, primer pintado = reloj de la animación);
       IMPACTO a C+625 (impactoDesde): golpe s3_lucas_caida.mp3 (su golpe está a 1,208 s del archivo: se toca desde golpeOff,
       agendado en el reloj del AudioContext) + polvo (su WebP trae 1208 ms vacíos: arranca 583 ms antes de C, todavía con B);
       clip 2 s3_lucas_levanta_camina_v4.webp (caja ancha x354.4 725.5x640, 3750 ms) a C+5250, sin corte; a C+9000 reposo en bucle.
     BUGS (/workspace/baby/anim/p3_bugs/posiciones.json): arrancan juntos s3_bugs_escalera.webp (7542 ms) y
       s3_escalera_despliegue.webp (2375 ms; al terminar se cambia por s3_escalera.png, que queda); a +7542 pasa a
       s3_bugs_comer_loop (su cuadro 0 = último del clip). Sin voz de Bugs.
     Un solo sonido a la vez (playSfx): la voz termina antes de que empiece C (y del golpe). */
  var S3T = window.__jahsehS3T = {
    lucasAt: 0, vozDesde: 625, impactoDesde: 4083, golpeOff: 1.158, polvoLead: 1208, lucas1Ms: 8708, lucas2Ms: 3750,
    bugsAt: 9900, bugsMs: 7542, escaleraMs: 2375, margen: 100
  };
  /* PELOTAS (después de la escena): turno GLOBAL que alterna Lucas, Bugs, Lucas, Bugs…
     Cualquier toque en la zona de Lucas o en la de Bugs lanza la pelota de A QUIEN LE TOCA (si tocan al que no le toca,
     igual sale la del turno actual) y pasa el turno al otro. Si la del turno aún no descargó, sale la del otro (si ya está).
     contactos = ms del clip en que la pelota toca el piso (suena s3_pelota_rebote en cada uno, un solo sonido a la vez).
     Lucas: el clip entra desde la derecha y sale por la derecha (primer y último cuadro vacíos), caja x738 y1280 342x640.
     Tras la escena su zona táctil queda donde estaba él (zonaLucasFin), aunque esté fuera de pantalla.
     Para cambiar un clip: src/ms/contactos aquí. Bugs = pelota_v9 (última pedida por Luis). */
  var S3P = window.__jahsehS3P = {
    bugs: { src: 'anim/s3_bugs_pelota_v9.webp', ms: 4625, contactos: [958.3, 1791.7, 2875, 3708.3] },  // /workspace/baby/anim/p3_bugs/pelota_v9/ (última pedida por Luis; mismos 4625 ms y contactos que v3/v8)
    lucas: null,   // lo pone S3L (modo 'parado'): lucas_pelota_parado
    zonaLucasFin: [802, 1546, 208, 366],   // x, y, w, h (lienzo 1080x1920): caja de tinta de Lucas en reposo (x802..1010, y1546..1912)
    turno: 0, escenas: [], sonido: 's3_pelota_rebote'
  };
  /* LUCAS con 4 estados (piezas v3 «centro» + v2 «parado» de /workspace/baby/anim/p3_lucas/):
     1 sale del CENTRO del marco y cae vertical bajo x=540 (s3_lucas_salida_caida_centro, caja x354.4 y1280 342x640, 8708 ms)
     → 2 se levanta y camina a su reposo x≈910 (s3_lucas_levanta_camina_centro, caja ancha x354.4 725.5x640, 3750 ms)
     → 3 reposo en bucle (s3_lucas_reposo_loop, x738) → 4 pelota al tocarlo (s3_lucas_pelota_parado, x738, 7208 ms) → 3.
     Las capas no reciben toques (pointer-events:none); la zona táctil de Lucas (#tapLucas = caja de reposo x802 y1546 w208 h366)
     existe solo desde que queda en reposo. Los cambios de pieza se encadenan sin corte (s3Enlaza).
     modo 'sale' = versión anterior (Lucas salía por la derecha); sus clips ya NO están en el sitio.
     Para cambiar una pieza: reemplazar el archivo en anim/ y poner clip2Ms / pelota.ms / pelota.contactos de su posiciones.json. */
  var S3L = window.__jahsehS3L = {
    modo: 'parado',   // clip2 de v4_detras (caminata corregida); reposo y pelota de v2_parado (aprobadas)
    parado: { clip2: 'anim/s3_lucas_levanta_camina_v4.webp', clip2Ms: 3750, reposo: 'anim/s3_lucas_reposo_loop.webp',
              pelota: { src: 'anim/s3_lucas_pelota_parado.webp', ms: 7208, contactos: [1625, 2417, 2792, 3208] } }
  };
  /* MODO TOQUE (cambio de Luis, 31-oct): Lucas NO cae solo. Al entrar a la pantalla 3 se ve la pieza A (los pies asoman bajo
     el borde inferior del marco) y luego el bucle B (pies colgando) INDEFINIDAMENTE. Bugs y la escalera no se ven todavía.
     Solo al TOCAR los pies (#tapPies, zona invisible, activa únicamente con B corriendo y sin otra animación):
     voz frase_15 → al terminar la voz, en el siguiente ciclo completo de B, clip C (caída desde los pies) anclado a su primer
     pintado → golpe s3_lucas_caida en C+impactoMs (reloj del AudioContext) → se frota → camina (clip2) → reposo → pelotas.
     Bugs (y la escalera) arrancan bugsTrasImpacto ms después del impacto. Volver a la pantalla o recargar = estado inicial.
     activo:false = modo anterior por tiempo (Lucas cae solo al entrar; voz a +625).
     Piezas v5_pies (/workspace/baby/anim/p3_lucas/v5_pies/, lienzo 342x640 en x354.4 y1280, 24 fps):
       A asoma 625 ms (su último cuadro = B[0]: B entra 42 ms antes del final de A, así sigue «desde el cuadro 1» sin repetir);
       B bucle 1250 ms (30 cuadros únicos; en anim/ se quitó la entrada final repetida y se puso bucle infinito, sin tocar píxeles);
       C caída 5250 ms, impacto a 625 ms (cuadro 15); C[0] = B[0], así que C entra justo cuando B vuelve a su cuadro 0. */
  S3L.toque = {
    activo: true,   // true = modo toque (aprobado). false = modo anterior por tiempo (legado: necesitaba el clip v4 de 8708 ms, ya retirado)
    A: { src: 'anim/s3_lucas_pies_asoma.webp', ms: 625, ultimoMs: 42 },   // asomo, 1 vez; ultimoMs = duración de su último cuadro (= B[0])
    B: { src: 'anim/s3_lucas_pies_bucle.webp', cicloMs: 1250 },          // bucle de espera; C entra en un múltiplo de cicloMs
    C: { src: 'anim/s3_lucas_caida_desde_pies.webp', ms: 5250, impactoMs: 625 },
    zona: [400, 1630, 290, 110],                                    // x, y, w, h (1080x1920): zona táctil de los pies (x400–690, y1630–1740)
    vozMsSiFalla: 2873,                                             // duración de frase_15 si el audio no está disponible
    bugsTrasImpacto: 1117                                           // Bugs arranca 1117 ms después del impacto
  };
  if (S3L.modo === 'parado') {
    S3T.lucas2Ms = S3L.parado.clip2Ms; S3P.lucas = S3L.parado.pelota;
    var c2 = document.getElementById('s3Lucas2'); if (c2) { c2.setAttribute('data-src', S3L.parado.clip2); var so = c2.parentNode.querySelector('source'); if (so) so.setAttribute('data-srcset', S3L.parado.clip2); }
  }
  var s3 = $('#s3'), s3T = [];
  var S3 = { lucas: $('#s3Lucas'), lucas2: $('#s3Lucas2'), polvo: $('#s3Polvo'), esc: $('#s3Escalera'), escFija: $('#s3EscaleraFija'),
             bugsEsc: $('#s3BugsEsc'), loop: $('#s3BugsLoop'), pelotaB: $('#s3BugsPelota'), pelotaL: null,
             tapLucas: $('#tapLucas'), tapBugs: $('#tapBugs'), reposo: null, pies: $('#s3LucasPies'), piesA: $('#s3LucasPiesA'), tapPies: $('#tapPies') };
  function s3Toque() { return !!(S3L.toque && S3L.toque.activo && S3.pies && S3.tapPies); }
  if (s3Toque()) {
    var zp = S3L.toque.zona; S3.tapPies.setAttribute('style', '--x:' + zp[0] + ';--y:' + zp[1] + ';--w:' + zp[2] + ';--h:' + zp[3]);
    if (S3L.toque.B && S3L.toque.B.src) { S3.pies.setAttribute('data-src', S3L.toque.B.src); var sp = S3.pies.parentNode.tagName === 'PICTURE' && S3.pies.parentNode.querySelector('source'); if (sp) sp.setAttribute('data-srcset', S3L.toque.B.src); }
    if (S3L.toque.C.src) { S3.lucas.setAttribute('data-src', S3L.toque.C.src); var sc = S3.lucas.parentNode.querySelector('source'); if (sc) sc.setAttribute('data-srcset', S3L.toque.C.src); }
    S3T.lucas1Ms = S3L.toque.C.ms; S3T.impactoDesde = S3L.toque.C.impactoMs;
  }
  function s3Parado() { return S3L.modo === 'parado'; }
  function s3CapaLucas(id, alt) {   // capa extra de Lucas en la misma caja que sus clips (se crea solo si se usa)
    var im = document.createElement('img');
    im.className = 'el layer off'; im.id = id; im.alt = alt;
    im.setAttribute('style', '--x:738;--y:1280;--w:342;--h:640;z-index:3');
    S3.lucas.closest('.page').appendChild(im); return im;
  }
  var s3Estado = { fin: false, lucasVis: false, lucas: '' };   // lucas: '' | asomo | espera | voz | cae | reposo
  window.__jahsehTap = { busy: function (id) { return Math.max(0, (lockUntil[id] || 0) - Date.now()); }, ignored: [], ev: [], estado: s3Estado };
  function s3Ev(e) { window.__jahsehTap.ev.push({ ev: e, t: Date.now() }); log('s3 ' + e); }
  function s3Clear() { s3T.forEach(clearTimeout); s3T = []; }
  function s3At(ms, fn) { s3T.push(setTimeout(function () { if (current === s3) fn(); }, Math.max(0, ms))); }
  function s3Show(im, on) { if (im) im.classList.toggle('off', !on); }
  function s3LucasVis(on) { s3Estado.lucasVis = on; s3Show(S3.tapLucas, on || s3Estado.fin); }
  var S3_ZL0 = S3.tapLucas ? S3.tapLucas.getAttribute('style') : '';
  function s3ZonaLucas(fin) {   // zona de Lucas: la de la escena o, tras la escena, la de su pelota (existe aunque él esté fuera)
    if (!S3.tapLucas) return;
    var z = S3P.zonaLucasFin;
    S3.tapLucas.setAttribute('style', fin && (S3P.lucas || s3Parado()) ? '--x:' + z[0] + ';--y:' + z[1] + ';--w:' + z[2] + ';--h:' + z[3] : S3_ZL0);
  }
  // reinicia «im» desde su cuadro 0 y, cuando ya decodificó, oculta «antes» (encadenado sin corte visible)
  function s3Enlaza(im, antes, cb) {
    var hecho = false;
    function swap() { if (hecho) return; hecho = true; s3Show(im, true); if (antes && antes !== im) s3Show(antes, false); if (cb) cb(); }
    im.onload = function () { im.onload = null; swap(); };
    restartImg(im);
    setTimeout(swap, 250);   // por si el load no llega (blob ya decodificado)
  }
  /* parte de Lucas (t0 = desde cuándo contar). Todo se ancla al RELOJ DE LA ANIMACIÓN: el clip 1 arranca en su cuadro 0 al
     pintarse por primera vez (onload del blob nuevo + primer requestAnimationFrame) y desde ese instante (S3.anclaLucas)
     se agendan voz, golpe (en el reloj del AudioContext, ver playSfx enPerf), polvo, clip 2 y reposo. */
  function s3Lucas(t0, sonido, golpe) {
    var L = S3T.lucasAt - t0;
    s3Show(S3.lucas, false); s3Show(S3.lucas2, false); if (!S3.polvoYa) s3Show(S3.polvo, false); s3Show(S3.reposo, false); s3LucasVis(false);
    if (s3Parado()) { if (!S3.reposo) S3.reposo = s3CapaLucas('s3LucasReposo', 'Pato Lucas parado'); s3PelotaCarga(S3.reposo, S3L.parado.reposo); }
    s3At(L, function () {
      var hecho = false, im = S3.lucas;
      function ancla() {
        if (hecho) return; hecho = true;
        requestAnimationFrame(function (tf) { s3Show(S3.pies, false); s3Show(S3.piesA, false); s3LucasDesde(Math.max(tf, performance.now() - 16), sonido, golpe === undefined ? sonido : golpe); });
      }
      im.onload = function () { im.onload = null; ancla(); };
      restartImg(im); s3Show(im, true); if (!s3Parado()) s3LucasVis(true);
      s3At(300, ancla);   // por si el load no llega
    });
  }
  function s3LucasDesde(a, sonido, golpe) {   // a = performance.now() del cuadro 0 del clip 1 (en modo toque: clip C)
    S3.anclaLucas = a; s3Ev('lucas'); window.__jahsehTap.anclaLucas = a;
    function en(ms, fn) { s3At(a + ms - performance.now(), fn); }
    var golpeEn = S3T.impactoDesde - Math.round((1.208 - S3T.golpeOff) * 1000);   // el golpe del mp3 está a 1,208 s
    if (sonido) {   // modo por tiempo: la voz va dentro del clip
      en(S3T.vozDesde - 200, function () { playSfx('s3_lucas_f15', 1, 0, 0, a + S3T.vozDesde); });
      en(S3T.vozDesde, function () { s3Ev('voz'); });
    }
    if (golpe) en(golpeEn - 200, function () { playSfx('s3_lucas_caida', 1, S3T.golpeOff, 0, a + golpeEn); });
    if (s3Toque()) {   // Bugs y la escalera arrancan recién después del impacto
      en(S3T.impactoDesde + S3L.toque.bugsTrasImpacto, function () { s3Bugs(S3T.bugsAt, true); });
      lockUntil.s3 = Date.now() + Math.max(S3T.lucas1Ms + S3T.lucas2Ms, S3T.impactoDesde + S3L.toque.bugsTrasImpacto + S3T.bugsMs) + S3T.margen + (a - performance.now());
    }
    if (S3.polvoYa) S3.polvoYa = false; else en(S3T.impactoDesde - S3T.polvoLead, function () { restartImg(S3.polvo); s3Show(S3.polvo, true); });
    en(golpeEn, function () { s3Ev('impacto'); });
    en(S3T.lucas1Ms, function () { s3Enlaza(S3.lucas2, S3.lucas); s3Ev('lucas2'); });
    if (s3Parado()) en(S3T.lucas1Ms + S3T.lucas2Ms, function () {   // se queda parado: reposo en bucle; recién ahora existe su zona
      if (S3.reposo && S3.reposo._blob) s3Enlaza(S3.reposo, S3.lucas2);   // si el bucle aún no bajó, queda el último cuadro del clip2 (misma pose)
      s3Show(S3.polvo, false); s3ZonaLucas(true); s3LucasVis(true); s3Estado.lucas = 'reposo'; s3Ev('lucasReposo');
    });
    else en(S3T.lucas1Ms + S3T.lucas2Ms, function () { s3Show(S3.lucas2, false); s3Show(S3.polvo, false); s3LucasVis(false); s3Ev('lucasFuera'); });
  }
  // parte de Bugs: asomo + escalera + bajada (escalera: true = también cae la escalera)
  function s3Bugs(t0, escalera) {
    var B = S3T.bugsAt - t0;
    s3Show(S3.bugsEsc, false);
    if (escalera) { s3Show(S3.esc, false); s3Show(S3.escFija, false); s3Show(S3.loop, false); }
    s3At(B, function () {
      if (escalera) { restartImg(S3.esc); s3Show(S3.esc, true); }
      s3Show(S3.loop, false); s3Show(S3.pelotaB, false);
      restartImg(S3.bugsEsc); s3Show(S3.bugsEsc, true); s3Ev('bugs');
    });
    if (escalera) s3At(B + S3T.escaleraMs, function () { s3Show(S3.escFija, true); s3Show(S3.esc, false); s3Ev('escaleraFija'); });
    s3At(B + S3T.bugsMs, function () { s3Enlaza(S3.loop, S3.bugsEsc, function () { s3Fin(); }); s3Ev('bucle'); });
  }
  function s3Fin() { s3Estado.fin = true; s3Show(S3.tapBugs, true); s3ZonaLucas(true); if (S3P.lucas) s3Show(S3.tapLucas, true); s3PelotaPrecarga(); if (window.__jahsehFotos && window.__jahsehFotos.a) s3FotoAnim(); }
  function s3Intro() {
    s3Clear();
    var sonido = !played.s3; played.s3 = true;   // suena la primera vez (playSfx reanuda el AudioContext si hace falta)
    s3Estado.fin = false; s3ZonaLucas(false); S3P.turno = 0;
    lockUntil.s3 = Date.now() + Math.max(S3T.lucasAt + S3T.lucas1Ms + S3T.lucas2Ms, S3T.bugsAt + S3T.bugsMs) + S3T.margen;
    s3Show(S3.pelotaB, false); if (S3.pelotaL) s3Show(S3.pelotaL, false);
    s3Ev('intro');
    if (s3Toque()) { s3IntroToque(); return; }
    s3Lucas(0, sonido); s3Bugs(0, true);
  }
  /* modo toque: estado inicial = pies en espera (A → B en bucle), sin Bugs ni escalera, sin límite de tiempo */
  function s3IntroToque() {
    var T = S3L.toque;
    [S3.lucas, S3.lucas2, S3.polvo, S3.reposo, S3.esc, S3.escFija, S3.bugsEsc, S3.loop, S3.pelotaB, S3.pelotaL].forEach(function (im) { s3Show(im, false); });
    s3Show(S3.tapLucas, false); s3Show(S3.tapBugs, false); s3Show(S3.tapPies, false); s3Estado.lucasVis = false;
    if (S3L.modo === 'parado') { if (!S3.reposo) S3.reposo = s3CapaLucas('s3LucasReposo', 'Pato Lucas parado'); s3PelotaCarga(S3.reposo, S3L.parado.reposo); }
    S3.anclaLucas = 0; window.__jahsehTap.anclaLucas = 0; S3.polvoYa = false; s3Show(S3.piesA, false); s3Show(S3.pies, false);
    function espera() {   // bucle B: la zona de los pies existe solo ahora; esperaDesde = primer pintado de B[0] (reloj del bucle)
      s3Estado.lucas = 'espera'; lockUntil.s3 = 0; S3.esperaDesde = performance.now();
      var im = S3.pies, ok = false;
      function pinta() { if (ok) return; ok = true; requestAnimationFrame(function (tf) { S3.esperaDesde = Math.max(tf, performance.now() - 16); s3Show(im, true); if (S3.piesA) s3Show(S3.piesA, false); }); }
      im.onload = function () { im.onload = null; pinta(); };
      restartImg(im); s3At(250, pinta);
      s3Show(S3.tapPies, true); s3Ev('piesEspera');
    }
    if (T.A && T.A.src && S3.piesA && S3.piesA._blob) {   // pieza A una vez (anclada a su primer pintado), luego B
      s3Estado.lucas = 'asomo'; lockUntil.s3 = Date.now() + T.A.ms + S3T.margen;
      var im = S3.piesA, ok = false;
      function anclaA() { if (ok) return; ok = true; requestAnimationFrame(function (tf) { var a = Math.max(tf, performance.now() - 16); s3Ev('piesAsoman'); s3At(a + T.A.ms - (T.A.ultimoMs || 0) - performance.now(), espera); }); }
      im.onload = function () { im.onload = null; anclaA(); };
      restartImg(im); s3Show(im, true); s3At(250, anclaA);
    } else espera();   // sin A (o aún sin descargar): directo al bucle
  }
  /* toque en los pies: voz → (fin de la voz + fin de ciclo de B) → clip C */
  function s3TapPies() {
    if (Date.now() < swallowClick || document.body.classList.contains('rsvp-open')) return;
    if (!unlocked) unlock();
    if (s3Estado.lucas !== 'espera' || s3Busy()) { s3Ign('pies'); return; }
    var T = S3L.toque, t0 = performance.now();
    s3Estado.lucas = 'voz'; s3Show(S3.tapPies, false); lockUntil.s3 = Date.now() + 60000;   // bloqueado hasta que s3LucasDesde fije el final
    TAPS.log.push('s3:pies'); s3Ev('toquePies');
    var p = playSfx('s3_lucas_f15'); s3Ev('voz');
    p.then(function (dur) {
      if (current !== s3 || s3Estado.lucas !== 'voz') return;
      var e = dur && window.__jahsehAudio.at.filter(function (x) { return x.k === 's3_lucas_f15'; }).pop();   // inicio real de la voz
      var fin = e ? e.t + e.dur * 1000 : t0 + T.vozMsSiFalla, c = T.B && T.B.cicloMs;
      if (c) { var d = fin - S3.esperaDesde; fin = S3.esperaDesde + Math.ceil(d / c) * c; }   // siguiente ciclo completo del bucle B
      // el polvo trae polvoLead ms vacíos: si el impacto llega antes, se arranca ya con B (sus primeros cuadros son transparentes)
      var pol = T.C.impactoMs - S3T.polvoLead;
      if (pol < 0) s3At(fin + pol - performance.now(), function () { if (s3Estado.lucas !== 'voz') return; restartImg(S3.polvo); s3Show(S3.polvo, true); S3.polvoYa = true; });
      s3At(fin - performance.now(), function () { s3Estado.lucas = 'cae'; s3Ev('caida'); s3Lucas(S3T.lucasAt, false, true); });
    });
  }
  if (S3.tapPies) bindTap(S3.tapPies, s3TapPies);
  window.__jahsehS3dbg = { esperaDesde: function () { return S3.esperaDesde || 0; } };   // solo lectura, para las pruebas
  /* pelotas: carga diferida (recién al terminar la escena) */
  function s3PelotaCarga(im, src) {
    if (!im || im._blob || im._cargando) return;
    im._cargando = true;
    blobs[src] = blobs[src] || fetch(src).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .catch(function (e) { log('img error ' + src + ' ' + e); return null; });
    blobs[src].then(function (b) { im._cargando = false; if (b) im._blob = b; });
  }
  function s3PelotaPrecarga() {
    s3PelotaCarga(S3.pelotaB, S3P.bugs.src);
    if (S3P.lucas) {
      if (!S3.pelotaL) S3.pelotaL = s3CapaLucas('s3LucasPelota', 'Pato Lucas con la pelota');
      s3PelotaCarga(S3.pelotaL, S3P.lucas.src);
    }
  }
  function s3Pelota(quien) {
    var P = S3P[quien], im = quien === 'bugs' ? S3.pelotaB : S3.pelotaL;
    if (!P || !im || !im._blob) return false;
    lockUntil.s3 = Date.now() + P.ms + S3T.margen;
    if (quien === 'bugs') s3Enlaza(im, S3.loop);
    else if (s3Parado()) s3Enlaza(im, S3.reposo, function () { s3Show(S3.lucas2, false); });   // de reposo a pelota sin corte
    else { restartImg(im); s3Show(im, true); }
    P.contactos.forEach(function (c, n) { s3At(c, function () { playSfx(S3P.sonido); s3Ev('rebote' + (n + 1)); }); });
    s3At(P.ms, function () {
      if (quien === 'bugs') s3Enlaza(S3.loop, im);
      else if (s3Parado()) { if (S3.reposo && S3.reposo._blob) s3Enlaza(S3.reposo, im); }   // vuelve al reposo (si no, queda su último cuadro = reposo)
      else s3Show(im, false);   // provisional 'sale': su último cuadro ya está vacío (salió por la derecha); la zona sigue activa
      s3Ev('pelotaFin:' + quien);
    });
    S3P.escenas.push(quien); s3Ev('pelota:' + quien);
    return true;
  }
  function s3Busy() { return Date.now() < (lockUntil.s3 || 0); }
  function s3Ign(who) { window.__jahsehTap.ignored.push('s3:' + who); TAPS.log.push('s3:' + who + ':ignorado'); log('tap ignorado s3 ' + who); }
  function s3Tap(who) {
    if (Date.now() < swallowClick || document.body.classList.contains('rsvp-open')) return;
    if (!unlocked) unlock();
    if (s3Busy()) { s3Ign(who); return; }
    if (s3Estado.fin) {
      // después de la escena: pelotas, alternando Lucas/Bugs si hay clip de Lucas
      var quien = S3P.lucas ? (S3P.turno % 2 === 0 ? 'lucas' : 'bugs') : 'bugs';
      if (!s3Pelota(quien)) {
        var otro = quien === 'lucas' ? 'bugs' : 'lucas';
        if (S3P[otro] && s3Pelota(otro)) quien = otro;
        else if (who === 'bugs') { s3Clear(); lockUntil.s3 = Date.now() + S3T.bugsMs + S3T.margen; s3Bugs(S3T.bugsAt, false); quien = 'bugs-bajada'; } // la pelota aún no cargó: repite asomo y bajada (la escalera ya está)
        else { s3Ign(who); return; }
      }
      if (quien === 'lucas') S3P.turno = 1; else if (quien === 'bugs') S3P.turno = 0;   // pasa el turno al otro
      TAPS.log.push('s3:' + quien); TAPS.count['s3_' + quien] = (TAPS.count['s3_' + quien] || 0) + 1;
      return;
    }
    // durante la escena todo está bloqueado (lockUntil.s3), así que aquí solo se llega si la escena se cortó
    if (who === 'lucas' && s3Estado.lucasVis) { s3Clear(); lockUntil.s3 = Date.now() + S3T.lucas1Ms + S3T.lucas2Ms + S3T.margen; s3Lucas(S3T.lucasAt, true); TAPS.log.push('s3:lucas'); }
    else s3Ign(who);
  }
  bindTap(S3.tapLucas, function () { s3Tap('lucas'); });
  bindTap(S3.tapBugs, function () { s3Tap('bugs'); });
  /* ---------- v13 P3: cuadro con pila de fotos ----------
     Toque/clic (o Enter/Espacio) en el marco: la foto de arriba se desliza y gira un poco hacia la derecha, pasa detrás
     de la pila y queda la siguiente, en orden y cíclico. Solo se mueve la foto (traslación + giro leve; sin escala ni filtros).
     Lista: anim/s3_fotos/lista.json {"fotos":[{"src","ajuste":"cover"|"contain","anim":null|ruta}, ...]} (también admite rutas sueltas);
     si falta o está mal, S3F_DEF. Las fotos tapan exactamente la ventana x352 y1031 w376 h501 (la foto 1 está horneada en p3.webp);
     con «contain» las franjas libres son del color del paspartú (#f6ecdc), así no se ve la foto horneada de abajo.
     Carga diferida: solo 2 <img> (la actual y la siguiente). «anim»: WebP animado de esa foto; reemplaza a la fija solo cuando
     esa foto está arriba y la animada ya cargó (si no hay, queda la fija). Sonido de página solo si no suena otro (p. ej. la voz de Lucas). */
  var S3F_DEF = [{ src: 'anim/s3_fotos/foto_1.webp', ajuste: 'cover', anim: null }];
  var S3F = window.__jahsehFotos = { lista: null, i: 0, busy: 0, pasadas: 0, ignorados: 0, sonidos: 0, mudos: 0, MS: 600, el: $('#s3Fotos'), a: null, b: null };
  function s3FotoItem(k) { var L = S3F.lista; return L[((k % L.length) + L.length) % L.length]; }
  function s3FotoCarga(im, k) {
    var it = s3FotoItem(k);
    im.classList.remove('lista'); im.onload = null; im._k = k; im._anim = false;
    im.style.objectFit = it.ajuste === 'contain' ? 'contain' : 'cover';
    if (im.getAttribute('src') === it.src && im.complete && im.naturalWidth) { im.classList.add('lista'); return; }
    im.onload = function () { im.classList.add('lista'); if (im === S3F.a) s3FotoAnim(); };
    im.src = it.src;
  }
  function s3FotoAnim() {                    // versión animada de la foto de arriba (opcional)
    var im = S3F.a, k = im && im._k, it = im && s3FotoItem(k);
    if (!it || !it.anim || im._anim || !im.classList.contains('lista')) return;
    if (!S3F.pasadas && !s3Estado.fin) return;   // la animada de la foto 1 recién al terminar la escena (no compite con los clips al entrar)
    var pre = new Image();
    pre.onload = function pon() {
      if (S3F.a === im && im._k === k && Date.now() < S3F.busy) { setTimeout(pon, S3F.busy - Date.now() + 20); return; }   // termina de pasar y luego cambia
      if (S3F.a === im && im._k === k && !im._anim) { im.onload = null; im._anim = true; im.src = it.anim; S3F.animadas = (S3F.animadas || 0) + 1; log('foto anim ' + it.anim); } };
    pre.src = it.anim;
  }
  function s3FotosInit() {
    if (!S3F.el || S3F.cargando) return;
    S3F.cargando = true;
    fetch('anim/s3_fotos/lista.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        var L = (j && Array.isArray(j.fotos) ? j.fotos : []).map(function (x) {
          return typeof x === 'string' ? { src: x, ajuste: 'cover', anim: null } : x;
        }).filter(function (x) { return x && typeof x.src === 'string' && x.src; });
        S3F.lista = L.length ? L : S3F_DEF;
        S3F.b = document.createElement('img'); S3F.a = document.createElement('img');
        [S3F.b, S3F.a].forEach(function (im) { im.alt = ''; im.decoding = 'async'; im.draggable = false; S3F.el.appendChild(im); });
        S3F.a.alt = 'Foto de JAHSEH'; S3F.a.style.zIndex = 2; S3F.b.style.zIndex = 1;
        s3FotoCarga(S3F.a, 0);
        if (S3F.lista.length > 1) s3FotoCarga(S3F.b, 1);   // precarga solo la siguiente
      });
  }
  function s3FotoSonido() {
    var otro = Object.keys(sfxNodes).some(function (k) { return k !== 'sobre'; });   // un solo sonido a la vez
    if (otro || !unlocked) { S3F.mudos++; return; }
    S3F.sonidos++; playSfx('s3_foto_pagina', 0.8);
  }
  function s3FotoPasa() {
    if (Date.now() < swallowClick || document.body.classList.contains('rsvp-open') || !S3F.lista) return;
    if (Date.now() < S3F.busy) { S3F.ignorados++; log('foto: toque ignorado (pasando)'); return; }
    if (S3F.lista.length < 2) return;
    if (!unlocked) unlock();
    S3F.busy = Date.now() + S3F.MS + 50;
    var top = S3F.a, under = S3F.b;
    top.classList.add('pasa');
    s3FotoSonido();
    if (top.animate) top.animate([
      { transform: 'translate(0,0) rotate(0deg)' },
      { transform: 'translate(15%,-1%) rotate(6deg)', offset: 0.45 },
      { transform: 'translate(6%,1%) rotate(2.5deg)', offset: 0.75 },
      { transform: 'translate(0,0) rotate(0deg)' }
    ], { duration: S3F.MS, easing: 'ease-in-out' });
    setTimeout(function () { top.style.zIndex = 1; under.style.zIndex = 2; }, S3F.MS * 0.45);   // a mitad de camino pasa detrás
    setTimeout(function () {
      top.classList.remove('pasa');
      S3F.i = (S3F.i + 1) % S3F.lista.length; S3F.pasadas++;
      S3F.a = under; S3F.b = top; under.alt = 'Foto de JAHSEH'; top.alt = '';
      s3FotoCarga(top, S3F.i + 1);                                                             // la de atrás pasa a ser la siguiente
      s3FotoAnim();
      log('foto ' + (S3F.i + 1) + '/' + S3F.lista.length);
    }, S3F.MS);
  }
  if (S3F.el) {
    bindTap(S3F.el, s3FotoPasa);
    S3F.el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); s3FotoPasa(); }
    });
  }
  /* fin v13 P3 */
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
    sections.forEach(function (s, i) { if (i > 1 && s !== s3) loadBg(s); });   // v13 final: el fondo de la 3 va con su precarga diferida
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
