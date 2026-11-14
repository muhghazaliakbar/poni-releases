// Time Tracker — one timer at a time across a few projects: tap to start, tap again to stop,
// today's time per project, this week's total, and a plain summary to paste into a timesheet.

var STRINGS = {
  en: {
    add: 'Add a project, e.g. 💼 Client A', edit: 'Edit', done: 'Done', full: 'Up to 8 projects',
    dup: 'That project is already on the list', empty: 'No projects yet',
    emptyHint: 'Type a project below and press Return, then tap it to start the timer.',
    stop: 'Stop', idle: 'Nothing running · tap a project to start', today: 'Today', week: 'This week',
    copy: 'Copy today', copied: 'Today’s time copied', nothingToday: 'Nothing tracked today yet',
    total: 'Total', h: 'h', m: 'm', stillTitle: 'Still working on {n}?', stillBody: 'The timer has been running for {t}.',
    started: '{n} started', stopped: '{n} · {t}',
    seed: ['💼 Client work', '📚 Learning']
  },
  id: {
    add: 'Tambah proyek, mis. 💼 Klien A', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 8 proyek',
    dup: 'Proyek itu sudah ada', empty: 'Belum ada proyek',
    emptyHint: 'Ketik nama proyek di bawah lalu tekan Enter, kemudian ketuk untuk memulai timer.',
    stop: 'Stop', idle: 'Tidak ada yang berjalan · ketuk proyek untuk mulai', today: 'Hari ini', week: 'Minggu ini',
    copy: 'Salin hari ini', copied: 'Waktu hari ini disalin', nothingToday: 'Belum ada waktu tercatat hari ini',
    total: 'Total', h: 'j', m: 'm', stillTitle: 'Masih mengerjakan {n}?', stillBody: 'Timer sudah berjalan {t}.',
    started: '{n} dimulai', stopped: '{n} · {t}',
    seed: ['💼 Pekerjaan klien', '📚 Belajar']
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 8, KEEP_DAYS = 120, DAY = 86400000;

function clock() { return Date.now(); } // tests replace this

var projects = notch.storage.get('projects');
if (!projects) {
  projects = t('seed').map(function (name, i) { return { id: 'p' + i, name: name }; });
  notch.storage.set('projects', projects);
}
var sessions = notch.storage.get('sessions') || []; // [{ p: project id, s: start ms, e: end ms }]
var running = notch.storage.get('running') || null; // { p, s }
var nudged = notch.storage.get('nudged') || 0;      // start time of the run we already asked about
var editing = false;

function save() {
  var oldest = clock() - KEEP_DAYS * DAY;
  sessions = sessions.filter(function (x) { return x.e >= oldest; });
  notch.storage.set('sessions', sessions);
  notch.storage.set('projects', projects);
  notch.storage.set('running', running);
}

function project(id) { return projects.filter(function (p) { return p.id === id; })[0]; }

function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
/// Monday 00:00 of the week containing `ms`.
function startOfWeek(ms) {
  var d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return startOfDay(d.getTime());
}

/// Milliseconds spent on a project (or all projects when `id` is null) between `from` and now, running timer included.
function spent(id, from) {
  var now = clock(), total = 0;
  var all = running ? sessions.concat([{ p: running.p, s: running.s, e: now }]) : sessions;
  all.forEach(function (x) {
    if (id && x.p !== id) return;
    var s = Math.max(x.s, from), e = Math.min(x.e, now);
    if (e > s) total += e - s;
  });
  return total;
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
/// 2h 15m, 45m, 0m.
function dur(ms) {
  var mins = Math.floor(ms / 60000), h = Math.floor(mins / 60), m = mins % 60;
  return h ? h + t('h') + ' ' + m + t('m') : m + t('m');
}
/// 1:02:03 for the running timer.
function elapsed(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
}

function stop() {
  if (!running) return null;
  var r = { p: running.p, s: running.s, e: clock() };
  if (r.e - r.s >= 1000) sessions.push(r);
  running = null;
  save();
  return r;
}

function start(id) {
  stop();
  running = { p: id, s: clock() };
  save();
}

function idleHours() {
  var v = notch.settings.get('idle');
  return v === undefined || v === null || v === '' ? 3 : Math.max(0, +v || 0);
}

/// One notification per run that goes past the check-in time.
function checkIdle() {
  var hours = idleHours();
  if (!running || !hours || nudged === running.s) return;
  var ms = clock() - running.s;
  if (ms < hours * 3600000) return;
  var p = project(running.p);
  nudged = running.s;
  notch.storage.set('nudged', nudged);
  notch.notify(tf('stillTitle', { n: p ? p.name : '?' }), tf('stillBody', { t: dur(ms) }));
}

function summary() {
  var from = startOfDay(clock()), lines = [], total = 0;
  projects.forEach(function (p) {
    var ms = spent(p.id, from);
    if (ms >= 60000) { lines.push(p.name + ' — ' + dur(ms)); total += ms; }
  });
  if (lines.length > 1) lines.push(t('total') + ' — ' + dur(total));
  return lines.join('\n');
}

function row(p) {
  var today = spent(p.id, startOfDay(clock()));
  var most = Math.max.apply(null, projects.map(function (x) { return spent(x.id, startOfDay(clock())); }).concat([60000]));
  var on = !!running && running.p === p.id;
  var parts = [
    ui.button('', 'tap:' + p.id, { symbol: on ? 'lucide:circle-stop' : 'lucide:circle-play', compact: true, style: on ? 'primary' : undefined }),
    ui.vstack([
      ui.hstack([
        ui.text(p.name, { style: 'headline', lines: 1, color: on ? 'accent' : undefined }),
        ui.spacer(),
        ui.text(dur(today), { style: 'monoFootnote', color: today ? 'secondary' : 'tertiary' })
      ], { spacing: 8 }),
      ui.progress(today / most, { color: on ? 'green' : 'teal', height: 4 })
    ], { spacing: 4 })
  ];
  if (editing) parts.push(ui.button('', 'remove:' + p.id, { symbol: 'lucide:x', compact: true }));
  return ui.hstack(parts, { spacing: 10, padding: 8, background: 'white', fill: true });
}

function render() {
  checkIdle();
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!projects.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var p = running && project(running.p);
  var head = p
    ? ui.hstack([
        ui.symbol('lucide:timer', { size: 18, color: 'green', animation: 'pulse' }),
        ui.text(p.name, { style: 'headline', lines: 1 }),
        ui.spacer(),
        ui.text(elapsed(clock() - running.s), { style: 'monoHeadline', color: 'green' }),
        ui.button(t('stop'), 'stop', { symbol: 'lucide:square', compact: true })
      ], { spacing: 10 })
    : ui.text(t('idle'), { style: 'callout', color: 'secondary' });
  var todayTotal = spent(null, startOfDay(clock()));
  return ui.vstack([
    head,
    ui.vstack(projects.map(row), { spacing: 6 }),
    ui.hstack([
      ui.text(t('today') + ' ' + dur(todayTotal) + ' · ' + t('week') + ' ' + dur(spent(null, startOfWeek(clock()))), { style: 'caption', color: 'secondary' }),
      ui.spacer(),
      ui.button(t('copy'), 'copy', { symbol: 'lucide:copy', compact: true })
    ], { spacing: 8 }),
    input
  ], { spacing: 10 });
}

function compact() {
  if (notch.settings.get('beside') === false || !running) return null;
  var p = project(running.p), s = Math.floor((clock() - running.s) / 1000);
  var text = Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60));
  return { symbol: 'lucide:timer', text: (p ? p.name + ' · ' : '') + text, color: 'green' };
}

function onAction(action, value) {
  if (action.indexOf('tap:') === 0) {
    var id = action.slice(4), p = project(id);
    if (!p) return;
    if (running && running.p === id) {
      var r = stop();
      if (r) notch.flash(tf('stopped', { n: p.name, t: dur(r.e - r.s) }), 'lucide:circle-stop');
    } else {
      start(id);
    }
  }
  if (action === 'stop') stop();
  if (action === 'copy') {
    var text = summary();
    if (!text) { notch.flash(t('nothingToday'), 'info.circle.fill'); return; }
    notch.clipboard.set(text);
    notch.flash(t('copied'), 'lucide:clipboard-check');
  }
  if (action === 'add') {
    var name = String(value || '').trim().slice(0, 40);
    if (!name) return;
    if (projects.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (projects.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    projects.push({ id: 'p' + clock().toString(36), name: name });
    save();
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) {
    var gone = action.slice(7);
    if (running && running.p === gone) stop();
    projects = projects.filter(function (x) { return x.id !== gone; });
    sessions = sessions.filter(function (x) { return x.p !== gone; });
    save();
  }
}

setInterval(checkIdle, 60000);
