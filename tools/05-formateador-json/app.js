/* Día 05 · Formateador y validador de JSON — 100% en el navegador, JavaScript puro. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var input = $('input'), output = $('output'), statusEl = $('status');
  var indentSel = $('indent'), sortKeys = $('sortKeys');
  var errbox = $('errbox'), errMsg = $('errMsg'), errSnippet = $('errSnippet'), gotoBtn = $('gotoBtn');
  var copyBtn = $('copyBtn'), downloadBtn = $('downloadBtn');
  var inMeta = $('inMeta'), outMeta = $('outMeta');
  var fileName = 'datos';
  var lastError = null;
  var timer = null;

  // ---------- Validador estricto con posición (línea/columna) ----------
  function JsonError(msg, pos) { this.message = msg; this.pos = pos; }

  function describe(ch) {
    if (ch === undefined) return 'el final del texto';
    if (ch === '\n') return 'un salto de línea';
    if (ch === '\r') return 'un retorno de carro';
    if (ch === '\t') return 'una tabulación';
    if (ch === ' ') return 'un espacio';
    if (ch === "'") return "una comilla simple (') — JSON solo admite comillas dobles";
    return '«' + ch + '»';
  }

  // Recorre el texto siguiendo la gramática de JSON (RFC 8259). Lanza JsonError con la posición exacta.
  function validate(text) {
    var i = 0, n = text.length, warnings = [];

    function ws() {
      while (i < n) {
        var c = text.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13) i++;
        else if (c === 0xFEFF && i === 0) i++; // BOM
        else break;
      }
    }
    function fail(msg, pos) { throw new JsonError(msg, pos === undefined ? i : pos); }

    function value(depth) {
      if (depth > 5000) fail('El JSON está anidado demasiadas veces.');
      ws();
      var ch = text[i];
      if (ch === '{') return object(depth);
      if (ch === '[') return array(depth);
      if (ch === '"') return string();
      if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
      if (text.startsWith('true', i)) { i += 4; return; }
      if (text.startsWith('false', i)) { i += 5; return; }
      if (text.startsWith('null', i)) { i += 4; return; }
      if (ch === undefined) fail('Se esperaba un valor pero el texto terminó.');
      if (ch === "'") fail('Las cadenas deben ir entre comillas dobles ("), no simples (\').');
      if (/^(undefined|NaN|Infinity|True|False|None|NULL|Null)\b/.test(text.slice(i, i + 10))) {
        var w = /^\w+/.exec(text.slice(i))[0];
        fail('«' + w + '» no es un valor válido en JSON (usa true, false, null, números o cadenas).');
      }
      if (ch === '}' || ch === ']') fail('Se esperaba un valor y se encontró ' + describe(ch) + '. ¿Sobra una coma antes?');
      fail('Se esperaba un valor (objeto, arreglo, cadena, número, true, false o null) y se encontró ' + describe(ch) + '.');
    }

    function object(depth) {
      var start = i; i++; ws();
      var seen = Object.create(null);
      if (text[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (text[i] !== '"') {
          if (text[i] === '}') fail('Sobra una coma antes de «}».', lastComma);
          if (text[i] === undefined) fail('Falta cerrar el objeto abierto con «{».', start);
          if (text[i] === "'") fail('Los nombres de las claves deben ir entre comillas dobles ("), no simples.');
          if (/[A-Za-z_$]/.test(text[i])) fail('Los nombres de las claves deben ir entre comillas dobles (").');
          fail('Se esperaba el nombre de una clave entre comillas dobles y se encontró ' + describe(text[i]) + '.');
        }
        var kpos = i;
        var key = string();
        if (seen[key] && warnings.length < 20) warnings.push({ msg: 'Clave duplicada «' + key + '»', pos: kpos });
        seen[key] = true;
        ws();
        if (text[i] !== ':') fail('Se esperaba «:» después de la clave «' + key + '» y se encontró ' + describe(text[i]) + '.');
        i++;
        value(depth + 1);
        ws();
        if (text[i] === ',') { var lastComma = i; i++; continue; }
        if (text[i] === '}') { i++; return; }
        if (text[i] === undefined) fail('Falta cerrar el objeto abierto con «{».', start);
        fail('Se esperaba «,» o «}» después del valor y se encontró ' + describe(text[i]) + '. ¿Falta una coma?');
      }
    }

    function array(depth) {
      var start = i; i++; ws();
      if (text[i] === ']') { i++; return; }
      var lastComma;
      for (;;) {
        ws();
        if (text[i] === ']' && lastComma !== undefined) fail('Sobra una coma antes de «]».', lastComma);
        value(depth + 1);
        ws();
        if (text[i] === ',') { lastComma = i; i++; continue; }
        if (text[i] === ']') { i++; return; }
        if (text[i] === undefined) fail('Falta cerrar el arreglo abierto con «[».', start);
        fail('Se esperaba «,» o «]» después del elemento y se encontró ' + describe(text[i]) + '. ¿Falta una coma?');
      }
    }

    function string() {
      var start = i, out = '';
      i++;
      for (;;) {
        if (i >= n) fail('Falta cerrar la cadena que empieza aquí con comillas dobles (").', start);
        var c = text.charCodeAt(i);
        if (c === 34) { i++; return out; }
        if (c === 92) {
          var e = text[i + 1];
          if (e === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.substr(i + 2, 4))) fail('Secuencia \\u inválida: se esperaban 4 dígitos hexadecimales.');
            out += String.fromCharCode(parseInt(text.substr(i + 2, 4), 16));
            i += 6; continue;
          }
          if ('"\\/bfnrt'.indexOf(e) === -1 || e === undefined) fail('Secuencia de escape inválida «\\' + (e || '') + '».');
          out += e; i += 2; continue;
        }
        if (c < 32) fail('Carácter de control sin escapar dentro de una cadena (' + describe(text[i]) + '). Usa \\n, \\t, etc.');
        out += text[i]; i++;
      }
    }

    function number() {
      var start = i;
      if (text[i] === '-') i++;
      if (text[i] === '0') {
        i++;
        if (text[i] >= '0' && text[i] <= '9') fail('Los números no pueden tener ceros a la izquierda.', start);
      } else if (text[i] >= '1' && text[i] <= '9') {
        while (text[i] >= '0' && text[i] <= '9') i++;
      } else fail('Número inválido: se esperaba un dígito después de «-».');
      if (text[i] === '.') {
        i++;
        if (!(text[i] >= '0' && text[i] <= '9')) fail('Número inválido: se esperaba un dígito después del punto decimal.');
        while (text[i] >= '0' && text[i] <= '9') i++;
      }
      if (text[i] === 'e' || text[i] === 'E') {
        i++;
        if (text[i] === '+' || text[i] === '-') i++;
        if (!(text[i] >= '0' && text[i] <= '9')) fail('Número inválido: se esperaba un dígito en el exponente.');
        while (text[i] >= '0' && text[i] <= '9') i++;
      }
      var raw = text.slice(start, i);
      if (/^-?\d+$/.test(raw) && !Number.isSafeInteger(Number(raw)) && warnings.length < 20) {
        warnings.push({ msg: 'El número ' + raw + ' es demasiado grande y perderá precisión', pos: start });
      }
    }

    ws();
    if (i >= n) fail('El texto está vacío.', 0);
    value(0);
    ws();
    if (i < n) fail('Hay contenido extra después del final del JSON (' + describe(text[i]) + '). ¿Falta una coma o sobra algo?');
    return warnings;
  }

  function lineCol(text, pos) {
    var line = 1, col = 1;
    for (var k = 0; k < pos && k < text.length; k++) {
      if (text[k] === '\n') { line++; col = 1; } else col++;
    }
    return { line: line, col: col };
  }

  function snippet(text, pos) {
    var lines = text.split('\n');
    var lc = lineCol(text, pos);
    var from = Math.max(1, lc.line - 2), to = Math.min(lines.length, lc.line + 1);
    var w = String(to).length, out = [];
    for (var l = from; l <= to; l++) {
      var src = lines[l - 1].replace(/\t/g, ' ').replace(/\r$/, '');
      if (src.length > 160) {
        var s0 = l === lc.line ? Math.max(0, lc.col - 80) : 0;
        src = (s0 ? '…' : '') + src.slice(s0, s0 + 160);
        if (l === lc.line) lc.colShown = lc.col - s0 + (s0 ? 1 : 0);
      }
      out.push(esc((l === lc.line ? '>' : ' ') + String(l).padStart(w) + ' | ' + src));
      if (l === lc.line) {
        var colShown = lc.colShown || lc.col;
        out.push(' ' + ' '.repeat(w) + ' | ' + ' '.repeat(colShown - 1) + '<span class="caret">^</span>');
      }
    }
    return out.join('\n');
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  // ---------- Utilidades ----------
  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' status--' + kind : '');
  }
  function bytes(s) { return new Blob([s]).size; }
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (b / 1048576).toFixed(2).replace('.', ',') + ' MB';
  }
  function meta(s) {
    var lines = s ? s.split('\n').length : 0;
    return s.length.toLocaleString('es-CO') + ' caracteres · ' + lines.toLocaleString('es-CO') + ' líneas · ' + fmtBytes(bytes(s));
  }

  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }).forEach(function (k) {
        // defineProperty evita que una clave "__proto__" cambie el prototipo.
        Object.defineProperty(o, k, { value: sortDeep(v[k]), enumerable: true, writable: true, configurable: true });
      });
      return o;
    }
    return v;
  }

  function stats(v) {
    var s = { obj: 0, arr: 0, keys: 0, depth: 0 };
    (function walk(x, d) {
      if (d > s.depth) s.depth = d;
      if (Array.isArray(x)) { s.arr++; x.forEach(function (y) { walk(y, d + 1); }); }
      else if (x && typeof x === 'object') { s.obj++; var k = Object.keys(x); s.keys += k.length; k.forEach(function (y) { walk(x[y], d + 1); }); }
    })(v, 0);
    return s;
  }

  // ---------- Núcleo ----------
  function check(showOk) {
    var text = input.value;
    inMeta.textContent = meta(text);
    lastError = null;
    errbox.hidden = true;
    input.classList.remove('invalid', 'valid');
    if (!text.trim()) { setStatus('Pega un JSON o abre un archivo para empezar.'); return null; }
    var warnings;
    try {
      warnings = validate(text);
    } catch (e) {
      if (!(e instanceof JsonError)) throw e;
      var lc = lineCol(text, e.pos);
      lastError = { pos: e.pos, line: lc.line, col: lc.col };
      errMsg.textContent = 'Error en la línea ' + lc.line + ', columna ' + lc.col + ': ' + e.message;
      errSnippet.innerHTML = snippet(text, e.pos);
      errbox.hidden = false;
      input.classList.add('invalid');
      setStatus('❌ JSON inválido (línea ' + lc.line + ', columna ' + lc.col + ').', 'error');
      return null;
    }
    var value;
    try { value = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); }
    catch (e2) { setStatus('❌ JSON inválido: ' + e2.message, 'error'); input.classList.add('invalid'); return null; }
    input.classList.add('valid');
    var st = stats(value);
    var pl = function (k, one, many) { return k + ' ' + (k === 1 ? one : many); };
    var msg = '✅ JSON válido · ' + pl(st.obj, 'objeto', 'objetos') + ', ' + pl(st.arr, 'arreglo', 'arreglos') + ', ' + pl(st.keys, 'clave', 'claves') + ', profundidad ' + st.depth + '.';
    if (warnings.length) {
      var w0 = warnings[0], wl = lineCol(text, w0.pos);
      msg += ' ⚠️ ' + w0.msg + ' (línea ' + wl.line + ', columna ' + wl.col + ')' + (warnings.length > 1 ? ' y ' + (warnings.length - 1) + ' aviso(s) más' : '') + '.';
      setStatus(msg, 'warn');
    } else if (showOk !== false) setStatus(msg, 'ok');
    return { value: value, msg: msg, warn: warnings.length > 0 };
  }

  function indentValue() { return indentSel.value === 'tab' ? '\t' : Number(indentSel.value); }

  function run(mode) {
    var r = check();
    if (!r) { setOutput(''); return; }
    var v = sortKeys.checked ? sortDeep(r.value) : r.value;
    var out = mode === 'min' ? JSON.stringify(v) : JSON.stringify(v, null, indentValue());
    setOutput(out);
    var before = bytes(input.value), after = bytes(out);
    var extra = mode === 'min'
      ? ' Minificado: ' + fmtBytes(before) + ' → ' + fmtBytes(after) + (before ? ' (' + Math.round((1 - after / before) * 100) + ' % menos).' : '.')
      : ' Formateado con ' + (indentSel.value === 'tab' ? 'tabulación' : indentSel.value + ' espacios') + (sortKeys.checked ? ' y claves ordenadas.' : '.');
    setStatus(r.msg + extra, r.warn ? 'warn' : 'ok');
    lastMode = mode;
  }
  var lastMode = null;

  function setOutput(s) {
    output.value = s;
    copyBtn.disabled = downloadBtn.disabled = !s;
    outMeta.textContent = s ? meta(s) : '';
  }

  // ---------- Eventos ----------
  $('formatBtn').addEventListener('click', function () { run('pretty'); });
  $('minifyBtn').addEventListener('click', function () { run('min'); });
  $('validateBtn').addEventListener('click', function () { check(); });
  indentSel.addEventListener('change', function () { if (lastMode === 'pretty' && output.value) run('pretty'); });
  sortKeys.addEventListener('change', function () { if (lastMode && output.value) run(lastMode); });
  input.addEventListener('input', function () {
    if (output.value) { setOutput(''); lastMode = null; }
    clearTimeout(timer);
    timer = setTimeout(function () { check(); }, 250);
  });
  input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(e.shiftKey ? 'min' : 'pretty'); }
  });

  gotoBtn.addEventListener('click', function () {
    if (!lastError) return;
    input.focus();
    input.setSelectionRange(lastError.pos, Math.min(lastError.pos + 1, input.value.length));
    // Desplaza el área de texto hasta la línea del error.
    var lh = parseFloat(getComputedStyle(input).lineHeight) || 20;
    input.scrollTop = Math.max(0, (lastError.line - 3) * lh);
  });

  copyBtn.addEventListener('click', function () {
    var s = output.value; if (!s) return;
    function fallback() {
      output.focus(); output.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      setStatus(ok ? '📋 Copiado al portapapeles.' : 'No se pudo copiar; selecciona el texto y usa Ctrl+C.', ok ? 'ok' : 'warn');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(function () { setStatus('📋 Copiado al portapapeles.', 'ok'); }, fallback);
    } else fallback();
  });

  downloadBtn.addEventListener('click', function () {
    var s = output.value; if (!s) return;
    var name = fileName + (lastMode === 'min' ? '.min' : '') + '.json';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s + (lastMode === 'min' ? '' : '\n')], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    setStatus('⬇ Descargado «' + name + '».', 'ok');
  });

  function loadFile(f) {
    if (!f) return;
    if (f.size > 50 * 1048576) { setStatus('El archivo pesa más de 50 MB; es demasiado grande para el navegador.', 'warn'); return; }
    var r = new FileReader();
    r.onload = function () {
      input.value = String(r.result);
      fileName = (f.name || 'datos').replace(/\.(json|txt|geojson|map)$/i, '').replace(/\.min$/i, '') || 'datos';
      setOutput(''); lastMode = null;
      var ok = check(false);
      if (ok) setStatus('📂 «' + f.name + '» cargado. ' + ok.msg, ok.warn ? 'warn' : 'ok');
    };
    r.onerror = function () { setStatus('No se pudo leer el archivo.', 'error'); };
    r.readAsText(f);
  }
  $('file').addEventListener('change', function (e) { loadFile(e.target.files[0]); e.target.value = ''; });

  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  $('sampleBtn').addEventListener('click', function () {
    input.value = '{"nombre":"Andrey Tech","dia":5,"herramientas":["Video a MP3","Compresor de imágenes","Convertidor de imágenes","Generador de QR","Formateador de JSON"],"activo":true,"meta":{"pais":"Colombia","zona":"America/Bogota","version":1.5},"notas":null}';
    fileName = 'ejemplo';
    run('pretty');
  });
  $('clearBtn').addEventListener('click', function () {
    input.value = ''; setOutput(''); lastMode = null; fileName = 'datos'; check(); input.focus();
  });

  check();
})();
