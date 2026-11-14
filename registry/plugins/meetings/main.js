// Meeting Insights — how today's calendar eats your workday: hours in meetings, the free blocks left for focused
// work, back-to-back stretches, this week's meeting hours per weekday, and the next call with its Join button.
// Reads macOS Calendar through notch.calendar; nothing leaves this Mac.

var STRINGS = {
  en: {
    allowTitle: 'See how much of your day is meetings', allowHint: 'Poni reads your calendars on this Mac to find meetings and free time.',
    allow: 'Allow', askTitle: 'Asking for calendar access…', askHint: 'Approve the macOS prompt to see your meeting insights.',
    deniedTitle: 'Calendar access is off',
    deniedHint: 'Allow Poni in System Settings → Privacy & Security → Calendars, then come back here.',
    openPrivacy: 'Open Privacy Settings', loading: 'Reading your calendar…',
    inMeetings: '{d} in meetings', ofDay: 'of your {w} workday · {f} free', noMeetings: 'No meetings today',
    noMeetingsHint: 'The whole workday is yours.', dayOver: 'Workday’s over',
    now: 'Now', next: 'Next', until: 'until {t}', inTime: 'in {d}', tomorrow: 'tomorrow {t}', join: 'Join',
    focusTitle: 'Focus time left', longest: 'longest {d}', noFocus: 'No free block of {d} or more left today',
    backToBack: '{n} meetings back to back, {a}–{b}', week: 'This week', more: '+{n}',
    compactFree: 'Free until {t}', compactSoon: 'Meeting in {d}', compactBusy: 'Free at {t}',
    remindTitle: '{n} starts in 2 min', remindBody: '{s} · {t}–{e}', call: 'Call',
    h: 'h', min: 'min', sep: ':', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  id: {
    allowTitle: 'Lihat berapa banyak hari Anda habis untuk rapat', allowHint: 'Poni membaca kalender di Mac ini untuk menemukan rapat dan waktu kosong.',
    allow: 'Izinkan', askTitle: 'Meminta akses kalender…', askHint: 'Setujui permintaan macOS agar wawasan rapat tampil di sini.',
    deniedTitle: 'Akses kalender dimatikan',
    deniedHint: 'Izinkan Poni di Pengaturan Sistem → Privasi & Keamanan → Kalender, lalu kembali ke sini.',
    openPrivacy: 'Buka Pengaturan Privasi', loading: 'Membaca kalender…',
    inMeetings: '{d} untuk rapat', ofDay: 'dari {w} jam kerja · {f} kosong', noMeetings: 'Tidak ada rapat hari ini',
    noMeetingsHint: 'Seluruh jam kerja milik Anda.', dayOver: 'Jam kerja sudah selesai',
    now: 'Sekarang', next: 'Berikutnya', until: 'sampai {t}', inTime: '{d} lagi', tomorrow: 'besok {t}', join: 'Gabung',
    focusTitle: 'Sisa waktu fokus', longest: 'terpanjang {d}', noFocus: 'Tidak ada waktu kosong {d} atau lebih hari ini',
    backToBack: '{n} rapat beruntun, {a}–{b}', week: 'Minggu ini', more: '+{n}',
    compactFree: 'Kosong sampai {t}', compactSoon: 'Rapat {d} lagi', compactBusy: 'Kosong pukul {t}',
    remindTitle: '{n} mulai 2 menit lagi', remindBody: '{s} · {t}–{e}', call: 'Panggilan',
    h: 'j', min: 'mnt', sep: '.', days: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

function clock() { return Date.now(); } // tests replace this

var MIN = 60000, GAP = 10 * MIN, SOON = 15 * MIN, REMIND = 2 * MIN, CACHE = 30000;
var cache = null, cachedAt = 0;
var reminded = notch.storage.get('reminded') || {};   // 'start|title' → true, one reminder per call

// ---- Time helpers ----

function pad(n) { return (n < 10 ? '0' : '') + n; }
function hm(ms) { var d = new Date(ms); return pad(d.getHours()) + t('sep') + pad(d.getMinutes()); }
function dur(ms) {
  var m = Math.round(ms / MIN);
  if (m < 60) return m + ' ' + t('min');
  var h = Math.floor(m / 60), r = m % 60;
  return h + ' ' + t('h') + (r ? ' ' + r + ' ' + t('min') : '');
}
function startOfDay(ms, plusDays) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (plusDays || 0)).getTime(); }
function monday(ms) { var d = new Date(ms); return startOfDay(ms, -((d.getDay() + 6) % 7)); }
function at(dayMs, hour) { var d = new Date(dayMs); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).getTime(); }

