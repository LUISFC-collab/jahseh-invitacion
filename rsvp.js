/* =====================================================================
   Confirmación de asistencia (pantalla 7 · Lola) · v14 (v16: máximo 2 adultos y 2 niños)
   URL_HOJA: pega aquí la URL de la aplicación web de Google Apps Script
   (termina en /exec). Si queda vacía, solo se abre WhatsApp.
   v14: contadores de ADULTOS y NIÑOS por separado; por cada uno aparece su
   cajetín de nombre («Adulto 1», «Niño 1»…). Solo «Tu nombre» es obligatorio;
   los nombres de los cajetines son opcionales (si quedan vacíos, el mensaje
   dice «sin nombre»). «Adulto 1» se rellena solo con tu nombre (editable).
   ===================================================================== */
var URL_HOJA = '';

(function () {
  'use strict';
  var WHATSAPP = '51941562413';           // solo el WhatsApp de mamá
  var MAX_ADULTOS = 2, MAX_NINOS = 2;     // v16: máximo 2 adultos y 2 niños por invitación (pedido de Luis)
  var HOJA = window.__URL_HOJA_PRUEBA || URL_HOJA;   // __URL_HOJA_PRUEBA solo se usa en pruebas locales

  var $ = function (s) { return document.querySelector(s); };
  var caja = $('#rsvp'), form = $('#rsvpForm'), listo = $('#rsvpListo'), hoja = caja.querySelector('.rsvp-hoja');
  var nombre = $('#rsvpNombre'), lista = $('#rsvpNombres');
  var errNombre = $('#errNombre'), errGeneral = $('#errGeneral'), errCantidad = $('#errCantidad');
  var cuenta = { adulto: 0, nino: 0 };
  var guardado = { adulto: [], nino: [] };          // conserva lo escrito si bajan y vuelven a subir el contador
  var a1Tocado = false;                              // «Adulto 1» deja de copiar tu nombre si lo editan a mano
  window.__rsvp = { envios: [], whatsapp: [] };

  function limpio(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function limpiarErr() { errGeneral.textContent = ''; errCantidad.textContent = ''; }

  /* ---------- contadores y cajetines ---------- */
  function cajetin(tipo, i) {
    var et = (tipo === 'adulto' ? 'Adulto ' : 'Niño ') + i;
    var lab = document.createElement('label');
    lab.className = 'rsvp-caj ' + tipo;
    var chip = document.createElement('span'); chip.className = 'rsvp-chip';
    chip.textContent = et + (tipo === 'adulto' && i === 1 ? ' (tú)' : '');
    var inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 60; inp.autocomplete = 'off';
    inp.name = (tipo === 'adulto' ? 'nombre_adulto_' : 'nombre_nino_') + i;
    inp.id = (tipo === 'adulto' ? 'nomAdulto' : 'nomNino') + i;
    inp.placeholder = 'Nombre (opcional)';
    inp.setAttribute('aria-label', 'Nombre de ' + et.toLowerCase() + ' (opcional)');
    inp.value = guardado[tipo][i - 1] || '';
    if (tipo === 'adulto' && i === 1 && !a1Tocado) inp.value = limpio(nombre.value);
    inp.addEventListener('input', function () {
      guardado[tipo][i - 1] = inp.value;
      if (tipo === 'adulto' && i === 1) a1Tocado = true;
    });
    lab.appendChild(chip); lab.appendChild(inp);
    return lab;
  }
  function pintar() {
    $('#numAdultos').textContent = cuenta.adulto;
    $('#numNinos').textContent = cuenta.nino;
    $('#menosAdultos').disabled = cuenta.adulto <= 0;
    $('#masAdultos').disabled = cuenta.adulto >= MAX_ADULTOS;
    $('#menosNinos').disabled = cuenta.nino <= 0;
    $('#masNinos').disabled = cuenta.nino >= MAX_NINOS;
    // reconstruye los cajetines (primero adultos, luego niños)
    lista.textContent = '';
    var i;
    for (i = 1; i <= cuenta.adulto; i++) lista.appendChild(cajetin('adulto', i));
    for (i = 1; i <= cuenta.nino; i++) lista.appendChild(cajetin('nino', i));
    lista.hidden = cuenta.adulto + cuenta.nino === 0;
    var t = cuenta.adulto + cuenta.nino;
    $('#rsvpTotal').textContent = t ? 'Total: ' + t + (t === 1 ? ' persona' : ' personas') : '';
  }
  function cambiar(tipo, d) {
    var max = tipo === 'adulto' ? MAX_ADULTOS : MAX_NINOS;
    var antes = cuenta[tipo];
    cuenta[tipo] = Math.max(0, Math.min(max, cuenta[tipo] + d));
    if (cuenta[tipo] === antes) return;
    limpiarErr();
    pintar();
    if (d > 0) {   // muestra el cajetín nuevo sin robar el foco (no abre el teclado)
      var nuevo = lista.querySelector('#' + (tipo === 'adulto' ? 'nomAdulto' : 'nomNino') + cuenta[tipo]);
      if (nuevo) verCampo(nuevo.parentNode, true);
    }
  }
  [['#masAdultos', 'adulto', 1], ['#menosAdultos', 'adulto', -1], ['#masNinos', 'nino', 1], ['#menosNinos', 'nino', -1]].forEach(function (b) {
    $(b[0]).addEventListener('click', function () { cambiar(b[1], b[2]); });
  });
  nombre.addEventListener('input', function () {
    nombre.classList.remove('mal'); errNombre.textContent = ''; errGeneral.textContent = '';
    if (!a1Tocado) { var a1 = $('#nomAdulto1'); if (a1) a1.value = limpio(nombre.value); }
  });

  /* ---------- teclado del celular: la hoja se ajusta al área visible y el campo enfocado queda a la vista ---------- */
  // Lleva el cajetín enfocado al área visible de la hoja, por encima del botón «¡Confirmar asistencia!» (que va pegado abajo).
  function verCampo(el, suave) {
    if (!el || caja.hidden || !hoja.contains(el)) return;
    var h = hoja.getBoundingClientRect(), r = el.getBoundingClientRect();
    var btn = $('#rsvpEnviar'), tapa = 0;
    if (btn && btn.offsetParent) { var b = btn.getBoundingClientRect(); if (b.top < h.bottom && b.bottom > h.top) tapa = Math.max(0, h.bottom - b.top); }
    var arriba = h.top + 12, abajo = h.bottom - tapa - 12;
    var delta = 0;
    if (r.bottom > abajo) delta = r.bottom - abajo;          // tapado por abajo (teclado o botón)
    if (r.top - delta < arriba) delta = r.top - arriba;      // y nunca dejarlo cortado por arriba
    if (Math.abs(delta) < 1) return;
    try { hoja.scrollTo({ top: hoja.scrollTop + delta, behavior: suave ? 'smooth' : 'auto' }); } catch (e) { hoja.scrollTop += delta; }
  }
  function campoActivo() { var f = document.activeElement; return f && f.tagName === 'INPUT' && hoja.contains(f) ? f : null; }
  var esperaVer = 0;
  function verActivoLuego(ms) { clearTimeout(esperaVer); esperaVer = setTimeout(function () { var f = campoActivo(); if (f) verCampo(f, false); }, ms); }
  function tecladoAbierto(vv) { return !!vv && vv.height < window.innerHeight * 0.8; }
  function bugsAlto() { return caja.classList.contains('bugs-mini') ? BUGS.altoMini : BUGS.alto; }
  function ajustarAlto() {
    var vv = window.visualViewport;
    var alto = vv ? vv.height : window.innerHeight;
    caja.classList.toggle('bugs-mini', alto < 600);             // poca altura (teclado abierto): Bugs más pequeño a un lado
    caja.classList.toggle('teclado', tecladoAbierto(vv));
    var reserva = caja.classList.contains('con-bugs') ? bugsAlto() + 4 : 0;   // con Bugs a la vista: su alto queda libre sobre la hoja
    if (!vv || caja.hidden) {
      caja.style.height = ''; caja.style.top = '';
      hoja.style.maxHeight = reserva ? 'min(88dvh, calc(100% - ' + reserva + 'px))' : '';
      return;
    }
    caja.style.top = vv.offsetTop + 'px';                       // el fondo y la hoja siguen al teclado
    caja.style.height = vv.height + 'px';
    hoja.style.maxHeight = Math.round(Math.min(vv.height * (caja.classList.contains('teclado') ? 0.97 : 0.92), vv.height - reserva)) + 'px';
    bugsAcomodar();
    verActivoLuego(60);                                         // al abrirse o cerrarse el teclado, el cajetín enfocado vuelve a la vista
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', ajustarAlto); window.visualViewport.addEventListener('scroll', ajustarAlto); }
  window.addEventListener('resize', ajustarAlto);
  // cualquier cajetín (nombre, Adulto N, Niño N): al enfocarlo se acomoda a la vista; se repite cuando termina de subir el teclado
  hoja.addEventListener('focusin', function (e) {
    if (e.target && e.target.tagName === 'INPUT') { verCampo(e.target, false); verActivoLuego(350); }
  });



  /* ---------- v14: Bugs adulto «¿Qué hay de nuevo, viejo?» ----------
     Paquete de Luis (/workspace/bugs_adulto_pkg/bugs_adulto_que_hay_de_nuevo_viejo/), cuadros sin retocar (solo recorte y escala):
     s7_bugs_entra.webp = cuadros 0-24 (1670 ms, camina y se planta) + s7_bugs_entra_pasos.mp3 (0-1,60 s de su sonido: fanfarria y pasos, sin voz);
     s7_bugs_reposo.webp = cuadro 24; s7_bugs_habla.webp = cuadros 25-52 (1860 ms) + s7_bugs_que_hay_de_nuevo_viejo.mp3 (la voz empieza
     17 ms antes del cuadro 25 en la escena original: se arranca con ese desfase). Mismos tiempos por cuadro que el GIF (60/70 ms). */
  var BUGS = { entra: 'anim/s7_bugs_entra.webp?v=26', reposo: 'anim/s7_bugs_reposo.webp?v=26', habla: 'anim/s7_bugs_habla.webp?v=26',
               entraMs: 1670, hablaMs: 1860, vozOff: 0.017, alto: 110, altoMini: 80, margen: 2, esperaMax: 1500 };
  var bugsCaja = $('#rsvpBugs'), bugsImg = $('#bugsImg'), bugsGlobo = $('#bugsGlobo'), bugsTocame = $('#bugsTocame');
  var bugsBlob = {}, bugsUrl = null, bugsEstado = 'fuera', bugsTimer = 0, bugsOk = true;
  window.__rsvp.bugs = { eventos: [] };
  function bugsEv(e) { window.__rsvp.bugs.eventos.push({ e: e, t: Math.round(performance.now()) }); window.__rsvp.bugs.estado = bugsEstado; }
  function sfx() { return window.__jahsehSfx || { pre: function () {}, play: function () { return Promise.resolve(false); } }; }
  function bugsPrecarga() {
    sfx().pre('s7_bugs_entra'); sfx().pre('s7_bugs_voz');
    ['entra', 'reposo', 'habla'].forEach(function (k) {
      if (bugsBlob[k]) return;
      bugsBlob[k] = fetch(BUGS[k]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); });
      bugsBlob[k].catch(function () {});
    });
  }
  // cada reproducción usa un object URL nuevo: el WebP animado vuelve a empezar desde el cuadro 0
  function bugsPoner(k) {
    return (bugsBlob[k] || Promise.reject()).then(function (b) { return URL.createObjectURL(b); }, function () { return BUGS[k]; })
      .then(function (u) {
        var viejo = bugsUrl; bugsUrl = u.indexOf('blob:') === 0 ? u : null;
        bugsImg.src = u;
        if (viejo) setTimeout(function () { URL.revokeObjectURL(viejo); }, 500);
      });
  }
  function bugsAcomodar() {
    if (bugsCaja.hidden) return;
    var hoy = caja.getBoundingClientRect(), h = hoja.getBoundingClientRect();
    bugsCaja.style.left = Math.max(0, h.left - hoy.left + 4) + 'px';
    bugsCaja.style.bottom = Math.max(0, hoy.bottom - h.top - BUGS.margen) + 'px';
  }
  function bugsEntrar() {
    if (bugsEstado !== 'fuera' || !bugsOk) return;
    bugsEstado = 'entrando'; bugsEv('entra');
    caja.classList.add('con-bugs'); ajustarAlto();
    bugsCaja.hidden = false; bugsAcomodar();
    bugsPoner('entra').then(function () {
      sfx().play('s7_bugs_entra');                       // solo pasos (sin voz); con el sonido silenciado o bloqueado, entra en silencio
      clearTimeout(bugsTimer);
      bugsTimer = setTimeout(function () {
        bugsPoner('reposo'); bugsEstado = 'reposo'; bugsTocame.hidden = false; bugsEv('reposo');
        var foco = campoActivo(); if (foco) verCampo(foco, true);
      }, BUGS.entraMs);
    });
  }
  function bugsHablar() {
    if (bugsEstado === 'fuera' || bugsEstado === 'entrando') return;
    bugsEstado = 'hablando'; bugsEv('habla'); bugsTocame.hidden = true;
    bugsPoner('habla').then(function () {
      sfx().play('s7_bugs_voz', BUGS.vozOff);
      bugsGlobo.hidden = false;
      clearTimeout(bugsTimer);
      bugsTimer = setTimeout(function () { bugsPoner('reposo'); bugsEstado = 'reposo'; bugsGlobo.hidden = true; bugsEv('reposo'); }, BUGS.hablaMs + 150);
    });
  }
  $('#bugsBtn').addEventListener('click', function (e) { e.preventDefault(); bugsHablar(); });
  /* v15 (pedido de Luis): Bugs ya NO espera a que se escriba el nombre: entra caminando UNA vez apenas se despliega el formulario
     (cuando su animación de entrada ya bajó, como tarde a los BUGS.esperaMax ms; si tarda más usa la URL directa). Al cerrar y volver
     a abrir el formulario sigue ahí, en reposo; no vuelve a entrar. */
  function bugsAlAbrir() {
    if (bugsEstado !== 'fuera') return;
    var bajada = Promise.race([bugsBlob.entra || Promise.resolve(), new Promise(function (r) { setTimeout(r, BUGS.esperaMax); })]);
    // espera también a que termine la subida de la hoja (animación «subir» .3s): durante la subida
    // getBoundingClientRect da la hoja aún abajo y Bugs quedaría pegado al borde inferior
    var subida = new Promise(function (r) {
      var hecho = false, fin = function () { if (!hecho) { hecho = true; hoja.removeEventListener('animationend', fin); r(); } };
      hoja.addEventListener('animationend', fin); setTimeout(fin, 360);
    });
    Promise.all([bajada.catch(function () {}), window.__jahsehWebp || Promise.resolve(true), subida]).then(function (r) {
      bugsOk = !!r[1];
      if (!caja.hidden && !form.hidden) bugsEntrar();
    });
  }
  if (window.ResizeObserver) new ResizeObserver(bugsAcomodar).observe(hoja);
  hoja.addEventListener('animationend', bugsAcomodar);
  window.addEventListener('resize', bugsAcomodar);
  if (window.__jahsehWebp) window.__jahsehWebp.then(function (ok) { bugsOk = !!ok; });

  function abrir() {
    form.hidden = false; listo.hidden = true;
    caja.hidden = false; document.body.classList.add('rsvp-open');
    hoja.scrollTop = 0; ajustarAlto(); bugsPrecarga(); bugsAcomodar(); bugsAlAbrir();
    setTimeout(function () { try { nombre.focus({ preventScroll: true }); } catch (e) {} }, 320);
  }
  function cerrar() { caja.hidden = true; document.body.classList.remove('rsvp-open'); ajustarAlto(); }
  function parar(e) { e.stopPropagation(); }
  $('#confirmarBtn').addEventListener('click', function (e) { e.stopPropagation(); abrir(); });
  $('#rsvpCerrar').addEventListener('click', cerrar);
  $('#rsvpFondo').addEventListener('click', cerrar);
  $('#rsvpEditar').addEventListener('click', function () { form.hidden = false; listo.hidden = true; hoja.scrollTop = 0; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !caja.hidden) cerrar(); });
  ['click', 'touchstart', 'touchend'].forEach(function (t) { caja.addEventListener(t, parar, { passive: true }); });

  /* ---------- validación ---------- */
  function nombres(tipo) {
    var out = [];
    for (var i = 1; i <= cuenta[tipo]; i++) {
      var inp = $('#' + (tipo === 'adulto' ? 'nomAdulto' : 'nomNino') + i);
      out.push(limpio(inp ? inp.value : ''));
    }
    return out;
  }
  function validar(asiste) {
    errNombre.textContent = ''; limpiarErr(); nombre.classList.remove('mal');
    var nom = limpio(nombre.value);
    if (!nom) {
      nombre.classList.add('mal');
      errNombre.textContent = 'Escribe tu nombre, por favor.';
      errGeneral.textContent = 'Falta tu nombre para poder confirmar.';
      try { nombre.focus({ preventScroll: true }); } catch (e) {}
      verCampo(nombre);
      return null;
    }
    if (!asiste) return { nombre: nom, asiste: false, adultos: 0, ninos: 0, total: 0, nombresAdultos: [], nombresNinos: [] };
    if (cuenta.adulto + cuenta.nino < 1) {
      errCantidad.textContent = 'Toca «+» para indicar cuántos adultos y niños asistirán.';
      errGeneral.textContent = 'Indica cuántas personas asistirán.';
      verCampo($('.rsvp-conts'));
      return null;
    }
    return { nombre: nom, asiste: true, adultos: cuenta.adulto, ninos: cuenta.nino, total: cuenta.adulto + cuenta.nino,
             nombresAdultos: nombres('adulto'), nombresNinos: nombres('nino') };
  }

  /* ---------- mensaje de WhatsApp ---------- */
  function listaTxt(arr) {
    return arr.map(function (n, i) { return '  ' + (i + 1) + '. ' + (n || '(sin nombre)'); }).join('\n');
  }
  function mensaje(d) {
    if (!d.asiste) {
      return '¡Hola! 💙 Soy ' + d.nombre + '. Lamentablemente no podré asistir al primer añito de Jahseh Anthony ' +
        'el sábado 28 de noviembre. ¡Le mando un abrazo enorme y muchas felicidades!';
    }
    var t = '¡Hola! 🎉 Confirmo mi asistencia al primer añito de Jahseh Anthony 💙\n\n' +
      'Invitado: ' + d.nombre + '\n\n' +
      'Adultos: ' + d.adultos + (d.adultos ? '\n' + listaTxt(d.nombresAdultos) : '') + '\n\n' +
      'Niños: ' + d.ninos + (d.ninos ? '\n' + listaTxt(d.nombresNinos) : '') + '\n\n' +
      'Total de personas: ' + d.total + '\n\n' +
      '¡Nos vemos el sábado 28 de noviembre a las 10:00 a. m.!';
    return t;
  }

  function guardarEnHoja(d) {
    if (!HOJA) return;
    var datos = {
      fecha: new Date().toISOString(),
      nombre: d.nombre,
      adultos: d.adultos,
      ninos: d.ninos,
      total: d.total,
      nombres_adultos: d.nombresAdultos.map(function (n) { return n || '(sin nombre)'; }).join(', '),
      nombres_ninos: d.nombresNinos.map(function (n) { return n || '(sin nombre)'; }).join(', '),
      personas: d.total,                         // compatibilidad con la hoja anterior
      asiste: d.asiste ? 'Sí' : 'No'
    };
    window.__rsvp.envios.push(datos);
    try {
      fetch(HOJA, { method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(datos) })
        .catch(function () {});
    } catch (e) {}
  }

  function enviar(asiste) {
    var d = validar(asiste);
    if (!d) return;
    guardarEnHoja(d);                                   // 1) guarda la fila en la hoja (si hay URL)
    var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje(d));
    window.__rsvp.whatsapp.push(url);
    window.open(url, '_blank', 'noopener');             // 2) abre WhatsApp dentro del mismo toque
    $('#rsvpReabrir').href = url;
    $('#rsvpListoTit').innerHTML = (asiste ? '¡Gracias por confirmar!' : '¡Gracias por avisar!') + ' <span aria-hidden="true">💙</span>';
    $('#rsvpListoTxt').textContent = 'Se abrió WhatsApp con tu mensaje para mamá. Solo toca «Enviar» en WhatsApp. ' +
      'Si no se abrió, toca el botón de abajo.';
    form.hidden = true; listo.hidden = false; hoja.scrollTop = 0;
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); enviar(true); });
  $('#rsvpNoVoy').addEventListener('click', function () { enviar(false); });

  pintar();
  window.__rsvp.cuenta = cuenta;
})();
