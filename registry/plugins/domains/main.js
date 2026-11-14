// Domain Expiry — registration expiry dates from RDAP (rdap.org forwards to each registry, .id included),
// sorted by days left, with a notification 30, 7 and 1 day(s) before a domain lapses.

var STRINGS = {
  en: {
    add: 'Add a domain: example.com', edit: 'Edit', done: 'Done', full: 'Up to 15 domains',
    invalid: 'Not a domain. Try example.com', dup: 'Already tracking that one',
    empty: 'No domains yet', emptyHint: 'Type a domain below and press Return. Expiry dates come from the registry (RDAP).',
    checking: 'Checking…', days: '{n} d', expires: 'Expires {d}', expired: 'Expired {n} days ago', expiredToday: 'Expires today',
    noExp: 'The registry doesn’t publish an expiry date', unsupported: 'Expiry not published for this TLD', notFound: 'Not registered',
    failed: 'Couldn’t reach the registry', renew: 'Renew', soonest: '{d} expires in {n} days', soonestOne: '{d} expires tomorrow',
    soonestToday: '{d} expires today', lapsed: '{d} has expired', allGood: 'All {n} domains are good for 30+ days',
    one: 'Good for 30+ days', notifyTitle: '{d} expires in {n} days', notifyOne: '{d} expires tomorrow', notifyBody: 'Expiry: {date}. Renew it before it lapses.',
    footer: 'Registry data via RDAP · rechecked daily'
  },
  id: {
    add: 'Tambah domain: contoh.com', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 15 domain',
    invalid: 'Bukan domain. Coba contoh.com', dup: 'Domain itu sudah dipantau',
    empty: 'Belum ada domain', emptyHint: 'Ketik domain di bawah lalu tekan Enter. Tanggal kedaluwarsa diambil dari registry (RDAP).',
    checking: 'Memeriksa…', days: '{n} hr', expires: 'Berakhir {d}', expired: 'Sudah lewat {n} hari', expiredToday: 'Berakhir hari ini',
    noExp: 'Registry tidak mencantumkan tanggal kedaluwarsa', unsupported: 'Masa aktif tidak dipublikasikan untuk TLD ini', notFound: 'Belum terdaftar',
    failed: 'Registry tidak bisa dihubungi', renew: 'Perpanjang', soonest: '{d} berakhir {n} hari lagi', soonestOne: '{d} berakhir besok',
    soonestToday: '{d} berakhir hari ini', lapsed: '{d} sudah kedaluwarsa', allGood: 'Semua {n} domain aman 30+ hari',
    one: 'Aman 30+ hari', notifyTitle: '{d} berakhir {n} hari lagi', notifyOne: '{d} berakhir besok', notifyBody: 'Berakhir: {date}. Perpanjang sebelum lewat.',
    footer: 'Data registry lewat RDAP · diperiksa ulang tiap hari'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 15, DAY = 86400000, RECHECK = DAY, RETRY = 3600000, PER_TICK = 2;
var WARN = [30, 7, 1];

function clock() { return Date.now(); } // tests replace this

var domains = notch.storage.get('domains') || [];   // ['example.com']
var info = notch.storage.get('info') || {};         // domain → { status, exp, registrar, link, at, warned: { '30': true } }
var busy = {}, editing = false;

/// "https://www.Example.com/path" → "example.com".
function normalize(text) {
  var s = String(text || '').trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^@\/]*@/, '').replace(/[\/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '')
    .replace(/^www\./, '');
  if (s.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(s)) return null;
  return s;
}

function daysLeft(exp) { return Math.ceil((exp - clock()) / DAY); }
function color(days) { return days <= 7 ? 'red' : days <= 30 ? 'orange' : 'green'; }
function dateText(ms) {
  return new Date(ms).toLocaleDateString(notch.locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- RDAP -------------------------------------------------------------------------------------

function parse(json) {
  var out = { status: 'ok', exp: 0, registrar: '', link: '' };
  (json.events || []).forEach(function (e) {
    if (e && e.eventAction === 'expiration') out.exp = Date.parse(e.eventDate) || 0;
  });
  (json.entities || []).forEach(function (en) {
    if (!en || (en.roles || []).indexOf('registrar') < 0) return;
    var card = en.vcardArray && en.vcardArray[1];
    (card || []).forEach(function (f) {
      if (f[0] === 'fn' && typeof f[3] === 'string' && !out.registrar) out.registrar = f[3];
      if (f[0] === 'url' && typeof f[3] === 'string' && !out.link) out.link = f[3];
    });
    (en.links || []).forEach(function (l) {
      if (l && l.href && !/rdap/i.test(l.href) && !out.link) out.link = l.href;
    });
    if (!out.registrar && en.publicIds && en.publicIds[0]) out.registrar = String(en.publicIds[0].identifier || '');
  });
  if (out.link && !/^https?:\/\//i.test(out.link)) out.link = 'https://' + out.link;
  if (!out.exp) out.status = 'noexp';
  return out;
}

function check(domain) {
  if (busy[domain]) return false;
  busy[domain] = true;
  notch.fetch('https://rdap.org/domain/' + domain, { headers: { 'Accept': 'application/rdap+json, application/json' } }, function (text, err, status) {
    busy[domain] = false;
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!status && /permission/i.test(String(err))) return;   // asked again on the next tick
    var old = info[domain] || {};
    var next;
    if (status === 404 || (json && json.errorCode === 404)) {
      next = { status: json && /no rdap service/i.test(String(json.title || '')) ? 'unsupported' : 'notFound', exp: 0, registrar: '', link: '' };
    } else if (status >= 200 && status < 300 && json && json.objectClassName === 'domain') {
      next = parse(json);
    } else {
      old.failedAt = clock();
      info[domain] = old;
      notch.storage.set('info', info);
      return;
    }
    next.at = clock();
    next.failedAt = 0;
    // A later expiry means it was renewed: start the 30/7/1-day warnings over.
    next.warned = old.warned && old.exp === next.exp ? old.warned : {};
    info[domain] = next;
    warn(domain);
    notch.storage.set('info', info);
    notch.refresh();
  });
  return true;
}

function warn(domain) {
  var d = info[domain];
  if (!d || !d.exp) return;
  var left = daysLeft(d.exp);
  var due = WARN.filter(function (w) { return left <= w && !d.warned[String(w)]; });
  if (!due.length || left < 1) { due.forEach(function (w) { d.warned[String(w)] = true; }); return; }
  due.forEach(function (w) { d.warned[String(w)] = true; });
  if (notch.settings.get('notify') === false) return;
  notch.notify(left <= 1 ? tf('notifyOne', { d: domain }) : tf('notifyTitle', { d: domain, n: left }), tf('notifyBody', { date: dateText(d.exp) }));
}

/// At most two lookups in flight, oldest first, so a long list never floods the registries.
function tick() {
  var inFlight = domains.filter(function (d) { return busy[d]; }).length;
  var due = domains.filter(function (d) {
    var x = info[d];
    if (busy[d]) return false;
    if (!x || !x.at) return !x || !x.failedAt || clock() - x.failedAt > 60000;
    if (x.failedAt && clock() - x.failedAt < RETRY) return false;
    return clock() - x.at > RECHECK;
  });
  due.sort(function (a, b) { return ((info[a] || {}).at || 0) - ((info[b] || {}).at || 0); });
  var started = 0;
  for (var i = 0; i < due.length && started + inFlight < PER_TICK; i++) if (check(due[i])) started++;
  var changed = false;
  domains.forEach(function (d) { var x = info[d]; if (x && x.exp) { var before = JSON.stringify(x.warned); warn(d); if (JSON.stringify(x.warned) !== before) changed = true; } });
  if (changed) notch.storage.set('info', info);
}

// ---- UI ---------------------------------------------------------------------------------------

function sorted() {
  return domains.slice().sort(function (a, b) {
    var ea = (info[a] || {}).exp || Infinity, eb = (info[b] || {}).exp || Infinity;
    return ea === eb ? (a < b ? -1 : 1) : ea - eb;
  });
}

function renewURL(domain) {
  var d = info[domain] || {};
  return d.link || 'https://www.google.com/search?q=' + encodeURIComponent('renew ' + domain);
}

function row(domain) {
  var d = info[domain];
  var detail, tint = 'tertiary', days = null;
  if (!d || !d.at) detail = d && d.failedAt ? t('failed') : t('checking');
  else if (d.status === 'ok') {
    days = daysLeft(d.exp);
    tint = color(days);
    detail = (days < 0 ? tf('expired', { n: -days }) : days === 0 ? t('expiredToday') : tf('expires', { d: dateText(d.exp) })) +
      (d.registrar ? ' · ' + d.registrar : '');
  } else detail = t(d.status === 'unsupported' ? 'unsupported' : d.status === 'notFound' ? 'notFound' : 'noExp');
  var parts = [
    ui.symbol('lucide:globe', { size: 15, color: tint }),
    ui.vstack([
      ui.text(domain, { style: 'headline', lines: 1 }),
      ui.text(detail, { style: 'caption', lines: 1, color: d && d.status !== 'ok' && d.at ? 'secondary' : undefined })
    ], { spacing: 2 }),
    ui.spacer()
  ];
  if (days !== null) parts.push(ui.text(tf('days', { n: days }), { style: 'monoHeadline', color: tint }));
  if (editing) parts.push(ui.button('', 'remove:' + domain, { symbol: 'lucide:x', compact: true }));
  else if (days !== null) {
    parts.push(ui.button(days <= 30 ? t('renew') : '', 'renew:' + domain,
      { symbol: 'lucide:rotate-cw', compact: true, style: days <= 30 ? 'primary' : undefined }));
  }
  return ui.hstack(parts, { spacing: 10, paddingX: 10, paddingY: 7, background: days !== null && days <= 30 ? tint : 'white',
                            backgroundOpacity: days !== null && days <= 30 ? 0.16 : undefined, fill: true });
}

function summary(list) {
  var first = list[0], d = info[first];
  if (!d || !d.exp) return null;
  var n = daysLeft(d.exp);
  if (n > 30) return { text: list.length === 1 ? t('one') : tf('allGood', { n: list.length }), color: 'green' };
  var text = n < 0 ? tf('lapsed', { d: first }) : n === 0 ? tf('soonestToday', { d: first }) : n === 1 ? tf('soonestOne', { d: first }) : tf('soonest', { d: first, n: n });
  return { text: text, color: color(n) };
}

function render() {
  tick();
  var input = ui.hstack([
    ui.input(t('add'), 'add', { clear: true }),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!domains.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption', lines: 2 }), input], { spacing: 10 });
  }
  var list = sorted(), top = summary(list);
  var parts = [];
  if (top) parts.push(ui.text(top.text, { style: 'headline', color: top.color, lines: 1 }));
  parts.push(ui.vstack(list.map(row), { spacing: 5 }));
  parts.push(input);
  parts.push(ui.text(t('footer'), { style: 'caption', color: 'tertiary' }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (notch.settings.get('beside') === false) return null;
  var first = sorted()[0], d = first && info[first];
  if (!d || !d.exp) return null;
  var n = daysLeft(d.exp);
  if (n > 7) return null;
  return { symbol: 'lucide:hourglass', text: first + ' · ' + tf('days', { n: Math.max(n, 0) }), color: 'red' };
}

function onAction(action, value) {
  if (action === 'add') {
    var domain = normalize(value);
    if (!domain) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    if (domains.indexOf(domain) >= 0) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (domains.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    domains.push(domain);
    notch.storage.set('domains', domains);
    if (domains.filter(function (d) { return busy[d]; }).length < PER_TICK) check(domain);
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('renew:') === 0) notch.open(renewURL(action.slice(6)));
  if (action.indexOf('remove:') === 0) {
    var gone = action.slice(7);
    domains = domains.filter(function (d) { return d !== gone; });
    delete info[gone];
    notch.storage.set('domains', domains);
    notch.storage.set('info', info);
  }
}

setInterval(tick, 30000);
