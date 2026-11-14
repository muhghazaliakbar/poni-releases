// Public Holidays — the next days off from Google's public holiday calendar for the chosen country
// (it includes Indonesia's cuti bersama), long weekends, and the one day of leave that makes a longer one.

var STRINGS = {
  en: {
    loading: 'Fetching holidays…', failed: 'Can’t get the holiday calendar right now.', none: 'No more holidays found this year.',
    today: 'Today', tomorrow: 'Tomorrow', inDays: 'in {n} days', next: 'Next day off', observance: 'Observance',
    collective: 'Collective leave', long: '{n}-day long weekend · {from} – {to}',
    bridge: 'Take {d} off → {n} days in a row', upcoming: 'Coming up', remindTitle: 'Tomorrow is a day off',
    remindBody: '{name}', compactToday: 'Day off', source: 'Source: Google public holidays', stale: 'Offline: saved list'
  },
  id: {
    loading: 'Mengambil hari libur…', failed: 'Kalender hari libur tidak bisa diambil saat ini.', none: 'Tidak ada hari libur lagi tahun ini.',
    today: 'Hari ini', tomorrow: 'Besok', inDays: '{n} hari lagi', next: 'Libur berikutnya', observance: 'Perayaan',
    collective: 'Cuti bersama', long: 'Long weekend {n} hari · {from} – {to}',
    bridge: 'Ambil cuti {d} → libur {n} hari berturut-turut', upcoming: 'Berikutnya', remindTitle: 'Besok libur',
    remindBody: '{name}', compactToday: 'Libur', source: 'Sumber: kalender libur Google', stale: 'Offline: daftar tersimpan'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var DAY = 86400000, EVERY = 12 * 3600000;

function clock() { return Date.now(); } // tests replace this

var cache = notch.storage.get('cache') || null; // { key, at, days: [{ date: 'YYYY-MM-DD', name, observance }] }
var reminded = notch.storage.get('reminded') || '';
var loading = false, failed = false, lastTry = 0;

function country() { return String(notch.settings.get('country') || 'indonesian'); }
function lang() { return notch.locale === 'id' ? 'id' : 'en'; }
function cacheKey() { return lang() + '.' + country(); }

function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// Local noon for a 'YYYY-MM-DD' key, so adding days never trips over a DST change.
function dateOf(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
function addDays(key, n) { var d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); }
function today() { return keyOf(new Date(clock())); }
function daysBetween(a, b) { return Math.round((dateOf(b) - dateOf(a)) / DAY); }
function weekend(key) { var w = dateOf(key).getDay(); return w === 0 || w === 6; }

function fmt(key, withWeekday) {
  var d = dateOf(key);
  var opts = withWeekday ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
  return d.toLocaleDateString(notch.locale === 'id' ? 'id-ID' : 'en-GB', opts);
}

/// Parses the all-day events of an iCalendar file into [{ date, name, observance }], sorted.
function parseICS(text) {
  var lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  var out = [], ev = null, seen = {};
  lines.forEach(function (line) {
    if (line === 'BEGIN:VEVENT') { ev = {}; return; }
    if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.name) {
        var end = ev.end || addDays(ev.start, 1);
        for (var k = ev.start, n = 0; k < end && n < 14; k = addDays(k, 1), n++) {
          var id = k + '|' + ev.name;
          if (seen[id]) continue;
          seen[id] = true;
          out.push({ date: k, name: ev.name, observance: /observance|perayaan/i.test(ev.desc || '') });
        }
      }
      ev = null; return;
    }
    if (!ev) return;
    var m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/);
    if (!m) return;
    var value = m[2].replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').trim();
    if (m[1] === 'SUMMARY') ev.name = value;
    if (m[1] === 'DESCRIPTION') ev.desc = value;
    if (m[1] === 'DTSTART' || m[1] === 'DTEND') {
      var d = value.match(/^(\d{4})(\d{2})(\d{2})/);
      if (d) ev[m[1] === 'DTSTART' ? 'start' : 'end'] = d[1] + '-' + d[2] + '-' + d[3];
    }
  });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}

function load() {
  if (loading) return;
  loading = true; lastTry = clock();
  var key = cacheKey();
  var url = 'https://calendar.google.com/calendar/ical/' + encodeURIComponent(key + '#holiday@group.v.calendar.google.com') + '/public/basic.ics';
  notch.fetch(url, function (text, err, status) {
    loading = false;
    var days = !err && status === 200 ? parseICS(text) : [];
    if (!days.length) {
      failed = true;
      if (/permission/i.test(String(err))) lastTry = clock() - EVERY + 10000; // still being asked: try again soon
      notch.refresh(); return;
    }
    failed = false;
    var from = addDays(today(), -7);
    cache = { key: key, at: clock(), days: days.filter(function (d) { return d.date >= from; }) };
    notch.storage.set('cache', cache);
    notch.refresh();
  });
}

