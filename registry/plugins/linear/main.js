// Linear Issues — the open issues assigned to you, grouped like Linear's My Issues: In progress, Todo, Backlog.
// Priority icons, due-date warnings, click the ID to copy "ENG-123 Title", click the title to open it.
// Checks every 2 minutes and notifies once when a new issue lands on your plate.

var STRINGS = {
  en: {
    setupTitle: 'Connect Linear', setupHint: 'Settings → Linear Issues: paste a personal API key from Linear → Settings → Security & access.',
    update: 'This plugin needs Poni 0.4.3 or later.', loading: 'Checking Linear…',
    empty: 'Nothing assigned to you', emptyHint: 'Inbox zero. Enjoy it.',
    started: 'In progress', unstarted: 'Todo', backlog: 'Backlog', more: '+{n} more',
    open: '{n} open', overdueN: '{n} overdue', inProgressN: '{n} in progress',
    overdue: '{n}d late', today: 'Due today', tomorrow: 'Tomorrow', due: '{d}',
    auth: 'Linear refused the API key. Check it in the settings.', limit: 'Linear rate limit reached; trying again soon.',
    offline: 'Can’t reach Linear: {e}', copied: 'Copied {id}', newTitle: 'Assigned to you: {id}', newMany: '{n} new issues assigned to you',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], dateFormat: '{m} {d}'
  },
  id: {
    setupTitle: 'Hubungkan Linear', setupHint: 'Pengaturan → Issue Linear: tempel personal API key dari Linear → Settings → Security & access.',
    update: 'Plugin ini butuh Poni 0.4.3 atau lebih baru.', loading: 'Memeriksa Linear…',
    empty: 'Tidak ada issue untuk Anda', emptyHint: 'Semua beres. Nikmati.',
    started: 'Dikerjakan', unstarted: 'Todo', backlog: 'Backlog', more: '+{n} lagi',
    open: '{n} terbuka', overdueN: '{n} lewat tenggat', inProgressN: '{n} dikerjakan',
    overdue: 'telat {n} hr', today: 'Tenggat hari ini', tomorrow: 'Besok', due: '{d}',
    auth: 'Linear menolak API key. Periksa di pengaturan.', limit: 'Batas permintaan Linear tercapai; dicoba lagi sebentar lagi.',
    offline: 'Tidak bisa menghubungi Linear: {e}', copied: '{id} disalin', newTitle: 'Issue baru untuk Anda: {id}', newMany: '{n} issue baru untuk Anda',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], dateFormat: '{d} {m}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

function clock() { return Date.now(); } // tests replace this

var EVERY = 120000, RETRY = 5000, KNOWN_MAX = 300;
var QUERY = 'query { viewer { assignedIssues(first: 20, filter: { state: { type: { nin: ["completed", "canceled"] } } }, orderBy: updatedAt) ' +
  '{ nodes { identifier title url priority priorityLabel dueDate state { name type color } team { key } updatedAt } } } }';
var GROUPS = [
  { key: 'started', types: ['started'], limit: 5 },
  { key: 'unstarted', types: ['unstarted', 'triage'], limit: 4 },
  { key: 'backlog', types: ['backlog'], limit: 3 }
];

var issues = null;            // null until the first answer
var problem = '';
var lastCheck = 0, checking = false;
var known = notch.storage.get('known');   // identifiers already seen; null before the first load ever

function apiKey() { return String(notch.settings.get('key') || '').trim().replace(/^Bearer\s+/i, ''); }
/// Personal API keys go as they are; anything else (an OAuth token) needs "Bearer".
function authHeader(key) { return /^lin_api_/.test(key) ? key : 'Bearer ' + key; }

