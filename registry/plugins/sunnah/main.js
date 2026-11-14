// Hijri & Sunnah Fasts — today's Hijri date (Umm al-Qura, adjustable by a day) and the sunnah fasts in the
// next 30 days, with a reminder the evening before. Fully offline: the calendar comes from Intl.

var STRINGS = {
  en: {
    months: ['Muharram', 'Safar', 'Rabi’ al-Awwal', 'Rabi’ al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab',
      'Sha’ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa’dah', 'Dhu al-Hijjah'],
    era: 'AH', names: { mon: 'Monday', thu: 'Thursday', bidh: 'Ayyamul Bidh', arafah: 'Arafah', tasua: 'Tasu’a', asyura: 'Ashura', syawal: 'Six days of Shawwal' },
    today: 'Today', tomorrow: 'Tomorrow', inDays: 'in {n} days', upcoming: 'Sunnah fasts, next 30 days',
    none: 'No sunnah fasts in the next 30 days.', fastToday: 'Fasting today: {name}', fastTomorrow: 'Tomorrow: {name}',
    ramadanToday: 'Ramadan, day {d} · obligatory fast', ramadan: 'Ramadan (obligatory)', until: 'until {d}',
    forbidden: 'Fasting is not allowed today ({name}).', eid: 'Eid al-Fitr', adha: 'Eid al-Adha', tasyrik: 'Days of Tashriq',
    remindTitle: 'Fasting tomorrow: {name}', remindBody: 'Remember your intention and suhoor.',
    unsupported: 'This Mac can’t compute Hijri dates.'
  },
  id: {
    months: ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab',
      'Syakban', 'Ramadan', 'Syawal', 'Dzulkaidah', 'Dzulhijjah'],
    era: 'H', names: { mon: 'Senin', thu: 'Kamis', bidh: 'Ayyamul Bidh', arafah: 'Arafah', tasua: 'Tasu’a', asyura: 'Asyura', syawal: 'Enam hari Syawal' },
    today: 'Hari ini', tomorrow: 'Besok', inDays: '{n} hari lagi', upcoming: 'Puasa sunnah, 30 hari ke depan',
    none: 'Tidak ada puasa sunnah dalam 30 hari ke depan.', fastToday: 'Hari ini puasa {name}', fastTomorrow: 'Besok puasa {name}',
    ramadanToday: 'Ramadan hari ke-{d} · puasa wajib', ramadan: 'Ramadan (wajib)', until: 'sampai {d}',
    forbidden: 'Hari ini dilarang berpuasa ({name}).', eid: 'Idul Fitri', adha: 'Idul Adha', tasyrik: 'Hari Tasyrik',
    remindTitle: 'Besok puasa {name}', remindBody: 'Jangan lupa niat & sahur.',
    unsupported: 'Mac ini tidak bisa menghitung tanggal Hijriah.'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var DAYS_AHEAD = 30, SHOW = 7;

function clock() { return Date.now(); } // tests replace this

var reminded = notch.storage.get('reminded') || '';
var formatter = null, cache = {};
try {
  formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
} catch (e) { formatter = null; }

function offset() { var n = +notch.settings.get('offset'); return n === -1 || n === 1 ? n : 0; }
function remindHour() { var h = +notch.settings.get('remindAt'); return h >= 0 && h < 24 ? h : 21; }

function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// Local noon for a 'YYYY-MM-DD' key, so adding days never trips over a DST change.
function dateOf(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
function addDays(key, n) { var d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); }
function today() { return keyOf(new Date(clock())); }

/// { d, m, y } in the Hijri calendar for a Gregorian day key, shifted by the offset setting.
function hijri(key) {
  var id = key + '|' + offset();
  if (cache[id]) return cache[id];
  var out = { d: 0, m: 0, y: 0 };
  formatter.formatToParts(dateOf(addDays(key, offset()))).forEach(function (p) {
    if (p.type === 'day') out.d = parseInt(p.value, 10);
    if (p.type === 'month') out.m = parseInt(p.value, 10);
    if (p.type === 'year') out.y = parseInt(p.value, 10);
  });
  cache[id] = out;
  return out;
}

function hijriText(h) { return h.d + ' ' + t('months')[h.m - 1] + ' ' + h.y + ' ' + t('era'); }

/// What kind of day `key` is: { ramadan }, { forbidden: name }, or { codes: [reasons to fast] } (possibly empty).
function kind(key) {
  var h = hijri(key), w = dateOf(key).getDay(), codes = [];
  if (h.m === 9) return { ramadan: true, h: h };
  if (h.m === 10 && h.d === 1) return { forbidden: t('eid'), h: h };
  if (h.m === 12 && h.d === 10) return { forbidden: t('adha'), h: h };
  if (h.m === 12 && h.d >= 11 && h.d <= 13) return { forbidden: t('tasyrik'), h: h };
  if (notch.settings.get('monThu') !== false) {
    if (w === 1) codes.push('mon');
    if (w === 4) codes.push('thu');
  }
  if (h.m === 12 && h.d === 9) codes.push('arafah');
  if (h.m === 1 && h.d === 9) codes.push('tasua');
  if (h.m === 1 && h.d === 10) codes.push('asyura');
  if (h.m === 10 && h.d >= 2 && h.d <= 7) codes.push('syawal');
  if (h.d >= 13 && h.d <= 15) codes.push('bidh');
  return { codes: codes, h: h };
}

function names(codes) { var n = t('names'); return codes.map(function (c) { return n[c]; }).join(' · '); }

/// The fasts from today on: [{ key, codes }] plus one { key, ramadan, to } row for a Ramadan in the window.
function upcoming() {
  var start = today(), out = [], ramadanRow = null;
  for (var i = 0; i <= DAYS_AHEAD; i++) {
    var key = addDays(start, i), k = kind(key);
    if (k.ramadan) {
      if (!ramadanRow) { ramadanRow = { key: key, ramadan: true, to: key }; out.push(ramadanRow); } else ramadanRow.to = key;
      continue;
    }
    if (k.codes && k.codes.length) out.push({ key: key, codes: k.codes });
  }
  // A Ramadan that runs on past the window: show where it really ends.
  if (ramadanRow) while (kind(addDays(ramadanRow.to, 1)).ramadan) ramadanRow.to = addDays(ramadanRow.to, 1);
  return out;
}

function when(key) {
  var n = Math.round((dateOf(key) - dateOf(today())) / 86400000);
  return n === 0 ? t('today') : n === 1 ? t('tomorrow') : tf('inDays', { n: n });
}

function fmt(key) {
  return dateOf(key).toLocaleDateString(notch.locale === 'id' ? 'id-ID' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/// Tomorrow's sunnah fast reasons once the reminder hour has come, else null.
function tomorrowFast() {
  if (new Date(clock()).getHours() < remindHour()) return null;
  var k = kind(addDays(today(), 1));
  return k.codes && k.codes.length ? k.codes : null;
}

function remind() {
  if (notch.settings.get('remind') === false) return;
  var codes = tomorrowFast(), key = addDays(today(), 1);
  if (!codes || reminded === key) return;
  reminded = key;
  notch.storage.set('reminded', key);
  notch.notify(tf('remindTitle', { name: names(codes) }), t('remindBody'));
}

function render() {
  if (!formatter) return ui.text(t('unsupported'), { style: 'headline' });
  remind();
  var key = today(), k = kind(key);
  var status = k.ramadan ? tf('ramadanToday', { d: k.h.d })
    : k.forbidden ? tf('forbidden', { name: k.forbidden })
    : k.codes.length ? tf('fastToday', { name: names(k.codes) }) : null;
  var soon = tomorrowFast();
  if (!status && soon) status = tf('fastTomorrow', { name: names(soon) });
  var parts = [
    ui.hstack([
      ui.symbol('lucide:moon-star', { size: 24, color: 'teal' }),
      ui.vstack([
        ui.text(hijriText(k.h), { style: 'title', lines: 1 }),
        ui.text(dateOf(key).toLocaleDateString(notch.locale === 'id' ? 'id-ID' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          { style: 'caption' }),
        status ? ui.text(status, { style: 'callout', color: k.forbidden ? 'orange' : 'teal', lines: 1 }) : ui.text('', {})
      ], { spacing: 2 }),
      ui.spacer()
    ], { spacing: 12, padding: 12, background: 'teal', fill: true })
  ];
  var list = upcoming().filter(function (f) { return f.key > key; }).slice(0, SHOW);
  parts.push(ui.text(t('upcoming'), { style: 'caption' }));
  if (!list.length) parts.push(ui.text(t('none'), { style: 'callout', color: 'secondary' }));
  else parts.push(ui.vstack(list.map(function (f) {
    return ui.hstack([
      ui.text(fmt(f.key), { style: 'monoFootnote', width: 100, color: 'secondary' }),
      ui.text(f.ramadan ? t('ramadan') + ' · ' + tf('until', { d: fmt(f.to) }) : names(f.codes),
        { style: 'callout', lines: 1, color: f.ramadan ? 'teal' : undefined }),
      ui.spacer(),
      ui.text(when(f.key), { style: 'footnote', color: 'tertiary' })
    ], { spacing: 8 });
  }), { spacing: 6 }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (!formatter) return null;
  var codes = tomorrowFast();
  return codes ? { symbol: 'lucide:moon-star', text: tf('fastTomorrow', { name: names(codes) }), color: 'teal' } : null;
}

function onSettingsChanged() { cache = {}; }
