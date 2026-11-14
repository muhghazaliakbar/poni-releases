// Subscriptions — what you pay every month and every year, what renews next, and a reminder before each charge.
// Offline: everything lives in this plugin's storage. Type "Netflix 186000 15" (amount, day of the month),
// "Spotify 54,9rb 3 monthly" or "Domain 250000 2027-03-01 yearly".

var STRINGS = {
  en: {
    add: 'Add: Netflix 186000 15 · Domain 250000 2027-03-01 yearly', edit: 'Edit', done: 'Done',
    empty: 'Track your subscriptions', emptyHint: 'Type a name, the price and the day of the month it renews, e.g. “Spotify 54990 3”. Add “yearly” and a date for yearly ones: “Domain 250000 2027-03-01 yearly”.',
    perMonth: 'per month', perYear: '{a} per year', active: '{n} active', soon: 'Next 14 days', later: 'Later', paused: 'Paused',
    today: 'Today', tomorrow: 'Tomorrow', inDays: 'in {n} days', yearly: 'Yearly', monthly: 'Monthly', more: '+{n} more',
    invalid: 'Try “Netflix 186000 15”: a name, the price, then the day it renews', full: 'Up to 30 subscriptions',
    added: 'Added {n} · next {d}', removed: 'Removed {n}', pausedFlash: 'Paused {n}', resumed: 'Resumed {n}',
    remindToday: '{n} renews today', remindTomorrow: '{n} renews tomorrow', remindDays: '{n} renews in {d} days', remindBody: '{a} on {d}',
    compactToday: '{n} today', compactTomorrow: '{n} tomorrow',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], dateFormat: '{w} {d} {m}'
  },
  id: {
    add: 'Tambah: Netflix 186rb 15 · Domain 250rb 2027-03-01 tahunan', edit: 'Ubah', done: 'Selesai',
    empty: 'Catat langganan Anda', emptyHint: 'Ketik nama, harga, dan tanggal perpanjangan tiap bulan, mis. “Spotify 54990 3”. Untuk yang tahunan tambahkan “tahunan” dan tanggalnya: “Domain 250rb 2027-03-01 tahunan”.',
    perMonth: 'per bulan', perYear: '{a} per tahun', active: '{n} aktif', soon: '14 hari ke depan', later: 'Berikutnya', paused: 'Dijeda',
    today: 'Hari ini', tomorrow: 'Besok', inDays: '{n} hari lagi', yearly: 'Tahunan', monthly: 'Bulanan', more: '+{n} lagi',
    invalid: 'Coba “Netflix 186000 15”: nama, harga, lalu tanggal perpanjangan', full: 'Maksimal 30 langganan',
    added: '{n} ditambahkan · berikutnya {d}', removed: '{n} dihapus', pausedFlash: '{n} dijeda', resumed: '{n} dilanjutkan',
    remindToday: '{n} diperpanjang hari ini', remindTomorrow: '{n} diperpanjang besok', remindDays: '{n} diperpanjang {d} hari lagi', remindBody: '{a} pada {d}',
    compactToday: '{n} hari ini', compactTomorrow: '{n} besok',
    days: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], dateFormat: '{w}, {d} {m}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

function clock() { return Date.now(); } // tests replace this

var MAX = 30, SOON_DAYS = 14, ROWS = 8, DAY = 86400000;
var CURRENCIES = {
  IDR: { sym: 'Rp ', dp: 0, th: '.', dec: ',' }, USD: { sym: '$', dp: 2, th: ',', dec: '.' },
  EUR: { sym: '€', dp: 2, th: '.', dec: ',' }, GBP: { sym: '£', dp: 2, th: ',', dec: '.' },
  SGD: { sym: 'S$', dp: 2, th: ',', dec: '.' }, MYR: { sym: 'RM', dp: 2, th: ',', dec: '.' },
  AUD: { sym: 'A$', dp: 2, th: ',', dec: '.' }, JPY: { sym: '¥', dp: 0, th: ',', dec: '.' }
};

