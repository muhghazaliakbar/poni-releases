// Uptime — checks a few URLs on a timer. A site counts as down after two failed checks in a row,
// so one dropped request doesn't wake anyone up.

var STRINGS = {
  en: {
    add: 'Add a site: example.com or https://api.example.com/health', edit: 'Edit', done: 'Done', full: 'Up to 8 sites',
    invalid: 'Not a web address. Try example.com or https://…', dup: 'Already watching that one',
    empty: 'No sites yet', emptyHint: 'Type a website or an API health URL below and press Return.',
    allUp: 'All {n} up', someDown: '{d} of {n} down', checking: 'Checking…', up: 'Up', down: 'Down',
    ago: '{t} ago', justNow: 'just now', s: 's', m: 'min', h: 'h', noAnswer: 'No answer',
    downTitle: '{n} is down', downBody: '{why} · {url}', upTitle: '{n} is back up', upBody: 'Down for {t}'
  },
  id: {
    add: 'Tambah situs: contoh.com atau https://api.contoh.com/health', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 8 situs',
    invalid: 'Bukan alamat web. Coba contoh.com atau https://…', dup: 'Situs itu sudah dipantau',
    empty: 'Belum ada situs', emptyHint: 'Ketik situs web atau URL health API di bawah lalu tekan Enter.',
    allUp: 'Semua {n} naik', someDown: '{d} dari {n} turun', checking: 'Memeriksa…', up: 'Naik', down: 'Turun',
    ago: '{t} lalu', justNow: 'baru saja', s: 'dtk', m: 'mnt', h: 'jam', noAnswer: 'Tidak ada jawaban',
    downTitle: '{n} turun', downBody: '{why} · {url}', upTitle: '{n} sudah naik lagi', upBody: 'Turun selama {t}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 8, FAILS_TO_DOWN = 2;

function clock() { return Date.now(); } // tests replace this

var sites = notch.storage.get('sites') || [];   // [{ name, url }]
var state = notch.storage.get('state') || {};   // url → { up, status, ms, why, fails, since, at, times: [ms] }
var busy = {}, editing = false, lastRound = 0;

function every() { return Math.max(1, +(notch.settings.get('every') || 2)) * 60000; }

/// "example.com" → https://example.com; only http(s) URLs with a host.
function normalize(text) {
  var s = String(text || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^localhost:\d/i.test(s) && !/^[^\s\/:]+\.[^\s\/:]+:\d/.test(s)) return null;
    s = 'https://' + s;
  }
  var m = s.match(/^(https?):\/\/([^\s\/?#:]+)(:\d+)?([\/?#]\S*)?$/i);
  if (!m || !(m[2].indexOf('.') > 0 || m[2].toLowerCase() === 'localhost')) return null;
  return s;
}

function nameOf(url) { return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''); }

/// Reachable and not broken. 401/403 still mean the server answered (a protected page or API).
function healthy(status) { return (status >= 200 && status < 400) || status === 401 || status === 403; }

function check(site) {
  if (busy[site.url]) return;
  busy[site.url] = true;
  var started = clock();
  notch.fetch(site.url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Poni-Uptime' } }, function (text, err, status) {
    busy[site.url] = false;
    // Poni is still asking for (or was refused) the network permission: that says nothing about the site.
    if (!status && /permission/i.test(String(err))) { lastRound = clock() - every() + 5000; return; }
    record(site, status || 0, clock() - started, status ? 'HTTP ' + status : (err || t('noAnswer')));
  });
}

function record(site, status, ms, why) {
  var s = state[site.url] || { up: null, fails: 0, times: [] };
  var ok = healthy(status);
  s.status = status; s.ms = ok ? ms : null; s.at = clock();
  s.times = (s.times || []).concat(ok ? [ms] : [0]).slice(-12);
  if (ok) {
    if (s.up === false) announce('up', site, s);
    if (s.up !== true) s.since = clock();
    s.up = true; s.fails = 0; s.why = '';
  } else {
    s.fails = (s.fails || 0) + 1;
    s.why = why;
    if (s.fails >= FAILS_TO_DOWN && s.up !== false) {
      if (s.up === true) announce('down', site, s);
      s.up = false; s.since = clock();
    }
  }
  state[site.url] = s;
  notch.storage.set('state', state);
  notch.refresh();
}

function duration(ms) {
  var sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return sec + ' ' + t('s');
  if (sec < 3600) return Math.round(sec / 60) + ' ' + t('m');
  return Math.floor(sec / 3600) + ' ' + t('h') + ' ' + Math.round(sec % 3600 / 60) + ' ' + t('m');
}

function announce(kind, site, s) {
  if (notch.settings.get('notify') === false) return;
  if (kind === 'down') notch.notify(tf('downTitle', { n: site.name }), tf('downBody', { why: s.why, url: site.url }));
  else notch.notify(tf('upTitle', { n: site.name }), tf('upBody', { t: duration(clock() - s.since) }));
}

function round(force) {
  if (!sites.length || (!force && clock() - lastRound < every())) return;
  lastRound = clock();
  sites.forEach(check);
}

function ago(at) {
  var ms = clock() - at;
  return ms < 10000 ? t('justNow') : tf('ago', { t: duration(ms) });
}

function row(site, index) {
  var s = state[site.url] || {};
  var symbol = s.up === true ? 'lucide:circle-check' : s.up === false ? 'lucide:circle-x' : 'lucide:circle-dashed';
  var color = s.up === true ? 'green' : s.up === false ? 'red' : (s.fails ? 'orange' : 'tertiary');
  var detail = !s.at ? t('checking')
    : (s.up === false || s.fails ? s.why : s.status + ' · ' + s.ms + ' ms') + ' · ' + ago(s.at);
  var parts = [
    ui.symbol(symbol, { size: 16, color: color }),
    ui.vstack([
      ui.text(site.name, { style: 'headline', lines: 1 }),
      ui.text(detail, { style: 'caption', lines: 1, color: s.up === false ? 'red' : undefined })
    ], { spacing: 2 }),
    ui.spacer()
  ];
  var times = (s.times || []).filter(function (x) { return x !== undefined; });
  if (times.length > 1) parts.push(ui.bars(times, { color: s.up === false ? '#ff6b6b' : '#2ecc71', height: 22, barWidth: 4 }));
  if (editing) parts.push(ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true }));
  return ui.hstack(parts, { spacing: 10, padding: 8, background: 'white', fill: true });
}

