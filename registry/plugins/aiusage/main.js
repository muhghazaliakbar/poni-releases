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

// Site AiPage: one meter per limit, a 14 pt label with a mono note on the right over an 8 pt bar.
// Colours as on the site: Claude #d97757, Codex 5-hour mint, weekly blue.
function meter(label, sub, value, color) {
  return ui.vstack([
    ui.hstack([
      ui.text(label, { style: 'callout', weight: 'semibold' }),
      ui.spacer(),
      ui.text(sub, { style: 'monoFootnote', color: 'white/50', lines: 1 })
    ], { spacing: 12, align: 'baseline' }),
    ui.progress(value, { color: color, height: 8, track: 0.12 })
  ], { spacing: 6 });
}

function render() {
  var u = notch.ai.usage();
  if (!u) return ui.text('Membaca log lokal…', { style: 'caption', color: 'white/50' });
  var c = u.claude, x = u.codex, rows = [];
  if (c && c.block) {
    var b = c.block, elapsed = Math.min(1, (Date.now() - b.start) / (b.end - b.start));
    rows.push(meter('Claude Code · blok 5 jam', tok(b.input + b.output) + ' token · reset ' + left(b.end), elapsed, '#d97757'));
  } else if (c) {
    rows.push(meter('Claude Code · blok 5 jam', 'tidak ada blok aktif', 0, '#d97757'));
  }
  if (x && x.primary) {
    rows.push(meter('Codex · kuota utama', x.primary.reset ? 'sudah reset' : Math.round(x.primary.used * 100) + '% terpakai', x.primary.used, 'mint'));
  }
  if (x && x.secondary) {
    rows.push(meter('Codex · mingguan', x.secondary.reset ? 'sudah reset' : Math.round(x.secondary.used * 100) + '% terpakai', x.secondary.used, 'accent'));
  }
  if (!rows.length) return ui.vstack([ui.text('Belum ada data', { style: 'title' }),
    ui.text('Tidak ditemukan log Claude Code (~/.claude) atau Codex (~/.codex).', { style: 'callout', color: 'white/55' })], { spacing: 4 });
  return ui.vstack(rows, { spacing: 12 });
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
