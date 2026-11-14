// Release Watch — the latest version of a few npm, PyPI and Homebrew packages and GitHub repositories,
// checked every 6 hours, with a notification when one changes and a "new" mark until you open it.

var STRINGS = {
  en: {
    add: 'Add: react, owner/repo, pypi:requests, brew:node', edit: 'Edit', done: 'Done', full: 'Up to 12 packages',
    invalid: 'Try react, @scope/pkg, owner/repo, a github.com link, pypi:name or brew:name', dup: 'Already watching that one',
    empty: 'Nothing watched yet', emptyHint: 'Type a package or repository below and press Return.',
    checking: 'Checking…', allQuiet: '{n} watched · checked {t}', news: '{n} new', notFound: 'Not found',
    limit: 'Rate limit, trying later', offline: 'Couldn’t check', ago: '{t} ago', justNow: 'just now', isNew: 'new',
    outTitle: '{n} {v} is out', outBody: 'Was {old}', min: 'min', h: 'h', d: 'days', d1: '1 day', refresh: 'Check now'
  },
  id: {
    add: 'Tambah: react, owner/repo, pypi:requests, brew:node', edit: 'Ubah', done: 'Selesai', full: 'Maksimal 12 paket',
    invalid: 'Coba react, @scope/pkg, owner/repo, tautan github.com, pypi:nama atau brew:nama', dup: 'Sudah dipantau',
    empty: 'Belum ada yang dipantau', emptyHint: 'Ketik paket atau repositori di bawah lalu tekan Enter.',
    checking: 'Memeriksa…', allQuiet: '{n} dipantau · dicek {t}', news: '{n} baru', notFound: 'Tidak ditemukan',
    limit: 'Batas permintaan, dicoba nanti', offline: 'Gagal memeriksa', ago: '{t} lalu', justNow: 'baru saja', isNew: 'baru',
    outTitle: '{n} {v} sudah rilis', outBody: 'Sebelumnya {old}', min: 'mnt', h: 'jam', d: 'hari', d1: '1 hari', refresh: 'Cek sekarang'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var MAX = 12, EVERY = 6 * 3600000, RETRY = 30 * 60000;
var ICONS = { npm: 'lucide:package', github: 'lucide:git-branch', pypi: 'lucide:code', brew: 'lucide:beer' };

function clock() { return Date.now(); } // tests replace this

// [{ src, name, version, at (published or first seen, ms), url, checked, isNew, error }]
var items = notch.storage.get('items') || [];
var busy = {}, editing = false;

function save() { notch.storage.set('items', items); }
function keyOf(x) { return x.src + ':' + x.name; }

/// "react", "npm:react", "@vercel/ai", "owner/repo", "https://github.com/owner/repo", "pypi:requests", "brew:node"
/// → { src, name }, or null.
function parse(text) {
  var s = String(text || '').trim().replace(/\/+$/, '');
  var m;
  if (!s) return null;
  if ((m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i))) return { src: 'github', name: m[1] + '/' + m[2].replace(/\.git$/i, '') };
  if ((m = s.match(/^(?:https?:\/\/)?(?:www\.)?npmjs\.com\/package\/((?:@[\w.-]+\/)?[\w.-]+)/i))) s = 'npm:' + m[1];
  if ((m = s.match(/^(?:https?:\/\/)?pypi\.org\/project\/([\w.-]+)/i))) s = 'pypi:' + m[1];
  if ((m = s.match(/^(?:https?:\/\/)?formulae\.brew\.sh\/formula\/([\w@.+-]+)/i))) s = 'brew:' + m[1];
  if ((m = s.match(/^(?:gh|github):\s*([\w.-]+)\/([\w.-]+)$/i))) return { src: 'github', name: m[1] + '/' + m[2] };
  if ((m = s.match(/^pypi:\s*([A-Za-z0-9][\w.-]*)$/i))) return { src: 'pypi', name: m[1] };
  if ((m = s.match(/^brew:\s*([a-z0-9][\w@.+-]*)$/i))) return { src: 'brew', name: m[1].toLowerCase() };
  if ((m = s.match(/^npm:\s*((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)$/i))) return { src: 'npm', name: m[1].toLowerCase() };
  if ((m = s.match(/^@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*$/i))) return { src: 'npm', name: s.toLowerCase() };
  if ((m = s.match(/^([\w.-]+)\/([\w.-]+)$/))) return { src: 'github', name: m[1] + '/' + m[2] };
  if (/^[a-z0-9][\w.-]*$/i.test(s)) return { src: 'npm', name: s.toLowerCase() };
  return null;
}

/// Where to ask for the latest version. Scoped npm names keep the @ but encode the slash.
function apiURL(x, tags) {
  if (x.src === 'npm') return 'https://registry.npmjs.org/' + x.name.replace('/', '%2F') + '/latest';
  if (x.src === 'pypi') return 'https://pypi.org/pypi/' + x.name + '/json';
  if (x.src === 'brew') return 'https://formulae.brew.sh/api/formula/' + x.name + '.json';
  return 'https://api.github.com/repos/' + x.name + (tags ? '/tags?per_page=1' : '/releases/latest');
}
function pageURL(x) {
  if (x.src === 'npm') return 'https://www.npmjs.com/package/' + x.name;
  if (x.src === 'pypi') return 'https://pypi.org/project/' + x.name + '/';
  if (x.src === 'brew') return 'https://formulae.brew.sh/formula/' + x.name;
  return 'https://github.com/' + x.name + '/releases';
}
function options(x) {
  if (x.src !== 'github') return { headers: { 'Accept': 'application/json' } };
  var h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  var token = String(notch.settings.get('token') || '').trim();
  if (token) h.Authorization = 'Bearer ' + token;
  return { headers: h };
}

/// The answer of each registry → { version, at?, url? }, or null.
function read(x, json, tags) {
  if (!json) return null;
  if (x.src === 'npm') return json.version ? { version: String(json.version) } : null;
  if (x.src === 'pypi') {
    var info = json.info || {}, files = json.urls || [];
    var up = files.length ? Date.parse(files[0].upload_time_iso_8601 || files[0].upload_time) : NaN;
    return info.version ? { version: String(info.version), at: isNaN(up) ? null : up } : null;
  }
  if (x.src === 'brew') return json.versions && json.versions.stable ? { version: String(json.versions.stable) } : null;
  if (tags) return json[0] && json[0].name ? { version: String(json[0].name), url: 'https://github.com/' + x.name + '/tags' } : null;
  if (!json.tag_name) return null;
  var at = Date.parse(json.published_at || json.created_at);
  return { version: String(json.tag_name), at: isNaN(at) ? null : at, url: json.html_url || null };
}

function check(x, tags) {
  var key = keyOf(x);
  if (busy[key] && !tags) return;
  busy[key] = true;
  notch.fetchJSON(apiURL(x, tags), options(x), function (json, err, status) {
    busy[key] = false;
    if (items.indexOf(x) < 0) return; // removed meanwhile
    // Still asking for the network permission: try again shortly, show nothing.
    if (!status && /permission/i.test(String(err))) { x.checked = clock() - EVERY + 15000; return; }
    if (status === 404 && x.src === 'github' && !tags) return check(x, true); // no releases: the newest tag
    if (status === 404) { x.error = 'notFound'; x.checked = clock(); save(); return; }
    if (status === 403 || status === 429) { x.error = 'limit'; x.checked = clock() - EVERY + RETRY; save(); return; }
    var got = status >= 200 && status < 300 ? read(x, json, tags) : null;
    if (!got) { x.error = 'offline'; x.checked = clock() - EVERY + RETRY; save(); return; }
    x.error = null;
    x.checked = clock();
    if (x.version && got.version !== x.version) {
      var old = x.version;
      x.version = got.version; x.isNew = true; x.at = got.at || clock();
      if (notch.settings.get('notify') !== false) notch.notify(tf('outTitle', { n: x.name, v: shown(got.version) }), tf('outBody', { old: shown(old) }));
    } else if (!x.version) {
      x.version = got.version; x.at = got.at || null;
    } else if (got.at) {
      x.at = got.at;
    }
    x.url = got.url || pageURL(x);
    save();
    notch.refresh();
  });
}

function round(force) {
  items.forEach(function (x) { if (force || !x.checked || clock() - x.checked >= EVERY) check(x); });
}

/// v19.2.0 → 19.2.0 for display; other tags stay as they are.
function shown(v) { return String(v || '').replace(/^v(?=\d)/, ''); }

function ago(at) {
  var ms = clock() - at;
  if (ms < 60000) return t('justNow');
  if (ms < 3600000) return tf('ago', { t: Math.floor(ms / 60000) + ' ' + t('min') });
  if (ms < 86400000) return tf('ago', { t: Math.floor(ms / 3600000) + ' ' + t('h') });
  var d = Math.floor(ms / 86400000);
  return tf('ago', { t: d === 1 ? t('d1') : d + ' ' + t('d') });
}

function row(x, index) {
  var detail = x.error ? t(x.error) : !x.version ? t('checking') : x.at ? ago(x.at) : '';
  var parts = [
    ui.symbol(ICONS[x.src], { size: 15, color: x.isNew ? 'green' : 'secondary' }),
    ui.text(x.name, { style: 'headline', lines: 1 }),
    x.isNew ? ui.text(t('isNew'), { style: 'caption', weight: 'semibold', color: 'green' }) : ui.text('', {}),
    ui.spacer(),
    ui.text(detail, { style: 'caption', color: x.error ? 'orange' : 'tertiary', lines: 1 }),
    ui.text(x.version ? shown(x.version) : '—', { style: 'monoFootnote', color: x.isNew ? 'green' : 'primary' })
  ];
  if (editing) parts.push(ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true }));
  else parts.push(ui.button('', 'open:' + index, { symbol: 'lucide:external-link', compact: true }));
  return ui.hstack(parts, { spacing: 8, paddingX: 8, paddingY: 5, background: 'white', fill: true });
}

