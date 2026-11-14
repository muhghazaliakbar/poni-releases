// Daily Planner — today's Top 3 priorities and time blocks ("09:00 Deep work", "13:30-14:00 Call Budi",
// "15:00 45m Review PR"), the block you're in with its progress, what's next, and a reminder before each one.

var STRINGS = {
  en: {
    add: 'A priority, or a block: 13:30-14:00 Call Budi', edit: 'Edit', done: 'Done',
    top: 'Top 3', topFull: 'Top 3 is full. Finish or remove one first.', blocks: 'Today', noTitle: 'Add what the block is for, e.g. 09:00 Deep work',
    empty: 'Plan your day', emptyHint: 'Type up to three priorities, and time blocks starting with a time: 09:00 Deep work, 13:30-14:00 Call Budi, 15:00 45m Review PR.',
    now: 'Now', left: '{t} left', nextIn: 'Next up in {t}', noneLeft: 'No more blocks today', noBlocks: 'No time blocks yet',
    carry: '{n} unfinished from yesterday', carryBtn: 'Carry over', dismiss: 'Dismiss',
    dayDone: '{d} of {n} done today', allDone: 'All {n} done today. Nice work 🎉', topCount: '{d}/{n}',
    soonTitle: '{title} in {t}', soonBody: '{from}–{to}',
    min: 'min', h: 'h', ms: 'm', hs: 'h', overlap: 'Overlaps {title}', dup: 'Already in Top 3'
  },
  id: {
    add: 'Prioritas, atau blok: 13:30-14:00 Telepon Budi', edit: 'Ubah', done: 'Selesai',
    top: 'Top 3', topFull: 'Top 3 sudah penuh. Selesaikan atau hapus satu dulu.', blocks: 'Hari ini', noTitle: 'Tulis untuk apa bloknya, mis. 09:00 Kerja fokus',
    empty: 'Rencanakan hari Anda', emptyHint: 'Ketik hingga tiga prioritas, dan blok waktu yang diawali jam: 09:00 Kerja fokus, 13:30-14:00 Telepon Budi, 15:00 45m Review PR.',
    now: 'Sekarang', left: 'sisa {t}', nextIn: 'Berikutnya {t} lagi', noneLeft: 'Tidak ada blok lagi hari ini', noBlocks: 'Belum ada blok waktu',
    carry: '{n} belum selesai dari kemarin', carryBtn: 'Bawa ke hari ini', dismiss: 'Abaikan',
    dayDone: '{d} dari {n} selesai hari ini', allDone: 'Semua {n} selesai hari ini. Mantap 🎉', topCount: '{d}/{n}',
    soonTitle: '{title} {t} lagi', soonBody: '{from}–{to}',
    min: 'mnt', h: 'jam', ms: 'm', hs: 'j', overlap: 'Bertabrakan dengan {title}', dup: 'Sudah ada di Top 3'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var TOP = 3, KEEP_DAYS = 60, SHOW = 6, DAY_MIN = 1440;

function clock() { return Date.now(); } // tests replace this

var days = notch.storage.get('days') || {}; // 'YYYY-MM-DD' → { top: [{ text, done }], blocks: [{ id, start, end, title, notified }], carried }
var editing = false;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// Local calendar day, `back` days ago.
function dayKey(back) {
  var d = new Date(clock());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (back || 0));
  return keyOf(d);
}
function today() {
  var k = dayKey(0);
  if (!days[k]) days[k] = { top: [], blocks: [], carried: false };
  return days[k];
}
/// Minutes since local midnight, with seconds as a fraction.
function nowMin() { var d = new Date(clock()); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
/// Today's timestamp for a minute of the day.
function at(min) { var d = new Date(clock()); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d.getTime(); }
function hhmm(min) { return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }

function save() {
  var oldest = dayKey(KEEP_DAYS);
  Object.keys(days).forEach(function (k) { if (k < oldest) delete days[k]; });
  notch.storage.set('days', days);
}

function defaultLength() {
  var v = +notch.settings.get('length');
  return v > 0 ? Math.min(240, Math.round(v)) : 30;
}
function remindLead() {
  var v = notch.settings.get('remind');
  return v === undefined || v === null || v === '' ? 5 : Math.max(0, +v || 0);
}

/// "9:30", "09.30", "14:00", "3pm", "2:30 pm" at the start of `s` → { min, len }. A bare "3" isn't a time.
function parseTime(s) {
  var m = String(s).match(/^(\d{1,2})(?:[:.](\d{2}))?(?:\s*(am|pm)\b)?/i);
  if (!m || (m[2] === undefined && !m[3])) return null;
  var h = +m[1], mi = m[2] === undefined ? 0 : +m[2];
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  if (h > 23 || mi > 59) return null;
  return { min: h * 60 + mi, len: m[0].length };
}

/// "09:00 Deep work", "13:30-14:00 Call Budi", "15:00 45m Review PR", "10:00 1h30m Workshop"
/// → { start, end, title } in minutes of the day; { start, end, title: '' } when the title is missing; null when it isn't a block.
function parseBlock(text, defLen) {
  var s = String(text || '').trim();
  var a = parseTime(s);
  if (!a) return null;
  var start = a.min, end = null, rest = s.slice(a.len);
  var range = rest.match(/^\s*(?:-|–|—|to|until|sampai|s\/d)\s*/i);
  var b = range ? parseTime(rest.slice(range[0].length)) : null;
  if (b) {
    end = b.min === 0 ? DAY_MIN : b.min;
    rest = rest.slice(range[0].length + b.len);
    if (end <= start) return null;
  } else {
    var d = rest.match(/^\s+(?:(\d{1,2})\s*(?:h|hr|hrs|j|jam))?\s*(?:(\d{1,3})\s*(?:m|min|mins|mnt|menit))?(?=\s|$)/i);
    if (d && (d[1] || d[2])) {
      var len = (+d[1] || 0) * 60 + (+d[2] || 0);
      if (len > 0) { end = start + len; rest = rest.slice(d[0].length); }
    }
  }
  if (end === null) end = start + (defLen || 30);
  return { start: start, end: Math.min(end, DAY_MIN), title: rest.replace(/^[\s\-–—:·]+/, '').trim() };
}

function sortedBlocks() { return today().blocks.slice().sort(function (x, y) { return x.start - y.start || x.end - y.end; }); }
function current() { var n = nowMin(); return sortedBlocks().filter(function (b) { return b.start <= n && n < b.end; })[0] || null; }
function next() { var n = nowMin(); return sortedBlocks().filter(function (b) { return b.start > n; })[0] || null; }

/// 12 min, 1 h 5 min (or 12m / 1h 5m when short).
function span(mins, short) {
  mins = Math.max(0, Math.ceil(mins));
  var h = Math.floor(mins / 60), m = mins % 60;
  if (short) return h ? h + t('hs') + (m ? ' ' + m + t('ms') : '') : m + t('ms');
  return h ? h + ' ' + t('h') + (m ? ' ' + m + ' ' + t('min') : '') : m + ' ' + t('min');
}

/// One reminder per block, `lead` minutes before it starts. Blocks that already started are never announced late.
function tick() {
  var lead = remindLead(), now = clock(), changed = false;
  if (!days[dayKey(0)]) return;
  today().blocks.forEach(function (b) {
    if (b.notified) return;
    var s = at(b.start);
    if (now >= s) { b.notified = true; changed = true; return; }
    if (lead > 0 && now >= s - lead * 60000) {
      b.notified = true; changed = true;
      notch.notify(tf('soonTitle', { title: b.title, t: span((s - now) / 60000) }), tf('soonBody', { from: hhmm(b.start), to: hhmm(b.end) }));
    }
  });
  if (changed) save();
}

/// The most recent earlier day (within a week) with unfinished priorities not already on today's list.
function leftovers() {
  var d = today();
  if (d.carried || d.top.length >= TOP) return [];
  for (var back = 1; back <= 7; back++) {
    var prev = days[dayKey(back)];
    if (!prev || !prev.top.length) continue;
    return prev.top.filter(function (x) {
      return !x.done && !d.top.some(function (y) { return y.text.toLowerCase() === x.text.toLowerCase(); });
    });
  }
  return [];
}

function topRow(x, i) {
  var parts = [
    ui.button('', 'top:' + i, { symbol: x.done ? 'lucide:circle-check-big' : 'lucide:circle', compact: true, style: x.done ? 'primary' : undefined }),
    ui.text(x.text, { style: 'headline', lines: 1, color: x.done ? 'tertiary' : undefined }),
    ui.spacer()
  ];
  if (editing) parts.push(ui.button('', 'rmtop:' + i, { symbol: 'lucide:x', compact: true }));
  return ui.hstack(parts, { spacing: 10 });
}

function blockRow(b) {
  var n = nowMin(), live = b.start <= n && n < b.end, past = n >= b.end;
  var line = ui.hstack([
    ui.symbol(past ? 'lucide:circle-check' : live ? 'lucide:circle-play' : 'lucide:circle', { size: 13, color: past ? 'tertiary' : live ? 'green' : 'secondary' }),
    ui.text(hhmm(b.start) + '–' + hhmm(b.end), { style: 'monoFootnote', color: live ? 'green' : past ? 'tertiary' : 'secondary' }),
    ui.text(b.title, { style: live ? 'headline' : 'callout', lines: 1, color: past ? 'tertiary' : undefined }),
    ui.spacer()
  ].concat(live ? [ui.text(tf('left', { t: span(b.end - n) }), { style: 'caption', color: 'green' })] : [])
   .concat(editing ? [ui.button('', 'rmblock:' + b.id, { symbol: 'lucide:x', compact: true })] : []), { spacing: 8 });
  if (!live) return line;
  return ui.vstack([line, ui.progress((n - b.start) / (b.end - b.start), { color: 'green', height: 4 })],
    { spacing: 4, padding: 6, background: 'white', fill: true });
}

function render() {
  tick();
  var d = today();
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  var carry = leftovers();
  var carryCard = carry.length ? ui.hstack([
    ui.symbol('lucide:history', { size: 14, color: 'orange' }),
    ui.text(tf('carry', { n: carry.length }), { style: 'callout', lines: 1 }),
    ui.spacer(),
    ui.button(t('carryBtn'), 'carry', { symbol: 'lucide:arrow-right', compact: true, style: 'primary' }),
    ui.button('', 'dismiss', { symbol: 'lucide:x', compact: true })
  ], { spacing: 8, padding: 6, background: 'white', fill: true }) : null;

  if (!d.top.length && !d.blocks.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' })]
      .concat(carryCard ? [carryCard] : []).concat([input]), { spacing: 10 });
  }

  var cur = current(), nx = next(), n = nowMin();
  var head = cur
    ? ui.hstack([ui.text(t('now') + ' · ' + cur.title, { style: 'headline', lines: 1, color: 'green' }), ui.spacer(),
                 ui.text(tf('left', { t: span(cur.end - n) }), { style: 'monoFootnote', color: 'green' })], { spacing: 8 })
    : nx
      ? ui.hstack([ui.text(tf('nextIn', { t: span(nx.start - n) }) + ' · ' + nx.title, { style: 'headline', lines: 1 }), ui.spacer(),
                   ui.text(hhmm(nx.start), { style: 'monoFootnote', color: 'secondary' })], { spacing: 8 })
      : ui.text(d.blocks.length ? t('noneLeft') : t('noBlocks'), { style: 'headline', color: 'secondary' });

  var parts = [head];
  if (carryCard) parts.push(carryCard);
  if (d.top.length) {
    var doneCount = d.top.filter(function (x) { return x.done; }).length;
    parts.push(ui.vstack([
      ui.hstack([ui.text(t('top'), { style: 'caption', weight: 'semibold', color: 'secondary' }), ui.spacer(),
                 ui.text(tf('topCount', { d: doneCount, n: d.top.length }), { style: 'monoFootnote', color: doneCount === d.top.length ? 'green' : 'tertiary' })])
    ].concat(d.top.map(topRow)), { spacing: 4 }));
  }
  var blocks = sortedBlocks();
  if (blocks.length) {
    // The part of the day that matters: from the last finished block on.
    var first = 0;
    while (first < blocks.length - SHOW && blocks[first + 1].end <= n) first++;
    parts.push(ui.vstack(blocks.slice(first, first + SHOW).map(blockRow), { spacing: 4 }));
  }
  var last = blocks.length ? blocks[blocks.length - 1].end : 0;
  if (d.top.length && (new Date(clock()).getHours() >= 17 || (last && n >= last))) {
    var dn = d.top.filter(function (x) { return x.done; }).length;
    parts.push(ui.text(dn === d.top.length ? tf('allDone', { n: dn }) : tf('dayDone', { d: dn, n: d.top.length }),
      { style: 'caption', color: dn === d.top.length ? 'green' : 'secondary' }));
  }
  parts.push(input);
  return ui.vstack(parts, { spacing: 10 });
}

function compact() {
  if (notch.settings.get('beside') === false || !days[dayKey(0)]) return null;
  var cur = current(), n = nowMin();
  if (cur) return { symbol: 'lucide:calendar-clock', text: cur.title + ' · ' + span(cur.end - n, true), color: 'green' };
  var nx = next();
  if (nx && nx.start - n <= 60) return { symbol: 'lucide:calendar-clock', text: nx.title + ' · ' + tf('nextIn', { t: span(nx.start - n, true) }).toLowerCase() };
  return null;
}

function onAction(action, value) {
  var d = today();
  if (action === 'add') {
    var text = String(value || '').trim();
    if (!text) return;
    var b = parseBlock(text, defaultLength());
    if (b) {
      if (!b.title) { notch.flash(t('noTitle'), 'exclamationmark.triangle.fill'); return; }
      d.blocks.push({ id: 'b' + clock().toString(36) + d.blocks.length, start: b.start, end: b.end, title: b.title, notified: false });
      var clash = d.blocks.filter(function (x) { return x.start < b.end && b.start < x.end; })[0];
      if (clash && clash.title !== b.title) notch.flash(tf('overlap', { title: clash.title }), 'info.circle.fill');
      save(); tick();
      return;
    }
    if (d.top.some(function (x) { return x.text.toLowerCase() === text.toLowerCase(); })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (d.top.length >= TOP) { notch.flash(t('topFull'), 'exclamationmark.triangle.fill'); return; }
    d.top.push({ text: text, done: false });
    save();
  }
  if (action.indexOf('top:') === 0) {
    var x = d.top[+action.slice(4)];
    if (x) {
      x.done = !x.done;
      save();
      var dn = d.top.filter(function (y) { return y.done; }).length;
      if (x.done && dn === d.top.length) notch.flash(tf('allDone', { n: dn }), 'lucide:circle-check-big');
    }
  }
  if (action === 'carry') {
    leftovers().slice(0, TOP - d.top.length).forEach(function (y) { d.top.push({ text: y.text, done: false }); });
    d.carried = true;
    save();
  }
  if (action === 'dismiss') { d.carried = true; save(); }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('rmtop:') === 0) { d.top.splice(+action.slice(6), 1); save(); }
  if (action.indexOf('rmblock:') === 0) {
    var id = action.slice(8);
    d.blocks = d.blocks.filter(function (y) { return y.id !== id; });
    save();
  }
}

setInterval(tick, 30000);