function workHours() {
  var a = +(notch.settings.get('workStart') || 9), b = +(notch.settings.get('workEnd') || 17);
  if (!(b > a)) b = Math.min(24, a + 8);
  return { start: a, end: b };
}
function minFocus() { return Math.max(15, +(notch.settings.get('minFocus') || 30)) * MIN; }

// ---- Calendar ----

/// Timed events from this week's Monday through next week's Sunday, so "this week" and the next 7 days are both in.
function events() {
  if (cache && clock() - cachedAt < CACHE) return cache;
  var from = notch.features && notch.features.indexOf('calendar-from') >= 0;
  var raw = from ? notch.calendar.events(14, monday(clock())) : notch.calendar.events(7);
  if (!raw) return null;
  cache = raw.filter(function (e) { return !e.allDay && e.end > e.start; })
    .sort(function (a, b) { return a.start - b.start || a.end - b.end; });
  cachedAt = clock();
  return cache;
}

/// Overlapping (or touching within `gap`) intervals merged, clipped to [from, to].
function merge(list, from, to, gap) {
  var out = [];
  list.forEach(function (e) {
    var s = Math.max(e.start, from), f = Math.min(e.end, to);
    if (f <= s) return;
    var last = out[out.length - 1];
    if (last && s <= last.end + (gap || 0)) last.end = Math.max(last.end, f);
    else out.push({ start: s, end: f });
  });
  return out;
}
function total(intervals) { return intervals.reduce(function (sum, i) { return sum + i.end - i.start; }, 0); }

/// Free gaps in [from, to] between busy intervals.
function gaps(busy, from, to) {
  var out = [], cursor = from;
  busy.forEach(function (b) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, to) });
    cursor = Math.max(cursor, b.end);
  });
  if (cursor < to) out.push({ start: cursor, end: to });
  return out.filter(function (g) { return g.end > g.start; });
}

/// Three or more meetings with less than 10 minutes between them, still to come or running.
function backToBack(list, now) {
  var chains = [], cur = null;
  list.forEach(function (e) {
    if (cur && e.start - cur.end < GAP) { cur.n++; cur.end = Math.max(cur.end, e.end); }
    else { cur = { start: e.start, end: e.end, n: 1 }; chains.push(cur); }
  });
  return chains.filter(function (c) { return c.n >= 3 && c.end > now; })[0] || null;
}

function analyze() {
  var all = events();
  if (!all) return null;
  var now = clock(), day0 = startOfDay(now), day1 = startOfDay(now, 1), wh = workHours();
  var ws = at(day0, wh.start), we = at(day0, wh.end);
  var today = all.filter(function (e) { return e.end > day0 && e.start < day1; });
  var busyWork = merge(today, ws, we);
  var meetingMs = total(busyWork), workMs = we - ws;
  var left = now < we ? gaps(merge(today, Math.max(now, ws), we), Math.max(now, ws), we) : [];
  var longest = left.reduce(function (best, g) { return !best || g.end - g.start > best.end - best.start ? g : best; }, null);
  var current = today.filter(function (e) { return e.start <= now && e.end > now; });
  var next = all.filter(function (e) { return e.start > now; })[0] || null;
  // Weekday totals (whole days, not just working hours), Monday first.
  var mon = monday(now), week = [];
  for (var i = 0; i < 7; i++) {
    var a = startOfDay(mon, i), b = startOfDay(mon, i + 1);
    week.push(total(merge(all.filter(function (e) { return e.end > a && e.start < b; }), a, b)));
  }
  return {
    now: now, ws: ws, we: we, today: today, meetingMs: meetingMs, workMs: workMs,
    focus: left.filter(function (g) { return g.end - g.start >= minFocus(); }), longest: longest,
    current: current, next: next, chain: backToBack(today, now), week: week,
    todayIndex: Math.round((day0 - mon) / 86400000)
  };
}

// ---- Reminders ----

