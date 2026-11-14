// Snippets — saved text copied with one click. Placeholders are filled in at copy time:
// {date} {date+7} {date-1} {time} {datetime} {day} {iso} {clipboard} {uuid}, and {cursor} is dropped.

var STRINGS = {
  en: {
    add: 'Add as name: text  ·  \\n for a new line', edit: 'Edit', done: 'Done', full: 'Up to 30 snippets',
    filter: 'Search snippets', clear: 'Clear', empty: 'No snippets yet', noMatch: 'No snippet matches “{q}”',
    emptyHint: 'Type name: text below and press Return. {date}, {time}, {clipboard} and {uuid} are filled in when you copy.',
    copied: 'Copied: {n}', saved: 'Saved: {n}', updated: 'Updated: {n}', more: '+{n} more · search to find them',
    help: '{date} {date+7} {time} {datetime} {day} {clipboard} {uuid} {cursor}',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    seed: [
      ['Sign-off', 'Thanks, and have a good {day}!\n\nBest regards,\n'],
      ['Meeting notes', 'Meeting notes · {date}\n\nAttendees:\n\nAgenda:\n1. {cursor}\n\nAction items:\n- '],
      ['Follow-up', 'Hi! Just following up on my message from {date-3}. Could you take a look when you have a moment?']
    ]
  },
  id: {
    add: 'Tambah sebagai nama: teks  ·  \\n untuk baris baru', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 30 snippet',
    filter: 'Cari snippet', clear: 'Hapus', empty: 'Belum ada snippet', noMatch: 'Tidak ada snippet yang cocok dengan “{q}”',
    emptyHint: 'Ketik nama: teks di bawah lalu tekan Enter. {date}, {time}, {clipboard} dan {uuid} terisi saat disalin.',
    copied: 'Disalin: {n}', saved: 'Tersimpan: {n}', updated: 'Diperbarui: {n}', more: '+{n} lagi · cari untuk menemukannya',
    help: '{date} {date+7} {time} {datetime} {day} {clipboard} {uuid} {cursor}',
    months: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
    days: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    seed: [
      ['Salam penutup', 'Terima kasih, selamat hari {day}!\n\nSalam,\n'],
      ['Notulen rapat', 'Notulen rapat · {date}\n\nPeserta:\n\nAgenda:\n1. {cursor}\n\nTindak lanjut:\n- '],
      ['Bukti transfer', 'Halo, sudah saya transfer ke BCA 123 456 7890 a.n. … sebesar Rp … pada {datetime}. Mohon dicek ya, terima kasih 🙏']
    ]
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 30, SHOW = 6, DAY = 86400000;

function clock() { return Date.now(); } // tests replace this

var snippets = notch.storage.get('snippets'); // [{ id, name, text, pinned, used (ms) }]
if (!snippets) {
  snippets = t('seed').map(function (s, i) { return { id: 's' + i, name: s[0], text: s[1], pinned: false, used: 0 }; });
  notch.storage.set('snippets', snippets);
}
var query = '', editing = false;

function save() { notch.storage.set('snippets', snippets); }

function pad(n) { return (n < 10 ? '0' : '') + n; }
/// Today (plus `offset` days) at local noon, so day steps never trip over DST.
function dayAt(offset) {
  var d = new Date(clock());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}
function longDate(d) {
  return notch.locale === 'id'
    ? d.getDate() + ' ' + t('months')[d.getMonth()] + ' ' + d.getFullYear()
    : t('months')[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function timeNow() {
  var d = new Date(clock());
  return pad(d.getHours()) + (notch.locale === 'id' ? '.' : ':') + pad(d.getMinutes());
}
function uuid() {
  if (notch.crypto && notch.crypto.uuid) return String(notch.crypto.uuid()).toLowerCase();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

/// Fills in the placeholders; unknown {words} stay as typed.
function expand(text) {
  var clip = null;
  return String(text).replace(/\{(date|day|iso)([+-]\d{1,4})?\}|\{(time|datetime|clipboard|cursor|uuid)\}/g, function (all, dated, offset, plain) {
    if (dated) {
      var d = dayAt(offset ? +offset : 0);
      if (dated === 'date') return longDate(d);
      if (dated === 'day') return t('days')[d.getDay()];
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    if (plain === 'time') return timeNow();
    if (plain === 'datetime') return longDate(dayAt(0)) + (notch.locale === 'id' ? ' pukul ' : ', ') + timeNow();
    if (plain === 'clipboard') {
      if (clip === null) clip = (notch.clipboard.get && notch.clipboard.get()) || '';
      return clip;
    }
    if (plain === 'uuid') return uuid();
    return ''; // {cursor}
  });
}

/// "name: text" (with \n for new lines) → { name, text }. Without a name, the text's start becomes one.
function parse(input) {
  var s = String(input || '').trim();
  if (!s) return null;
  var colon = s.indexOf(':'), name, text;
  // A colon right after a short name (not inside {…} or a URL) separates the two.
  if (colon > 0 && colon <= 40 && s.slice(0, colon).indexOf('{') < 0 && s.charAt(colon + 1) !== '/') {
    name = s.slice(0, colon).trim();
    text = s.slice(colon + 1).replace(/^ /, '');
  } else {
    text = s;
    name = s.replace(/\\n/g, ' ').replace(/\{[^}]*\}/g, '').trim().slice(0, 24) || '…';
  }
  text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  if (!name || !text.trim()) return null;
  return { name: name, text: text };
}

/// Pinned first, then the most recently used, then the order they were added.
function ordered() {
  return snippets.map(function (s, i) { return { s: s, i: i }; }).sort(function (a, b) {
    if (!!a.s.pinned !== !!b.s.pinned) return a.s.pinned ? -1 : 1;
    if ((b.s.used || 0) !== (a.s.used || 0)) return (b.s.used || 0) - (a.s.used || 0);
    return a.i - b.i;
  }).map(function (x) { return x.s; });
}
function matches(s) {
  if (!query) return true;
  var q = query.toLowerCase();
  return s.name.toLowerCase().indexOf(q) >= 0 || s.text.toLowerCase().indexOf(q) >= 0;
}
function byId(id) { return snippets.filter(function (s) { return s.id === id; })[0]; }

function preview(text) { return String(text).replace(/\s*\n\s*/g, ' ⏎ ').slice(0, 80); }

function row(s) {
  var parts = [
    ui.button('', 'copy:' + s.id, { symbol: 'lucide:copy', compact: true }),
    ui.vstack([
      ui.text(s.name, { style: 'headline', lines: 1 }),
      ui.text(preview(s.text), { style: 'caption', color: 'tertiary', lines: 1 })
    ], { spacing: 1 }),
    ui.spacer()
  ];
  if (editing) parts.push(ui.button('', 'remove:' + s.id, { symbol: 'lucide:x', compact: true }));
  else parts.push(ui.button('', 'pin:' + s.id, { symbol: 'lucide:pin', compact: true, style: s.pinned ? 'primary' : undefined }));
  return ui.hstack(parts, { spacing: 10, paddingX: 8, paddingY: 6, background: 'white', fill: true });
}

function render() {
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!snippets.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var list = ordered().filter(matches);
  var items = [];
  if (snippets.length > SHOW) {
    items.push(ui.hstack([
      ui.symbol('lucide:search', { size: 14, color: 'secondary' }),
      ui.input(t('filter'), 'filter', { value: query })
    ].concat(query ? [ui.button(t('clear'), 'clear', { symbol: 'lucide:x', compact: true })] : []), { spacing: 8 }));
  }
  if (!list.length) items.push(ui.text(tf('noMatch', { q: query }), { style: 'callout', color: 'secondary' }));
  items.push(ui.vstack(list.slice(0, SHOW).map(row), { spacing: 4 }));
  if (list.length > SHOW) items.push(ui.text(tf('more', { n: list.length - SHOW }), { style: 'caption', color: 'tertiary' }));
  items.push(input);
  if (editing) items.push(ui.text(t('help'), { style: 'monoFootnote', color: 'tertiary' }));
  return ui.vstack(items, { spacing: 8 });
}

function onAction(action, value) {
  if (action.indexOf('copy:') === 0) {
    var s = byId(action.slice(5));
    if (!s) return;
    notch.clipboard.set(expand(s.text));
    s.used = clock();
    save();
    notch.flash(tf('copied', { n: s.name }), 'lucide:clipboard-check');
  }
  if (action === 'add') {
    var x = parse(value);
    if (!x) return;
    // Same name again: replace its text, so editing is just typing it anew.
    var same = snippets.filter(function (y) { return y.name.toLowerCase() === x.name.toLowerCase(); })[0];
    if (same) { same.text = x.text; save(); notch.flash(tf('updated', { n: same.name }), 'lucide:check'); return; }
    if (snippets.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    snippets.push({ id: 's' + clock().toString(36) + snippets.length, name: x.name, text: x.text, pinned: false, used: clock() });
    save();
    notch.flash(tf('saved', { n: x.name }), 'lucide:check');
  }
  if (action === 'filter') query = String(value || '').trim();
  if (action === 'clear') query = '';
  if (action.indexOf('pin:') === 0) { var p = byId(action.slice(4)); if (p) { p.pinned = !p.pinned; save(); } }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) {
    var gone = action.slice(7);
    snippets = snippets.filter(function (y) { return y.id !== gone; });
    save();
  }
}
