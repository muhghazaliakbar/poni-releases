// Countdown — countdown to a date the user types (YYYY-MM-DD or YYYY-MM-DD HH:MM).

var STRINGS = {
  en: {
    placeholder: 'e.g. Payday 2026-11-25  or  Launch 2026-12-01 09:00', emptyTitle: 'No date set',
    emptyHint: 'Type a name and a date, then press Return.', remove: 'Remove', arrived: 'It’s here! 🎉',
    days: 'days', hours: 'hours', minutes: 'min', seconds: 'sec', daysShort: '{n} days', dayShort: '1 day',
    format: 'Format: Name YYYY-MM-DD'
  },
  id: {
    placeholder: 'Contoh: Gajian 2026-11-25  atau  Rilis 2026-12-01 09:00', emptyTitle: 'Belum ada target',
    emptyHint: 'Ketik nama dan tanggal, lalu tekan Enter.', remove: 'Hapus', arrived: 'Sudah tiba! 🎉',
    days: 'hari', hours: 'jam', minutes: 'menit', seconds: 'detik', daysShort: '{n} hari', dayShort: '1 hari',
    format: 'Format: Nama YYYY-MM-DD'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }

var target = notch.storage.get('target'); // { label, date: ISO string }

function parse(text) {
  var m = String(text).trim().match(/^(.*?)\s*(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  var d = new Date(+m[2], +m[3] - 1, +m[4], m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  return { label: m[1] || 'Target', date: d.toISOString() };
}

function parts(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function box(value, label) {
  return ui.vstack([ui.text(value, { style: 'title' }), ui.text(label, { style: 'caption' })],
    { spacing: 2, align: 'center', padding: 10, background: 'white', fill: true });
}

function render() {
  var input = ui.input(t('placeholder'), 'set');
  if (!target) {
    return ui.vstack([
      ui.text(t('emptyTitle'), { style: 'headline' }),
      ui.text(t('emptyHint'), { style: 'caption' }),
      input
    ], { spacing: 10 });
  }
  var date = new Date(target.date);
  var ms = date.getTime() - Date.now();
  var p = parts(ms);
  return ui.vstack([
    ui.hstack([
      ui.symbol('calendar.badge.clock', { size: 22, color: 'accent' }),
      ui.vstack([
        ui.text(target.label, { style: 'headline' }),
        ui.text(date.toLocaleString(notch.locale === 'id' ? 'id-ID' : 'en-US'), { style: 'caption' })
      ], { spacing: 2 }),
      ui.spacer(),
      ui.button(t('remove'), 'clear', { symbol: 'xmark' })
    ]),
    ms <= 0
      ? ui.text(t('arrived'), { style: 'title', color: 'green' })
      : ui.hstack([box(String(p.d), t('days')), box(pad(p.h), t('hours')), box(pad(p.m), t('minutes')), box(pad(p.s), t('seconds'))], { spacing: 8 }),
    input
  ], { spacing: 12 });
}

function compact() {
  if (!target) return null;
  var ms = new Date(target.date).getTime() - Date.now();
  if (ms <= 0) return null;
  var p = parts(ms);
  return { symbol: 'calendar.badge.clock', text: p.d > 1 ? t('daysShort').replace('{n}', p.d) : p.d === 1 ? t('dayShort') : pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s), color: 'accent' };
}

function onAction(action, value) {
  if (action === 'set') {
    var parsed = parse(value);
    if (parsed) { target = parsed; notch.storage.set('target', parsed); }
    else notch.flash(t('format'), 'exclamationmark.triangle.fill');
  }
  if (action === 'clear') { target = null; notch.storage.set('target', null); }
}
