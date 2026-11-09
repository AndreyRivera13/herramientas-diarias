/* MP3 encoder worker — uses vendored lamejs (LGPL). See vendor/LICENSE-lamejs.txt */
/* global lamejs */
'use strict';

importScripts('vendor/lame.min.js');

var MAX_SAMPLES = 1152;
var encoder = null;
var dataBuffer = [];

function clearBuffer() {
  dataBuffer = [];
}

function append(mp3buf) {
  if (mp3buf && mp3buf.length > 0) {
    dataBuffer.push(new Int8Array(mp3buf));
  }
}

function floatTo16BitPCM(float32) {
  var out = new Int16Array(float32.length);
  for (var i = 0; i < float32.length; i++) {
    var s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? (s * 0x8000) : (s * 0x7fff);
  }
  return out;
}

self.onmessage = function (e) {
  var msg = e.data || {};
  try {
    if (msg.cmd === 'encode') {
      clearBuffer();
      var sampleRate = msg.sampleRate || 44100;
      var bitRate = msg.bitRate || 192;
      var leftF = new Float32Array(msg.left);
      var rightF = msg.right ? new Float32Array(msg.right) : null;
      var channels = rightF ? 2 : 1;

      var left = floatTo16BitPCM(leftF);
      var right = rightF ? floatTo16BitPCM(rightF) : null;

      encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitRate);

      var total = left.length;
      var remaining = total;
      var i = 0;

      // Encode in chunks and yield progress
      function pump() {
        var start = performance.now();
        while (remaining >= MAX_SAMPLES) {
          var l = left.subarray(i, i + MAX_SAMPLES);
          var r = right ? right.subarray(i, i + MAX_SAMPLES) : undefined;
          append(encoder.encodeBuffer(l, r));
          i += MAX_SAMPLES;
          remaining -= MAX_SAMPLES;

          // Yield every ~40ms so the UI can update
          if (performance.now() - start > 40) {
            self.postMessage({
              cmd: 'progress',
              progress: 1 - remaining / total
            });
            setTimeout(pump, 0);
            return;
          }
        }

        if (remaining > 0) {
          var l2 = left.subarray(i);
          var r2 = right ? right.subarray(i) : undefined;
          append(encoder.encodeBuffer(l2, r2));
        }

        append(encoder.flush());
        self.postMessage({
          cmd: 'progress',
          progress: 1
        });
        self.postMessage({
          cmd: 'end',
          buf: dataBuffer
        });
        clearBuffer();
        encoder = null;
      }

      pump();
    }
  } catch (err) {
    self.postMessage({
      cmd: 'error',
      msg: (err && err.message) ? err.message : String(err)
    });
  }
};
