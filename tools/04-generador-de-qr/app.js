/* Día 04 · Generador de códigos QR — 100% en el navegador (qrcode-generator, MIT, incluido en vendor/). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
  var qrbox = $('qrbox'), statusEl = $('status'), summaryEl = $('summary');
  var pngBtn = $('pngBtn'), svgBtn = $('svgBtn'), copyBtn = $('copyBtn');
  var fg = $('fg'), bg = $('bg'), ecl = $('ecl'), sizeSel = $('size'), margin = $('margin'), marginVal = $('marginVal');

  if (typeof qrcode !== 'function') {
    statusEl.textContent = 'No se pudo cargar el generador de QR.';
    statusEl.className = 'status status--error';
    return;
  }
  // Codificar como UTF-8 para que tildes, ñ y emojis se lean bien.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  var type = 'url';
  var current = null; // { qr, payload, count }
  var timer = null;

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' status--' + kind : '');
  }
  function setButtons(on) { pngBtn.disabled = svgBtn.disabled = copyBtn.disabled = !on; }

  // ---------- Construcción del contenido ----------
  function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }

  function buildPayload() {
    var v;
    switch (type) {
      case 'url':
        v = $('url').value.trim();
        if (!v) return { error: 'Escribe una dirección web.' };
        if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
        return { data: v };
      case 'text':
        v = $('text').value;
        if (!v.trim()) return { error: 'Escribe algún texto.' };
        return { data: v };
      case 'wifi':
        var ssid = $('ssid').value, sec = $('security').value, pass = $('wifiPass').value;
        if (!ssid) return { error: 'Escribe el nombre de la red (SSID).' };
        if (sec !== 'nopass' && !pass) return { error: 'Escribe la contraseña de la red o elige «Sin contraseña».' };
        var w = 'WIFI:T:' + sec + ';S:' + wifiEscape(ssid) + ';';
        if (sec !== 'nopass') w += 'P:' + wifiEscape(pass) + ';';
        if ($('hidden').checked) w += 'H:true;';
        return { data: w + ';', mask: sec !== 'nopass' ? pass : null };
      case 'email':
        var to = $('mailTo').value.trim(), sub = $('mailSubject').value, body = $('mailBody').value;
        if (!to) return { error: 'Escribe el correo de destino.' };
        var q = [];
        if (sub) q.push('subject=' + encodeURIComponent(sub));
        if (body) q.push('body=' + encodeURIComponent(body));
        return { data: 'mailto:' + to + (q.length ? '?' + q.join('&') : '') };
      case 'tel':
        var raw = $('telNum').value.trim(), mode = $('telMode').value, msg = $('telMsg').value;
        var num = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
        if (num.replace('+', '').length < 3) return { error: 'Escribe un número de teléfono válido.' };
        if (mode === 'tel') return { data: 'tel:' + num };
        if (mode === 'sms') return { data: 'SMSTO:' + num + ':' + msg };
        return { data: 'https://wa.me/' + num.replace('+', '') + (msg ? '?text=' + encodeURIComponent(msg) : '') };
    }
    return { error: 'Tipo desconocido.' };
  }

  // ---------- Contraste ----------
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(h) {
    var c = hexToRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrastNote() {
    var lf = lum(fg.value), lb = lum(bg.value);
    var ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    if (ratio < 3) return 'Poco contraste entre colores (' + ratio.toFixed(1) + ':1); algunos lectores no lo leerán.';
    if (lf > lb) return 'Código más claro que el fondo: hay lectores que no leen QR invertidos.';
    return '';
  }

  // ---------- Render ----------
  function render() {
    var p = buildPayload();
    marginVal.textContent = margin.value;
    if (p.error) {
      current = null; setButtons(false); summaryEl.hidden = true;
      qrbox.innerHTML = '<div class="placeholder">' + p.error + '</div>';
      setStatus('');
      return;
    }
    var qr;
    try {
      qr = qrcode(0, ecl.value);
      qr.addData(p.data, 'Byte');
      qr.make();
    } catch (e) {
      current = null; setButtons(false); summaryEl.hidden = true;
      qrbox.innerHTML = '<div class="placeholder">El contenido es demasiado largo para un código QR.</div>';
      setStatus('Contenido demasiado largo: acórtalo o baja la corrección de errores a «L».', 'error');
      return;
    }
    var count = qr.getModuleCount();
    current = { qr: qr, payload: p.data, count: count };
    var canvas = drawCanvas(Math.min(Number(sizeSel.value), 768));
    canvas.id = 'qrCanvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Código QR generado');
    qrbox.innerHTML = '';
    qrbox.appendChild(canvas);
    setButtons(true);

    var bytes = new TextEncoder().encode(p.data).length;
    var shown = p.mask ? p.data.split(wifiEscape(p.mask)).join('•'.repeat(Math.min(p.mask.length, 12))) : p.data;
    var full = drawSize();
    summaryEl.hidden = false;
    summaryEl.innerHTML = '<b>Versión</b> ' + ((count - 17) / 4) + ' · ' + count + '×' + count + ' módulos · ' + bytes + ' bytes · PNG ' + full + '×' + full + ' px\n';
    summaryEl.appendChild(document.createTextNode(shown));
    var note = contrastNote();
    setStatus(note || 'Listo. Escanéalo con la cámara de tu celular para probarlo.', note ? 'warn' : 'ok');
  }

  function cellFor(target) {
    var total = current.count + 2 * Number(margin.value);
    return Math.max(1, Math.ceil(target / total));
  }
  function drawSize() { return cellFor(Number(sizeSel.value)) * (current.count + 2 * Number(margin.value)); }

  function drawCanvas(target) {
    var m = Number(margin.value), n = current.count, cell = cellFor(target);
    var dim = cell * (n + 2 * m);
    var c = document.createElement('canvas');
    c.width = c.height = dim;
    var ctx = c.getContext('2d');
    ctx.fillStyle = bg.value; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = fg.value;
    for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) {
      if (current.qr.isDark(r, col)) ctx.fillRect((col + m) * cell, (r + m) * cell, cell, cell);
    }
    return c;
  }

  function buildSvg() {
    var m = Number(margin.value), n = current.count, dim = n + 2 * m, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (current.qr.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
    }
    var px = Number(sizeSel.value);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' + bg.value + '"/>' +
      '<path fill="' + fg.value + '" d="' + d + '"/></svg>\n';
  }

  function fileBase() {
    var d = new Date(), pad = function (x) { return String(x).padStart(2, '0'); };
    return 'qr-' + type + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function pngBlob() {
    return new Promise(function (res) { drawCanvas(Number(sizeSel.value)).toBlob(res, 'image/png'); });
  }

  pngBtn.addEventListener('click', function () {
    if (!current) return;
    pngBlob().then(function (b) { download(b, fileBase() + '.png'); setStatus('PNG descargado.', 'ok'); });
  });
  svgBtn.addEventListener('click', function () {
    if (!current) return;
    download(new Blob([buildSvg()], { type: 'image/svg+xml' }), fileBase() + '.svg');
    setStatus('SVG descargado.', 'ok');
  });
  copyBtn.addEventListener('click', function () {
    if (!current) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      setStatus('Tu navegador no permite copiar imágenes; usa «PNG».', 'warn'); return;
    }
    pngBlob().then(function (b) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    }).then(function () { setStatus('Imagen copiada al portapapeles.', 'ok'); })
      .catch(function () { setStatus('No se pudo copiar; usa «PNG».', 'warn'); });
  });

  // ---------- Eventos ----------
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 120); }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      type = t.getAttribute('data-type');
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== type; });
      render();
    });
  });
  document.querySelectorAll('input, textarea, select').forEach(function (el) {
    el.addEventListener('input', schedule);
    el.addEventListener('change', schedule);
  });
  $('telMode').addEventListener('change', function () { $('telMsgField').hidden = this.value === 'tel'; });
  $('security').addEventListener('change', function () { $('wifiPass').disabled = this.value === 'nopass'; });
  $('togglePw').addEventListener('click', function () {
    var i = $('wifiPass'), show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    this.textContent = show ? 'Ocultar' : 'Ver';
  });

  render();
})();
