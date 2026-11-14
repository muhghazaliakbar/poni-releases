// Internet Health — every 30 s, times a tiny request to three connectivity-check endpoints (Google, Cloudflare, Apple).
// Latency, jitter and loss over the last 10 minutes, today's uptime, and an outage log: an outage is two failed rounds
// in a row (every endpoint failing) and ends at the first round that gets an answer.

var STRINGS = {
  en: {
    measuring: 'Measuring…', online: 'Online', slow: 'Slow', unstable: 'Unstable', offline: 'Offline',
    offlineFor: 'Offline for {t}', median: 'Latency', jitter: 'Jitter', loss: 'Loss', last10: 'last 10 min',
    good: 'Good for video calls', fine: 'Fine for calls; HD video may stutter', browse: 'OK for browsing; calls may lag',
    poor: 'Poor: expect slow pages and choppy calls', none: 'No connection', chart30: '30 min', chart24: 'Today',
    uptimeToday: 'Uptime today', uptimeWeek: '7 days', outages: 'Outages', noOutages: 'No outages today or yesterday',
    today: 'Today', yesterday: 'Yesterday', ongoing: 'ongoing', s: 's', m: 'min', h: 'h',
    downTitle: 'Internet connection lost', downBody: 'No answer from Google, Cloudflare or Apple since {t}.',
    upTitle: 'Back online', upBody: 'Offline for {d} ({from}–{to}).', footer: 'Checked every 30 s · Google, Cloudflare, Apple'
  },
  id: {
    measuring: 'Mengukur…', online: 'Online', slow: 'Lambat', unstable: 'Tidak stabil', offline: 'Offline',
    offlineFor: 'Offline selama {t}', median: 'Latensi', jitter: 'Jitter', loss: 'Hilang', last10: '10 menit terakhir',
    good: 'Bagus untuk video call', fine: 'Cukup untuk telepon; video HD bisa tersendat', browse: 'Cukup untuk browsing; telepon bisa tertunda',
    poor: 'Buruk: halaman lambat dan suara putus-putus', none: 'Tidak ada koneksi', chart30: '30 mnt', chart24: 'Hari ini',
    uptimeToday: 'Uptime hari ini', uptimeWeek: '7 hari', outages: 'Gangguan', noOutages: 'Tidak ada gangguan hari ini atau kemarin',
    today: 'Hari ini', yesterday: 'Kemarin', ongoing: 'berlangsung', s: 'dtk', m: 'mnt', h: 'jam',
    downTitle: 'Koneksi internet terputus', downBody: 'Google, Cloudflare, dan Apple tidak menjawab sejak {t}.',
    upTitle: 'Kembali online', upBody: 'Offline selama {d} ({from}–{to}).', footer: 'Diperiksa tiap 30 dtk · Google, Cloudflare, Apple'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var ENDPOINTS = [
  { name: 'Google', url: 'https://www.google.com/generate_204' },
  { name: 'Cloudflare', url: 'https://cp.cloudflare.com/generate_204' },
  { name: 'Apple', url: 'https://captive.apple.com/hotspot-detect.html' }
];
var EVERY = 30000, WINDOW = 10 * 60000, HISTORY = 60, KEEP_DAYS = 7, DAY = 86400000;
var GAP = 150000;   // no round for 2.5 min: the Mac slept; don't count the gap

function clock() { return Date.now(); } // tests replace this

var recent = notch.storage.get('recent') || [];   // [[time, ms]] for the last 60 rounds; ms = -1 when every endpoint failed
var days = notch.storage.get('days') || {};       // 'YYYY-MM-DD' → { n, ok, out: [[start, duration]] }
var outage = notch.storage.get('outage') || null; // { start } while offline
var fails = 0, failStart = 0, lastRound = 0, lastDone = recent.length ? recent[recent.length - 1][0] : 0;
var running = false, chart = 'recent', lastByEndpoint = {};
var minutes = null;                               // { key, vals: [1440 × '' | ms | 'x'] }, stored as 'm:<day>'

function pad(n) { return (n < 10 ? '0' : '') + n; }
function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function duration(ms) {
  var sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return sec + ' ' + t('s');
  if (sec < 3600) return Math.round(sec / 60) + ' ' + t('m');
  return Math.floor(sec / 3600) + ' ' + t('h') + ' ' + Math.round(sec % 3600 / 60) + ' ' + t('m');
}
function slowAt() { return +(notch.settings.get('slow') || 250); }
function pct(x) { return (x >= 99.95 || x === 0 ? Math.round(x) : x >= 99 ? x.toFixed(2) : x.toFixed(1)).toString().replace('.', notch.locale === 'id' ? ',' : '.') + '%'; }

// ---- Measuring --------------------------------------------------------------------------------

function round(force) {
  if (running || (!force && clock() - lastRound < EVERY)) return;
  running = true;
  lastRound = clock();
  var pending = ENDPOINTS.length, best = -1, asked = false, bust = '?_=' + clock();
  ENDPOINTS.forEach(function (e) {
    var started = clock();
    notch.fetch(e.url + bust, { headers: { 'Cache-Control': 'no-cache' } }, function (text, err, status) {
      var ms = clock() - started;
      if (!status && /permission/i.test(String(err))) asked = true;
      else if (status >= 200 && status < 400) { lastByEndpoint[e.name] = ms; if (best < 0 || ms < best) best = ms; }
      else lastByEndpoint[e.name] = -1;
      if (--pending > 0) return;
      running = false;
      if (asked && best < 0) { lastRound = clock() - EVERY + 5000; return; }   // the permission is still being asked
      record(best);
    });
  });
}

function record(ms) {
  var now = clock();
  if (lastDone && now - lastDone > GAP) {   // woke from sleep: close any outage at the last thing we saw
    if (outage) { addOutage(outage.start, Math.max(0, lastDone - outage.start)); outage = null; }
    fails = 0;
  }
  lastDone = now;
  recent.push([now, ms]);
  if (recent.length > HISTORY) recent = recent.slice(-HISTORY);
  var key = dayKey(now), d = days[key] || { n: 0, ok: 0, out: [] };
  d.n++; if (ms >= 0) d.ok++;
  days[key] = d;
  if (ms >= 0) {
    if (outage) {
      var length = now - outage.start;
      addOutage(outage.start, length);
      announce('up', length, outage.start, now);
      outage = null;
    }
    fails = 0;
  } else {
    fails++;
    if (fails === 1) failStart = now;
    if (fails >= 2 && !outage) { outage = { start: failStart }; announce('down', 0, failStart, now); }
  }
  minute(now, ms);
  prune(key);
  notch.storage.set('recent', recent);
  notch.storage.set('days', days);
  notch.storage.set('outage', outage);
  notch.refresh();
}

function addOutage(start, length) {
  var key = dayKey(start), d = days[key] || { n: 0, ok: 0, out: [] };
  d.out = (d.out || []).concat([[start, length]]).slice(-50);
  days[key] = d;
}

/// Per-minute aggregate for today: the best latency that minute, 'x' when every round failed.
function minute(now, ms) {
  var key = dayKey(now);
  if (!minutes || minutes.key !== key) {
    var saved = notch.storage.get('m:' + key);
    minutes = { key: key, vals: saved ? String(saved).split(',') : [] };
    while (minutes.vals.length < 1440) minutes.vals.push('');
  }
  var d = new Date(now), slot = d.getHours() * 60 + d.getMinutes(), old = minutes.vals[slot];
  if (ms >= 0) minutes.vals[slot] = String(old && old !== 'x' ? Math.min(+old, ms) : ms);
  else if (!old) minutes.vals[slot] = 'x';
  notch.storage.set('m:' + key, minutes.vals.join(','));
}

/// Keeps the last 7 days of counters and per-minute data.
function prune(today) {
  var cutoff = dayKey(clock() - (KEEP_DAYS - 1) * DAY);
  Object.keys(days).forEach(function (k) {
    if (k < cutoff) { delete days[k]; notch.storage.set('m:' + k, null); }
  });
  var marks = notch.storage.get('mdays') || [];
  if (marks.indexOf(today) < 0) {
    marks = marks.concat([today]).filter(function (k) { if (k < cutoff) { notch.storage.set('m:' + k, null); return false; } return true; });
    notch.storage.set('mdays', marks);
  }
}

function announce(kind, length, from, to) {
  if (notch.settings.get('notify') === false) return;
  if (kind === 'down') notch.notify(t('downTitle'), tf('downBody', { t: hhmm(from) }));
  else notch.notify(t('upTitle'), tf('upBody', { d: duration(length), from: hhmm(from), to: hhmm(to) }));
}

// ---- Numbers ----------------------------------------------------------------------------------

function stats() {
  var since = clock() - WINDOW;
  var win = recent.filter(function (r) { return r[0] >= since; });
  var ok = win.filter(function (r) { return r[1] >= 0; }).map(function (r) { return r[1]; });
  var sorted = ok.slice().sort(function (a, b) { return a - b; });
  var median = !sorted.length ? -1 : sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  var jitter = 0;
  for (var i = 1; i < ok.length; i++) jitter += Math.abs(ok[i] - ok[i - 1]);
  jitter = ok.length > 1 ? Math.round(jitter / (ok.length - 1)) : 0;
  return { n: win.length, median: median, jitter: jitter, loss: win.length ? (win.length - ok.length) / win.length * 100 : 0 };
}

function status(s) {
  if (outage) return 'offline';
  if (!recent.length) return 'measuring';
  if (fails === 1 || s.loss >= 10) return 'unstable';
  if (s.median > slowAt()) return 'slow';
  return 'online';
}

function verdict(s, st) {
  if (st === 'offline') return { text: t('none'), color: 'red' };
  if (s.median < 0) return null;
  if (s.median < 100 && s.jitter < 30 && s.loss < 2) return { text: t('good'), color: 'green' };
  if (s.median < 200 && s.jitter < 50 && s.loss < 5) return { text: t('fine'), color: 'teal' };
  if (s.median < 400 && s.loss < 15) return { text: t('browse'), color: 'orange' };
  return { text: t('poor'), color: 'red' };
}

function uptime(keys) {
  var n = 0, ok = 0;
  keys.forEach(function (k) { if (days[k]) { n += days[k].n; ok += days[k].ok; } });
  return n ? ok / n * 100 : -1;
}

// ---- UI ---------------------------------------------------------------------------------------

var STATUS = {
  measuring: { color: 'secondary', symbol: 'lucide:circle-dashed' }, online: { color: 'green', symbol: 'lucide:wifi' },
  slow: { color: 'orange', symbol: 'lucide:gauge' }, unstable: { color: 'orange', symbol: 'lucide:signal' },
  offline: { color: 'red', symbol: 'lucide:wifi-off' }
};

function metric(label, value, color) {
  return ui.vstack([
    ui.text(label, { style: 'caption', color: 'secondary', lines: 1 }),
    ui.text(value, { style: 'monoHeadline', color: color, lines: 1 })
  ], { spacing: 2, paddingX: 10, paddingY: 7, background: 'white', fill: true });
}

function chartView() {
  if (chart === 'today' && minutes && minutes.key === dayKey(clock())) {
    var hours = [], labels = [];
    for (var h = 0; h < 24; h++) {
      var vals = minutes.vals.slice(h * 60, h * 60 + 60).filter(function (v) { return v !== '' && v !== 'x'; }).map(Number);
      hours.push(vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0);
      labels.push(h % 6 === 0 ? String(h) : '');
    }
    return ui.bars(hours, { labels: labels, color: '#4fc3f7', height: 34, barWidth: 6 });
  }
  var pts = recent.map(function (r) { return r[1] < 0 ? 0 : r[1]; });
  while (pts.length < HISTORY) pts.unshift(0);
  var top = Math.max(slowAt(), Math.max.apply(null, pts));
  return ui.bars(pts, { color: '#2ecc71', height: 34, barWidth: 3, max: top, highlight: pts.length - 1 });
}

function outageLog() {
  var today = dayKey(clock()), yesterday = dayKey(clock() - DAY), list = [];
  [yesterday, today].forEach(function (k) {
    ((days[k] || {}).out || []).forEach(function (o) { list.push({ start: o[0], length: o[1], day: k === today ? t('today') : t('yesterday') }); });
  });
  if (outage) list.push({ start: outage.start, length: clock() - outage.start, day: t('today'), ongoing: true });
  list = list.slice(-4).reverse();
  if (!list.length) return [ui.text(t('noOutages'), { style: 'caption', color: 'tertiary' })];
  return list.map(function (o) {
    return ui.hstack([
      ui.symbol('lucide:wifi-off', { size: 11, color: o.ongoing ? 'red' : 'tertiary' }),
      ui.text(o.day + ' ' + hhmm(o.start), { style: 'monoFootnote', color: 'secondary' }),
      ui.spacer(),
      ui.text(o.ongoing ? t('ongoing') + ' · ' + duration(o.length) : duration(o.length), { style: 'monoFootnote', color: o.ongoing ? 'red' : 'primary' })
    ], { spacing: 6 });
  });
}

function render() {
  round(false);
  var s = stats(), st = status(s), look = STATUS[st], v = verdict(s, st);
  var title = st === 'offline' ? tf('offlineFor', { t: duration(clock() - outage.start) }) : t(st);
  var endpoints = ENDPOINTS.map(function (e) {
    var ms = lastByEndpoint[e.name];
    return e.name + ' ' + (ms === undefined ? '–' : ms < 0 ? '✕' : ms + ' ms');
  }).join(' · ');
  var week = [];
  for (var i = 0; i < KEEP_DAYS; i++) week.push(dayKey(clock() - i * DAY));
  var upToday = uptime([dayKey(clock())]), upWeek = uptime(week);
  var parts = [
    ui.hstack([
      ui.symbol(look.symbol, { size: 18, color: look.color, animation: st === 'measuring' ? 'pulse' : undefined }),
      ui.vstack([
        ui.text(title, { style: 'headline', color: look.color }),
        v ? ui.text(v.text, { style: 'caption', color: v.color, lines: 1 }) : ui.text(t('measuring'), { style: 'caption', color: 'tertiary' })
      ], { spacing: 1 }),
      ui.spacer(),
      ui.button(chart === 'today' ? t('chart24') : t('chart30'), 'chart', { symbol: 'lucide:chart-line', compact: true })
    ], { spacing: 10 }),
    ui.hstack([
      metric(t('median'), s.median < 0 ? '–' : s.median + ' ms', s.median > slowAt() ? 'orange' : undefined),
      metric(t('jitter'), s.n ? s.jitter + ' ms' : '–', s.jitter >= 50 ? 'orange' : undefined),
      metric(t('loss'), s.n ? Math.round(s.loss) + '%' : '–', s.loss >= 10 ? 'red' : s.loss > 0 ? 'orange' : undefined)
    ], { spacing: 6 }),
    chartView(),
    ui.text(endpoints, { style: 'monoFootnote', color: 'tertiary', lines: 1 }),
    ui.hstack([
      ui.text(t('uptimeToday'), { style: 'caption', color: 'secondary' }),
      ui.text(upToday < 0 ? '–' : pct(upToday), { style: 'monoFootnote', color: upToday >= 99 ? 'green' : upToday < 0 ? 'tertiary' : 'orange' }),
      ui.spacer(),
      ui.text(t('uptimeWeek'), { style: 'caption', color: 'secondary' }),
      ui.text(upWeek < 0 ? '–' : pct(upWeek), { style: 'monoFootnote', color: upWeek >= 99 ? 'green' : upWeek < 0 ? 'tertiary' : 'orange' })
    ], { spacing: 6 }),
    ui.divider(),
    ui.text(t('outages'), { style: 'caption', color: 'secondary' }),
    ui.vstack(outageLog(), { spacing: 3 }),
    ui.text(t('footer'), { style: 'caption', color: 'tertiary', lines: 1 })
  ];
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (notch.settings.get('beside') === false) return null;
  var s = stats(), st = status(s);
  if (st === 'offline') return { symbol: 'lucide:wifi-off', text: t('offline') + ' · ' + duration(clock() - outage.start), color: 'red' };
  if (st === 'slow') return { symbol: 'lucide:gauge', text: s.median + ' ms', color: 'orange' };
  if (st === 'unstable') return { symbol: 'lucide:signal', text: t('unstable'), color: 'orange' };
  return null;
}

function onAction(action) {
  if (action === 'chart') {
    chart = chart === 'today' ? 'recent' : 'today';
    if (chart === 'today' && !minutes) {
      var saved = notch.storage.get('m:' + dayKey(clock()));
      minutes = { key: dayKey(clock()), vals: saved ? String(saved).split(',') : [] };
      while (minutes.vals.length < 1440) minutes.vals.push('');
    }
  }
}

function init() { round(true); }

setInterval(function () { round(false); }, 5000);
