// Calculator — sums, percentages and unit conversions, typed in plain words. No eval(): a small parser.

var STRINGS = {
  en: {
    placeholder: 'Type a sum: 12% of 1,500,000 · 5 km to mi · 72 F to C · (3 + 4) ^ 2',
    empty: 'Type a calculation and press Return', examples: 'Try 12% of 1,500,000, 1,500,000 + 10%, 5 km to mi, 2 GB to MB, 72 F to C',
    error: 'Can’t calculate that', units: 'Can’t convert {a} to {b}', copied: 'Copied {v}', copy: 'Copy', clear: 'Clear',
    history: 'Recent'
  },
  id: {
    placeholder: 'Ketik hitungan: 12% dari 1.500.000 · 5 km ke mil · 72 F ke C · (3 + 4) ^ 2',
    empty: 'Ketik hitungan lalu tekan Enter', examples: 'Coba 12% dari 1.500.000, 1.500.000 + 10%, 5 km ke mil, 2 GB ke MB, 72 F ke C',
    error: 'Tidak bisa menghitung itu', units: 'Tidak bisa mengubah {a} ke {b}', copied: '{v} disalin', copy: 'Salin', clear: 'Hapus',
    history: 'Terakhir'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }
function indonesian() { return notch.locale === 'id'; }

// MARK: Numbers in both conventions

/// "1.500.000" (id) / "1,500,000" (en) / "2,5" (id) / "2.5" → a number. Mixed separators: the last one is the decimal point.
function readNumber(s) {
  var dot = s.indexOf('.') >= 0, comma = s.indexOf(',') >= 0;
  if (dot && comma) {
    return s.lastIndexOf(',') > s.lastIndexOf('.') ? +s.replace(/\./g, '').replace(',', '.') : +s.replace(/,/g, '');
  }
  if (dot) return (indonesian() && /^\d{1,3}(\.\d{3})+$/.test(s)) || /^\d{1,3}(\.\d{3}){2,}$/.test(s) ? +s.replace(/\./g, '') : +s;
  if (comma) return (!indonesian() && /^\d{1,3}(,\d{3})+$/.test(s)) || /^\d{1,3}(,\d{3}){2,}$/.test(s) ? +s.replace(/,/g, '') : +s.replace(',', '.');
  return +s;
}

function format(n) {
  var rounded = parseFloat(n.toPrecision(12));
  if (Math.abs(rounded) >= 1e15 || (rounded !== 0 && Math.abs(rounded) < 1e-6)) return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  return new Intl.NumberFormat(indonesian() ? 'id-ID' : 'en-US', { maximumFractionDigits: 8 }).format(rounded);
}

// MARK: Arithmetic

function tokenize(text) {
  var s = text.toLowerCase()
    .replace(/[×]/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-')
    .replace(/(\d|\))\s*x\s*(?=[\d(])/g, '$1*')
    .replace(/%\s*(of|dari)\s+/g, '% * ');
  var out = [], re = /\s*(\d[\d.,]*|sqrt|√|pi|π|[-+*/^%()])/y, m, i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) { if (/^\s*$/.test(s.slice(i))) break; throw new Error('token'); }
    out.push(m[1]);
    i = re.lastIndex;
  }
  return out;
}

/// Recursive descent. "a + b%" adds b percent of a; "b%" alone is b / 100.
function evaluate(text) {
  var tokens = tokenize(text), pos = 0;
  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }
  function expr() {
    var left = term().v;
    while (peek() === '+' || peek() === '-') {
      var op = next(), right = term();
      var r = right.pct ? left * right.v : right.v;
      left = op === '+' ? left + r : left - r;
    }
    return left;
  }
  function term() {
    var first = unary(), v = first.v, single = true;
    while (peek() === '*' || peek() === '/') {
      var op = next(), r = unary().v;
      v = op === '*' ? v * r : v / r;
      single = false;
    }
    return { v: v, pct: single && first.pct };
  }
  // Minus binds looser than ^, like on paper: -3^2 = -9, 2^-1 = 0.5.
  function unary() {
    if (peek() === '-') { next(); var u = unary(); return { v: -u.v, pct: u.pct }; }
    if (peek() === '+') { next(); return unary(); }
    return power();
  }
  function power() {
    var base = postfix();
    if (peek() === '^') { next(); return { v: Math.pow(base.v, unary().v), pct: false }; }
    return base;
  }
  function postfix() {
    var v = primary();
    if (peek() === '%') { next(); return { v: v / 100, pct: true }; }
    return { v: v, pct: false };
  }
  function primary() {
    var tok = next();
    if (tok === undefined) throw new Error('end');
    if (tok === '(') { var v = expr(); if (next() !== ')') throw new Error('paren'); return v; }
    if (tok === 'sqrt' || tok === '√') return Math.sqrt(primary());
    if (tok === 'pi' || tok === 'π') return Math.PI;
    if (/^\d/.test(tok)) return readNumber(tok.replace(/[.,]$/, ''));
    throw new Error('unexpected');
  }
  var result = expr();
  if (pos < tokens.length || !isFinite(result)) throw new Error('rest');
  return result;
}

// MARK: Units (factor to the category's base unit)

