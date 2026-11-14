/* Día 06 · Codificador y decodificador Base64 — 100% en el navegador, JavaScript puro. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var plain = $('plain'), b64 = $('b64'), statusEl = $('status');
  var urlSafe = $('urlSafe'), noPad = $('noPad'), wrap76 = $('wrap76'), live = $('live');
  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8', { fatal: true });

  // ---------- Núcleo ----------
  function bytesToB64(bytes) {
    var CH = 0x8000, s = '';
    for (var i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function B64Error(msg) { this.message = msg; }

  // Acepta estándar y URL-safe, con o sin relleno, con espacios/saltos de línea.
  function b64ToBytes(str) {
    var s = String(str).replace(/[\s]+/g, '');
    if (!s) return new Uint8Array(0);
    var bad = /[^A-Za-z0-9+/=_-]/.exec(s);
    if (bad) throw new B64Error('Carácter no válido en Base64: «' + bad[0] + '» (posición ' + (bad.index + 1) + ').');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    var eq = s.indexOf('=');
    if (eq !== -1 && /[^=]/.test(s.slice(eq))) throw new B64Error('Hay relleno «=» en medio del texto; solo puede ir al final.');
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) throw new B64Error('Longitud inválida: al Base64 le sobra o le falta un carácter.');
    while (s.length % 4) s += '=';
    var bin;
    try { bin = atob(s); } catch (e) { throw new B64Error('No es Base64 válido.'); }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function applyOptions(s) {
    if (urlSafe.checked) s = s.replace(/\+/g, '-').replace(/\//g, '_');
    if (noPad.checked) s = s.replace(/=+$/, '');
    if (wrap76.checked) s = s.replace(/(.{76})(?=.)/g, '$1\n');
    return s;
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' status--' + kind : '');
  }

  function updateMeta() {
    $('plainMeta').textContent = plain.value.length + ' caracteres · ' + enc.encode(plain.value).length + ' bytes';
    $('b64Meta').textContent = b64.value.replace(/\s/g, '').length + ' caracteres';
  }

  // ---------- Texto ----------
  function encodeText() {
    var bytes = enc.encode(plain.value);
    b64.value = applyOptions(bytesToB64(bytes));
    updateMeta();
    setStatus(statusEl, plain.value ? '✓ Codificado: ' + fmtBytes(bytes.length) + ' → ' + b64.value.replace(/\s/g, '').length + ' caracteres Base64.' : '', 'ok');
  }

  function decodeText() {
    try {
      var bytes = b64ToBytes(b64.value);
      var text;
      try { text = dec.decode(bytes); }
      catch (e) {
        plain.value = '';
        updateMeta();
        setStatus(statusEl, '⚠ El Base64 es válido pero no contiene texto UTF‑8 (' + fmtBytes(bytes.length) + ' binarios). Usa la pestaña «Archivos» para reconstruirlo.', 'warn');
        return;
      }
      plain.value = text;
      updateMeta();
      setStatus(statusEl, b64.value.trim() ? '✓ Decodificado: ' + fmtBytes(bytes.length) + ' de texto UTF‑8.' : '', 'ok');
    } catch (e) {
      updateMeta();
      setStatus(statusEl, '✗ ' + (e.message || 'Error al decodificar.'), 'error');
    }
  }

  var lastEdited = 'plain', timer = null;
  function schedule(fn) { if (!live.checked) return; clearTimeout(timer); timer = setTimeout(fn, 150); }
  plain.addEventListener('input', function () { lastEdited = 'plain'; updateMeta(); schedule(encodeText); });
  b64.addEventListener('input', function () { lastEdited = 'b64'; updateMeta(); schedule(decodeText); });
  [urlSafe, noPad, wrap76].forEach(function (c) {
    c.addEventListener('change', function () { if (plain.value) encodeText(); });
  });
  $('encodeBtn').addEventListener('click', function () { lastEdited = 'plain'; encodeText(); });
  $('decodeBtn').addEventListener('click', function () { lastEdited = 'b64'; decodeText(); });
  $('swapBtn').addEventListener('click', function () {
    var a = plain.value; plain.value = b64.value; b64.value = a; updateMeta();
    setStatus(statusEl, 'Contenido intercambiado.', '');
  });
  $('sampleBtn').addEventListener('click', function () {
    plain.value = '¡Hola, mundo! Programar en español: ñandú, café ☕ y cohetes 🚀';
    encodeText();
  });
  $('clearBtn').addEventListener('click', function () { plain.value = ''; b64.value = ''; updateMeta(); setStatus(statusEl, ''); });

  function copy(text, el, btn) {
    if (!text) return;
    var done = function () { var t = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(function () { btn.textContent = t; }, 1200); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta);
    }
  }
  $('copyPlain').addEventListener('click', function () { copy(plain.value, plain, this); });
  $('copyB64').addEventListener('click', function () { copy(b64.value, b64, this); });

  // ---------- Pestañas ----------
  var tabs = [['tabText', 'panelText'], ['tabFile', 'panelFile']];
  tabs.forEach(function (pair) {
    $(pair[0]).addEventListener('click', function () {
      tabs.forEach(function (p) {
        var on = p[0] === pair[0];
        $(p[0]).setAttribute('aria-selected', on ? 'true' : 'false');
        $(p[1]).hidden = !on;
      });
    });
  });

  // ---------- Archivo → Base64 ----------
  var fileStatus = $('fileStatus'), fileOut = $('fileOut'), asDataUri = $('asDataUri');
  var current = null; // { name, type, b64 }

  function renderFileOut() {
    if (!current) return;
    fileOut.value = asDataUri.checked ? 'data:' + (current.type || 'application/octet-stream') + ';base64,' + current.b64 : current.b64;
    $('copyFile').disabled = false; $('dlTxt').disabled = false;
  }

  function handleFile(f) {
    if (!f) return;
    if (f.size > 50 * 1048576) { setStatus(fileStatus, '✗ El archivo supera 50 MB; es demasiado grande para Base64 en el navegador.', 'error'); return; }
    setStatus(fileStatus, 'Leyendo ' + f.name + '…', '');
    f.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      current = { name: f.name, type: f.type, b64: bytesToB64(bytes) };
      $('fileInfo').textContent = f.name + ' · ' + (f.type || 'tipo desconocido') + ' · ' + fmtBytes(f.size) + ' → ' + fmtBytes(current.b64.length) + ' en Base64 (+' + (f.size ? Math.round((current.b64.length / f.size - 1) * 100) : 0) + '%)';
      renderFileOut();
      setStatus(fileStatus, '✓ Archivo codificado.', 'ok');
    }, function () { setStatus(fileStatus, '✗ No se pudo leer el archivo.', 'error'); });
  }
  $('file').addEventListener('change', function () { handleFile(this.files[0]); this.value = ''; });
  asDataUri.addEventListener('change', renderFileOut);
  var dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
  dz.addEventListener('drop', function (e) { handleFile(e.dataTransfer.files[0]); });
  $('copyFile').addEventListener('click', function () { copy(fileOut.value, fileOut, this); });
  $('dlTxt').addEventListener('click', function () {
    if (!current) return;
    download(new Blob([fileOut.value], { type: 'text/plain' }), current.name + '.base64.txt');
  });

  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // ---------- Base64 → Archivo ----------
  var SIGS = [
    [[0x89, 0x50, 0x4E, 0x47], 'image/png', 'png'],
    [[0xFF, 0xD8, 0xFF], 'image/jpeg', 'jpg'],
    [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
    [[0x25, 0x50, 0x44, 0x46], 'application/pdf', 'pdf'],
    [[0x50, 0x4B, 0x03, 0x04], 'application/zip', 'zip'],
    [[0x42, 0x4D], 'image/bmp', 'bmp'],
    [[0x1F, 0x8B], 'application/gzip', 'gz'],
    [[0x49, 0x44, 0x33], 'audio/mpeg', 'mp3'],
    [[0x4F, 0x67, 0x67, 0x53], 'audio/ogg', 'ogg'],
    [[0x77, 0x4F, 0x46, 0x32], 'font/woff2', 'woff2'],
    [[0x00, 0x00, 0x01, 0x00], 'image/x-icon', 'ico']
  ];
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
    'application/pdf': 'pdf', 'application/json': 'json', 'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css',
    'application/zip': 'zip', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'image/bmp': 'bmp', 'font/woff2': 'woff2' };

  function sniff(b) {
    for (var i = 0; i < SIGS.length; i++) {
      var sig = SIGS[i][0], ok = b.length >= sig.length;
      for (var j = 0; ok && j < sig.length; j++) if (b[j] !== sig[j]) ok = false;
      if (ok) return { type: SIGS[i][1], ext: SIGS[i][2] };
    }
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' };
    if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return { type: 'video/mp4', ext: 'mp4' };
    try {
      var t = dec.decode(b.subarray(0, Math.min(b.length, 4096)));
      if (/^\s*<svg[\s>]/i.test(t) || /^\s*<\?xml[^>]*>\s*<svg/i.test(t)) return { type: 'image/svg+xml', ext: 'svg' };
      if (/^\s*[{\[]/.test(t)) return { type: 'application/json', ext: 'json' };
      return { type: 'text/plain', ext: 'txt' };
    } catch (e) { /* binario */ }
    return { type: 'application/octet-stream', ext: 'bin' };
  }

  var dlFile = $('dlFile'), preview = $('preview'), lastUrl = null;
  $('buildBtn').addEventListener('click', function () {
    var raw = $('fileIn').value.trim(), type = '';
    dlFile.hidden = true; preview.hidden = true;
    if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
    if (!raw) { setStatus(fileStatus, 'Pega primero un texto Base64 o un Data URI.', 'warn'); return; }
    var m = /^data:([^;,]*)(?:;[^,]*?)?(;base64)?,/i.exec(raw);
    if (m) {
      if (!m[2]) { setStatus(fileStatus, '✗ El Data URI no está en Base64 (falta «;base64»).', 'error'); return; }
      type = m[1].toLowerCase(); raw = raw.slice(m[0].length);
    }
    var bytes;
    try { bytes = b64ToBytes(raw); } catch (e) { setStatus(fileStatus, '✗ ' + e.message, 'error'); return; }
    var guess = sniff(bytes);
    if (!type) type = guess.type;
    var ext = EXT[type] || guess.ext;
    var name = ($('outName').value.trim() || 'archivo').replace(/[\\/:*?"<>|]+/g, '_');
    if (!/\.[a-z0-9]{1,5}$/i.test(name)) name += '.' + ext;
    var blob = new Blob([bytes], { type: type });
    lastUrl = URL.createObjectURL(blob);
    dlFile.href = lastUrl; dlFile.download = name; dlFile.hidden = false;
    dlFile.textContent = '⬇ Descargar ' + name;
    $('buildInfo').textContent = name + ' · ' + type + ' · ' + fmtBytes(bytes.length);
    if (/^image\//.test(type)) { preview.src = lastUrl; preview.hidden = false; }
    setStatus(fileStatus, '✓ Archivo reconstruido (' + fmtBytes(bytes.length) + ').', 'ok');
  });

  updateMeta();
})();