function remind(all, now) {
  if (notch.settings.get('remind') === false || !all) return;
  var changed = false;
  all.forEach(function (e) {
    var key = e.start + '|' + e.title;
    if (!e.meeting || !e.meeting.url || reminded[key]) return;
    var lead = e.start - now;
    if (lead > REMIND || lead < -MIN) return;
    reminded[key] = true; changed = true;
    notch.notify(tf('remindTitle', { n: e.title }), tf('remindBody', { s: e.meeting.service || t('call'), t: hm(e.start), e: hm(e.end) }));
  });
  Object.keys(reminded).forEach(function (k) { if (+k.split('|')[0] < now - 86400000) { delete reminded[k]; changed = true; } });
  if (changed) notch.storage.set('reminded', reminded);
}

// ---- View ----

function permissionView(st) {
  if (st === 'ask') {
    return ui.hstack([ui.symbol('lucide:chart-column', { size: 26, color: 'secondary' }),
      ui.vstack([ui.text(t('allowTitle'), { style: 'headline' }), ui.text(t('allowHint'), { style: 'caption' })], { spacing: 2 }),
      ui.spacer(),
      ui.button(t('allow'), 'ask-calendar', { style: 'primary' })], { spacing: 12 });
  }
  if (st === 'pending') {
    return ui.hstack([ui.symbol('lucide:calendar-clock', { size: 26, color: 'secondary' }),
      ui.vstack([ui.text(t('askTitle'), { style: 'headline' }), ui.text(t('askHint'), { style: 'caption' })], { spacing: 2 })], { spacing: 12 });
  }
  return ui.vstack([
    ui.text(t('deniedTitle'), { style: 'headline' }),
    ui.text(t('deniedHint'), { style: 'caption' }),
    ui.button(t('openPrivacy'), 'privacy', { symbol: 'lucide:lock-open', compact: true })
  ], { spacing: 8 });
}

function joinButton(e) {
  return e.meeting && e.meeting.url
    ? ui.button(t('join'), 'join|' + e.meeting.url, { symbol: 'lucide:video', style: 'primary', color: 'mint', labelColor: 'black', compact: true })
    : ui.spacer();
}

function meetingRow(a) {
  var e = a.current[0], live = !!e;
  if (!e) e = a.next;
  if (!e) return null;
  var when;
  if (live) when = tf('until', { t: hm(e.end) });
  else if (e.start < startOfDay(a.now, 1)) when = hm(e.start) + ' · ' + tf('inTime', { d: dur(e.start - a.now) });
  else if (e.start < startOfDay(a.now, 2)) when = tf('tomorrow', { t: hm(e.start) });
  else when = t('days')[(new Date(e.start).getDay() + 6) % 7] + ' ' + hm(e.start);
  return ui.hstack([
    ui.symbol('lucide:circle', { size: 9, color: e.color || 'accent', fill: true, stroke: 0, animation: live ? 'pulse' : null }),
    ui.text(live ? t('now') : t('next'), { style: 'caption', weight: 'semibold', color: live ? 'mint' : 'white/50' }),
    ui.text(e.title, { lines: 1 }),
    ui.text(when, { style: 'caption', color: 'white/45', lines: 1 }),
    ui.spacer(),
    joinButton(e)
  ], { spacing: 8 });
}

function focusRow(a) {
  if (a.now >= a.we) return ui.text(t('dayOver'), { style: 'caption', color: 'white/45' });
  if (!a.focus.length) return ui.text(tf('noFocus', { d: dur(minFocus()) }), { style: 'caption', color: 'orange' });
  var chips = a.focus.slice(0, 4).map(function (g) {
    var best = a.longest && g.start === a.longest.start;
    return ui.hstack([ui.text(hm(g.start) + '–' + hm(g.end), { style: 'monoFootnote', color: best ? 'mint' : 'white/80' })],
      { paddingX: 8, paddingY: 3, background: best ? 'mint' : 'white', backgroundOpacity: best ? 0.16 : 0.08, radius: 7 });
  });
  if (a.focus.length > 4) chips.push(ui.text(tf('more', { n: a.focus.length - 4 }), { style: 'caption', color: 'white/40' }));
  return ui.vstack([
    ui.hstack([
      ui.symbol('lucide:brain', { size: 12, color: 'mint' }),
      ui.text(t('focusTitle'), { style: 'caption', weight: 'semibold', color: 'white/70' }),
      ui.text(tf('longest', { d: dur(a.longest.end - a.longest.start) }), { style: 'caption', color: 'white/40' })
    ], { spacing: 6 }),
    ui.hstack(chips, { spacing: 6 })
  ], { spacing: 4 });
}

