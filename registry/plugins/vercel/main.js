// Vercel Deploys — the latest deployments of your account or team. Building ones sit beside the notch with a
// running timer; a finished one turns green or red there for a couple of minutes, with a notification once.
// Checks every 5 s while something builds, every minute otherwise.

var STRINGS = {
  en: {
    setupTitle: 'Connect Vercel', setupHint: 'Settings → Vercel Deploys: paste a token from vercel.com/account/tokens.',
    badToken: 'That doesn’t look like a Vercel token. Paste it again in the settings, without spaces.',
    update: 'This plugin needs Poni 0.4.3 or later.', loading: 'Checking Vercel…', none: 'No deployments yet',
    noneFiltered: 'No recent deployments for {p}',
    building: 'Building', queued: 'Queued', ready: 'Ready', error: 'Failed', canceled: 'Canceled',
    production: 'Production', preview: 'Preview', ago: '{t} ago', justNow: 'just now', s: 's', m: 'm', h: 'h', d: 'd',
    auth: 'Vercel refused the token ({s}). Check it, and the team, in the settings.',
    team: 'Team not found. Use the team ID (team_…) or slug from the team’s settings.',
    limit: 'Vercel rate limit reached; trying again soon.', offline: 'Can’t reach Vercel: {e}',
    doneTitle: '{p} is live', failTitle: '{p} failed to deploy', cancelTitle: '{p} deploy canceled',
    body: '{tag} · {b} · {d}', buildingN: '{n} building', allGood: 'All deployed', lastFailed: 'Last deploy failed',
    open: 'Open', logs: 'Logs', took: 'in {d}'
  },
  id: {
    setupTitle: 'Hubungkan Vercel', setupHint: 'Pengaturan → Deploy Vercel: tempel token dari vercel.com/account/tokens.',
    badToken: 'Sepertinya itu bukan token Vercel. Tempel ulang di pengaturan, tanpa spasi.',
    update: 'Plugin ini butuh Poni 0.4.3 atau lebih baru.', loading: 'Memeriksa Vercel…', none: 'Belum ada deployment',
    noneFiltered: 'Belum ada deployment terbaru untuk {p}',
    building: 'Build', queued: 'Mengantre', ready: 'Siap', error: 'Gagal', canceled: 'Dibatalkan',
    production: 'Produksi', preview: 'Preview', ago: '{t} lalu', justNow: 'baru saja', s: 'd', m: 'm', h: 'j', d: 'h',
    auth: 'Vercel menolak token ({s}). Periksa token, juga timnya, di pengaturan.',
    team: 'Tim tidak ditemukan. Pakai ID tim (team_…) atau slug dari pengaturan tim.',
    limit: 'Batas permintaan Vercel tercapai; dicoba lagi sebentar lagi.', offline: 'Tidak bisa menghubungi Vercel: {e}',
    doneTitle: '{p} sudah live', failTitle: '{p} gagal deploy', cancelTitle: 'Deploy {p} dibatalkan',
    body: '{tag} · {b} · {d}', buildingN: '{n} sedang build', allGood: 'Semua ter-deploy', lastFailed: 'Deploy terakhir gagal',
    open: 'Buka', logs: 'Log', took: 'dalam {d}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

function clock() { return Date.now(); } // tests replace this

var FAST = 5000, SLOW = 60000, SHOW_FINISHED = 120000;
var RUNNING = { BUILDING: 1, QUEUED: 1, INITIALIZING: 1 };

var deployments = [];   // newest first, see simplify()
var problem = '';       // last error, shown under the list
var lastCheck = 0, lastOk = 0, checking = false;
var seen = notch.storage.get('seen') || {};   // deployment id → state we last saw, to notice a finish once
var finished = null;                          // { name, state, at } of the latest finish seen here

function token() { return String(notch.settings.get('token') || '').trim(); }
function tokenLooksValid(s) { return /^[A-Za-z0-9_\-.]{16,}$/.test(s); }
function projects() {
  return String(notch.settings.get('projects') || '').split(',').map(function (p) { return p.trim().toLowerCase(); })
    .filter(function (p) { return p; });
}
function isRunning(d) { return !!RUNNING[d.state]; }
function anyRunning() { return deployments.some(isRunning); }

function url() {
  var filtered = projects().length > 0;
  var u = 'https://api.vercel.com/v6/deployments?limit=' + (filtered ? 20 : 10);
  var team = String(notch.settings.get('team') || '').trim();
  if (team) u += (/^team_/.test(team) ? '&teamId=' : '&slug=') + encodeURIComponent(team);
  return u;
}

function simplify(d) {
  var meta = d.meta || {};
  var started = d.buildingAt || d.createdAt || d.created;
  return {
    id: d.uid || d.id, name: d.name || '', url: d.url || '', inspector: d.inspectorUrl || '',
    state: String(d.state || d.readyState || 'QUEUED').toUpperCase(),
    production: d.target === 'production',
    branch: meta.githubCommitRef || meta.gitlabCommitRef || meta.bitbucketCommitRef || '',
    message: String(meta.githubCommitMessage || meta.gitlabCommitMessage || meta.bitbucketCommitMessage || '').split('\n')[0],
    created: d.createdAt || d.created, started: started, ready: d.ready || null
  };
}

function check(force) {
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return;
  var tok = token();
  if (!tok || !tokenLooksValid(tok) || checking) return;
  if (!force && clock() - lastCheck < (anyRunning() ? FAST : SLOW)) return;
  lastCheck = clock();
  checking = true;
  notch.fetch(url(), { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' } }, function (text, err, status) {
    checking = false;
    // Poni is still asking for the network permission (or we're offline): try again in a few seconds.
    if (!status) {
      if (/permission/i.test(String(err))) { lastCheck = clock() - SLOW + FAST; return; }
      problem = tf('offline', { e: err || '—' }); lastCheck = clock() - SLOW + 15000; notch.refresh(); return;
    }
    if (status === 401 || status === 403) { problem = tf('auth', { s: status }); deployments = []; return; }
    if (status === 404) { problem = t('team'); deployments = []; return; }
    if (status === 429) { problem = t('limit'); return; }
    var json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    if (!json || !json.deployments) { problem = tf('offline', { e: 'HTTP ' + status }); return; }
    problem = '';
    var only = projects();
    var list = json.deployments.map(simplify).filter(function (d) {
      return !only.length || only.indexOf(d.name.toLowerCase()) >= 0;
    }).slice(0, 10);
    noticeFinished(list);
    deployments = list;
    lastOk = clock();
    notch.refresh();
  });
}

// A deployment we saw building that has now finished — or one that started and finished between two checks.
function noticeFinished(list) {
  var next = {};
  list.forEach(function (d) {
    var before = seen[d.id];
    var wasRunning = before ? !!RUNNING[before] : (lastOk && d.created > lastOk);
    if (wasRunning && !isRunning(d)) announce(d);
    next[d.id] = d.state;
  });
  seen = next;
  notch.storage.set('seen', seen);
}

function announce(d) {
  finished = { name: d.name, state: d.state, at: clock() };
  var key = d.state === 'READY' ? 'doneTitle' : d.state === 'CANCELED' ? 'cancelTitle' : 'failTitle';
  var title = tf(key, { p: d.name });
  notch.flash(title, d.state === 'READY' ? 'lucide:circle-check' : 'lucide:circle-x');
  if (notch.settings.get('notify') === false) return;
  var parts = [d.production ? t('production') : t('preview')];
  if (d.branch) parts.push(d.branch);
  if (d.message) parts.push(d.message);
  var took = buildTime(d);
  if (took) parts.push(tf('took', { d: took }));
  notch.notify(title, parts.join(' · '));
}

function short(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + t('s');
  if (s < 3600) return Math.floor(s / 60) + t('m') + ' ' + (s % 60) + t('s');
  if (s < 86400) return Math.floor(s / 3600) + t('h') + ' ' + Math.floor(s % 3600 / 60) + t('m');
  return Math.floor(s / 86400) + t('d');
}
function ago(ms) {
  var s = clock() - ms;
  if (s < 10000) return t('justNow');
  s = Math.round(s / 1000);
  var v = s < 60 ? s + t('s') : s < 3600 ? Math.floor(s / 60) + t('m') : s < 86400 ? Math.floor(s / 3600) + t('h') : Math.floor(s / 86400) + t('d');
  return tf('ago', { t: v });
}
function buildTime(d) {
  if (isRunning(d)) return d.started ? short(clock() - d.started) : '';
  return d.ready && d.started && d.ready >= d.started ? short(d.ready - d.started) : '';
}

function look(state) {
  if (state === 'BUILDING' || state === 'INITIALIZING') return { icon: 'lucide:loader-circle', color: 'amber', label: t('building'), anim: 'spin' };
  if (state === 'QUEUED') return { icon: 'lucide:circle-dashed', color: 'amber', label: t('queued'), anim: 'pulse' };
  if (state === 'READY') return { icon: 'lucide:circle-check', color: 'mint', label: t('ready') };
  if (state === 'CANCELED') return { icon: 'lucide:circle-slash', color: 'white/50', label: t('canceled') };
  return { icon: 'lucide:circle-x', color: 'rose', label: t('error') };
}

function tag(text, color) {
  return ui.hstack([ui.text(text, { style: 'caption', weight: 'semibold', color: color })],
    { paddingX: 6, paddingY: 1, background: color, backgroundOpacity: 0.16, radius: 6 });
}

function row(d, i) {
  var l = look(d.state), running = isRunning(d);
  var title = [ui.text(d.name, { style: 'headline', lines: 1 })];
  if (d.production) title.push(tag(t('production'), 'purple'));
  var detail = [];
  if (d.branch) detail.push(ui.symbol('lucide:git-branch', { size: 11, color: 'white/40' }), ui.text(d.branch, { style: 'monoFootnote', color: 'white/50', lines: 1 }));
  if (d.message) detail.push(ui.text(d.message, { style: 'caption', color: 'white/45', lines: 1 }));
  var took = buildTime(d);
  var right = running
    ? ui.text(l.label + (took ? ' · ' + took : ''), { style: 'monoFootnote', color: 'amber' })
    : ui.vstack([
        ui.text(l.label, { style: 'caption', weight: 'semibold', color: l.color }),
        ui.text(ago(d.created) + (took ? ' · ' + took : ''), { style: 'monoFootnote', color: 'white/40' })
      ], { spacing: 1, align: 'trailing' });
  // A live deployment opens the site; anything else opens Vercel's inspector with the build logs.
  var link = d.state === 'READY' && d.url ? 'https://' + d.url : d.inspector;
  return ui.hstack([
    ui.symbol(l.icon, { size: 18, color: l.color, animation: l.anim || null }),
    ui.vstack([ui.hstack(title, { spacing: 6 }), ui.hstack(detail, { spacing: 5 })], { spacing: 2 }),
    ui.spacer(),
    right,
    link ? ui.button('', 'open|' + i, { symbol: d.state === 'READY' ? 'lucide:external-link' : 'lucide:square-terminal', style: 'plain', compact: true }) : ui.spacer()
  ], { spacing: 10, paddingX: 10, paddingY: 6, background: running ? 'amber' : 'white', backgroundOpacity: running ? 0.1 : 0.04, radius: 10, fill: true });
}

function render() {
  check(false);
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return ui.text(t('update'), { style: 'callout', color: 'white/60' });
  var tok = token();
  if (!tok) {
    return ui.vstack([
      ui.hstack([ui.symbol('lucide:triangle', { size: 18, fill: true }), ui.text(t('setupTitle'), { style: 'title' })], { spacing: 8 }),
      ui.text(t('setupHint'), { style: 'callout', color: 'white/55' })
    ], { spacing: 6 });
  }
  if (!tokenLooksValid(tok)) return ui.text(t('badToken'), { style: 'callout', color: 'rose' });

  var building = deployments.filter(isRunning).length;
  var latest = deployments[0];
  var summary = building ? tf('buildingN', { n: building })
    : latest && latest.state === 'ERROR' ? t('lastFailed') : deployments.length ? t('allGood') : '';
  var children = [];
  if (summary) {
    children.push(ui.hstack([
      ui.symbol('lucide:triangle', { size: 13, fill: true, color: 'white/70' }),
      ui.text(summary, { style: 'headline', color: building ? 'amber' : latest.state === 'ERROR' ? 'rose' : 'mint' }),
      ui.spacer(),
      ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', style: 'plain', compact: true })
    ], { spacing: 8 }));
  }
  var rows = deployments.slice(0, 5).map(row);
  if (rows.length) children.push(ui.vstack(rows, { spacing: 4, stagger: true }));
  else if (!problem) {
    var only = projects();
    children.push(ui.text(!lastOk ? t('loading') : only.length ? tf('noneFiltered', { p: only.join(', ') }) : t('none'), { color: 'white/55' }));
  }
  if (problem) children.push(ui.text(problem, { style: 'caption', color: 'rose' }));
  return ui.vstack(children, { spacing: 8 });
}

// Beside the notch: the newest build with its running time, or a just-finished one in green or red.
function compact() {
  check(false);
  var running = deployments.filter(isRunning);
  if (running.length) {
    var d = running[0];
    var label = d.state === 'QUEUED' ? t('queued') : short(clock() - (d.started || d.created));
    return { symbol: 'lucide:loader-circle', text: d.name + ' · ' + label + (running.length > 1 ? ' +' + (running.length - 1) : ''), color: 'amber' };
  }
  if (finished && clock() - finished.at < SHOW_FINISHED) {
    var ok = finished.state === 'READY';
    return { symbol: ok ? 'lucide:circle-check' : 'lucide:circle-x', text: finished.name + ' · ' + look(finished.state).label, color: ok ? 'mint' : 'rose' };
  }
  return null;
}

function onAction(action) {
  if (action === 'refresh') check(true);
  if (action.indexOf('open|') === 0) {
    var d = deployments[+action.slice(5)];
    if (!d) return;
    notch.open(d.state === 'READY' && d.url ? 'https://' + d.url : (d.inspector || 'https://' + d.url));
  }
}

function onSettingsChanged() { lastCheck = 0; lastOk = 0; deployments = []; problem = ''; finished = null; }