function render() {
  round(false);
  var input = ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 });
  if (!items.length) {
    return ui.vstack([ui.text(t('empty'), { style: 'headline' }), ui.text(t('emptyHint'), { style: 'caption' }), input], { spacing: 10 });
  }
  var fresh = items.filter(function (x) { return x.isNew; }).length;
  var last = Math.max.apply(null, items.map(function (x) { return x.checked || 0; }));
  var head = fresh ? tf('news', { n: fresh }) : last ? tf('allQuiet', { n: items.length, t: ago(last) }) : t('checking');
  return ui.vstack([
    ui.hstack([
      ui.text(head, { style: 'headline', color: fresh ? 'green' : 'secondary' }),
      ui.spacer(),
      ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', compact: true })
    ]),
    ui.vstack(items.map(row), { spacing: 4 }),
    input
  ], { spacing: 8 });
}

function compact() {
  if (notch.settings.get('beside') === false) return null;
  var fresh = items.filter(function (x) { return x.isNew; });
  if (!fresh.length) return null;
  var text = fresh.length === 1 ? fresh[0].name + ' ' + shown(fresh[0].version) : tf('news', { n: fresh.length });
  return { symbol: 'lucide:tag', text: text, color: 'green' };
}

function onAction(action, value) {
  if (action === 'add') {
    var x = parse(value);
    if (!x) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    if (items.some(function (y) { return keyOf(y) === keyOf(x); })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (items.length >= MAX) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    items.push(x); save(); check(x);
  }
  if (action.indexOf('open:') === 0) {
    var it = items[+action.slice(5)];
    if (!it) return;
    notch.open(it.url || pageURL(it));
    if (it.isNew) { it.isNew = false; save(); }
  }
  if (action === 'refresh') round(true);
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) { items.splice(+action.slice(7), 1); save(); }
}

function onSettingsChanged(key) {
  if (key === 'token') items.forEach(function (x) { if (x.src === 'github' && x.error) x.checked = 0; });
}

setInterval(function () { round(false); }, 60000);