function check(force) {
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return;
  var key = apiKey();
  if (!key || checking) return;
  if (!force && clock() - lastCheck < EVERY) return;
  lastCheck = clock();
  checking = true;
  notch.fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(key) },
    body: JSON.stringify({ query: QUERY })
  }, function (text, err, status) {
    checking = false;
    if (!status) {
      if (/permission/i.test(String(err))) { lastCheck = clock() - EVERY + RETRY; return; }
      problem = tf('offline', { e: err || '—' }); lastCheck = clock() - EVERY + 30000; notch.refresh(); return;
    }
    var json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    var errs = (json && json.errors) || [];
    var authFail = status === 401 || errs.some(function (e) {
      return /auth/i.test(String((e.extensions && e.extensions.code) || '') + ' ' + String(e.message || ''));
    });
    if (authFail) { problem = t('auth'); issues = null; notch.refresh(); return; }
    if (status === 429 || errs.some(function (e) { return /RATELIMITED/i.test(String(e.extensions && e.extensions.code)); })) {
      problem = t('limit'); return;
    }
    var nodes = json && json.data && json.data.viewer && json.data.viewer.assignedIssues && json.data.viewer.assignedIssues.nodes;
    if (!nodes) { problem = tf('offline', { e: errs.length ? errs[0].message : 'HTTP ' + status }); return; }
    problem = '';
    issues = nodes;
    noticeNew();
    notch.refresh();
  });
}

// New identifiers since the last check: one notification (or a summary for several). The very first load
// only remembers what's there, so installing the plugin doesn't announce your whole backlog.
function noticeNew() {
  var ids = issues.map(function (i) { return i.identifier; });
  if (known) {
    var fresh = issues.filter(function (i) { return known.indexOf(i.identifier) < 0; });
    if (fresh.length && notch.settings.get('notify') !== false) {
      if (fresh.length === 1) notch.notify(tf('newTitle', { id: fresh[0].identifier }), fresh[0].title);
      else notch.notify(tf('newMany', { n: fresh.length }), fresh.map(function (i) { return i.identifier; }).join(', '));
    }
  }
  var merged = ids.concat((known || []).filter(function (id) { return ids.indexOf(id) < 0; })).slice(0, KNOWN_MAX);
  known = merged;
  notch.storage.set('known', known);
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function today() { var d = new Date(clock()); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/// Whole days from today to a 'YYYY-MM-DD' date (negative when it's past).
function daysUntil(date) {
  var p = String(date).split('-'), a = new Date(clock());
  var from = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12).getTime();
  var to = new Date(+p[0], +p[1] - 1, +p[2], 12).getTime();
  return Math.round((to - from) / 86400000);
}
function due(issue) {
  if (!issue.dueDate) return null;
  var n = daysUntil(issue.dueDate);
  if (n < 0) return { text: tf('overdue', { n: -n }), color: 'red', late: true };
  if (n === 0) return { text: t('today'), color: 'orange', late: true };
  if (n === 1) return { text: t('tomorrow'), color: 'yellow' };
  var p = issue.dueDate.split('-');
  return { text: tf('dateFormat', { m: t('months')[+p[1] - 1], d: +p[2] }), color: 'white/40' };
}
function isLate(issue) { var d = due(issue); return !!(d && d.late && d.color === 'red'); }

function priority(p) {
  if (p === 1) return { icon: 'lucide:octagon-alert', color: 'orange' };
  if (p === 2) return { icon: 'lucide:signal-high', color: 'white/80' };
  if (p === 3) return { icon: 'lucide:signal-medium', color: 'white/65' };
  if (p === 4) return { icon: 'lucide:signal-low', color: 'white/50' };
  return { icon: 'lucide:ellipsis', color: 'white/30' };
}
/// Urgent first, "no priority" last, then the nearest due date.
function rank(a, b) {
  var pa = a.priority || 5, pb = b.priority || 5;
  if (pa !== pb) return pa - pb;
  var da = a.dueDate || '9999', db = b.dueDate || '9999';
  return da < db ? -1 : da > db ? 1 : 0;
}

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; }

function row(issue) {
  var pr = priority(issue.priority), d = due(issue), index = issues.indexOf(issue);
  var parts = [
    ui.symbol(pr.icon, { size: 14, color: pr.color }),
    ui.button(issue.identifier, 'copy|' + index, { style: 'plain', color: 'white/50', compact: true }),
    ui.button(clip(issue.title, 46), 'open|' + index, { style: 'plain', compact: true }),
    ui.spacer()
  ];
  if (d) parts.push(ui.text(d.text, { style: 'caption', weight: d.late ? 'semibold' : null, color: d.color }));
  return ui.hstack(parts, { spacing: 6 });
}