var subs = notch.storage.get('subs') || [];        // [{ id, name, amount, cycle: 'monthly'|'yearly', day, month?, from?, paused? }]
var notified = notch.storage.get('notified') || {}; // 'id@YYYY-MM-DD' → true, one reminder per renewal
var editing = false;

function save() { notch.storage.set('subs', subs); }

// ---- Dates (local days at noon, so DST never shifts a day) ----

function pad(n) { return (n < 10 ? '0' : '') + n; }
function todayNoon() { var d = new Date(clock()); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// The billing day in a given month, moved to the month's last day when it's shorter (31 → 30 Nov, 28/29 Feb).
function dateOn(y, m, day) {
  var first = new Date(y, m, 1, 12);
  var last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last), 12);
}
function parseDate(s) {
  var m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  return dateOn(+m[1], +m[2] - 1, +m[3]);
}
/// The next charge on or after today (never before the first charge date, when one was given).
function nextCharge(s) {
  var today = todayNoon(), y = today.getFullYear(), m = today.getMonth(), next;
  if (s.cycle === 'yearly') {
    next = dateOn(y, s.month, s.day);
    if (next < today) next = dateOn(y + 1, s.month, s.day);
  } else {
    next = dateOn(y, m, s.day);
    if (next < today) next = dateOn(y, m + 1, s.day);
  }
  var from = s.from && parseDate(s.from);
  return from && from > next ? from : next;
}
function daysLeft(s) { return Math.round((nextCharge(s) - todayNoon()) / DAY); }
function dateLabel(d) { return tf('dateFormat', { w: t('days')[d.getDay()], d: d.getDate(), m: t('months')[d.getMonth()] }); }
function whenLabel(n) { return n === 0 ? t('today') : n === 1 ? t('tomorrow') : tf('inDays', { n: n }); }

// ---- Money ----

