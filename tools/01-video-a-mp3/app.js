/* Video / audio → MP3 — 100% en el navegador. Archivos nunca salen del dispositivo. */
'use strict';

(function () {
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var browseBtn = document.getElementById('browseBtn');
  var fileMeta = document.getElementById('fileMeta');
  var bitRateSelect = document.getElementById('bitRate');
  var convertBtn = document.getElementById('convertBtn');
  var progressWrap = document.getElementById('progressWrap');
  var progressBar = document.getElementById('progressBar');
  var progressLabel = document.getElementById('progressLabel');
  var statusEl = document.getElementById('status');
  var downloadLink = document.getElementById('downloadLink');
  var preview = document.getElementById('preview');

  var selectedFile = null;
  var objectUrl = null;
  var worker = null;

  function setStatus(msg, type) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (type ? ' status--' + type : '');
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function formatDuration(sec) {
    if (!isFinite(sec) || sec < 0) return '—';
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function resetOutput() {
    downloadLink.hidden = true;
    downloadLink.removeAttribute('href');
    progressWrap.hidden = true;
    progressBar.style.width = '0%';
    progressLabel.textContent = '0%';
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function acceptFile(file) {
    if (!file) return;
    var ok = /^(video|audio)\//.test(file.type) ||
      /\.(mp4|webm|mov|m4a|mp3|wav|ogg|aac|mkv|avi|flac)$/i.test(file.name);
    if (!ok) {
      setStatus('Formato no reconocido. Prueba con mp4, webm, mov, m4a, wav u ogg.', 'error');
      return;
    }
    selectedFile = file;
    resetOutput();
    fileMeta.hidden = false;
    fileMeta.innerHTML =
      '<strong>' + escapeHtml(file.name) + '</strong>' +
      '<span>' + formatBytes(file.size) + ' · ' + (file.type || 'archivo local') + '</span>';
    convertBtn.disabled = false;
    setStatus('Listo para convertir. El archivo no saldrá de tu dispositivo.', 'ok');

    // Preview if video/audio
    try {
      if (preview.src) URL.revokeObjectURL(preview.src);
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    } catch (_) {
      preview.hidden = true;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  browseBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) acceptFile(fileInput.files[0]);
  });

  ;['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragover');
    });
  });
  ;['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) acceptFile(f);
  });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  function decodeFile(file) {
    return file.arrayBuffer().then(function (ab) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('Tu navegador no soporta Web Audio API.');
      var ctx = new Ctx();
      return ctx.decodeAudioData(ab.slice(0)).then(function (buffer) {
        return ctx.close().then(function () { return buffer; }, function () { return buffer; });
      }).catch(function (err) {
        ctx.close().catch(function () {});
        throw err;
      });
    });
  }

  function encodeWithWorker(audioBuffer, bitRate) {
    return new Promise(function (resolve, reject) {
      if (worker) {
        try { worker.terminate(); } catch (_) {}
      }
      worker = new Worker('worker.js');

      worker.onmessage = function (e) {
        var msg = e.data || {};
        if (msg.cmd === 'progress') {
          var pct = Math.round((msg.progress || 0) * 100);
          progressBar.style.width = pct + '%';
          progressLabel.textContent = pct + '%';
          setStatus('Codificando MP3… ' + pct + '%', 'ok');
        } else if (msg.cmd === 'end') {
          var blob = new Blob(msg.buf, { type: 'audio/mpeg' });
          resolve(blob);
          try { worker.terminate(); } catch (_) {}
          worker = null;
        } else if (msg.cmd === 'error') {
          reject(new Error(msg.msg || 'Error al codificar'));
          try { worker.terminate(); } catch (_) {}
          worker = null;
        }
      };
      worker.onerror = function (err) {
        reject(new Error(err.message || 'Error en el worker'));
        try { worker.terminate(); } catch (_) {}
        worker = null;
      };

      var left = audioBuffer.getChannelData(0);
      var right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

      // Transfer copies so main thread keeps UI responsive; slice to detachable ArrayBuffers
      var leftCopy = left.slice(0).buffer;
      var rightCopy = right ? right.slice(0).buffer : null;
      var payload = {
        cmd: 'encode',
        sampleRate: audioBuffer.sampleRate,
        bitRate: bitRate,
        left: leftCopy,
        right: rightCopy
      };
      var transfer = [leftCopy];
      if (rightCopy) transfer.push(rightCopy);
      worker.postMessage(payload, transfer);
    });
  }

  convertBtn.addEventListener('click', function () {
    if (!selectedFile) return;
    convertBtn.disabled = true;
    resetOutput();
    progressWrap.hidden = false;
    progressBar.style.width = '5%';
    progressLabel.textContent = '5%';
    setStatus('Decodificando audio en el navegador…', 'ok');

    var bitRate = parseInt(bitRateSelect.value, 10) || 192;
    var started = performance.now();

    decodeFile(selectedFile)
      .then(function (audioBuffer) {
        progressBar.style.width = '20%';
        progressLabel.textContent = '20%';
        setStatus(
          'Audio listo (' +
            formatDuration(audioBuffer.duration) +
            ', ' +
            audioBuffer.sampleRate +
            ' Hz, ' +
            audioBuffer.numberOfChannels +
            ' canal' + (audioBuffer.numberOfChannels > 1 ? 'es' : '') +
            '). Codificando…',
          'ok'
        );
        return encodeWithWorker(audioBuffer, bitRate);
      })
      .then(function (blob) {
        if (!blob || blob.size < 100) {
          throw new Error('El MP3 generado está vacío o es inválido.');
        }
        objectUrl = URL.createObjectURL(blob);
        var base = selectedFile.name.replace(/\.[^.]+$/, '') || 'audio';
        var outName = base + '.mp3';
        downloadLink.href = objectUrl;
        downloadLink.download = outName;
        downloadLink.hidden = false;
        downloadLink.textContent = 'Descargar ' + outName + ' (' + formatBytes(blob.size) + ')';
        progressBar.style.width = '100%';
        progressLabel.textContent = '100%';
        var secs = ((performance.now() - started) / 1000).toFixed(1);
        setStatus('Listo en ' + secs + 's. Todo ocurrió en tu dispositivo.', 'ok');
        convertBtn.disabled = false;

        // Expose for automated tests
        window.__lastMp3 = { blob: blob, name: outName, size: blob.size, url: objectUrl };
      })
      .catch(function (err) {
        console.error(err);
        convertBtn.disabled = false;
        progressWrap.hidden = true;
        var msg = (err && err.message) ? err.message : String(err);
        if (/Unable to decode|EncodingError|decode/i.test(msg)) {
          setStatus(
            'No se pudo decodificar este archivo. Prueba con mp4 (AAC), webm, m4a, wav u ogg en Chrome o Edge.',
            'error'
          );
        } else {
          setStatus('Error: ' + msg, 'error');
        }
      });
  });

  // Hook for headless tests: window.__convertTestFile(File) → Promise<{size, name}>
  window.__convertTestFile = function (file, bitRate) {
    return new Promise(function (resolve, reject) {
      acceptFile(file);
      if (bitRate) bitRateSelect.value = String(bitRate);
      var check = setInterval(function () {
        if (window.__lastMp3) {
          clearInterval(check);
          resolve(window.__lastMp3);
        }
      }, 200);
      convertBtn.click();
      // Also watch status for errors
      var errWatch = setInterval(function () {
        if (statusEl.classList.contains('status--error')) {
          clearInterval(check);
          clearInterval(errWatch);
          reject(new Error(statusEl.textContent));
        }
        if (window.__lastMp3) clearInterval(errWatch);
      }, 200);
      setTimeout(function () {
        clearInterval(check);
        clearInterval(errWatch);
        if (!window.__lastMp3) reject(new Error('Timeout esperando conversión'));
      }, 120000);
    });
  };
})();
