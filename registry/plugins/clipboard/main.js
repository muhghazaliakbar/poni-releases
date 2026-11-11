// Riwayat Clipboard — what you copied recently, one click to copy again.
// Only plain text is kept, on this Mac only (notch.storage). Poni never hands plugins what password
// managers mark as concealed, so passwords do not end up here.

var items = notch.storage.get('items') || []; // [{ t: text, at: ms, pin: bool }]
var lastCount = -1;

// Needs Poni 0.1.2+, which keeps password-manager copies away from plugins.
function supported() {
  if (notch.version === 'dev') return true;
  var v = String(notch.version).split('.').map(Number);
  return v[0] > 0 || v[1] > 1 || (v[1] === 1 && v[2] >= 2);
}

function save() { notch.storage.set('items', items); }
function max() { return +notch.settings.get('max') || 30; }

function remember(text) {
  if (!text || !text.trim()) return;
  if (text.length > 5000) text = text.slice(0, 5000);
  var pinned = false;
  items = items.filter(function (i) { if (i.t === text) { pinned = i.pin; return false; } return true; });
  items.unshift({ t: text, at: Date.now(), pin: pinned });
  // Drop the oldest unpinned items beyond the limit.
  var kept = 0;
  items = items.filter(function (i) { return i.pin || ++kept <= max(); });
  save();
}

function check() {
  var count = notch.clipboard.changeCount();
  if (count === lastCount) return;
  lastCount = count;
  remember(notch.clipboard.get());
}

function init() {
  if (!supported()) return;
  check();
  setInterval(check, 750);
}

function kind(t) {
  if (/^https?:\/\/\S+$/.test(t.trim())) return 'lucide:link-2';
  if (/^\S+@\S+\.\S+$/.test(t.trim())) return 'lucide:at-sign';
  if (/^[\d\s.,+\-()]+$/.test(t.trim())) return 'lucide:hash';
  return 'lucide:type';
}

function ago(ms) {
  var m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' mnt';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' j';
  return Math.floor(h / 24) + ' hr';
}

function preview(t) { return t.replace(/\s+/g, ' ').trim().slice(0, 140); }

// Pinned first, then newest first.
function ordered() {
  return items.filter(function (i) { return i.pin; }).concat(items.filter(function (i) { return !i.pin; }));
}

function render() {
  if (!supported()) {
    return ui.vstack([
      ui.text('Perbarui Poni', { style: 'title' }),
      ui.text('Riwayat Clipboard butuh Poni 0.1.2 atau lebih baru.', { style: 'callout', color: 'white/55' })
    ], { spacing: 2 });
  }
  var list = ordered();
  var shown = list.slice(0, +notch.settings.get('show') || 5);
  var unpinned = items.filter(function (i) { return !i.pin; }).length;

  var header = ui.hstack([
    ui.text(items.length ? items.length + ' item · salin lagi dengan satu klik' : 'Belum ada yang disalin',
      { style: 'callout', color: 'white/55' }),
    ui.spacer(),
    unpinned ? ui.button('Bersihkan', 'clear', { symbol: 'lucide:trash-2', compact: true }) : ui.spacer()
  ], { spacing: 12 });

  if (!list.length) {
    return ui.vstack([header,
      ui.text('Salin teks di aplikasi mana pun (⌘C), lalu teks itu muncul di sini.', { style: 'caption', color: 'white/40' })],
      { spacing: 10 });
  }

  var rows = shown.map(function (i) {
    var index = items.indexOf(i);
    return ui.hstack([
      ui.symbol(kind(i.t), { size: 15, color: 'white/55' }),
      ui.text(preview(i.t), { lines: 1 }),
      ui.spacer(),
      ui.text(ago(i.at), { style: 'caption', color: 'white/40' }),
      ui.button('', 'pin:' + index, { symbol: 'lucide:pin', fill: i.pin, compact: true, labelColor: i.pin ? 'amber' : null }),
      ui.button('', 'copy:' + index, { symbol: 'lucide:copy', compact: true })
    ], { spacing: 10 });
  });
  if (list.length > shown.length) {
    rows.push(ui.text('+' + (list.length - shown.length) + ' lainnya', { style: 'caption', color: 'white/40' }));
  }
  return ui.vstack([header, ui.vstack(rows, { spacing: 6, stagger: true })], { spacing: 12 });
}

function onAction(action) {
  var parts = action.split(':');
  var item = items[+parts[1]];
  if (parts[0] === 'copy' && item) {
    notch.clipboard.set(item.t);
    notch.flash('Disalin', 'lucide:check');
  }
  if (parts[0] === 'pin' && item) { item.pin = !item.pin; save(); }
  if (parts[0] === 'clear') { items = items.filter(function (i) { return i.pin; }); save(); }
}

function onSettingsChanged() {
  var kept = 0;
  items = items.filter(function (i) { return i.pin || ++kept <= max(); });
  save();
}