function currency() { return CURRENCIES[notch.settings.get('currency')] || CURRENCIES.IDR; }
function money(v) {
  var c = currency();
  var dp = c.dp && Math.round(v * 100) % 100 !== 0 ? c.dp : 0;
  var fixed = (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toFixed(dp).split('.');
  var whole = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, c.th);
  return c.sym + whole + (fixed[1] ? c.dec + fixed[1] : '');
}
/// "186000", "186.000", "54,9rb", "1,5jt", "15k", "9.99", "Rp54.990", "$12" → a number, or null.
function parseAmount(text) {
  var s = String(text || '').toLowerCase().replace(/^(rp|s\$|a\$|rm|\$|€|£|¥)/, '');
  var m = s.match(/^(\d+(?:[.,]\d+)*)(rb|ribu|k|jt|juta|m)?$/);
  if (!m) return null;
  var num = m[1], mult = !m[2] ? 1 : /^(rb|ribu|k)$/.test(m[2]) ? 1e3 : 1e6;
  var last = Math.max(num.lastIndexOf('.'), num.lastIndexOf(','));
  var value;
  if (last < 0) value = +num;
  else {
    var head = num.slice(0, last).replace(/[.,]/g, ''), tail = num.slice(last + 1);
    // With rb/jt the separator is a decimal point; without, three digits after it mean thousands (54.990).
    value = !m[2] && tail.length === 3 ? +(head + tail) : +(head + '.' + tail);
  }
  value = value * mult;
  return isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

// ---- Parsing a line ----

var MONTHLY = /^(monthly|month|mo|bulanan|bulan|bln)$/i, YEARLY = /^(yearly|annual|annually|year|yr|tahunan|tahun|thn)$/i;

function parseLine(text) {
  var words = String(text || '').trim().split(/\s+/).filter(function (w) { return w; });
  var cycle = 'monthly', day = null, month = null, from = null, amount = null;
  if (words.length && (MONTHLY.test(words[words.length - 1]) || YEARLY.test(words[words.length - 1]))) {
    cycle = YEARLY.test(words.pop()) ? 'yearly' : 'monthly';
  }
  var dayWord = null;
  if (words.length > 1) {
    var last = words[words.length - 1], date = parseDate(last);
    if (date) { words.pop(); day = date.getDate(); month = date.getMonth(); from = ymd(date); }
    else if (/^\d{1,2}$/.test(last) && +last >= 1 && +last <= 31) { dayWord = words.pop(); day = +dayWord; }
  }
  if (words.length > 1) amount = parseAmount(words[words.length - 1]);
  if (amount !== null) words.pop();
  else if (dayWord) { amount = parseAmount(dayWord); day = null; }  // "Gym 30": the number was the price
  var name = words.join(' ').trim();
  if (!name || amount === null) return null;
  var today = todayNoon();
  if (day === null) day = today.getDate();
  if (cycle === 'yearly' && month === null) month = (day >= today.getDate() ? today : dateOn(today.getFullYear(), today.getMonth() + 1, 1)).getMonth();
  // "netflix" → "Netflix", but "iCloud" stays as typed.
  if (name === name.toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
  var s = { name: name, amount: amount, cycle: cycle, day: day };
  if (cycle === 'yearly') s.month = month;
  if (from && parseDate(from) > today) s.from = from;
  return s;
}

// ---- Totals and reminders ----

function active() { return subs.filter(function (s) { return !s.paused; }); }
function monthlyTotal() { return active().reduce(function (sum, s) { return sum + (s.cycle === 'yearly' ? s.amount / 12 : s.amount); }, 0); }
function yearlyTotal() { return active().reduce(function (sum, s) { return sum + (s.cycle === 'yearly' ? s.amount : s.amount * 12); }, 0); }

function remind() {
  var before = +(notch.settings.get('remind') || 0), today = ymd(todayNoon()), changed = false;
  Object.keys(notified).forEach(function (k) { if (k.split('@')[1] < today) { delete notified[k]; changed = true; } });
  if (before > 0) {
    active().forEach(function (s) {
      var n = daysLeft(s), next = nextCharge(s), key = s.id + '@' + ymd(next);
      if (n > before || notified[key]) return;
      notified[key] = true; changed = true;
      var title = n === 0 ? tf('remindToday', { n: s.name }) : n === 1 ? tf('remindTomorrow', { n: s.name }) : tf('remindDays', { n: s.name, d: n });
      notch.notify(title, tf('remindBody', { a: money(s.amount), d: dateLabel(next) }));
    });
  }
  if (changed) notch.storage.set('notified', notified);
}

// ---- View ----

function byNext(a, b) { return daysLeft(a) - daysLeft(b) || a.name.localeCompare(b.name); }

function row(s) {
  var n = daysLeft(s), soon = !s.paused && n <= SOON_DAYS, index = subs.indexOf(s);
  var when = s.paused ? t('paused') : n <= SOON_DAYS ? whenLabel(n) : dateLabel(nextCharge(s));
  var color = s.paused ? 'white/40' : n === 0 ? 'orange' : n === 1 ? 'yellow' : soon ? 'white/75' : 'white/45';
  var name = [ui.text(s.name, { style: 'headline', lines: 1 })];
  if (s.cycle === 'yearly') name.push(ui.text(t('yearly'), { style: 'caption', color: 'teal' }));
  var parts = [
    ui.symbol(s.paused ? 'lucide:pause' : n <= 1 ? 'lucide:alarm-clock' : 'lucide:calendar-sync', { size: 14, color: s.paused ? 'white/35' : n <= 1 ? color : 'white/50' }),
    ui.hstack(name, { spacing: 6 }),
    ui.spacer(),
    ui.text(money(s.amount), { style: 'mono', color: s.paused ? 'white/40' : 'white/85' }),
    ui.text(when, { style: 'caption', weight: n <= 1 && !s.paused ? 'semibold' : 'regular', color: color, width: 92, align: 'trailing' })
  ];
  if (editing) {
    parts.push(ui.button('', 'pause:' + index, { symbol: s.paused ? 'lucide:play' : 'lucide:pause', compact: true }));
    parts.push(ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true }));
  }
  return ui.hstack(parts, { spacing: 8, opacity: s.paused ? 0.6 : 1 });
}

