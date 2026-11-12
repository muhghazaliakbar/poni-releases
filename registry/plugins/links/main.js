// Quick Links — up to 8 websites, folders and apps, one click each.

var STRINGS = {
  en: {
    add: 'Add a link: Name = github.com, or ~/Documents, or slack://', edit: 'Edit', done: 'Done',
    full: 'Up to 8 links', invalid: 'Not a link. Try example.com, ~/Downloads, or an app link like slack://',
    update: 'Opening folders needs Poni 0.5.5 or later.', empty: 'No links yet',
    emptyHint: 'Type a website, a folder, or an app link below and press Return.',
    seed: [['Gmail', 'https://mail.google.com'], ['Calendar', 'https://calendar.google.com'],
           ['GitHub', 'https://github.com'], ['YouTube', 'https://youtube.com'], ['Downloads', '~/Downloads']]
  },
  id: {
    add: 'Tambah tautan: Nama = github.com, atau ~/Documents, atau slack://', edit: 'Ubah', done: 'Selesai',
    full: 'Maksimal 8 tautan', invalid: 'Bukan tautan. Coba contoh.com, ~/Downloads, atau tautan app seperti slack://',
    update: 'Membuka folder butuh Poni 0.5.5 atau lebih baru.', empty: 'Belum ada tautan',
    emptyHint: 'Ketik situs, folder, atau tautan app di bawah lalu tekan Enter.',
    seed: [['Gmail', 'https://mail.google.com'], ['Kalender', 'https://calendar.google.com'],
           ['GitHub', 'https://github.com'], ['YouTube', 'https://youtube.com'], ['Unduhan', '~/Downloads']]
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }

var MAX = 8;
var links = notch.storage.get('links');
if (!links) {
  links = t('seed').map(function (s) { return { name: s[0], url: s[1] }; });
  notch.storage.set('links', links);
}
var editing = false;

/// "github.com" → https://github.com; folders and app links stay as typed; anything else is null.
function normalize(target) {
  var s = String(target || '').trim();
  if (!s) return null;
  if (s === '~' || s.indexOf('~/') === 0 || s.charAt(0) === '/') return s;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(s) || /^[^\s/:]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s)) return 'https://' + s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (/^https?:\/\/[^\s/]+\.[^\s/]+|^https?:\/\/localhost/i.test(s)) return s;
    return /^https?:/i.test(s) || /\s/.test(s) ? null : s; // slack://, mailto:a@b.c, obsidian://open…
  }
  return null;
}

/// "Docs = notion.so" → { name: 'Docs', url: 'https://notion.so' }; "github.com" → { name: 'Github', … }.
function parse(text) {
  var s = String(text || ''), i = s.indexOf('=');
  var name = i > 0 ? s.slice(0, i).trim() : '', url = normalize(i > 0 ? s.slice(i + 1) : s);
  if (!url) return null;
  if (!name) {
    var path = url.match(/^~?\/?(?:.*\/)?([^\/]+)\/?$/);
    var host = url.match(/^https?:\/\/(?:www\.)?([^\/:.]+)/i);
    var scheme = url.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
    name = host ? host[1] : scheme ? (scheme[1].toLowerCase() === 'mailto' ? scheme[2] : scheme[1]) : path ? path[1] : url;
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  return { name: name, url: url };
}

function icon(url) {
  var u = url.toLowerCase();
  if (u.charAt(0) === '~' || u.charAt(0) === '/') return /\.app\/?$/.test(u) ? 'lucide:app-window' : 'lucide:folder';
  if (u.indexOf('mailto:') === 0 || /mail\./.test(u)) return 'lucide:mail';
  if (/calendar/.test(u)) return 'lucide:calendar';
  if (/github|gitlab|bitbucket/.test(u)) return 'lucide:code';
  if (/youtube|vimeo|netflix/.test(u)) return 'lucide:play';
  if (/figma/.test(u)) return 'lucide:pen-tool';
  if (/slack|discord|whatsapp|telegram/.test(u)) return 'lucide:message-square';
  if (/meet\.|zoom/.test(u)) return 'lucide:video';
  if (/notion|docs\.google|obsidian/.test(u)) return 'lucide:book-open';
  if (!/^https?:/.test(u)) return 'lucide:app-window';
  return 'lucide:globe';
}

function tile(link, index) {
  var parts = [ui.button(link.name, 'open:' + index, { symbol: icon(link.url), fill: true })];
  if (editing) parts.push(ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true }));
  return ui.hstack(parts, { spacing: 4, fill: true });
}

function render() {
  var rows = [];
  for (var i = 0; i < links.length; i += 4) {
    var cells = links.slice(i, i + 4).map(function (l, j) { return tile(l, i + j); });
    while (cells.length < 4 && links.length > 4) cells.push(ui.spacer());
    rows.push(ui.hstack(cells, { spacing: 8 }));
  }
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!links.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  return ui.vstack(rows.concat([input]), { spacing: 8 });
}

function save() { notch.storage.set('links', links); }

function onAction(action, value) {
  if (action.indexOf('open:') === 0) {
    var link = links[+action.slice(5)];
    if (!link) return;
    var url = link.url;
    if (url.charAt(0) === '/' && !(notch.features && notch.features.indexOf('open-paths') >= 0)) {
      url = 'file://' + encodeURI(url); // older Poni: plain paths still open this way
    }
    if (url.charAt(0) === '~' && !(notch.features && notch.features.indexOf('open-paths') >= 0)) {
      notch.flash(t('update'), 'exclamationmark.triangle.fill');
      return;
    }
    notch.open(url);
  }
  if (action === 'add') {
    var parsed = parse(value);
    if (!parsed) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    if (links.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    links.push(parsed);
    save();
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) { links.splice(+action.slice(7), 1); save(); }
}
