// Hitung Mundur — countdown to a date the user types (YYYY-MM-DD or YYYY-MM-DD HH:MM).

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
  var input = ui.input('Contoh: Gajian 2026-11-25  atau  Rilis 2026-12-01 09:00', 'set');
  if (!target) {
    return ui.vstack([
      ui.text('Belum ada target', { style: 'headline' }),
      ui.text('Ketik nama dan tanggal, lalu tekan Enter.', { style: 'caption' }),
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
        ui.text(date.toLocaleString('id-ID'), { style: 'caption' })
      ], { spacing: 2 }),
      ui.spacer(),
      ui.button('Hapus', 'clear', { symbol: 'xmark' })
    ]),
    ms <= 0
      ? ui.text('Sudah tiba! 🎉', { style: 'title', color: 'green' })
      : ui.hstack([box(String(p.d), 'hari'), box(pad(p.h), 'jam'), box(pad(p.m), 'menit'), box(pad(p.s), 'detik')], { spacing: 8 }),
    input
  ], { spacing: 12 });
}

function compact() {
  if (!target) return null;
  var ms = new Date(target.date).getTime() - Date.now();
  if (ms <= 0) return null;
  var p = parts(ms);
  return { symbol: 'calendar.badge.clock', text: p.d > 0 ? p.d + ' hari' : pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s), color: 'accent' };
}

function onAction(action, value) {
  if (action === 'set') {
    var t = parse(value);
    if (t) { target = t; notch.storage.set('target', t); }
    else notch.flash('Format: Nama YYYY-MM-DD', 'exclamationmark.triangle.fill');
  }
  if (action === 'clear') { target = null; notch.storage.set('target', null); }
}