function render() {
  round(false);
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!sites.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var down = sites.filter(function (x) { return (state[x.url] || {}).up === false; }).length;
  var known = sites.filter(function (x) { return typeof (state[x.url] || {}).up === 'boolean'; }).length;
  return ui.vstack([
    ui.hstack([
      ui.text(down ? tf('someDown', { d: down, n: sites.length }) : known < sites.length ? t('checking') : tf('allUp', { n: sites.length }),
        { style: 'headline', color: down ? 'red' : known < sites.length ? 'secondary' : 'green' }),
      ui.spacer(),
      ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', compact: true })
    ]),
    ui.vstack(sites.map(row), { spacing: 6 }),
    input
  ], { spacing: 8 });
}

function compact() {
  var down = sites.filter(function (x) { return (state[x.url] || {}).up === false; });
  if (!down.length) return null;
  return { symbol: 'lucide:circle-x', text: down.length === 1 ? down[0].name : tf('someDown', { d: down.length, n: sites.length }), color: 'red' };
}

function save() { notch.storage.set('sites', sites); }

function onAction(action, value) {
  if (action === 'add') {
    var url = normalize(value);
    if (!url) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    if (sites.some(function (x) { return x.url === url; })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (sites.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    var site = { name: nameOf(url), url: url };
    sites.push(site); save(); check(site);
  }
  if (action === 'refresh') round(true);
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) {
    var gone = sites.splice(+action.slice(7), 1)[0];
    if (gone) { delete state[gone.url]; notch.storage.set('state', state); }
    save();
  }
}

setInterval(function () { round(false); }, 15000);