var UNITS = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, inch: 0.0254, inci: 0.0254, ft: 0.3048, feet: 0.3048, kaki: 0.3048,
    yd: 0.9144, mi: 1609.344, mil: 1609.344, mile: 1609.344, miles: 1609.344, nmi: 1852 },
  mass: { mg: 1e-6, g: 0.001, gr: 0.001, gram: 0.001, kg: 1, ons: 0.1, oz: 0.028349523125, lb: 0.45359237, lbs: 0.45359237,
    pound: 0.45359237, ton: 1000, t: 1000 },
  data: { b: 1, byte: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776 },
  time: { ms: 0.001, s: 1, sec: 1, detik: 1, min: 60, menit: 60, h: 3600, hr: 3600, hour: 3600, hours: 3600, jam: 3600,
    day: 86400, days: 86400, hari: 86400, week: 604800, weeks: 604800, minggu: 604800, year: 31557600, tahun: 31557600 },
  volume: { ml: 0.001, l: 1, liter: 1, litre: 1, cup: 0.2365882365, gal: 3.785411784, gallon: 3.785411784, floz: 0.0295735295625 },
  area: { m2: 1, 'm²': 1, km2: 1e6, 'km²': 1e6, ha: 1e4, hektar: 1e4, are: 100, acre: 4046.8564224, ft2: 0.09290304, 'ft²': 0.09290304 },
  speed: { 'km/h': 1 / 3.6, kmh: 1 / 3.6, kph: 1 / 3.6, 'm/s': 1, mph: 0.44704, knot: 0.514444, knots: 0.514444 }
};
var TEMPS = { c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };

function findUnit(name) {
  var n = name.toLowerCase();
  for (var cat in UNITS) if (UNITS[cat][n] !== undefined) return { cat: cat, factor: UNITS[cat][n] };
  if (TEMPS[n]) return { cat: 'temp', id: TEMPS[n] };
  return null;
}

function convertTemp(v, from, to) {
  var c = from === 'c' ? v : from === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
  return to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15;
}

/// "5 km to mi" → { value, unit: 'mi' } or null when the text isn't a conversion.
function conversion(text) {
  var m = String(text).trim().match(/^(.+?)\s*([a-zA-Z°µ²/]+)\s+(?:to|in|into|ke|dalam|jadi|=)\s+([a-zA-Z°²/]+)$/i);
  if (!m) return null;
  var a = findUnit(m[2]), b = findUnit(m[3]);
  if (!a && !b) return null;
  if (!a || !b || a.cat !== b.cat) throw { units: true, a: m[2], b: m[3] };
  var v = evaluate(m[1]);
  var out = a.cat === 'temp' ? convertTemp(v, a.id, b.id) : v * a.factor / b.factor;
  return { value: out, unit: m[3] };
}

/// The answer to whatever was typed, as text, or throws.
function answer(text) {
  var conv = conversion(text);
  if (conv) return format(conv.value) + ' ' + conv.unit;
  return format(evaluate(text));
}

// MARK: Notch

var history = notch.storage.get('history') || []; // [{ q, a }], newest first

function render() {
  if (!history.length) {
    return ui.vstack([
      ui.text(t('empty'), { style: 'headline' }),
      ui.text(t('examples'), { style: 'caption' }),
      ui.input(t('placeholder'), 'calc')
    ], { spacing: 10 });
  }
  var last = history[0];
  var rows = history.slice(1, 5).map(function (h, i) {
    return ui.hstack([
      ui.text(h.q, { style: 'caption', lines: 1 }),
      ui.spacer(),
      ui.button(h.a, 'copy:' + (i + 1), { symbol: 'lucide:copy', compact: true })
    ], { spacing: 8 });
  });
  return ui.vstack([
    ui.hstack([
      ui.vstack([
        ui.text(last.q, { style: 'caption', lines: 1 }),
        ui.text('= ' + last.a, { style: 'monoTitle', lines: 1 })
      ], { spacing: 2 }),
      ui.spacer(),
      ui.button(t('copy'), 'copy:0', { symbol: 'lucide:copy', compact: true, style: 'primary' }),
      ui.button('', 'clear', { symbol: 'lucide:trash-2', compact: true })
    ], { spacing: 8, padding: 10, background: 'white', fill: true }),
    ui.vstack(rows, { spacing: 4 }),
    ui.input(t('placeholder'), 'calc')
  ], { spacing: 8 });
}

function onAction(action, value) {
  if (action === 'calc') {
    var q = String(value || '').trim();
    if (!q) return;
    try {
      history.unshift({ q: q, a: answer(q) });
      history = history.slice(0, 5);
      notch.storage.set('history', history);
    } catch (e) {
      notch.flash(e && e.units ? tf('units', { a: e.a, b: e.b }) : t('error'), 'exclamationmark.triangle.fill');
    }
  }
  if (action.indexOf('copy:') === 0) {
    var h = history[+action.slice(5)];
    if (h) { notch.clipboard.set(h.a); notch.flash(tf('copied', { v: h.a }), 'lucide:copy'); }
  }
  if (action === 'clear') { history = []; notch.storage.set('history', history); }
}