function render() {
  var st = notch.calendar.status();
  if (st !== 'granted') return permissionView(st);
  var a = analyze();
  if (!a) return ui.text(t('loading'), { color: 'white/55' });
  remind(cache, a.now);

  var share = a.workMs ? a.meetingMs / a.workMs : 0;
  var heavy = share >= 0.6;
  var headline = a.today.length
    ? ui.vstack([
        ui.text(tf('inMeetings', { d: dur(a.meetingMs) }), { style: 'headline', color: heavy ? 'orange' : 'primary' }),
        ui.text(tf('ofDay', { w: dur(a.workMs), f: dur(Math.max(0, a.workMs - a.meetingMs)) }), { style: 'caption', color: 'white/45' })
      ], { spacing: 2 })
    : ui.vstack([ui.text(t('noMeetings'), { style: 'headline' }), ui.text(t('noMeetingsHint'), { style: 'caption', color: 'white/45' })], { spacing: 2 });
  // Weekdays always; Saturday and Sunday only when they have meetings.
  var days = t('days'), values = [], labels = [];
  for (var i = 0; i < 7; i++) {
    if (i < 5 || a.week[i] > 0) { values.push(Math.round(a.week[i] / 360000) / 10); labels.push(days[i]); }
  }
  var todayBar = labels.indexOf(days[a.todayIndex]);
  var header = ui.hstack([
    ui.ring(Math.min(1, share), { size: 46, width: 5, color: heavy ? 'orange' : 'mint', label: Math.round(share * 100) + '%' }),
    headline,
    ui.spacer(),
    ui.vstack([
      ui.text(t('week'), { style: 'caption', color: 'white/40' }),
      ui.bars(values, { labels: labels, color: '#7C8CF8', height: 30, barWidth: 8, highlight: todayBar >= 0 ? todayBar : null })
    ], { spacing: 2, align: 'trailing' })
  ], { spacing: 12 });

  var children = [header];
  var meeting = meetingRow(a);
  if (meeting) children.push(meeting);
  if (a.chain) {
    children.push(ui.hstack([
      ui.symbol('lucide:triangle-alert', { size: 13, color: 'orange' }),
      ui.text(tf('backToBack', { n: a.chain.n, a: hm(a.chain.start), b: hm(a.chain.end) }), { style: 'caption', color: 'orange' })
    ], { spacing: 6 }));
  }
  children.push(focusRow(a));
  return ui.vstack(children, { spacing: 10 });
}

// Beside the notch: "Meeting in 5 min" just before one, "Free at 15:30" during a run of meetings, and
// "Free until 14:00" while you're in a focus block during working hours.
function compact() {
  if (notch.calendar.status() !== 'granted') return null;
  var a = analyze();
  if (!a) return null;
  if (a.current.length) {
    var run = merge(a.today, a.now, startOfDay(a.now, 1), GAP).filter(function (b) { return b.start <= a.now; })[0];
    return run ? { symbol: 'lucide:calendar-clock', text: tf('compactBusy', { t: hm(run.end) }), color: 'white/80' } : null;
  }
  var next = a.next && a.next.start < startOfDay(a.now, 1) ? a.next : null;
  if (next && next.start - a.now <= SOON) {
    return { symbol: 'lucide:alarm-clock', text: tf('compactSoon', { d: dur(Math.max(MIN, next.start - a.now)) }), color: 'orange' };
  }
  if (next && a.now >= a.ws && a.now < a.we && next.start - a.now >= minFocus()) {
    return { symbol: 'lucide:brain', text: tf('compactFree', { t: hm(next.start) }), color: 'mint' };
  }
  return null;
}

function onAction(action) {
  if (action === 'ask-calendar') { notch.calendar.request(); return; }
  if (action === 'privacy') { notch.open('x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'); return; }
  if (action.indexOf('join|') === 0) notch.open(action.slice(5));
}

function onSettingsChanged() { cache = null; }

// Reminders fire even while the notch stays closed.
setInterval(function () {
  if (notch.calendar.status() === 'granted') { var all = events(); remind(all, clock()); }
}, 30000);