function current() { return cache && cache.key === cacheKey() ? cache : null; }

/// Days off: public holidays and collective leave (not observances).
function offSet() {
  var set = {};
  (current() ? current().days : []).forEach(function (d) { if (!d.observance) set[d.date] = d.name; });
  return set;
}
function isOff(key, off) { return weekend(key) || !!off[key]; }

/// The run of days off around `key`: { from, to, n }.
function block(key, off) {
  var from = key, to = key;
  while (isOff(addDays(from, -1), off)) from = addDays(from, -1);
  while (isOff(addDays(to, 1), off)) to = addDays(to, 1);
  return { from: from, to: to, n: daysBetween(from, to) + 1 };
}

/// One workday next to the block that, taken as leave, joins it to another run of days off.
function bridge(b, off) {
  var best = null;
  [addDays(b.from, -1), addDays(b.to, 1)].forEach(function (gap) {
    if (isOff(gap, off)) return;
    var extra = {}; extra[gap] = 'leave';
    for (var k in off) extra[k] = off[k];
    var joined = block(gap, extra);
    if (joined.n > b.n + 1 && (!best || joined.n > best.n)) best = { day: gap, n: joined.n };
  });
  return best;
}

function upcoming() {
  var c = current();
  if (!c) return [];
  var show = !!notch.settings.get('observances'), now = today();
  return c.days.filter(function (d) { return d.date >= now && (show || !d.observance); });
}

function when(key) {
  var n = daysBetween(today(), key);
  return n === 0 ? t('today') : n === 1 ? t('tomorrow') : tf('inDays', { n: n });
}

function remind() {
  if (!notch.settings.get('remind')) return;
  var now = new Date(clock());
  if (now.getHours() < 18) return;
  var tomorrow = addDays(today(), 1), off = offSet();
  if (!off[tomorrow] || reminded === tomorrow) return;
  reminded = tomorrow;
  notch.storage.set('reminded', reminded);
  notch.notify(t('remindTitle'), tf('remindBody', { name: off[tomorrow] }));
}

function tag(d) {
  if (d.observance) return t('observance');
  return /cuti bersama|collective leave/i.test(d.name) ? t('collective') : '';
}

function render() {
  if (!current() || clock() - (current() ? current().at : 0) > EVERY) {
    if (clock() - lastTry > 60000 || !lastTry) load();
  }
  if (!current()) return ui.text(failed ? t('failed') : t('loading'), { style: 'headline' });
  remind();
  var list = upcoming(), off = offSet();
  if (!list.length) return ui.text(t('none'), { style: 'headline' });
  var first = list[0];
  var parts = [
    ui.hstack([
      ui.symbol('lucide:party-popper', { size: 22, color: 'orange' }),
      ui.vstack([
        ui.text(t('next') + ' · ' + when(first.date), { style: 'caption', color: 'orange' }),
        ui.text(first.name, { style: 'headline', lines: 1 }),
        ui.text(fmt(first.date, true) + (tag(first) ? ' · ' + tag(first) : ''), { style: 'caption' })
      ], { spacing: 2 }),
      ui.spacer()
    ], { spacing: 12, padding: 12, background: 'orange', fill: true })
  ];
  if (!first.observance) {
    var b = block(first.date, off);
    if (b.n >= 3) parts.push(ui.row(tf('long', { n: b.n, from: fmt(b.from, true), to: fmt(b.to, true) }), '', { symbol: 'lucide:sun', color: 'green' }));
    var br = bridge(b, off);
    if (br) parts.push(ui.row(tf('bridge', { d: fmt(br.day, true), n: br.n }), '', { symbol: 'lucide:lightbulb', color: 'yellow' }));
  }
  var rest = list.slice(1, 5);
  if (rest.length) {
    parts.push(ui.text(t('upcoming'), { style: 'caption' }));
    parts.push(ui.vstack(rest.map(function (d) {
      return ui.hstack([
        ui.text(fmt(d.date, true), { style: 'monoFootnote', width: 92, color: d.observance ? 'tertiary' : 'secondary' }),
        ui.text(d.name, { style: 'callout', lines: 1, color: d.observance ? 'secondary' : undefined }),
        ui.spacer(),
        ui.text(when(d.date), { style: 'footnote', color: 'tertiary' })
      ], { spacing: 8 });
    }), { spacing: 6 }));
  }
  parts.push(ui.text(failed ? t('stale') : t('source'), { style: 'caption', color: failed ? 'orange' : 'tertiary' }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (notch.settings.get('beside') === false) return null;
  var list = upcoming().filter(function (d) { return !d.observance; });
  if (!list.length) return null;
  var n = daysBetween(today(), list[0].date);
  if (n > 3) return null;
  return { symbol: 'lucide:party-popper', text: n === 0 ? t('compactToday') : when(list[0].date), color: 'orange' };
}

function onSettingsChanged(key) {
  if (key === 'country' || key === null) { lastTry = 0; failed = false; load(); }
}
