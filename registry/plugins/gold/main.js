// Gold Price — international gold and silver spot prices per gram in your currency, with a 7-day history.
// Prices from gold-api.com (USD per troy ounce), exchange rates from open.er-api.com. Neither needs a key.

var STRINGS = {
  en: {
    loading: 'Fetching the gold price…', failed: 'Can’t get the gold price right now.',
    perGram: 'Gold per gram', silver: 'Silver', perGramShort: '/g', vsYesterday: 'vs yesterday', since: 'since {d}',
    noChange: 'No change since yesterday', firstDay: 'Change shows from tomorrow',
    week: 'Last 7 days', quick: 'Gold price for', mine: 'My gold · {g} g',
    spot: 'International spot price. Retail gold (e.g. Antam) is usually higher, buyback lower.',
    stale: 'Offline: price from {t}.', updated: 'Updated {t} · gold-api.com, open.er-api.com'
  },
  id: {
    loading: 'Mengambil harga emas…', failed: 'Harga emas tidak bisa diambil saat ini.',
    perGram: 'Emas per gram', silver: 'Perak', perGramShort: '/g', vsYesterday: 'dibanding kemarin', since: 'sejak {d}',
    noChange: 'Tidak berubah sejak kemarin', firstDay: 'Perubahan tampil mulai besok',
    week: '7 hari terakhir', quick: 'Harga emas untuk', mine: 'Emas saya · {g} g',
    spot: 'Harga spot internasional. Emas ritel (mis. Antam) biasanya lebih mahal, harga buyback lebih rendah.',
    stale: 'Offline: harga dari {t}.', updated: 'Diperbarui {t} · gold-api.com, open.er-api.com'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var OUNCE = 31.1034768, EVERY = 30 * 60000, KEEP = 8;
var CURRENCIES = {
  IDR: { pre: 'Rp ', dec: 0, sep: '.', point: ',' },
  USD: { pre: '$', dec: 2, sep: ',', point: '.' },
  MYR: { pre: 'RM ', dec: 2, sep: ',', point: '.' },
  SGD: { pre: 'S$', dec: 2, sep: ',', point: '.' },
  EUR: { pre: '€', dec: 2, sep: ',', point: '.' }
};
var GRAMS = [1, 5, 10, 25, 100];

function clock() { return Date.now(); } // tests replace this

var data = notch.storage.get('data') || null;       // { at, xau, xag, fx: { IDR, USD, … } }  (metals in USD per troy ounce)
var history = notch.storage.get('history') || [];   // [{ day: 'YYYY-MM-DD', at, xau, xag, fx }], one per day, oldest first
var error = null, loading = false, lastFetch = 0;

function currency() { var c = String(notch.settings.get('currency') || 'IDR'); return CURRENCIES[c] ? c : 'IDR'; }
function grams() { var g = +notch.settings.get('grams'); return isFinite(g) && g > 0 ? g : 0; }

function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dateOf(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
function today() { return keyOf(new Date(clock())); }
function yesterday() { var d = dateOf(today()); d.setDate(d.getDate() - 1); return keyOf(d); }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function shortDate(key) {
  return dateOf(key).toLocaleDateString(notch.locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short' });
}

/// 2345678 → "Rp 2.345.678" (IDR) or "$134.56".
function money(n, cur) {
  var c = CURRENCIES[cur || currency()];
  var fixed = Math.abs(n).toFixed(c.dec).split('.');
  var s = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, c.sep) + (fixed[1] ? c.point + fixed[1] : '');
  return (n < 0 ? '-' : '') + c.pre + s;
}

/// Price per gram in the chosen currency from a { xau|xag, fx } record.
function perGram(rec, metal) {
  var rate = rec && rec.fx ? rec.fx[currency()] : null;
  if (!rec || !rec[metal] || !rate) return null;
  return rec[metal] * rate / OUNCE;
}

function load() {
  if (loading) return;
  loading = true;
  lastFetch = clock();
  var got = {}, left = 3, problem = null;
  function done() {
    if (--left > 0) return;
    loading = false;
    if (!got.xau || !got.fx) { error = 'failed'; retry(problem); return; }
    error = null;
    data = { at: clock(), xau: got.xau, xag: got.xag || (data && data.xag) || null, fx: got.fx };
    notch.storage.set('data', data);
    snapshot();
    notch.refresh();
  }
  function metal(symbol) {
    notch.fetchJSON('https://api.gold-api.com/price/' + symbol, function (json, err) {
      if (json && +json.price > 0) got[symbol.toLowerCase()] = +json.price; else problem = problem || err;
      done();
    });
  }
  metal('XAU');
  metal('XAG');
  notch.fetchJSON('https://open.er-api.com/v6/latest/USD', function (json, err) {
    if (json && json.rates && json.rates.IDR) {
      got.fx = {};
      for (var k in CURRENCIES) got.fx[k] = k === 'USD' ? 1 : +json.rates[k] || null;
    } else problem = problem || err;
    done();
  });
}

/// Still asking for the network permission: try again in 10 s. Offline or a bad answer: in 2 minutes.
function retry(err) {
  lastFetch = clock() - EVERY + (/permission/i.test(String(err)) ? 10000 : 120000);
  notch.refresh();
}

/// Keeps the latest price of each day, for "vs yesterday" and the 7-day bars.
function snapshot() {
  var key = today(), rec = { day: key, at: data.at, xau: data.xau, xag: data.xag, fx: data.fx };
  if (history.length && history[history.length - 1].day === key) history[history.length - 1] = rec;
  else history.push(rec);
  while (history.length > KEEP) history.shift();
  notch.storage.set('history', history);
}

/// The last saved day before today, or null.
function previous() {
  var key = today();
  for (var i = history.length - 1; i >= 0; i--) if (history[i].day < key) return history[i];
  return null;
}

function changeLine(now) {
  var prev = previous(), then = perGram(prev, 'xau');
  if (!then) return ui.text(t('firstDay'), { style: 'caption', color: 'tertiary' });
  var diff = now - then, pct = diff / then * 100;
  var label = prev.day === yesterday() ? t('vsYesterday') : tf('since', { d: shortDate(prev.day) });
  if (Math.abs(pct) < 0.005) return ui.text(t('noChange'), { style: 'caption', color: 'secondary' });
  var up = diff > 0;
  return ui.hstack([
    ui.symbol(up ? 'lucide:trending-up' : 'lucide:trending-down', { size: 13, color: up ? 'green' : 'red' }),
    ui.text((up ? '+' : '') + money(diff) + ' (' + (up ? '+' : '') + pct.toFixed(2) + '%) ' + label,
      { style: 'caption', color: up ? 'green' : 'red', lines: 1 })
  ], { spacing: 4 });
}

function weekBars() {
  var days = history.slice(-7).filter(function (h) { return perGram(h, 'xau'); });
  if (days.length < 2) return [];
  var values = days.map(function (h) { return perGram(h, 'xau'); });
  var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
  // Prices move about a percent a day: start the bars just under the lowest price so the movement shows.
  var base = hi > lo ? lo - (hi - lo) * 0.25 : lo * 0.9;
  return [
    ui.text(t('week'), { style: 'caption' }),
    ui.bars(values.map(function (v) { return v - base; }), {
      labels: days.map(function (h) { return String(+h.day.slice(8)); }),
      color: '#f5b83d', height: 34, barWidth: 12, highlight: values.length - 1
    })
  ];
}

function render() {
  if (clock() - lastFetch > EVERY) load();
  var gold = perGram(data, 'xau');
  if (!gold) return ui.text(error ? t('failed') : t('loading'), { style: 'headline' });
  var silver = perGram(data, 'xag');
  var parts = [
    ui.hstack([
      ui.symbol('lucide:coins', { size: 24, color: 'amber' }),
      ui.vstack([
        ui.text(t('perGram'), { style: 'caption', color: 'amber' }),
        ui.text(money(gold), { style: 'monoTitle', lines: 1 }),
        changeLine(gold)
      ], { spacing: 2 }),
      ui.spacer(),
      silver ? ui.vstack([
        ui.text(t('silver'), { style: 'caption' }),
        ui.text(money(silver) + t('perGramShort'), { style: 'monoFootnote', color: 'secondary' })
      ], { spacing: 2, align: 'trailing' }) : ui.text('', {})
    ], { spacing: 12, padding: 12, background: 'amber', fill: true })
  ];
  var g = grams();
  if (g) parts.push(ui.row(tf('mine', { g: String(Math.round(g * 100) / 100) }), money(gold * g), { symbol: 'lucide:gem', color: 'amber', highlight: true }));
  parts = parts.concat(weekBars());
  parts.push(ui.text(t('quick'), { style: 'caption' }));
  parts.push(ui.vstack(GRAMS.map(function (n) { return ui.row(n + ' g', money(gold * n)); }), { spacing: 2 }));
  parts.push(ui.text(t('spot'), { style: 'caption', color: 'secondary', lines: 2 }));
  parts.push(ui.text(error ? tf('stale', { t: shortDate(keyOf(new Date(data.at))) + ' ' + hhmm(data.at) }) : tf('updated', { t: hhmm(data.at) }),
    { style: 'caption', color: error ? 'orange' : 'tertiary' }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (!notch.settings.get('beside')) return null;
  var gold = perGram(data, 'xau');
  return gold ? { symbol: 'lucide:coins', text: money(gold), color: 'amber' } : null;
}

function onSettingsChanged() { notch.refresh(); }
