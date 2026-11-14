// Service Status — the public Statuspage summaries (…/api/v2/summary.json) of the services a developer depends on:
// active incidents with their impact, a notification when one starts and when it's resolved.

var STRINGS = {
  en: {
    calm: 'All systems operational', issues: '{n} services have issues', issue: '{s} has issues', checking: 'Checking…',
    services: 'Services', back: 'Done', watching: 'Watching {n}', operational: 'Operational: {list}',
    custom: 'Add a Statuspage: status.example.com', invalid: 'Not a web address. Try status.example.com',
    dup: 'Already in the list', notStatuspage: '{h} doesn’t serve a Statuspage summary', full: 'Up to 6 custom pages',
    failed: 'No answer', updated: 'updated {t}', ago: '{t} ago', justNow: 'just now', m: 'min', h: 'h', d: 'd',
    newTitle: '{s}: {name}', newBody: 'Impact: {impact} · {status}', fixedTitle: '{s}: resolved', fixedBody: '{name}',
    impact: { none: 'none', minor: 'minor', major: 'major', critical: 'critical', maintenance: 'maintenance' },
    state: { investigating: 'investigating', identified: 'identified', monitoring: 'monitoring', in_progress: 'in progress', verifying: 'verifying' },
    pick: 'Tick the services to watch', noneWatched: 'You’re not watching any service', pickHint: 'Open Services to pick some.',
    footer: 'Checked every 5 min from each service’s public status page'
  },
  id: {
    calm: 'Semua sistem normal', issues: '{n} layanan bermasalah', issue: '{s} bermasalah', checking: 'Memeriksa…',
    services: 'Layanan', back: 'Selesai', watching: 'Memantau {n}', operational: 'Normal: {list}',
    custom: 'Tambah Statuspage: status.contoh.com', invalid: 'Bukan alamat web. Coba status.contoh.com',
    dup: 'Sudah ada di daftar', notStatuspage: '{h} tidak menyediakan ringkasan Statuspage', full: 'Maksimal 6 halaman tambahan',
    failed: 'Tidak ada jawaban', updated: 'diperbarui {t}', ago: '{t} lalu', justNow: 'baru saja', m: 'mnt', h: 'jam', d: 'hr',
    newTitle: '{s}: {name}', newBody: 'Dampak: {impact} · {status}', fixedTitle: '{s}: sudah pulih', fixedBody: '{name}',
    impact: { none: 'tidak ada', minor: 'ringan', major: 'besar', critical: 'kritis', maintenance: 'pemeliharaan' },
    state: { investigating: 'diselidiki', identified: 'penyebab ditemukan', monitoring: 'dipantau', in_progress: 'berlangsung', verifying: 'diverifikasi' },
    pick: 'Centang layanan yang ingin dipantau', noneWatched: 'Belum ada layanan yang dipantau', pickHint: 'Buka Layanan untuk memilih.',
    footer: 'Diperiksa tiap 5 menit dari halaman status publik tiap layanan'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var CATALOG = [
  { id: 'github', name: 'GitHub', host: 'www.githubstatus.com' },
  { id: 'vercel', name: 'Vercel', host: 'www.vercel-status.com' },
  { id: 'cloudflare', name: 'Cloudflare', host: 'www.cloudflarestatus.com' },
  { id: 'openai', name: 'OpenAI', host: 'status.openai.com' },
  { id: 'anthropic', name: 'Anthropic', host: 'status.claude.com' },
  { id: 'netlify', name: 'Netlify', host: 'www.netlifystatus.com' },
  { id: 'atlassian', name: 'Atlassian', host: 'status.atlassian.com' },
  { id: 'jira', name: 'Jira', host: 'jira-software.status.atlassian.com' },
  { id: 'discord', name: 'Discord', host: 'discordstatus.com' },
  { id: 'linear', name: 'Linear', host: 'linearstatus.com' },
  { id: 'supabase', name: 'Supabase', host: 'status.supabase.com' },
  { id: 'npm', name: 'npm', host: 'status.npmjs.org' },
  { id: 'digitalocean', name: 'DigitalOcean', host: 'status.digitalocean.com' },
  { id: 'figma', name: 'Figma', host: 'status.figma.com' },
  { id: 'notion', name: 'Notion', host: 'www.notion-status.com' }
];
var DEFAULT_WATCH = ['github', 'vercel', 'cloudflare', 'openai', 'anthropic'];
var EVERY = 5 * 60000, MAX_CUSTOM = 6;
var RANK = { none: 0, maintenance: 1, minor: 2, major: 3, critical: 4 };
var COLOR = { none: 'green', maintenance: 'blue', minor: 'yellow', major: 'orange', critical: 'red' };

function clock() { return Date.now(); } // tests replace this

var watch = notch.storage.get('watch') || DEFAULT_WATCH.slice();   // catalog ids
var custom = notch.storage.get('custom') || [];                    // [{ id: host, name, host }]
var state = notch.storage.get('state') || {};                      // host → { indicator, description, incidents: [...], at, failed }
var busy = {}, managing = false, lastRound = 0;

function services() {
  var list = CATALOG.filter(function (s) { return watch.indexOf(s.id) >= 0; });
  return list.concat(custom);
}

// ---- Helpers ----------------------------------------------------------------------------------

function duration(ms) {
  var min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return min + ' ' + t('m');
  if (min < 1440) return Math.floor(min / 60) + ' ' + t('h');
  return Math.floor(min / 1440) + ' ' + t('d');
}
function ago(at) { return clock() - at < 60000 ? t('justNow') : tf('ago', { t: duration(clock() - at) }); }

/// "https://status.example.com/history" → "status.example.com".
function hostOf(text) {
  var s = String(text || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/?#].*$/, '').replace(/:\d+$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) && /\.[a-z]{2,}$/.test(s) ? s : null;
}

function worst(s) {
  var st = state[s.host];
  if (!st || st.failed && !st.indicator) return 'none';
  var level = st.indicator || 'none';
  (st.incidents || []).forEach(function (i) { if ((RANK[i.impact] || 0) > (RANK[level] || 0)) level = i.impact; });
  return RANK[level] === undefined ? 'minor' : level;
}
function troubled(s) {
  var st = state[s.host];
  return !!st && ((st.indicator && st.indicator !== 'none') || (st.incidents || []).length > 0);
}

// ---- Data -------------------------------------------------------------------------------------

function check(s, onBad) {
  if (busy[s.host]) return;
  busy[s.host] = true;
  notch.fetch('https://' + s.host + '/api/v2/summary.json', { headers: { 'Accept': 'application/json' } }, function (text, err, status) {
    busy[s.host] = false;
    if (!status && /permission/i.test(String(err))) { lastRound = clock() - EVERY + 10000; return; }
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!json || !json.status || typeof json.status.indicator !== 'string') {
      if (onBad && status) return onBad();
      var old = state[s.host] || {};
      old.failed = true; old.at = old.at || 0;
      state[s.host] = old;
      notch.storage.set('state', state);
      return;
    }
    if (json.page && json.page.name && s.host === s.id) { s.name = json.page.name.replace(/\s+status$/i, ''); notch.storage.set('custom', custom); }
    update(s, json);
  });
}

function update(s, json) {
  var pageURL = String((json.page && json.page.url) || ('https://' + s.host)).replace(/\/$/, '');
  var incidents = (json.incidents || []).filter(function (i) { return i && i.id && i.status !== 'resolved' && i.status !== 'postmortem'; })
    .map(function (i) {
      return { id: String(i.id), name: String(i.name || ''), impact: String(i.impact || 'minor'), status: String(i.status || ''),
               url: String(i.shortlink || (pageURL + '/incidents/' + i.id)), updated: Date.parse(i.updated_at || i.created_at || '') || clock() };
    });
  var old = state[s.host];
  if (old && old.at) {   // the first look at a page only sets the baseline; no notifications for what was already going on
    var before = {}, now = {};
    (old.incidents || []).forEach(function (i) { before[i.id] = i; });
    incidents.forEach(function (i) { now[i.id] = true; if (!before[i.id]) announce('new', s, i); });
    (old.incidents || []).forEach(function (i) { if (!now[i.id]) announce('fixed', s, i); });
  }
  state[s.host] = { indicator: String(json.status.indicator), description: String(json.status.description || ''),
                    incidents: incidents, url: pageURL, at: clock(), failed: false };
  notch.storage.set('state', state);
  notch.refresh();
}

function announce(kind, s, i) {
  if (notch.settings.get('notify') === false) return;
  if (kind === 'new') {
    notch.notify(tf('newTitle', { s: s.name, name: i.name }),
      tf('newBody', { impact: t('impact')[i.impact] || i.impact, status: t('state')[i.status] || i.status }));
  } else notch.notify(tf('fixedTitle', { s: s.name }), tf('fixedBody', { name: i.name }));
}

function round(force) {
  var list = services();
  if (!list.length || (!force && clock() - lastRound < EVERY)) return;
  lastRound = clock();
  list.forEach(function (s) { check(s); });
}

// ---- UI ---------------------------------------------------------------------------------------

function incidentRow(s, i) {
  return ui.hstack([
    ui.symbol(i.impact === 'critical' || i.impact === 'major' ? 'lucide:octagon-alert' : i.impact === 'maintenance' ? 'lucide:wrench' : 'lucide:triangle-alert',
      { size: 15, color: COLOR[i.impact] || 'yellow' }),
    ui.vstack([
      ui.text(s.name, { style: 'caption', color: COLOR[i.impact] || 'yellow', weight: 'semibold', lines: 1 }),
      ui.text(i.name, { style: 'callout', lines: 2 }),
      ui.text((t('state')[i.status] || i.status) + ' · ' + tf('updated', { t: ago(i.updated) }), { style: 'caption', color: 'tertiary', lines: 1 })
    ], { spacing: 2 }),
    ui.spacer(),
    ui.button('', 'open:' + i.url, { symbol: 'lucide:external-link', compact: true })
  ], { spacing: 10, paddingX: 10, paddingY: 8, background: COLOR[i.impact] || 'yellow', backgroundOpacity: 0.14, fill: true });
}

/// A service that reports degraded components without an incident.
function degradedRow(s) {
  var st = state[s.host], level = worst(s);
  return ui.hstack([
    ui.symbol('lucide:circle-alert', { size: 15, color: COLOR[level] }),
    ui.vstack([
      ui.text(s.name, { style: 'caption', color: COLOR[level], weight: 'semibold' }),
      ui.text(st.description, { style: 'callout', lines: 1 })
    ], { spacing: 2 }),
    ui.spacer(),
    ui.button('', 'open:' + st.url, { symbol: 'lucide:external-link', compact: true })
  ], { spacing: 10, paddingX: 10, paddingY: 8, background: COLOR[level], backgroundOpacity: 0.14, fill: true });
}

function manageView() {
  var rows = CATALOG.map(function (s) {
    var on = watch.indexOf(s.id) >= 0, st = state[s.host];
    return ui.hstack([
      ui.button('', 'toggle:' + s.id, { symbol: on ? 'lucide:square-check' : 'lucide:square', compact: true, color: on ? 'accent' : undefined }),
      ui.text(s.name, { style: 'callout', color: on ? 'primary' : 'secondary' }),
      ui.spacer(),
      on && st && st.at ? ui.symbol('lucide:circle-dot', { size: 9, color: COLOR[worst(s)] }) : ui.spacer()
    ], { spacing: 8 });
  });
  custom.forEach(function (s, index) {
    rows.push(ui.hstack([
      ui.button('', 'uncustom:' + index, { symbol: 'lucide:x', compact: true }),
      ui.vstack([ui.text(s.name, { style: 'callout' }), ui.text(s.host, { style: 'caption', color: 'tertiary' })], { spacing: 0 }),
      ui.spacer(),
      state[s.host] && state[s.host].at ? ui.symbol('lucide:circle-dot', { size: 9, color: COLOR[worst(s)] }) : ui.spacer()
    ], { spacing: 8 }));
  });
  return ui.vstack([
    ui.hstack([ui.text(t('pick'), { style: 'headline' }), ui.spacer(),
               ui.button(t('back'), 'manage', { symbol: 'lucide:check', compact: true })]),
    ui.vstack(rows, { spacing: 4 }),
    ui.input(t('custom'), 'custom', { clear: true })
  ], { spacing: 8 });
}

function render() {
  round(false);
  if (managing) return manageView();
  var list = services();
  var header = function (text, color) {
    return ui.hstack([
      ui.text(text, { style: 'headline', color: color, lines: 1 }),
      ui.spacer(),
      ui.button(t('services'), 'manage', { symbol: 'lucide:server', compact: true }),
      ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', compact: true })
    ], { spacing: 6 });
  };
  if (!list.length) {
    return ui.vstack([header(t('noneWatched'), 'secondary'), ui.text(t('pickHint'), { style: 'caption' })], { spacing: 8 });
  }
  var known = list.filter(function (s) { return state[s.host] && state[s.host].at; });
  var bad = list.filter(troubled);
  bad.sort(function (a, b) { return RANK[worst(b)] - RANK[worst(a)]; });
  var parts = [];
  if (!bad.length && known.length < list.length) parts.push(header(t('checking'), 'secondary'));
  else if (!bad.length) {
    parts.push(header(t('calm'), 'green'));
  } else {
    var top = worst(bad[0]);
    parts.push(header(bad.length === 1 ? tf('issue', { s: bad[0].name }) : tf('issues', { n: bad.length }), COLOR[top]));
    var cards = [];
    bad.forEach(function (s) {
      var incidents = state[s.host].incidents || [];
      if (!incidents.length) cards.push(degradedRow(s));
      incidents.slice(0, 3).forEach(function (i) { cards.push(incidentRow(s, i)); });
    });
    parts.push(ui.vstack(cards.slice(0, 6), { spacing: 6 }));
  }
  var fine = known.filter(function (s) { return !troubled(s); }).map(function (s) { return s.name; });
  var failing = list.filter(function (s) { return state[s.host] && state[s.host].failed; }).map(function (s) { return s.name; });
  if (fine.length) {
    parts.push(ui.hstack([
      ui.symbol('lucide:circle-check', { size: 13, color: 'green' }),
      ui.text(tf('operational', { list: fine.join(', ') }), { style: 'caption', color: 'secondary', lines: 2 })
    ], { spacing: 6 }));
  }
  if (failing.length) parts.push(ui.text(t('failed') + ': ' + failing.join(', '), { style: 'caption', color: 'orange', lines: 1 }));
  parts.push(ui.text(t('footer'), { style: 'caption', color: 'tertiary', lines: 1 }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  var bad = services().filter(troubled);
  if (!bad.length) return null;
  bad.sort(function (a, b) { return RANK[worst(b)] - RANK[worst(a)]; });
  var level = worst(bad[0]);
  return { symbol: level === 'maintenance' ? 'lucide:wrench' : 'lucide:triangle-alert',
           text: bad[0].name + (bad.length > 1 ? ' +' + (bad.length - 1) : ''), color: COLOR[level] };
}

function onAction(action, value) {
  if (action === 'manage') managing = !managing;
  if (action === 'refresh') round(true);
  if (action.indexOf('open:') === 0) notch.open(action.slice(5));
  if (action.indexOf('toggle:') === 0) {
    var id = action.slice(7), at = watch.indexOf(id);
    if (at >= 0) watch.splice(at, 1);
    else {
      watch.push(id);
      var s = CATALOG.filter(function (c) { return c.id === id; })[0];
      if (s) check(s);
    }
    notch.storage.set('watch', watch);
  }
  if (action === 'custom') {
    var host = hostOf(value);
    if (!host) { notch.flash(t('invalid'), 'exclamationmark.triangle.fill'); return; }
    var inCatalog = CATALOG.filter(function (c) { return c.host === host; })[0];
    if (inCatalog) {
      if (watch.indexOf(inCatalog.id) < 0) { watch.push(inCatalog.id); notch.storage.set('watch', watch); check(inCatalog); }
      else notch.flash(t('dup'), 'info.circle.fill');
      return;
    }
    if (custom.some(function (c) { return c.host === host; })) { notch.flash(t('dup'), 'info.circle.fill'); return; }
    if (custom.length >= MAX_CUSTOM) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    var entry = { id: host, name: host, host: host };
    custom.push(entry);
    notch.storage.set('custom', custom);
    check(entry, function () {
      custom = custom.filter(function (c) { return c.host !== host; });
      notch.storage.set('custom', custom);
      notch.flash(tf('notStatuspage', { h: host }), 'exclamationmark.triangle.fill');
    });
  }
  if (action.indexOf('uncustom:') === 0) {
    var gone = custom.splice(+action.slice(9), 1)[0];
    if (gone) { delete state[gone.host]; notch.storage.set('state', state); }
    notch.storage.set('custom', custom);
  }
}

setInterval(function () { round(false); }, 30000);
