// Dev Toolbox — small developer conversions, each result one click from the clipboard.

var STRINGS = {
  en: {
    uuid: 'UUID', password: 'Password', time: 'Time', base64: 'Base64', url: 'URL', hash: 'Hash', json: 'JSON',
    fresh: 'New', paste: 'Paste', copied: 'Copied', update: 'This tool needs Poni 0.5.6 or later.',
    input: 'Type or paste text, then press Return', inputTime: 'A Unix timestamp or a date (2026-11-12 09:30), or leave empty for now',
    inputJSON: 'Paste JSON and press Return', nothing: 'Type something above, or paste from the clipboard.',
    unixS: 'Unix (seconds)', unixMs: 'Unix (milliseconds)', iso: 'ISO 8601 (UTC)', local: 'Local time',
    encoded: 'Encoded', decoded: 'Decoded', notB64: 'Not valid Base64', notURL: 'Not valid URL encoding',
    badDate: 'Not a date or timestamp', pretty: 'Formatted', minified: 'Minified', badJSON: 'Invalid JSON: {e}',
    chars: '{n} characters'
  },
  id: {
    uuid: 'UUID', password: 'Password', time: 'Waktu', base64: 'Base64', url: 'URL', hash: 'Hash', json: 'JSON',
    fresh: 'Baru', paste: 'Tempel', copied: 'Disalin', update: 'Alat ini butuh Poni 0.5.6 atau lebih baru.',
    input: 'Ketik atau tempel teks, lalu tekan Enter', inputTime: 'Timestamp Unix atau tanggal (2026-11-12 09:30), atau kosongkan untuk sekarang',
    inputJSON: 'Tempel JSON lalu tekan Enter', nothing: 'Ketik sesuatu di atas, atau tempel dari clipboard.',
    unixS: 'Unix (detik)', unixMs: 'Unix (milidetik)', iso: 'ISO 8601 (UTC)', local: 'Waktu lokal',
    encoded: 'Encode', decoded: 'Decode', notB64: 'Bukan Base64 yang valid', notURL: 'Bukan URL encoding yang valid',
    badDate: 'Bukan tanggal atau timestamp', pretty: 'Rapi', minified: 'Ringkas', badJSON: 'JSON tidak valid: {e}',
    chars: '{n} karakter'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MODES = [
  { id: 'uuid', symbol: 'lucide:fingerprint' }, { id: 'password', symbol: 'lucide:key-round' },
  { id: 'time', symbol: 'lucide:clock' }, { id: 'base64', symbol: 'lucide:binary' }, { id: 'url', symbol: 'lucide:link' },
  { id: 'hash', symbol: 'lucide:hash' }, { id: 'json', symbol: 'lucide:braces' }
];
var mode = notch.storage.get('mode') || 'uuid';
var input = '';
var generated = {}; // mode → value, for UUID and password

function hasCrypto() { return !!(notch.crypto && notch.features && notch.features.indexOf('crypto') >= 0); }

// MARK: UTF-8 and Base64 (JavaScriptCore has neither TextEncoder nor btoa)

function utf8(text) {
  var out = [], s = encodeURIComponent(text);
  for (var i = 0; i < s.length; i++) {
    if (s.charAt(i) === '%') { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; } else out.push(s.charCodeAt(i));
  }
  return out;
}
function fromUtf8(bytes) {
  return decodeURIComponent(bytes.map(function (b) { return '%' + (b < 16 ? '0' : '') + b.toString(16); }).join(''));
}
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Encode(text) {
  var b = utf8(text), out = '';
  for (var i = 0; i < b.length; i += 3) {
    var n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return out;
}
/// Standard or URL-safe Base64, padding optional; null when it isn't Base64 of UTF-8 text.
function base64Decode(text) {
  var s = String(text).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!s || /[^A-Za-z0-9+\/]/.test(s) || s.length % 4 === 1) return null;
  var bytes = [], bits = 0, value = 0;
  for (var i = 0; i < s.length; i++) {
    value = (value << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  try { return fromUtf8(bytes); } catch (e) { return null; }
}

// MARK: Generators

/// Uniform characters from secure random bytes (bytes past the largest multiple of the alphabet are skipped).
function password(length, symbols) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (symbols ? '!@#$%^&*-_=+?' : '');
  var limit = 256 - (256 % alphabet.length), out = '';
  while (out.length < length) {
    var bytes = notch.crypto.randomBytes(length * 2);
    if (!bytes.length) return null;
    for (var i = 0; i < bytes.length && out.length < length; i++) if (bytes[i] < limit) out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function generate() {
  if (!hasCrypto()) return;
  if (mode === 'uuid') generated.uuid = notch.crypto.uuid();
  if (mode === 'password') {
    var n = Math.max(8, Math.min(64, +(notch.settings.get('length') || 20)));
    generated.password = password(n, notch.settings.get('symbols') !== false);
  }
}

// MARK: Results for the current mode: [{ label, value }] or { error }

function pad(n) { return (n < 10 ? '0' : '') + n; }

function timeResults(text) {
  var s = String(text).trim(), d;
  if (!s) d = new Date();
  else if (/^-?\d{1,10}(\.\d+)?$/.test(s)) d = new Date(+s * 1000);
  else if (/^-?\d{11,16}$/.test(s)) d = new Date(+s);
  else {
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    d = m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : new Date(s);
  }
  if (isNaN(d.getTime())) return { error: t('badDate') };
  var local = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  return [
    { label: t('unixS'), value: String(Math.floor(d.getTime() / 1000)) },
    { label: t('unixMs'), value: String(d.getTime()) },
    { label: t('iso'), value: d.toISOString() },
    { label: t('local'), value: local }
  ];
}

function results() {
  if (mode === 'uuid' || mode === 'password') {
    if (!hasCrypto()) return { error: t('update') };
    if (!generated[mode]) generate();
    var v = generated[mode] || '';
    return [{ label: mode === 'uuid' ? 'UUID v4' : tf('chars', { n: v.length }), value: v }];
  }
  if (mode === 'time') return timeResults(input);
  if (!input) return { error: t('nothing'), quiet: true };
  if (mode === 'base64') {
    var dec = base64Decode(input);
    return [{ label: t('encoded'), value: base64Encode(input) }, { label: t('decoded'), value: dec === null ? '' : dec, note: dec === null ? t('notB64') : '' }];
  }
  if (mode === 'url') {
    var d;
    try { d = decodeURIComponent(input.replace(/\+/g, ' ')); } catch (e) { d = null; }
    return [{ label: t('encoded'), value: encodeURIComponent(input) }, { label: t('decoded'), value: d === null ? '' : d, note: d === null ? t('notURL') : '' }];
  }
  if (mode === 'hash') {
    if (!hasCrypto()) return { error: t('update') };
    return ['sha256', 'sha1', 'md5'].map(function (a) { return { label: a.toUpperCase().replace('SHA', 'SHA-'), value: notch.crypto.hash(a, input) }; });
  }
  if (mode === 'json') {
    try {
      var obj = JSON.parse(input);
      return [{ label: t('pretty'), value: JSON.stringify(obj, null, 2) }, { label: t('minified'), value: JSON.stringify(obj) }];
    } catch (e) { return { error: tf('badJSON', { e: String(e.message || e).replace(/^JSON Parse error: /, '') }) }; }
  }
  return [];
}

// MARK: Notch

var shown = []; // the results on screen, for the copy buttons

function render() {
  var tabs = ui.hstack(MODES.map(function (m) {
    return ui.button(t(m.id), 'mode:' + m.id, { symbol: m.symbol, compact: true, style: m.id === mode ? 'primary' : undefined });
  }), { spacing: 6 });
  var r = results();
  shown = r.error ? [] : r;
  var body = r.error
    ? [ui.text(r.error, { style: 'caption', color: r.quiet ? undefined : 'orange' })]
    : r.map(function (x, i) {
        return ui.hstack([
          ui.vstack([
            ui.text(x.label, { style: 'caption' }),
            ui.text(x.note || x.value || '—', { style: x.note ? 'caption' : 'mono', lines: mode === 'json' && i === 0 ? 4 : 1,
              color: x.note ? 'orange' : undefined })
          ], { spacing: 2 }),
          ui.spacer()
        ].concat(x.value ? [ui.button('', 'copy:' + i, { symbol: 'lucide:copy', compact: true })] : []),
        { spacing: 8, padding: 8, background: 'white', fill: true });
      });
  var controls;
  if (mode === 'uuid' || mode === 'password') {
    controls = ui.hstack([ui.spacer(), ui.button(t('fresh'), 'generate', { symbol: 'lucide:refresh-cw', compact: true })]);
  } else {
    controls = ui.hstack([
      ui.input(mode === 'time' ? t('inputTime') : mode === 'json' ? t('inputJSON') : t('input'), 'input'),
      ui.button(t('paste'), 'paste', { symbol: 'lucide:clipboard-paste', compact: true })
    ], { spacing: 8 });
  }
  return ui.vstack([tabs].concat(body).concat([controls]), { spacing: 8 });
}

function onAction(action, value) {
  if (action.indexOf('mode:') === 0) { mode = action.slice(5); notch.storage.set('mode', mode); }
  if (action === 'generate') generate();
  if (action === 'input') input = String(value || '');
  if (action === 'paste') input = String(notch.clipboard.get() || '');
  if (action.indexOf('copy:') === 0) {
    var x = shown[+action.slice(5)];
    if (x && x.value) { notch.clipboard.set(x.value); notch.flash(t('copied') + ' · ' + x.label, 'lucide:copy'); }
  }
}
