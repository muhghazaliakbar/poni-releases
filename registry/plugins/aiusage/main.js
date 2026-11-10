// Pemakaian AI — notch.ai.usage(): Claude Code tokens (5-hour blocks) + Codex rate limits.

var alerted = null;

function tok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' jt';
  if (n >= 1e3) return Math.round(n / 1e3) + ' rb';
  return String(n || 0);
}
function left(ms) {
  var m = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (m >= 1440) return Math.floor(m / 1440) + ' hr ' + Math.floor((m % 1440) / 60) + ' j';
  return Math.floor(m / 60) + ' j ' + (m % 60) + ' m';
}
function tone(x) { return x > 0.85 ? 'red' : x > 0.6 ? 'orange' : 'green'; }
function shortModel(m) { return m.replace(/^claude-/, '').replace(/-\d{8}$/, ''); }

function claudeView(c) {
  if (!c) return null;
  var rows = [ui.hstack([ui.symbol('asterisk', { size: 13, color: 'orange' }), ui.text('Claude Code', { style: 'headline' }), ui.spacer(),
    ui.text('hari ini ' + tok(c.today.input + c.today.output) + ' token', { style: 'caption' })], { spacing: 6 })];
  if (c.block) {
    var b = c.block, elapsed = (Date.now() - b.start) / (b.end - b.start);
    rows.push(ui.hstack([ui.text('Blok 5 jam', { style: 'caption' }), ui.spacer(),
      ui.text(tok(b.input + b.output) + ' token · ' + b.messages + ' pesan · reset ' + left(b.end), { style: 'mono', color: 'secondary' })]));
    rows.push(ui.progress(elapsed, { color: 'orange' }));
    var models = Object.keys(b.models).sort(function (x, y) { return b.models[y] - b.models[x]; }).slice(0, 3)
      .map(function (m) { return shortModel(m) + ' ' + tok(b.models[m]); }).join(' · ');
    rows.push(ui.text(models, { style: 'caption', color: 'tertiary', lines: 1 }));
  } else {
    rows.push(ui.text('Tidak ada blok aktif — blok baru dimulai saat Anda memakai Claude Code lagi.', { style: 'caption' }));
  }
  return ui.vstack(rows, { spacing: 5 });
}

function codexView(x) {
  if (!x) return null;
  var rows = [ui.hstack([ui.symbol('terminal', { size: 13, color: 'teal' }), ui.text('Codex', { style: 'headline' }), ui.spacer(),
    ui.text(x.plan ? 'paket ' + x.plan : '', { style: 'caption' })], { spacing: 6 })];
  [['5 jam', x.primary], ['Mingguan', x.secondary]].forEach(function (w) {
    if (!w[1]) return;
    rows.push(ui.hstack([ui.text(w[0], { style: 'caption' }), ui.spacer(),
      ui.text(w[1].reset ? 'sudah reset · belum dipakai lagi' : Math.round(w[1].used * 100) + '% terpakai · reset ' + left(w[1].resetsAt),
        { style: 'mono', color: 'secondary' })]));
    rows.push(ui.progress(w[1].used, { color: tone(w[1].used) }));
  });
  return ui.vstack(rows, { spacing: 5 });
}

function render() {
  var u = notch.ai.usage();
  if (!u) return ui.text('Membaca log lokal…', { style: 'caption' });
  var parts = [claudeView(u.claude), codexView(u.codex)].filter(Boolean);
  if (!parts.length) return ui.vstack([ui.text('Belum ada data', { style: 'headline' }),
    ui.text('Tidak ditemukan log Claude Code (~/.claude) atau Codex (~/.codex).', { style: 'caption' })], { spacing: 4 });
  var out = [];
  parts.forEach(function (p, i) { if (i) out.push(ui.divider()); out.push(p); });
  return ui.vstack(out, { spacing: 10 });
}

function compact() {
  var u = notch.ai.usage();
  if (!u) return null;
  var x = u.codex, c = u.claude, mode = notch.settings.get('compact');
  var limit = (notch.settings.get('alert') || 80) / 100;
  if (x && x.primary && x.primary.used >= limit && alerted !== x.primary.resetsAt) {
    alerted = x.primary.resetsAt;
    notch.flash('Codex ' + Math.round(x.primary.used * 100) + '% kuota 5 jam', 'exclamationmark.triangle.fill');
  }
  if (mode === 'none') return null;
  if (mode === 'auto') {
    var cAt = c && c.block ? c.lastActivity || 0 : 0, xAt = x && x.primary ? x.updatedAt || 0 : 0;
    if (!cAt && !xAt) return null;
    mode = cAt >= xAt ? 'claude' : 'codex';
  }
  if (mode === 'codex' && x && x.primary) return { symbol: 'terminal', text: Math.round(x.primary.used * 100) + '%', color: tone(x.primary.used) };
  if (mode === 'claude' && c && c.block) return { symbol: 'asterisk', text: left(c.block.end), color: 'orange' };
  return null;
}
