// Clipboard — what you copied recently, one click to copy again.
// Only plain text is kept, on this Mac only (notch.storage). Poni never hands plugins what password
// managers mark as concealed, so passwords do not end up here.

var STRINGS = {
  en: {
    justNow: 'just now', min: 'min', h: 'h', d: 'd',
    updateTitle: 'Update Poni', updateHint: 'Clipboard history needs Poni 0.1.2 or later.',
    count: '{n} items · click to copy again', one: '1 item · click to copy again', empty: 'Nothing copied yet',
    clear: 'Clear', emptyHint: 'Copy text in any app (⌘C) and it shows up here.', more: '+{n} more', copied: 'Copied'
  },
  id: {
    justNow: 'baru saja', min: 'mnt', h: 'j', d: 'hr',
    updateTitle: 'Perbarui Poni', updateHint: 'Riwayat Clipboard butuh Poni 0.1.2 atau lebih baru.',
    count: '{n} item · salin lagi dengan satu klik', one: '1 item · salin lagi dengan satu klik', empty: 'Belum ada yang disalin',
    clear: 'Bersihkan', emptyHint: 'Salin teks di aplikasi mana pun (⌘C), lalu teks itu muncul di sini.', more: '+{n} lainnya', copied: 'Disalin'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }

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
  if (m < 1) return t('justNow');
  if (m < 60) return m + ' ' + t('min');
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' ' + t('h');
  return Math.floor(h / 24) + ' ' + t('d');
}

function preview(t) { return t.replace(/\s+/g, ' ').trim().slice(0, 140); }

// Pinned first, then newest first.
function ordered() {
  return items.filter(function (i) { return i.pin; }).concat(items.filter(function (i) { return !i.pin; }));
}

function render() {
  if (!supported()) {
    return ui.vstack([
      ui.text(t('updateTitle'), { style: 'title' }),
      ui.text(t('updateHint'), { style: 'callout', color: 'white/55' })
    ], { spacing: 2 });
  }
  var list = ordered();
  var shown = list.slice(0, +notch.settings.get('show') || 5);
  var unpinned = items.filter(function (i) { return !i.pin; }).length;

  var header = ui.hstack([
    ui.text(items.length === 1 ? t('one') : items.length ? t('count').replace('{n}', items.length) : t('empty'),
      { style: 'callout', color: 'white/55' }),
    ui.spacer(),
    unpinned ? ui.button(t('clear'), 'clear', { symbol: 'lucide:trash-2', compact: true }) : ui.spacer()
  ], { spacing: 12 });

  if (!list.length) {
    return ui.vstack([header,
      ui.text(t('emptyHint'), { style: 'caption', color: 'white/40' })],
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
    rows.push(ui.text(t('more').replace('{n}', list.length - shown.length), { style: 'caption', color: 'white/40' }));
  }
  return ui.vstack([header, ui.vstack(rows, { spacing: 6, stagger: true })], { spacing: 12 });
}

function onAction(action) {
  var parts = action.split(':');
  var item = items[+parts[1]];
  if (parts[0] === 'copy' && item) {
    notch.clipboard.set(item.t);
    notch.flash(t('copied'), 'lucide:check');
  }
  if (parts[0] === 'pin' && item) { item.pin = !item.pin; save(); }
  if (parts[0] === 'clear') { items = items.filter(function (i) { return i.pin; }); save(); }
}

function onSettingsChanged() {
  var kept = 0;
  items = items.filter(function (i) { return i.pin || ++kept <= max(); });
  save();
}
