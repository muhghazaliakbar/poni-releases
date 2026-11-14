// Stock Watchlist — IDX and US stocks, indices and currency pairs from Yahoo Finance's chart data,
// with an intraday sparkline per row and one-shot price alerts ("BBCA > 10000").

var STRINGS = {
  en: {
    title: 'Watchlist', add: 'Add BBCA, AAPL, ^JKSE, USDIDR=X, or an alert: BBCA > 10000', edit: 'Edit', done: 'Done',
    open: 'Market open', closed: 'Markets closed', updated: 'Updated {t}', loading: 'Loading…', failed: 'No data right now',
    empty: 'Your watchlist is empty', emptyHint: 'Type a ticker below and press Return.',
    full: 'Up to 10 tickers', fullAlerts: 'Up to 10 alerts', dup: 'Already on your watchlist', invalid: 'That doesn’t look like a ticker',
    notFound: 'Can’t find {s} on Yahoo Finance', badPrice: 'Write an alert like BBCA > 10000',
    alerts: 'Price alerts', alertSet: 'Alert set: {s} {op} {p}', above: 'above', below: 'below',
    alertTitle: '{s} is {dir} {p}', alertBody: 'Now {p} ({c} today)', hit: 'reached {t}',
    footer: 'Yahoo Finance · may be delayed ~15 min · not investment advice', stale: 'Offline: prices from {t}'
  },
  id: {
    title: 'Pantauan', add: 'Tambah BBCA, AAPL, ^JKSE, USDIDR=X, atau alert: BBCA > 10000', edit: 'Ubah', done: 'Selesai',
    open: 'Pasar buka', closed: 'Pasar tutup', updated: 'Diperbarui {t}', loading: 'Memuat…', failed: 'Data belum tersedia',
    empty: 'Daftar pantauan masih kosong', emptyHint: 'Ketik kode saham di bawah lalu tekan Enter.',
    full: 'Maksimal 10 kode', fullAlerts: 'Maksimal 10 alert', dup: 'Sudah ada di daftar pantauan', invalid: 'Itu bukan kode saham',
    notFound: '{s} tidak ditemukan di Yahoo Finance', badPrice: 'Tulis alert seperti BBCA > 10000',
    alerts: 'Alert harga', alertSet: 'Alert dipasang: {s} {op} {p}', above: 'di atas', below: 'di bawah',
    alertTitle: '{s} {dir} {p}', alertBody: 'Sekarang {p} ({c} hari ini)', hit: 'tercapai {t}',
    footer: 'Yahoo Finance · bisa tertunda ~15 mnt · bukan saran investasi', stale: 'Offline: harga dari {t}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 10, MAX_ALERTS = 10, OPEN_EVERY = 2 * 60000, CLOSED_EVERY = 30 * 60000;
var DEFAULTS = ['^JKSE', 'BBCA.JK', 'BBRI.JK', 'TLKM.JK'];
var NAMES = { '^JKSE': 'IHSG', '^JKLQ45': 'LQ45', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq', '^DJI': 'Dow Jones',
              '^N225': 'Nikkei 225', '^HSI': 'Hang Seng', '^STI': 'STI', '^FTSE': 'FTSE 100' };
var CURRENCY = { IDR: 'Rp ', USD: '$', EUR: '€', GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$', HKD: 'HK$', MYR: 'RM ' };

function clock() { return Date.now(); } // tests replace this

var tickers = notch.storage.get('tickers') || DEFAULTS.slice();
var quotes = notch.storage.get('quotes') || {};   // symbol → { price, prev, currency, name, start, end, closes, at }
var alerts = notch.storage.get('alerts') || [];   // [{ sym, op: '>'|'<', price, done, hitAt }]
var busy = {}, failed = {}, editing = false, lastRound = 0;

function market() { return notch.settings.get('market') === 'us' ? 'us' : 'idx'; }

// ---- Formatting -------------------------------------------------------------------------------

function seps() { return notch.locale === 'id' ? ['.', ','] : [',', '.']; }
function num(n, dec) {
  var s = Math.abs(n).toFixed(dec).split('.');
  var out = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, seps()[0]) + (s[1] ? seps()[1] + s[1] : '');
  return (n < 0 ? '-' : '') + out;
}
function decimals(sym, currency, price) {
  if (Math.abs(price) < 1) return 4;
  if (sym.charAt(0) === '^') return 2;
  return currency === 'IDR' || currency === 'JPY' ? 0 : 2;
}
function money(sym, q, value) {
  var text = num(value, decimals(sym, q.currency, q.price));
  if (sym.charAt(0) === '^') return text;   // index points, not money
  var c = CURRENCY[q.currency];
  return c ? c + text : (q.currency ? text + ' ' + q.currency : text);
}
function signed(sym, q, value) { return (value > 0 ? '+' : value < 0 ? '−' : '') + num(Math.abs(value), decimals(sym, q.currency, q.price)); }
function pctText(p) { return (p > 0 ? '+' : p < 0 ? '−' : '') + num(Math.abs(p), 2) + '%'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function label(sym) {
  if (NAMES[sym]) return NAMES[sym];
  var fx = sym.match(/^([A-Z]{3})([A-Z]{3})=X$/);
  if (fx) return fx[1] + '/' + fx[2];
  return sym.replace(/\.JK$/, '');
}
function change(q) { return q.prev ? { abs: q.price - q.prev, pct: (q.price - q.prev) / q.prev * 100 } : { abs: 0, pct: 0 }; }

// ---- Input ------------------------------------------------------------------------------------

/// "bbca" → "BBCA.JK" on the IDX market setting, "IHSG" → "^JKSE"; explicit suffixes stay as typed.
function symbolOf(text) {
  var s = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
  if (s === 'IHSG' || s === 'JCI') return '^JKSE';
  if (s === 'LQ45') return '^JKLQ45';
  if (!/^[\^A-Z0-9][A-Z0-9.=\-]{0,14}$/.test(s)) return null;
  if (market() === 'idx' && /^[A-Z]{4}$/.test(s)) return s + '.JK';
  return s;
}

/// The other reading of a bare code, tried when the first one isn't found ("AAPL.JK" → "AAPL").
function alternative(sym) {
  if (/^[A-Z]{4}\.JK$/.test(sym)) return sym.slice(0, 4);
  if (/^[A-Z]{4}$/.test(sym)) return sym + '.JK';
  return null;
}

/// "10000", "10.000", "10,000" → 10000; "4,5" or "4.5" → 4.5.
function priceOf(text) {
  var s = String(text || '').trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  var n = parseFloat(s);
  return isFinite(n) && n > 0 && /^\d+(\.\d+)?$/.test(s) ? n : null;
}

// ---- Data -------------------------------------------------------------------------------------

function interval() {
  var now = clock() / 1000;
  var open = tickers.some(function (s) { var q = quotes[s]; return !q || (q.start <= now && now < q.end); });
  return open ? OPEN_EVERY : CLOSED_EVERY;
}
function anyOpen() {
  var now = clock() / 1000;
  return tickers.some(function (s) { var q = quotes[s]; return q && q.start <= now && now < q.end; });
}

function fetchQuote(sym, onMissing) {
  if (busy[sym]) return;
  busy[sym] = true;
  notch.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=15m',
    { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (text, err, status) {
      busy[sym] = false;
      if (!status && /permission/i.test(String(err))) { lastRound = clock() - interval() + 10000; return; }
      var json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      var result = json && json.chart && json.chart.result && json.chart.result[0];
      if (status === 404 || (json && json.chart && !result && json.chart.error)) { if (onMissing) onMissing(); else failed[sym] = true; return; }
      if (!result || !result.meta || typeof result.meta.regularMarketPrice !== 'number') { failed[sym] = true; return; }
      failed[sym] = false;
      store(sym, result);
    });
}

function store(sym, result) {
  var m = result.meta;
  var period = (m.currentTradingPeriod && m.currentTradingPeriod.regular) || {};
  var raw = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  var closes = raw.filter(function (x) { return typeof x === 'number'; });
  var q = {
    price: m.regularMarketPrice, prev: m.chartPreviousClose || m.previousClose || 0, currency: m.currency || '',
    name: m.shortName || m.longName || '', start: period.start || 0, end: period.end || 0, closes: closes, at: clock()
  };
  quotes[sym] = q;
  notch.storage.set('quotes', quotes);
  checkAlerts(sym, q);
  notch.refresh();
}

function checkAlerts(sym, q) {
  var changed = false;
  alerts.forEach(function (a) {
    if (a.done || a.sym !== sym) return;
    if (a.op === '>' ? q.price >= a.price : q.price <= a.price) {
      a.done = true; a.hitAt = clock(); changed = true;
      notch.notify(tf('alertTitle', { s: label(sym), dir: t(a.op === '>' ? 'above' : 'below'), p: money(sym, q, a.price) }),
        tf('alertBody', { p: money(sym, q, q.price), c: pctText(change(q).pct) }));
    }
  });
  if (changed) notch.storage.set('alerts', alerts);
}

function round(force) {
  if (!tickers.length || (!force && clock() - lastRound < interval())) return;
  lastRound = clock();
  tickers.forEach(function (s) { fetchQuote(s); });
}

function save() { notch.storage.set('tickers', tickers); }

/// Adds a symbol; if Yahoo doesn't know it, tries the other market's reading before giving up.
function addTicker(sym, then) {
  if (tickers.indexOf(sym) >= 0) { if (then) then(sym); return true; }
  if (tickers.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return false; }
  tickers.push(sym); save();
  fetchQuote(sym, function () {
    var alt = alternative(sym), at = tickers.indexOf(sym);
    if (alt && at >= 0 && tickers.indexOf(alt) < 0) {
      tickers[at] = alt; save();
      fixAlerts(sym, alt);
      fetchQuote(alt, function () { drop(alt); notch.flash(tf('notFound', { s: label(sym) }), 'exclamationmark.triangle.fill'); });
    } else { drop(sym); notch.flash(tf('notFound', { s: label(sym) }), 'exclamationmark.triangle.fill'); }
  });
  if (then) then(sym);
  return true;
}

function fixAlerts(from, to) {
  alerts.forEach(function (a) { if (a.sym === from) a.sym = to; });
  notch.storage.set('alerts', alerts);
}

function drop(sym) {
  var i = tickers.indexOf(sym);
  if (i >= 0) tickers.splice(i, 1);
  delete quotes[sym];
  alerts = alerts.filter(function (a) { return a.sym !== sym; });
  save(); notch.storage.set('quotes', quotes); notch.storage.set('alerts', alerts);
}

// ---- UI ---------------------------------------------------------------------------------------

/// Intraday closes scaled so the day's range fills the bars (they grow from zero).
function spark(closes) {
  var pts = closes;
  if (pts.length > 28) {
    var step = pts.length / 28, out = [];
    for (var i = 0; i < 28; i++) out.push(pts[Math.floor(i * step)]);
    out[out.length - 1] = pts[pts.length - 1];
    pts = out;
  }
  var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1;
  return pts.map(function (v) { return Math.round(((v - lo) / span * 0.8 + 0.2) * 100); });
}

function row(sym, index) {
  var q = quotes[sym];
  var head = ui.vstack([
    ui.text(label(sym), { style: 'headline', lines: 1 }),
    ui.text(q ? q.name : (failed[sym] ? t('failed') : t('loading')), { style: 'caption', lines: 1, color: q ? 'tertiary' : (failed[sym] ? 'orange' : 'tertiary') })
  ], { spacing: 1, width: 118 });
  var parts = [head, ui.spacer()];
  if (q) {
    var c = change(q), up = c.abs >= 0;
    if (q.closes && q.closes.length > 2) parts.push(ui.bars(spark(q.closes), { color: up ? '#2ecc71' : '#ff6b6b', height: 22, barWidth: 2, max: 100 }));
    parts.push(ui.vstack([
      ui.text(money(sym, q, q.price), { style: 'monoHeadline', lines: 1 }),
      ui.text(signed(sym, q, c.abs) + ' · ' + pctText(c.pct), { style: 'monoFootnote', color: c.abs > 0 ? 'green' : c.abs < 0 ? 'red' : 'secondary', lines: 1 })
    ], { spacing: 1, align: 'trailing' }));
  }
  if (editing) parts.push(ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true }));
  return ui.hstack(parts, { spacing: 10, paddingX: 10, paddingY: 7, background: 'white', fill: true });
}

function alertRow(a, index) {
  var q = quotes[a.sym] || { currency: '', price: a.price };
  var text = label(a.sym) + ' ' + a.op + ' ' + money(a.sym, q, a.price);
  return ui.hstack([
    ui.symbol(a.done ? 'lucide:check' : 'lucide:bell', { size: 13, color: a.done ? 'green' : 'amber' }),
    ui.text(text, { style: 'monoFootnote', color: a.done ? 'tertiary' : 'primary', lines: 1 }),
    a.done ? ui.text(tf('hit', { t: hhmm(a.hitAt) }), { style: 'caption', color: 'green' }) : ui.spacer(),
    ui.spacer(),
    ui.button('', 'unalert:' + index, { symbol: 'lucide:x', compact: true })
  ], { spacing: 6 });
}

function render() {
  round(false);
  var input = ui.hstack([
    ui.input(t('add'), 'add', { clear: true }),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!tickers.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var latest = 0, offline = false;
  tickers.forEach(function (s) { if (quotes[s]) latest = Math.max(latest, quotes[s].at); if (failed[s]) offline = true; });
  var open = anyOpen();
  var parts = [
    ui.hstack([
      ui.text(t('title'), { style: 'headline' }),
      ui.symbol('lucide:circle-dot', { size: 9, color: open ? 'green' : 'tertiary' }),
      ui.text(open ? t('open') : t('closed'), { style: 'caption', color: open ? 'green' : 'secondary' }),
      ui.spacer(),
      latest ? ui.text(offline ? tf('stale', { t: hhmm(latest) }) : tf('updated', { t: hhmm(latest) }), { style: 'caption', color: offline ? 'orange' : 'tertiary' }) : ui.spacer(),
      ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', compact: true })
    ], { spacing: 6 }),
    ui.vstack(tickers.map(row), { spacing: 5 })
  ];
  if (alerts.length) {
    parts.push(ui.text(t('alerts'), { style: 'caption', color: 'secondary' }));
    parts.push(ui.vstack(alerts.map(alertRow), { spacing: 4 }));
  }
  parts.push(input);
  parts.push(ui.text(t('footer'), { style: 'caption', color: 'tertiary', lines: 1 }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  var mode = notch.settings.get('beside') || 'first';
  if (mode === 'none') return null;
  var pick = null;
  tickers.forEach(function (s) {
    var q = quotes[s];
    if (!q) return;
    if (mode === 'first') { if (!pick) pick = s; return; }
    if (!pick || Math.abs(change(q).pct) > Math.abs(change(quotes[pick]).pct)) pick = s;
  });
  if (!pick) return null;
  var c = change(quotes[pick]);
  return { symbol: c.abs >= 0 ? 'lucide:trending-up' : 'lucide:trending-down', text: label(pick) + ' ' + pctText(c.pct),
           color: c.abs > 0 ? 'green' : c.abs < 0 ? 'red' : 'secondary' };
}

function onAction(action, value) {
  if (action === 'add') {
    var text = String(value || '').trim();
    var m = text.match(/^([^\s<>]+)\s*([<>])\s*([^\s<>]+)$/);
    if (m) {
      var sym = symbolOf(m[1]), price = priceOf(m[3]);
      if (!sym) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
      if (price === null) { notch.flash(t('badPrice'), 'exclamationmark.triangle.fill'); return; }
      if (alerts.filter(function (a) { return !a.done; }).length >= MAX_ALERTS) { notch.flash(t('fullAlerts'), 'exclamationmark.triangle.fill'); return; }
      var known = tickers.indexOf(sym) >= 0;
      alerts.push({ sym: sym, op: m[2], price: price, done: false, hitAt: 0 });
      notch.storage.set('alerts', alerts);
      if (!known && !addTicker(sym)) { alerts.pop(); notch.storage.set('alerts', alerts); return; }
      if (known && quotes[sym]) checkAlerts(sym, quotes[sym]);
      notch.flash(tf('alertSet', { s: label(sym), op: m[2], p: num(price, price % 1 ? 2 : 0) }), 'bell.fill');
      return;
    }
    if (/[<>]/.test(text)) { notch.flash(t('badPrice'), 'exclamationmark.triangle.fill'); return; }
    var s = symbolOf(text);
    if (!s) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    if (tickers.indexOf(s) >= 0) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    addTicker(s);
  }
  if (action === 'refresh') round(true);
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) { var gone = tickers[+action.slice(7)]; if (gone) drop(gone); }
  if (action.indexOf('unalert:') === 0) { alerts.splice(+action.slice(8), 1); notch.storage.set('alerts', alerts); }
}

function onSettingsChanged() { round(true); }

setInterval(function () { round(false); }, 15000);
