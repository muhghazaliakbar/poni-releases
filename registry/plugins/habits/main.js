// Habits — a few daily habits: tick them off, keep the streak, see the last 7 days.

var STRINGS = {
  en: {
    add: 'Add a habit, e.g. 🏃 Run 20 minutes', edit: 'Edit', done: 'Done', full: 'Up to 6 habits',
    today: 'Today', progress: '{d} of {n} done', allDone: 'All done today. 🎉', empty: 'No habits yet',
    emptyHint: 'Type a habit below and press Return. An emoji at the start makes it easy to spot.',
    streak: '{n}-day streak', dup: 'That habit is already on the list',
    seed: ['💪 Exercise', '📖 Read 10 pages', '💧 8 glasses of water']
  },
  id: {
    add: 'Tambah kebiasaan, mis. 🏃 Lari 20 menit', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 6 kebiasaan',
    today: 'Hari ini', progress: '{d} dari {n} selesai', allDone: 'Semua selesai hari ini. 🎉', empty: 'Belum ada kebiasaan',
    emptyHint: 'Ketik kebiasaan di bawah lalu tekan Enter. Emoji di awal membuatnya mudah dikenali.',
    streak: 'streak {n} hari', dup: 'Kebiasaan itu sudah ada',
    seed: ['💪 Olahraga', '📖 Baca 10 halaman', '📿 Mengaji']
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 6, KEEP_DAYS = 400;

function clock() { return Date.now(); } // tests replace this

var habits = notch.storage.get('habits');
if (!habits) {
  habits = t('seed').map(function (name, i) { return { id: 'h' + i, name: name }; });
  notch.storage.set('habits', habits);
}
var history = notch.storage.get('history') || {}; // 'YYYY-MM-DD' → [habit id]
var editing = false;

function pad(n) { return (n < 10 ? '0' : '') + n; }
/// Local calendar day, `back` days ago.
function day(back) {
  var d = new Date(clock());
  d.setHours(12, 0, 0, 0); // noon: stepping back by days never trips over a DST change
  d.setDate(d.getDate() - (back || 0));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function isDone(h, key) { return (history[key] || []).indexOf(h.id) >= 0; }

/// Days in a row the habit was done, ending today, or yesterday when today isn't ticked yet.
function streak(h) {
  var back = isDone(h, day(0)) ? 0 : 1, n = 0;
  while (isDone(h, day(back + n)) && n < KEEP_DAYS) n++;
  return n;
}

function save() {
  // Forget days older than we ever show or count.
  var oldest = day(KEEP_DAYS);
  Object.keys(history).forEach(function (k) { if (k < oldest) delete history[k]; });
  notch.storage.set('history', history);
  notch.storage.set('habits', habits);
}

function week(h) {
  var dots = [];
  for (var back = 6; back >= 0; back--) {
    var on = isDone(h, day(back));
    dots.push(ui.symbol(on ? 'lucide:circle-check' : 'lucide:circle', { size: 13, color: on ? 'green' : 'tertiary' }));
  }
  return ui.hstack(dots, { spacing: 4 });
}

function row(h, index) {
  var on = isDone(h, day(0)), s = streak(h);
  return ui.hstack([
    ui.button('', 'toggle:' + h.id, { symbol: on ? 'lucide:circle-check-big' : 'lucide:circle', compact: true, style: on ? 'primary' : undefined }),
    ui.text(h.name, { style: 'headline', lines: 1, color: on ? 'secondary' : undefined }),
    ui.spacer(),
    s > 0 ? ui.text('🔥 ' + s, { style: 'monoFootnote', color: 'orange' }) : ui.text('', {}),
    week(h)
  ].concat(editing ? [ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true })] : []),
  { spacing: 10, padding: 8, background: 'white', fill: true });
}

function render() {
  var doneToday = habits.filter(function (h) { return isDone(h, day(0)); }).length;
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!habits.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var all = doneToday === habits.length;
  return ui.vstack([
    ui.hstack([
      ui.text(all ? t('allDone') : t('today') + ' · ' + tf('progress', { d: doneToday, n: habits.length }), { style: 'headline' }),
      ui.spacer(),
      ui.progress(doneToday / habits.length, { color: 'green', height: 6 })
    ], { spacing: 12 }),
    ui.vstack(habits.map(row), { spacing: 6 }),
    input
  ], { spacing: 10 });
}

function compact() {
  if (!notch.settings.get('beside') || !habits.length) return null;
  var left = habits.filter(function (h) { return !isDone(h, day(0)); }).length;
  return left ? { symbol: 'lucide:list-checks', text: (habits.length - left) + '/' + habits.length, color: 'green' } : null;
}

function onAction(action, value) {
  if (action.indexOf('toggle:') === 0) {
    var id = action.slice(7), key = day(0), list = history[key] || [];
    var i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    history[key] = list;
    save();
    var h = habits.filter(function (x) { return x.id === id; })[0];
    if (i < 0 && h && streak(h) > 1) notch.flash(h.name + ' · ' + tf('streak', { n: streak(h) }), 'lucide:flame');
  }
  if (action === 'add') {
    var name = String(value || '').trim();
    if (!name) return;
    if (habits.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (habits.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    habits.push({ id: 'h' + clock().toString(36), name: name });
    save();
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) { habits.splice(+action.slice(7), 1); save(); }
}
