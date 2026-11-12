// GitHub Actions — workflow runs (and the latest deployment) of a few repositories, with the running ones
// beside the notch. Checks every 30 s while something runs, every 2 min otherwise.

var STRINGS = {
  en: {
    setupTitle: 'Add your repositories', setupHint: 'Settings → GitHub Actions: list repositories like owner/repo, and add a token for private ones.',
    update: 'This plugin needs Poni 0.4.3 or later.', loading: 'Checking GitHub…', none: 'No workflow runs yet',
    running: 'running', queued: 'queued', success: 'passed', failure: 'failed', cancelled: 'cancelled', skipped: 'skipped',
    ago: '{t} ago', s: 's', m: 'm', h: 'h', d: 'd', auth: 'GitHub refused the token (401). Check it in the settings.',
    notFound: '{r} not found (private repositories need a token).', limit: 'GitHub rate limit reached; trying again soon.',
    finished: '{r}: {w} {c}', deploy: 'Deploy', settings: 'Settings'
  },
  id: {
    setupTitle: 'Tambahkan repositori Anda', setupHint: 'Pengaturan → GitHub Actions: tulis repositori seperti owner/repo, dan tambahkan token untuk yang privat.',
    update: 'Plugin ini butuh Poni 0.4.3 atau lebih baru.', loading: 'Memeriksa GitHub…', none: 'Belum ada workflow run',
    running: 'berjalan', queued: 'mengantre', success: 'lulus', failure: 'gagal', cancelled: 'dibatalkan', skipped: 'dilewati',
    ago: '{t} lalu', s: 'd', m: 'm', h: 'j', d: 'h', auth: 'GitHub menolak token (401). Periksa di pengaturan.',
    notFound: '{r} tidak ditemukan (repositori privat butuh token).', limit: 'Batas permintaan GitHub tercapai; dicoba lagi nanti.',
    finished: '{r}: {w} {c}', deploy: 'Deploy', settings: 'Pengaturan'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var runs = {};        // repo → [run]
var deploys = {};     // repo → { state, environment, url, at }
var errors = {};      // repo → message key/text
var lastCheck = 0;
var checking = 0;
var seen = notch.storage.get('seen') || {}; // run id → status we last saw (to notice finishes once)

function repos() {
  return String(notch.settings.get('repos') || '').split(/[\s,]+/).map(function (r) { return r.trim(); })
    .filter(function (r) { return /^[\w.-]+\/[\w.-]+$/.test(r); });
}
function headers() {
  var h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  var token = String(notch.settings.get('token') || '').trim();
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}
function anyRunning() {
  return Object.keys(runs).some(function (r) { return runs[r].some(function (x) { return x.status !== 'completed'; }); });
}

function check() {
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return;
  var list = repos();
  if (!list.length || checking) return;
  var interval = anyRunning() ? 30000 : 120000;
  if (Date.now() - lastCheck < interval) return;
  lastCheck = Date.now();
  list.forEach(function (repo) {
    checking++;
    notch.fetchJSON('https://api.github.com/repos/' + repo + '/actions/runs?per_page=5', { headers: headers() }, function (json, err, status) {
      checking--;
      if (status === 401) { errors[repo] = t('auth'); return; }
      if (status === 404) { errors[repo] = tf('notFound', { r: repo }); return; }
      if (status === 403 || status === 429) { errors[repo] = t('limit'); return; }
      // No answer at all (offline, or the permission was just being asked): try again in 15 s.
      if (err || !json || !json.workflow_runs) { errors[repo] = String(err || 'GitHub'); if (!status) lastCheck = Date.now() - 105000; return; }
      delete errors[repo];
      runs[repo] = json.workflow_runs.map(function (r) {
        return { id: r.id, name: r.name, branch: r.head_branch, status: r.status, conclusion: r.conclusion,
                 url: r.html_url, started: Date.parse(r.run_started_at || r.created_at), updated: Date.parse(r.updated_at) };
      });
      noticeFinished(repo);
    });
    checking++;
    notch.fetchJSON('https://api.github.com/repos/' + repo + '/deployments?per_page=1', { headers: headers() }, function (json) {
      checking--;
      var d = json && json[0];
      if (!d) { delete deploys[repo]; return; }
      checking++;
      notch.fetchJSON(d.statuses_url + '?per_page=1', { headers: headers() }, function (st) {
        checking--;
        var s = st && st[0];
        deploys[repo] = { state: s ? s.state : 'pending', environment: d.environment, url: (s && (s.environment_url || s.target_url)) || '',
                          at: Date.parse((s && s.updated_at) || d.created_at) };
      });
    });
  });
}

// A run we saw running that has now finished: a flash, and a notification if that's on.
function noticeFinished(repo) {
  runs[repo].forEach(function (r) {
    var before = seen[r.id];
    if (before && before !== 'completed' && r.status === 'completed') {
      var msg = tf('finished', { r: repo.split('/')[1], w: r.name, c: t(r.conclusion) || r.conclusion });
      notch.flash(msg, r.conclusion === 'success' ? 'lucide:circle-check' : 'lucide:circle-x');
      if (notch.settings.get('notify') !== false) notch.notify(msg, r.branch || '');
    }
    seen[r.id] = r.status;
  });
  var ids = {};
  Object.keys(runs).forEach(function (k) { runs[k].forEach(function (r) { ids[r.id] = seen[r.id]; }); });
  seen = ids;
  notch.storage.set('seen', seen);
}

function ago(ms) {
  var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  var v = s < 60 ? s + t('s') : s < 3600 ? Math.floor(s / 60) + t('m') : s < 86400 ? Math.floor(s / 3600) + t('h') : Math.floor(s / 86400) + t('d');
  return tf('ago', { t: v });
}
function look(status, conclusion) {
  if (status !== 'completed') return { icon: 'lucide:loader-circle', color: 'amber', label: t(status === 'queued' ? 'queued' : 'running'), anim: 'spin' };
  if (conclusion === 'success') return { icon: 'lucide:circle-check', color: 'mint', label: t('success') };
  if (conclusion === 'failure' || conclusion === 'timed_out') return { icon: 'lucide:circle-x', color: 'rose', label: t('failure') };
  if (conclusion === 'cancelled') return { icon: 'lucide:circle-slash', color: 'white/50', label: t('cancelled') };
  return { icon: 'lucide:circle-dashed', color: 'white/50', label: t('skipped') };
}
function deployLook(state) {
  if (state === 'success') return look('completed', 'success');
  if (state === 'failure' || state === 'error') return look('completed', 'failure');
  if (state === 'inactive') return look('completed', 'cancelled');
  return look('in_progress');
}

function render() {
  check();
  if (!notch.features || notch.features.indexOf('fetch-options') < 0) return ui.text(t('update'), { style: 'callout', color: 'white/60' });
  var list = repos();
  if (!list.length) {
    return ui.vstack([ui.text(t('setupTitle'), { style: 'title' }), ui.text(t('setupHint'), { style: 'callout', color: 'white/55' })], { spacing: 4 });
  }
  var all = [];
  list.forEach(function (repo) { (runs[repo] || []).forEach(function (r) { all.push({ repo: repo, run: r }); }); });
  all.sort(function (a, b) {
    var ar = a.run.status !== 'completed', br = b.run.status !== 'completed';
    return ar !== br ? (ar ? -1 : 1) : b.run.updated - a.run.updated;
  });
  var rows = all.slice(0, 5).map(function (x) {
    var r = x.run, l = look(r.status, r.conclusion);
    return ui.hstack([
      ui.symbol(l.icon, { size: 16, color: l.color, animation: l.anim || null }),
      ui.text(x.repo.split('/')[1] + ' · ' + r.name, { lines: 1 }),
      ui.text(r.branch || '', { style: 'monoFootnote', color: 'white/40', lines: 1 }),
      ui.spacer(),
      ui.text(r.status !== 'completed' ? l.label : ago(r.updated), { style: 'caption', color: r.status !== 'completed' ? 'amber' : 'white/45' }),
      ui.button('', 'open|' + r.url, { symbol: 'lucide:external-link', style: 'plain', compact: true })
    ], { spacing: 10 });
  });
  list.forEach(function (repo) {
    var d = deploys[repo];
    if (!d) return;
    var l = deployLook(d.state);
    rows.push(ui.hstack([
      ui.symbol('lucide:rocket', { size: 16, color: l.color }),
      ui.text(t('deploy') + ' · ' + repo.split('/')[1] + (d.environment ? ' · ' + d.environment : ''), { lines: 1 }),
      ui.spacer(),
      ui.text(l.label + ' · ' + ago(d.at), { style: 'caption', color: 'white/45' }),
      d.url ? ui.button('', 'open|' + d.url, { symbol: 'lucide:external-link', style: 'plain', compact: true }) : ui.spacer()
    ], { spacing: 10 }));
  });
  Object.keys(errors).forEach(function (repo) { rows.push(ui.text(errors[repo], { style: 'caption', color: 'rose' })); });
  if (!rows.length) rows.push(ui.text(lastCheck ? t('none') : t('loading'), { color: 'white/55' }));
  return ui.vstack(rows, { spacing: 6 });
}

// Beside the notch: the newest running workflow with how long it has been going.
function compact() {
  check();
  var running = [];
  Object.keys(runs).forEach(function (repo) {
    runs[repo].forEach(function (r) { if (r.status !== 'completed') running.push({ repo: repo, run: r }); });
  });
  if (!running.length) return null;
  running.sort(function (a, b) { return b.run.started - a.run.started; });
  var x = running[0], secs = Math.round((Date.now() - x.run.started) / 1000);
  var dur = secs < 60 ? secs + t('s') : Math.floor(secs / 60) + t('m') + ' ' + (secs % 60) + t('s');
  return { symbol: 'lucide:loader-circle', text: x.repo.split('/')[1] + ' · ' + dur, color: 'amber' };
}

function onAction(action) {
  if (action.indexOf('open|') === 0) notch.open(action.slice(5));
}

function onSettingsChanged() { lastCheck = 0; runs = {}; deploys = {}; errors = {}; }
