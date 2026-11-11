/* Día 03 · Convertidor de formatos de imagen — 100% en el navegador (Canvas + codificador BMP propio). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var dropzone = $('dropzone'), fileInput = $('fileInput'), browseBtn = $('browseBtn');
  var formatSel = $('format'), quality = $('quality'), qualityVal = $('qualityVal'), maxWidthInput = $('maxWidth'), bgInput = $('bg');
  var convertBtn = $('convertBtn'), zipBtn = $('zipBtn'), clearBtn = $('clearBtn');
  var statusEl = $('status'), summaryEl = $('summary'), list = $('list');

  var EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'image/bmp': 'bmp' };
  var LOSSY = { 'image/jpeg': 1, 'image/webp': 1 };
  var OPAQUE = { 'image/jpeg': 1, 'image/bmp': 1 };
  var items = [];
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
  function srcFmt(file) {
    var t = (file.type || '').replace('image/', '').replace('svg+xml', 'svg').replace('x-icon', 'ico').replace('vnd.microsoft.icon', 'ico');
    if (t === 'jpeg') t = 'jpg';
    return (t || (file.name.split('.').pop() || '?')).toUpperCase();
  }
  function updateButtons() {
    var has = items.length > 0;
    convertBtn.disabled = busy || !has;
    clearBtn.disabled = busy || !has;
    zipBtn.disabled = busy || !items.some(function (it) { return it.result; });
  }
  function syncControls() {
    var t = formatSel.value;
    quality.disabled = !LOSSY[t];
    qualityVal.textContent = LOSSY[t] ? quality.value : '—';
    bgInput.disabled = !OPAQUE[t];
  }

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
      var isImg = (file.type && file.type.indexOf('image/') === 0) || /\.(png|jpe?g|webp|gif|bmp|svg|avif|ico)$/i.test(file.name);
      if (!isImg) { skipped++; return; }
      var it = { file: file, origUrl: URL.createObjectURL(file), result: null };
      it.el = document.createElement('div');
      it.el.className = 'item';
      items.push(it);
      list.appendChild(it.el);
      renderItem(it);
      added++;
    });
    if (added) setStatus(items.length + ' imagen(es) lista(s). Elige el formato y pulsa “Convertir”.');
    if (skipped) setStatus((added ? added + ' añadida(s). ' : '') + skipped + ' archivo(s) ignorado(s): no son imágenes.', added ? '' : 'error');
    updateButtons();
    if (added && !busy) convertAll();
  }

  function renderItem(it) {
    var r = it.result, f = it.file;
    var html = '<div class="head"><span class="name">' + esc(f.name) + '</span>';
    if (r) html += '<span class="saved good">' + esc(srcFmt(f)) + ' → ' + EXT[r.type].toUpperCase() + '</span>';
    else if (it.error) html += '<span class="saved bad">Error</span>';
    else html += '<span class="saved good">Procesando…</span>';
    html += '</div>';
    html += '<figure><img alt="Original" src="' + it.origUrl + '" /><figcaption>Original · ' + esc(srcFmt(f)) + ' · ' + fmtBytes(f.size) +
      (it.origW ? ' · ' + it.origW + '×' + it.origH : '') + '</figcaption></figure>';
    if (r) {
      html += '<figure><img alt="Convertida" src="' + r.url + '" /><figcaption>Convertida · ' + EXT[r.type].toUpperCase() + ' · ' +
        fmtBytes(r.blob.size) + ' · ' + r.width + '×' + r.height + '</figcaption></figure>';
      html += '<div class="dl"><a class="btn ghost" href="' + r.url + '" download="' + esc(r.name) + '">⬇ Descargar ' + esc(r.name) + '</a>';
      if (r.flattened) html += '<span class="note">La transparencia se rellenó con el color de fondo elegido (' + EXT[r.type].toUpperCase() + ' no admite transparencia).</span>';
      html += '</div>';
    } else if (it.error) {
      html += '<figure><figcaption style="color:var(--danger)">' + esc(it.error) + '</figcaption></figure>';
    } else {
      html += '<figure><figcaption>…</figcaption></figure>';
    }
    it.el.innerHTML = html;
  }

  function loadImage(file) {
    if (window.createImageBitmap && file.type !== 'image/svg+xml') {
      return createImageBitmap(file).catch(function () { return loadViaImg(file); });
    }
    return loadViaImg(file);
  }
  function loadViaImg(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        if (!img.naturalWidth) { img.width = 512; img.height = 512; }
        resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen (formato no soportado por este navegador o archivo dañado).')); };
      img.src = url;
    });
  }

  /* ---------- Codificador BMP (24 bits, sin compresión) ---------- */
  function encodeBMP(imageData) {
    var w = imageData.width, h = imageData.height, px = imageData.data;
    var rowSize = Math.ceil((w * 3) / 4) * 4;
    var dataSize = rowSize * h, fileSize = 54 + dataSize;
    var buf = new ArrayBuffer(fileSize), dv = new DataView(buf), u8 = new Uint8Array(buf);
    u8[0] = 0x42; u8[1] = 0x4D;               // "BM"
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, 54, true);               // offset a los píxeles
    dv.setUint32(14, 40, true);               // BITMAPINFOHEADER
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);                 // positivo = de abajo hacia arriba
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, dataSize, true);
    dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true); // 72 ppp
    for (var y = 0; y < h; y++) {
      var src = (h - 1 - y) * w * 4, dst = 54 + y * rowSize;
      for (var x = 0; x < w; x++, src += 4, dst += 3) {
        u8[dst] = px[src + 2]; u8[dst + 1] = px[src + 1]; u8[dst + 2] = px[src];
      }
    }
    return new Blob([buf], { type: 'image/bmp' });
  }

  function hasAlpha(ctx, w, h) {
    var d = ctx.getImageData(0, 0, w, h).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  }

  function convertFile(file, opts) {
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
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      var flattened = false;
      if (OPAQUE[opts.type]) {
        // Detectar si había transparencia antes de rellenar
        ctx.drawImage(src, 0, 0, w, h);
        flattened = hasAlpha(ctx, w, h);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(src, 0, 0, w, h);
      if (src.close) try { src.close(); } catch (_) {}
      var meta = { width: w, height: h, origW: w0, origH: h0, type: opts.type, flattened: flattened };
      if (opts.type === 'image/bmp') {
        meta.blob = encodeBMP(ctx.getImageData(0, 0, w, h));
        return meta;
      }
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('El navegador no pudo generar la imagen.'));
          if (blob.type !== opts.type) return reject(new Error('Este navegador no soporta exportar a ' + EXT[opts.type].toUpperCase() + '.'));
          meta.blob = blob; resolve(meta);
        }, opts.type, LOSSY[opts.type] ? opts.quality : undefined);
      });
    });
  }

  function currentOpts() {
    var mw = parseInt(maxWidthInput.value, 10);
    return {
      type: formatSel.value,
      quality: Math.min(1, Math.max(0.01, parseInt(quality.value, 10) / 100)),
      maxWidth: mw > 0 ? mw : 0,
      bg: bgInput.value || '#ffffff'
    };
  }

  function convertAll() {
    if (busy || !items.length) return Promise.resolve();
    busy = true; updateButtons();
    var opts = currentOpts();
    var done = 0, errors = 0;
    setStatus('Convirtiendo 0/' + items.length + '…');
    var chain = Promise.resolve();
    items.slice().forEach(function (it) {
      chain = chain.then(function () {
        if (it.result) { URL.revokeObjectURL(it.result.url); it.result = null; }
        it.error = null; renderItem(it);
        return convertFile(it.file, opts).then(function (res) {
          it.origW = res.origW; it.origH = res.origH;
          res.url = URL.createObjectURL(res.blob);
          res.name = baseName(it.file.name) + '.' + EXT[res.type];
          it.result = res;
        }).catch(function (e) { errors++; it.error = e && e.message ? e.message : String(e); })
          .then(function () { done++; renderItem(it); setStatus('Convirtiendo ' + done + '/' + items.length + '…'); });
      });
    });
    return chain.then(function () {
      var ok = items.filter(function (it) { return it.result; });
      var names = uniqueNames(ok.map(function (it) {
        var n = baseName(it.file.name), e = EXT[it.result.type];
        return (it.file.name.toLowerCase() === (n + '.' + e).toLowerCase() ? n + '-convertida' : n) + '.' + e;
      }));
      ok.forEach(function (it, i) { it.result.name = names[i]; renderItem(it); });
      busy = false; updateButtons(); renderSummary();
      if (errors) setStatus('Listo con ' + errors + ' error(es). Revisa los archivos marcados.', 'error');
      else setStatus('¡Listo! ' + done + ' imagen(es) convertida(s) a ' + EXT[opts.type].toUpperCase() + '.', 'ok');
    });
  }

  function renderSummary() {
    var ok = items.filter(function (it) { return it.result; });
    if (!ok.length) { summaryEl.hidden = true; return; }
    var a = 0, b = 0;
    ok.forEach(function (it) { a += it.file.size; b += it.result.blob.size; });
    summaryEl.hidden = false;
    summaryEl.innerHTML = ok.length + ' archivo(s) · ' + fmtBytes(a) + ' → <b>' + fmtBytes(b) + '</b> en <b>' +
      EXT[ok[0].result.type].toUpperCase() + '</b>';
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

  quality.addEventListener('input', syncControls);
  formatSel.addEventListener('change', function () { syncControls(); if (items.length) convertAll(); });
  convertBtn.addEventListener('click', convertAll);
  clearBtn.addEventListener('click', function () {
    items.forEach(function (it) { URL.revokeObjectURL(it.origUrl); if (it.result) URL.revokeObjectURL(it.result.url); });
    items = []; list.innerHTML = ''; summaryEl.hidden = true; setStatus(''); updateButtons();
  });
  zipBtn.addEventListener('click', function () {
    zipBtn.disabled = true;
    setStatus('Creando ZIP…');
    buildZip().then(function (zip) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(zip); a.download = 'imagenes-convertidas.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      setStatus('ZIP descargado (' + fmtBytes(zip.size) + ').', 'ok');
    }).catch(function (e) { setStatus('No se pudo crear el ZIP: ' + e.message, 'error'); })
      .then(updateButtons);
  });

  syncControls();
  // Expuesto para pruebas automatizadas
  window.__convertidor = { convertFile: convertFile, convertAll: convertAll, buildZip: buildZip, addFiles: addFiles, encodeBMP: encodeBMP, items: function () { return items; } };
})();
