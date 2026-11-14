// Spending — a quick offline expense log. Type "kopi 25rb" or "makan siang 35k" and press Return:
// today's total, this month against a budget, the last 7 days, and the notes you spend most on.

var STRINGS = {
  en: {
    addIDR: 'e.g. coffee 25k, lunch 35rb, 1.5jt rent', addOther: 'e.g. coffee 4.50, lunch 12, 1.5k rent',
    noAmount: 'Add an amount, e.g. “coffee 25k”', added: '{amount} · {note}', other: 'Other',
    today: 'Today', month: 'This month', edit: 'Edit', done: 'Done', undo: 'Undo', undone: 'Removed {amount} · {note}',
    empty: 'Nothing logged today', emptyHint: 'Type what you spent and the amount, then press Return. rb/k = thousand, jt = million.',
    more: '+{n} more today', week: 'Last 7 days', top: 'Most spent on this month',
    left: '{left} left · {perDay}/day for the {n} days left', leftOne: '{left} left for today',
    over: '{over} over budget', ofBudget: 'of {budget}', copy: 'Copy this month', copied: 'Copied {n} entries',
    days: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], csv: 'date,time,note,amount'
  },
  id: {
    addIDR: 'Contoh: kopi 25rb, makan siang 35k, 1,5jt sewa', addOther: 'Contoh: kopi 4.50, makan siang 12',
    noAmount: 'Tambahkan nominal, mis. “kopi 25rb”', added: '{amount} · {note}', other: 'Lainnya',
    today: 'Hari ini', month: 'Bulan ini', edit: 'Ubah', done: 'Selesai', undo: 'Urungkan', undone: 'Dihapus {amount} · {note}',
    empty: 'Belum ada catatan hari ini', emptyHint: 'Ketik pengeluaran dan nominalnya lalu tekan Enter. rb/k = ribu, jt = juta.',
    more: '+{n} lagi hari ini', week: '7 hari terakhir', top: 'Paling banyak bulan ini',
    left: 'Sisa {left} · {perDay}/hari untuk {n} hari lagi', leftOne: 'Sisa {left} untuk hari ini',
    over: 'Lewat anggaran {over}', ofBudget: 'dari {budget}', copy: 'Salin bulan ini', copied: '{n} catatan disalin',
    days: ['M', 'S', 'S', 'R', 'K', 'J', 'S'], csv: 'tanggal,jam,catatan,jumlah'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var KEEP_DAYS = 400, SHOW = 6;
var CURRENCIES = {
  IDR: { pre: 'Rp ', dec: 0, sep: '.', point: ',' },
  USD: { pre: '$', dec: 2, sep: ',', point: '.' },
  MYR: { pre: 'RM ', dec: 2, sep: ',', point: '.' },
  SGD: { pre: 'S$', dec: 2, sep: ',', point: '.' },
  EUR: { pre: '€', dec: 2, sep: ',', point: '.' }
};
var MULTIPLIER = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };

function clock() { return Date.now(); } // tests replace this

var entries = notch.storage.get('entries') || []; // [{ id, at, day: 'YYYY-MM-DD', amount, note }], oldest first
var editing = false, lastAdded = null;

function currency() { var c = String(notch.settings.get('currency') || 'IDR'); return CURRENCIES[c] ? c : 'IDR'; }
function budget() { var b = +notch.settings.get('budget'); return isFinite(b) && b > 0 ? b : 0; }

function pad(n) { return (n < 10 ? '0' : '') + n; }
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// Local calendar day, `back` days ago (noon, so stepping by days never trips over a DST change).
function day(back) {
  var d = new Date(clock());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (back || 0));
  return keyOf(d);
}

/// 25000 → "Rp 25.000" (IDR) or "$4.50".
function money(n) {
  var c = CURRENCIES[currency()];
  var fixed = Math.abs(n).toFixed(c.dec).split('.');
  var s = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, c.sep) + (fixed[1] ? c.point + fixed[1] : '');
  return (n < 0 ? '-' : '') + c.pre + s;
}