function section(title, list, limit) {
  if (!list.length) return [];
  var out = [ui.text(title, { style: 'caption', weight: 'semibold', color: 'white/50' })].concat(list.slice(0, limit).map(row));
  if (list.length > limit) out.push(ui.text(tf('more', { n: list.length - limit }), { style: 'caption', color: 'white/35' }));
  return out;
}

function render() {
  remind();
  var input = ui.input(t('add'), 'add', { clear: true });
  if (!subs.length) {
    return ui.vstack([
      ui.hstack([ui.symbol('lucide:calendar-sync', { size: 18, color: 'teal' }), ui.text(t('empty'), { style: 'headline' })], { spacing: 8 }),
      ui.text(t('emptyHint'), { style: 'caption', color: 'white/55' }),
      input
    ], { spacing: 8 });
  }
  var sorted = subs.slice().sort(byNext);
  var soon = sorted.filter(function (s) { return !s.paused && daysLeft(s) <= SOON_DAYS; });
  var later = sorted.filter(function (s) { return !s.paused && daysLeft(s) > SOON_DAYS; });
  var paused = sorted.filter(function (s) { return s.paused; });
  var header = ui.hstack([
    ui.vstack([
      ui.hstack([ui.text(money(monthlyTotal()), { style: 'monoTitle' }), ui.text(t('perMonth'), { style: 'caption', color: 'white/50' })], { spacing: 6, align: 'baseline' }),
      ui.text(tf('perYear', { a: money(yearlyTotal()) }) + ' · ' + tf('active', { n: active().length }), { style: 'caption', color: 'white/45' })
    ], { spacing: 2 }),
    ui.spacer(),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  var budget = editing ? MAX : ROWS;
  var rows = section(t('soon'), soon, budget);
  budget = Math.max(editing ? MAX : 2, budget - soon.length);
  rows = rows.concat(section(t('later'), later, budget));
  if (editing) rows = rows.concat(section(t('paused'), paused, MAX));
  else if (paused.length) rows.push(ui.text(t('paused') + ': ' + paused.map(function (s) { return s.name; }).join(', '), { style: 'caption', color: 'white/35', lines: 1 }));
  return ui.vstack([header, ui.vstack(rows, { spacing: 4 }), input], { spacing: 10 });
}

// Beside the notch: a renewal today or tomorrow.
function compact() {
  var due = active().filter(function (s) { return daysLeft(s) <= 1; }).sort(byNext);
  if (!due.length) return null;
  var first = due[0], today = daysLeft(first) === 0;
  var text = tf(today ? 'compactToday' : 'compactTomorrow', { n: first.name }) + (due.length > 1 ? ' +' + (due.length - 1) : '');
  return { symbol: 'lucide:calendar-sync', text: text, color: today ? 'orange' : 'yellow' };
}

function onAction(action, value) {
  if (action === 'add') {
    var s = parseLine(value);
    if (!s) { notch.flash(t('invalid'), 'lucide:circle-alert'); return; }
    if (subs.length >= MAX) { notch.flash(t('full'), 'lucide:circle-alert'); return; }
    s.id = 's' + clock().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    subs.push(s); save();
    notch.flash(tf('added', { n: s.name, d: dateLabel(nextCharge(s)) }), 'lucide:calendar-sync');
    remind();
    return;
  }
  if (action === 'edit') { editing = !editing; return; }
  var i = +action.split(':')[1], sub = subs[i];
  if (!sub) return;
  if (action.indexOf('pause:') === 0) {
    sub.paused = !sub.paused; save();
    notch.flash(tf(sub.paused ? 'pausedFlash' : 'resumed', { n: sub.name }), sub.paused ? 'lucide:pause' : 'lucide:play');
  }
  if (action.indexOf('remove:') === 0) {
    subs.splice(i, 1); save();
    notch.flash(tf('removed', { n: sub.name }), 'lucide:x');
  }
}
