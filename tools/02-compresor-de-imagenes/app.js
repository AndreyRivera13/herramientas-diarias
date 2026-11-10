/* Día 02 · Compresor de imágenes — 100% en el navegador (Canvas + toBlob). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var dropzone = $('dropzone'), fileInput = $('fileInput'), browseBtn = $('browseBtn');
  var formatSel = $('format'), quality = $('quality'), qualityVal = $('qualityVal'), maxWidthInput = $('maxWidth');
  var compressBtn = $('compressBtn'), zipBtn = $('zipBtn'), clearBtn = $('clearBtn');
  var statusEl = $('status'), summaryEl = $('summary'), list = $('list');

  var EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
  var items = []; // { file, origUrl, el, result: { blob, url, name, width, height } }
  var busy = false;

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' status--' + kind : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function baseName(name) { return name.replace(/\.[^.]+$/, '') || 'imagen'; }
  function updateButtons() {
    var has = items.length > 0;
    compressBtn.disabled = busy || !has;
    clearBtn.disabled = busy || !has;
    zipBtn.disabled = busy || !items.some(function (it) { return it.result; });
  }
  function syncQuality() {
    qualityVal.textContent = formatSel.value === 'image/png' ? '—' : quality.value;
    quality.disabled = formatSel.value === 'image/png';
  }

  // Comprobar soporte de WebP en toBlob
  (function checkWebp() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 1;
      if (c.toDataURL('image/webp').indexOf('data:image/webp') !== 0) {
        var opt = formatSel.querySelector('option[value="image/webp"]');
        opt.disabled = true; opt.textContent = 'WebP (no soportado en este navegador)';
      }
    } catch (_) {}
  })();

  function addFiles(fileList) {
    var added = 0, skipped = 0;
    Array.prototype.forEach.call(fileList || [], function (file) {
      if (!file.type || file.type.indexOf('image/') !== 0) { skipped++; return; }
      var it = { file: file, origUrl: URL.createObjectURL(file), result: null };
      it.el = document.createElement('div');
      it.el.className = 'item';
      items.push(it);
      list.appendChild(it.el);
      renderItem(it);
      added++;
    });
    if (added) setStatus(items.length + ' imagen(es) lista(s). Ajusta las opciones y pulsa “Comprimir”.');
    if (skipped) setStatus((added ? added + ' añadida(s). ' : '') + skipped + ' archivo(s) ignorado(s): no son imágenes.', added ? '' : 'error');
    updateButtons();
    if (added && !busy) compressAll();
  }

  function renderItem(it) {
    var r = it.result, f = it.file;
    var html = '<div class="head"><span class="name">' + esc(f.name) + '</span>';
    if (r) {
      var pct = (1 - r.blob.size / f.size) * 100;
      var good = pct > 0;
      html += '<span class="saved ' + (good ? 'good' : 'bad') + '">' +
        (good ? '−' + pct.toFixed(1) + '% ahorrado' : '+' + Math.abs(pct).toFixed(1) + '% más grande') + '</span>';
    } else if (it.error) {
      html += '<span class="saved bad">Error</span>';
    } else {
      html += '<span class="saved good">Procesando…</span>';
    }
    html += '</div>';
    html += '<figure><img alt="Original" src="' + it.origUrl + '" /><figcaption>Original · ' + fmtBytes(f.size) +
      (it.origW ? ' · ' + it.origW + '×' + it.origH : '') + '</figcaption></figure>';
    if (r) {
      html += '<figure><img alt="Comprimida" src="' + r.url + '" /><figcaption>Comprimida · ' + fmtBytes(r.blob.size) +
        ' · ' + r.width + '×' + r.height + ' · ' + EXT[r.blob.type].toUpperCase() + '</figcaption></figure>';
      html += '<div class="dl"><a class="btn ghost" href="' + r.url + '" download="' + esc(r.name) + '">⬇ Descargar ' + esc(r.name) + '</a>';
      if (r.blob.size >= f.size) html += '<span class="note">Esta imagen ya estaba bien optimizada: prueba menor calidad, otro formato o un ancho máximo.</span>';
      html += '</div>';
    } else if (it.error) {
      html += '<figure><figcaption style="color:var(--danger)">' + esc(it.error) + '</figcaption></figure>';
    } else {
      html += '<figure><figcaption>…</figcaption></figure>';
    }
    it.el.innerHTML = html;
  }

  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return loadViaImg(file); });
    }
    return loadViaImg(file);
  }
  function loadViaImg(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen (formato no soportado o archivo dañado).')); };
      img.src = url;
    });
  }

  function compressFile(file, opts) {
    return loadImage(file).then(function (src) {
      var w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
      var w = w0, h = h0;
      if (opts.maxWidth && w0 > opts.maxWidth) {
        w = Math.round(opts.maxWidth);
        h = Math.max(1, Math.round(h0 * (w / w0)));
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (opts.type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); } // JPEG no tiene transparencia
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h);
      if (src.close) try { src.close(); } catch (_) {}
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('El navegador no pudo generar la imagen.'));
          if (blob.type !== opts.type) return reject(new Error('Este navegador no soporta exportar a ' + EXT[opts.type].toUpperCase() + '.'));
          resolve({ blob: blob, width: w, height: h, origW: w0, origH: h0 });
        }, opts.type, opts.type === 'image/png' ? undefined : opts.quality);
      });
    });
  }

  function currentOpts() {
    var mw = parseInt(maxWidthInput.value, 10);
    return {
      type: formatSel.value,
      quality: Math.min(1, Math.max(0.01, parseInt(quality.value, 10) / 100)),
      maxWidth: mw > 0 ? mw : 0
    };
  }

  function compressAll() {
    if (busy || !items.length) return Promise.resolve();
    busy = true; updateButtons();
    var opts = currentOpts();
    var done = 0, errors = 0;
    setStatus('Comprimiendo 0/' + items.length + '…');
    var chain = Promise.resolve();
    items.slice().forEach(function (it) {
      chain = chain.then(function () {
        if (it.result) { URL.revokeObjectURL(it.result.url); it.result = null; }
        it.error = null; renderItem(it);
        return compressFile(it.file, opts).then(function (res) {
          it.origW = res.origW; it.origH = res.origH;
          it.result = {
            blob: res.blob, width: res.width, height: res.height,
            url: URL.createObjectURL(res.blob),
            name: baseName(it.file.name) + '-comprimida.' + EXT[res.blob.type]
          };
        }).catch(function (e) { errors++; it.error = e && e.message ? e.message : String(e); })
          .then(function () { done++; renderItem(it); setStatus('Comprimiendo ' + done + '/' + items.length + '…'); });
      });
    });
    return chain.then(function () {
      busy = false; updateButtons(); renderSummary();
      if (errors) setStatus('Listo con ' + errors + ' error(es). Revisa los archivos marcados.', 'error');
      else setStatus('¡Listo! ' + done + ' imagen(es) comprimida(s).', 'ok');
    });
  }

  function renderSummary() {
    var ok = items.filter(function (it) { return it.result; });
    if (!ok.length) { summaryEl.hidden = true; return; }
    var a = 0, b = 0;
    ok.forEach(function (it) { a += it.file.size; b += it.result.blob.size; });
    var pct = (1 - b / a) * 100;
    summaryEl.hidden = false;
    summaryEl.innerHTML = 'Total: ' + fmtBytes(a) + ' → <b>' + fmtBytes(b) + '</b> · ' +
      (pct >= 0 ? 'ahorro <b>' + pct.toFixed(1) + '%</b>' : 'aumento ' + Math.abs(pct).toFixed(1) + '%');
  }

  /* ---------- ZIP (modo "store", sin compresión: las imágenes ya están comprimidas) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files) { // files: [{ name, data: Uint8Array }]
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function uniqueNames(names) {
    var seen = {};
    return names.map(function (n) {
      if (!seen[n]) { seen[n] = 1; return n; }
      var i = ++seen[n], m = n.match(/^(.*?)(\.[^.]+)?$/);
      return m[1] + '-' + i + (m[2] || '');
    });
  }
  function buildZip() {
    var ok = items.filter(function (it) { return it.result; });
    var names = uniqueNames(ok.map(function (it) { return it.result.name; }));
    return Promise.all(ok.map(function (it) { return it.result.blob.arrayBuffer(); })).then(function (bufs) {
      return makeZip(bufs.map(function (b, i) { return { name: names[i], data: new Uint8Array(b) }; }));
    });
  }

  /* ---------- Eventos ---------- */
  browseBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('is-dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('is-dragover'); });
  });
  dropzone.addEventListener('drop', function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  quality.addEventListener('input', syncQuality);
  formatSel.addEventListener('change', syncQuality);
  compressBtn.addEventListener('click', compressAll);
  clearBtn.addEventListener('click', function () {
    items.forEach(function (it) { URL.revokeObjectURL(it.origUrl); if (it.result) URL.revokeObjectURL(it.result.url); });
    items = []; list.innerHTML = ''; summaryEl.hidden = true; setStatus(''); updateButtons();
  });
  zipBtn.addEventListener('click', function () {
    zipBtn.disabled = true;
    setStatus('Creando ZIP…');
    buildZip().then(function (zip) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(zip); a.download = 'imagenes-comprimidas.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      setStatus('ZIP descargado (' + fmtBytes(zip.size) + ').', 'ok');
    }).catch(function (e) { setStatus('No se pudo crear el ZIP: ' + e.message, 'error'); })
      .then(updateButtons);
  });

  syncQuality();
  // Expuesto para pruebas automatizadas
  window.__compresor = { compressFile: compressFile, compressAll: compressAll, buildZip: buildZip, addFiles: addFiles, items: function () { return items; } };
})();