/// "12.500" → 12500, "1,5" → 1.5, "1.234,56" → 1234.56, "4.50" → 4.5. A separator followed by exactly three
/// digits in a regular grouping is a thousands separator; otherwise the last separator is the decimal point.
function number(s) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return +s.replace(/[.,]/g, '');
  var last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (last < 0) return +s;
  return parseFloat(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
}

/// "kopi 25rb" → { amount: 25000, note: 'kopi' }; null when there's no amount.
function parse(text) {
  var tokens = String(text || '').trim().split(/\s+/).filter(function (x) { return x; });
  for (var i = 0; i < tokens.length; i++) {
    var m = tokens[i].toLowerCase().match(/^(?:rp\.?|rm|s\$|\$|€)?(\d[\d.,]*?)[.,]?(rb|ribu|k|jt|juta)?$/);
    if (!m) continue;
    var suffix = m[2], used = 1;
    if (!suffix && tokens[i + 1] && MULTIPLIER[tokens[i + 1].toLowerCase()]) { suffix = tokens[i + 1].toLowerCase(); used = 2; }
    var amount = number(m[1]) * (suffix ? MULTIPLIER[suffix] : 1);
    if (!isFinite(amount) || amount <= 0) continue;
    amount = currency() === 'IDR' ? Math.round(amount) : Math.round(amount * 100) / 100;
    var rest = tokens.slice(0, i).concat(tokens.slice(i + used)).join(' ');
    return { amount: amount, note: rest || t('other') };
  }
  return null;
}

function save() {
  var oldest = day(KEEP_DAYS);
  entries = entries.filter(function (e) { return e.day >= oldest; });
  notch.storage.set('entries', entries);
}

function sum(list) { return list.reduce(function (s, e) { return s + e.amount; }, 0); }
function onDay(key) { return entries.filter(function (e) { return e.day === key; }); }
function thisMonth() { var m = day(0).slice(0, 7); return entries.filter(function (e) { return e.day.slice(0, 7) === m; }); }
function hhmm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