function group(g) {
  var list = issues.filter(function (i) { return g.types.indexOf(i.state && i.state.type) >= 0; }).sort(rank);
  if (!list.length) return null;
  var color = (list[0].state && list[0].state.color) || 'white/60';
  var header = ui.hstack([
    ui.symbol(g.key === 'started' ? 'lucide:circle-dot' : g.key === 'backlog' ? 'lucide:circle-dashed' : 'lucide:circle', { size: 12, color: color }),
    ui.text(t(g.key), { style: 'caption', weight: 'semibold', color: 'white/70' }),
    ui.text(String(list.length), { style: 'monoFootnote', color: 'white/35' })
  ], { spacing: 6 });
  var rows = [header].concat(list.slice(0, g.limit).map(row));
  if (list.length > g.limit) rows.push(ui.text(tf('more', { n: list.length - g.limit }), { style: 'caption', color: 'white/35' }));
  return ui.vstack(rows, { spacing: 2 });
}

function render() {
  check(false);
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return ui.text(t('update'), { style: 'callout', color: 'white/60' });
  if (!apiKey()) {
    return ui.vstack([
      ui.hstack([ui.symbol('lucide:square-kanban', { size: 18 }), ui.text(t('setupTitle'), { style: 'title' })], { spacing: 8 }),
      ui.text(t('setupHint'), { style: 'callout', color: 'white/55' })
    ], { spacing: 6 });
  }
  if (!issues) return ui.text(problem || t('loading'), { style: problem ? 'callout' : null, color: problem ? 'rose' : 'white/55' });
  if (!issues.length) {
    return ui.vstack([
      ui.hstack([ui.symbol('lucide:circle-check', { size: 18, color: 'mint' }), ui.text(t('empty'), { style: 'headline' })], { spacing: 8 }),
      ui.text(t('emptyHint'), { style: 'caption', color: 'white/50' })
    ], { spacing: 4 });
  }
  var late = issues.filter(isLate).length;
  var started = issues.filter(function (i) { return i.state && i.state.type === 'started'; }).length;
  var summary = [ui.text(tf('open', { n: issues.length }), { style: 'headline' })];
  if (started) summary.push(ui.text(tf('inProgressN', { n: started }), { style: 'caption', color: 'amber' }));
  if (late) summary.push(ui.text(tf('overdueN', { n: late }), { style: 'caption', weight: 'semibold', color: 'red' }));
  summary.push(ui.spacer(), ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', style: 'plain', compact: true }));
  var children = [ui.hstack(summary, { spacing: 8 })];
  GROUPS.forEach(function (g) { var v = group(g); if (v) children.push(v); });
  if (problem) children.push(ui.text(problem, { style: 'caption', color: 'rose' }));
  return ui.vstack(children, { spacing: 8 });
}

// Beside the notch: overdue issues first (red), otherwise how many are in progress.
function compact() {
  check(false);
  if (!issues || !issues.length) return null;
  var late = issues.filter(isLate).length;
  if (late) return { symbol: 'lucide:circle-alert', text: tf('overdueN', { n: late }), color: 'red' };
  var started = issues.filter(function (i) { return i.state && i.state.type === 'started'; }).length;
  if (started) return { symbol: 'lucide:circle-dot', text: tf('inProgressN', { n: started }), color: 'amber' };
  return null;
}

function onAction(action) {
  if (action === 'refresh') { check(true); return; }
  var issue = issues && issues[+action.split('|')[1]];
  if (!issue) return;
  if (action.indexOf('open|') === 0) notch.open(issue.url);
  if (action.indexOf('copy|') === 0) {
    notch.clipboard.set(issue.identifier + ' ' + issue.title);
    notch.flash(tf('copied', { id: issue.identifier }), 'lucide:copy');
  }
}

function onSettingsChanged() { lastCheck = 0; issues = null; problem = ''; }
