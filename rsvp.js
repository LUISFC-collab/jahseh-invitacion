/* =====================================================================
   Confirmación de asistencia (pantalla 7 · Lola)
   URL_HOJA: pega aquí la URL de la aplicación web de Google Apps Script
   (termina en /exec). Si queda vacía, solo se abre WhatsApp.
   ===================================================================== */
var URL_HOJA = '';

(function () {
  'use strict';
  var WHATSAPP = '51941562413';           // solo el WhatsApp de mamá
  var MAX_PERSONAS = 10;
  var HOJA = window.__URL_HOJA_PRUEBA || URL_HOJA;   // __URL_HOJA_PRUEBA solo se usa en pruebas locales

  var $ = function (s) { return document.querySelector(s); };
  var caja = $('#rsvp'), form = $('#rsvpForm'), listo = $('#rsvpListo');
  var nombre = $('#rsvpNombre'), cantidad = $('#rsvpCantidad');
  var errNombre = $('#errNombre'), errGeneral = $('#errGeneral');
  window.__rsvp = { envios: [], whatsapp: [] };

  for (var i = 1; i <= MAX_PERSONAS; i++) {
    var o = document.createElement('option'); o.value = i;
    o.textContent = i === 1 ? '1 persona (solo yo)' : i + ' personas';
    cantidad.appendChild(o);
  }
  cantidad.value = '1';

  nombre.addEventListener('input', limpiar);
  function limpiar(e) { e.target.classList.remove('mal'); var s = e.target.parentNode.querySelector('.rsvp-error'); if (s) s.textContent = ''; errGeneral.textContent = ''; }

  function abrir() {
    form.hidden = false; listo.hidden = true;
    caja.hidden = false; document.body.classList.add('rsvp-open');
    setTimeout(function () { try { nombre.focus({ preventScroll: true }); } catch (e) {} }, 320);
  }
  function cerrar() { caja.hidden = true; document.body.classList.remove('rsvp-open'); }
  function parar(e) { e.stopPropagation(); }
  $('#confirmarBtn').addEventListener('click', function (e) { e.stopPropagation(); abrir(); });
  $('#rsvpCerrar').addEventListener('click', cerrar);
  $('#rsvpFondo').addEventListener('click', cerrar);
  $('#rsvpEditar').addEventListener('click', function () { form.hidden = false; listo.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !caja.hidden) cerrar(); });
  ['click', 'touchstart', 'touchend'].forEach(function (t) { caja.addEventListener(t, parar, { passive: true }); });

  function marcar(inp, msg) { inp.classList.add('mal'); inp.parentNode.querySelector('.rsvp-error').textContent = msg; }
  function limpio(s) { return s.replace(/\s+/g, ' ').trim(); }

  function validar(asiste) {
    errNombre.textContent = ''; errGeneral.textContent = ''; nombre.classList.remove('mal');
    var nom = limpio(nombre.value);
    if (!nom) {
      marcar(nombre, 'Escribe tu nombre, por favor.');
      errGeneral.textContent = 'Falta tu nombre para poder confirmar.';
      try { nombre.focus({ preventScroll: true }); } catch (e) {}
      nombre.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return null;
    }
    var n = parseInt(cantidad.value, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > MAX_PERSONAS) n = MAX_PERSONAS;
    return { nombre: nom, personas: asiste ? n : 0, asiste: asiste };
  }

  function mensaje(d) {
    if (!d.asiste) {
      return '¡Hola! 💙 Soy ' + d.nombre + '. Lamentablemente no podré asistir al primer añito de JAHSEH ANTHONY ' +
        'el sábado 28 de noviembre. ¡Le mando un abrazo enorme y muchas felicidades!';
    }
    return '¡Hola! 🎉 Confirmo mi asistencia al primer añito de JAHSEH ANTHONY 💙\n\n' +
      'Invitado: ' + d.nombre + '\n' +
      'Número de personas: ' + d.personas + '\n\n' +
      '¡Nos vemos el sábado 28 de noviembre a las 10:00 a. m.!';
  }

  function guardarEnHoja(d) {
    if (!HOJA) return;
    var datos = {
      fecha: new Date().toISOString(),
      nombre: d.nombre,
      personas: d.personas,
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
    var w = window.open(url, '_blank', 'noopener');     // 2) abre WhatsApp dentro del mismo toque
    $('#rsvpReabrir').href = url;
    $('#rsvpListoTit').innerHTML = (asiste ? '¡Gracias por confirmar!' : '¡Gracias por avisar!') + ' <span aria-hidden="true">💙</span>';
    $('#rsvpListoTxt').textContent = 'Se abrió WhatsApp con tu mensaje para mamá. Solo toca «Enviar» en WhatsApp. ' +
      'Si no se abrió, toca el botón de abajo.';
    form.hidden = true; listo.hidden = false;
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); enviar(true); });
  $('#rsvpNoVoy').addEventListener('click', function () { enviar(false); });
})();