/// The three notes with the most money this month: [{ note, total }].
function topNotes(list) {
  var by = {}, order = [];
  list.forEach(function (e) {
    var k = e.note.toLowerCase();
    if (!by[k]) { by[k] = { note: e.note, total: 0 }; order.push(k); }
    by[k].total += e.amount;
  });
  return order.map(function (k) { return by[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 3);
}

function budgetPart(spent) {
  var b = budget();
  if (!b) return [];
  var ratio = spent / b, color = ratio > 1 ? 'red' : ratio > 0.8 ? 'orange' : 'green';
  var now = new Date(clock());
  var daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  var left = b - spent;
  var line = left < 0 ? tf('over', { over: money(-left) })
    : daysLeft <= 1 ? tf('leftOne', { left: money(left) })
    : tf('left', { left: money(left), perDay: money(currency() === 'IDR' ? Math.floor(left / daysLeft) : left / daysLeft), n: daysLeft });
  return [
    ui.progress(Math.min(1, ratio), { color: color, height: 6 }),
    ui.text(line, { style: 'caption', color: left < 0 ? 'red' : ratio > 0.8 ? 'orange' : 'secondary', lines: 1 })
  ];
}

function weekPart() {
  var totals = [], labels = [], any = false;
  for (var back = 6; back >= 0; back--) {
    var key = day(back), v = sum(onDay(key));
    if (v) any = true;
    totals.push(v);
    var p = key.split('-');
    labels.push(t('days')[new Date(+p[0], +p[1] - 1, +p[2], 12).getDay()]);
  }
  if (!any) return [];
  return [ui.text(t('week'), { style: 'caption' }), ui.bars(totals, { labels: labels, color: '#34c759', height: 32, barWidth: 12, highlight: 6 })];
}

function entryRow(e) {
  return ui.hstack([
    ui.text(hhmm(e.at), { style: 'monoFootnote', color: 'tertiary' }),
    ui.text(e.note, { style: 'callout', lines: 1 }),
    ui.spacer(),
    ui.text(money(e.amount), { style: 'monoFootnote' })
  ].concat(editing ? [ui.button('', 'remove:' + e.id, { symbol: 'lucide:x', compact: true })] : []), { spacing: 8 });
}

function render() {
  var todays = onDay(day(0)).slice().reverse(), month = thisMonth(), monthTotal = sum(month);
  var buttons = [ui.input(currency() === 'IDR' ? t('addIDR') : t('addOther'), 'add')];
  if (lastAdded && todays.some(function (e) { return e.id === lastAdded; })) buttons.push(ui.button(t('undo'), 'undo', { symbol: 'lucide:undo-2', compact: true }));
  if (todays.length) buttons.push(ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true }));
  var parts = [
    ui.hstack([
      ui.vstack([
        ui.text(t('today'), { style: 'caption' }),
        ui.text(money(sum(todays)), { style: 'monoTitle', lines: 1 })
      ], { spacing: 2 }),
      ui.spacer(),
      ui.vstack([
        ui.text(t('month'), { style: 'caption' }),
        ui.text(money(monthTotal), { style: 'monoHeadline', lines: 1 }),
        budget() ? ui.text(tf('ofBudget', { budget: money(budget()) }), { style: 'caption', color: 'tertiary' }) : ui.text('', {})
      ], { spacing: 2, align: 'trailing' })
    ], { spacing: 12 })
  ].concat(budgetPart(monthTotal));
  parts.push(ui.hstack(buttons, { spacing: 8 }));
  if (!todays.length) {
    parts.push(ui.text(t('empty'), { style: 'callout', color: 'secondary' }));
    if (!entries.length) parts.push(ui.text(t('emptyHint'), { style: 'caption', lines: 2 }));
  } else {
    parts.push(ui.vstack(todays.slice(0, SHOW).map(entryRow), { spacing: 4 }));
    if (todays.length > SHOW) parts.push(ui.text(tf('more', { n: todays.length - SHOW }), { style: 'caption', color: 'tertiary' }));
  }
  parts = parts.concat(weekPart());
  var top = topNotes(month);
  if (top.length) {
    parts.push(ui.text(t('top'), { style: 'caption' }));
    parts.push(ui.vstack(top.map(function (x) { return ui.row(x.note, money(x.total)); }), { spacing: 2 }));
    parts.push(ui.button(t('copy'), 'copy', { symbol: 'lucide:copy', compact: true }));
  }
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (!notch.settings.get('beside')) return null;
  var total = sum(onDay(day(0)));
  return total ? { symbol: 'lucide:wallet', text: money(total), color: 'green' } : null;
}

function csvField(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function onAction(action, value) {
  if (action === 'add') {
    var e = parse(value);
    if (!e) { if (String(value || '').trim()) notch.flash(t('noAmount'), 'lucide:wallet'); return; }
    var now = clock();
    e.id = 'e' + now.toString(36) + entries.length.toString(36);
    e.at = now;
    e.day = day(0);
    entries.push(e);
    lastAdded = e.id;
    save();
    notch.flash(tf('added', { amount: money(e.amount), note: e.note }), 'lucide:wallet');
  }
  if (action === 'undo' && lastAdded) {
    var gone = entries.filter(function (x) { return x.id === lastAdded; })[0];
    entries = entries.filter(function (x) { return x.id !== lastAdded; });
    lastAdded = null;
    save();
    if (gone) notch.flash(tf('undone', { amount: money(gone.amount), note: gone.note }), 'lucide:undo-2');
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) {
    var id = action.slice(7);
    entries = entries.filter(function (x) { return x.id !== id; });
    if (lastAdded === id) lastAdded = null;
    save();
  }
  if (action === 'copy') {
    var month = thisMonth();
    var lines = [t('csv')].concat(month.map(function (x) {
      return [x.day, hhmm(x.at), csvField(x.note), currency() === 'IDR' ? String(x.amount) : x.amount.toFixed(2)].join(',');
    }));
    notch.clipboard.set(lines.join('\n'));
    notch.flash(tf('copied', { n: month.length }), 'lucide:copy');
  }
}
