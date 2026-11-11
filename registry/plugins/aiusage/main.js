// AI Usage — notch.ai.usage(): Claude Code tokens (5-hour blocks) + Codex rate limits.

var STRINGS = {
  en: {
    million: 'M', thousand: 'K', d: 'd', h: 'h', m: 'm',
    reading: 'Reading local logs…', claudeBlock: 'Claude Code · 5-hour block', tokens: '{n} tokens · resets in {t}',
    noBlock: 'no active block', codexPrimary: 'Codex · main quota', codexWeekly: 'Codex · weekly',
    wasReset: 'reset', used: '{n}% used', emptyTitle: 'No data yet',
    emptyHint: 'No Claude Code (~/.claude) or Codex (~/.codex) logs found.', alert: 'Codex at {n}% of 5-hour quota'
  },
  id: {
    million: ' jt', thousand: ' rb', d: 'hr', h: 'j', m: 'm',
    reading: 'Membaca log lokal…', claudeBlock: 'Claude Code · blok 5 jam', tokens: '{n} token · reset {t}',
    noBlock: 'tidak ada blok aktif', codexPrimary: 'Codex · kuota utama', codexWeekly: 'Codex · mingguan',
    wasReset: 'sudah reset', used: '{n}% terpakai', emptyTitle: 'Belum ada data',
    emptyHint: 'Tidak ditemukan log Claude Code (~/.claude) atau Codex (~/.codex).', alert: 'Codex {n}% kuota 5 jam'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var alerted = null;

function tok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + t('million');
  if (n >= 1e3) return Math.round(n / 1e3) + t('thousand');
  return String(n || 0);
}
function left(ms) {
  var m = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (m >= 1440) return Math.floor(m / 1440) + ' ' + t('d') + ' ' + Math.floor((m % 1440) / 60) + ' ' + t('h');
  return Math.floor(m / 60) + ' ' + t('h') + ' ' + (m % 60) + ' ' + t('m');
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
  if (!u) return ui.text(t('reading'), { style: 'caption', color: 'white/50' });
  var c = u.claude, x = u.codex, rows = [];
  if (c && c.block) {
    var b = c.block, elapsed = Math.min(1, (Date.now() - b.start) / (b.end - b.start));
    rows.push(meter(t('claudeBlock'), tf('tokens', { n: tok(b.input + b.output), t: left(b.end) }), elapsed, '#d97757'));
  } else if (c) {
    rows.push(meter(t('claudeBlock'), t('noBlock'), 0, '#d97757'));
  }
  if (x && x.primary) {
    rows.push(meter(t('codexPrimary'), x.primary.reset ? t('wasReset') : tf('used', { n: Math.round(x.primary.used * 100) }), x.primary.used, 'mint'));
  }
  if (x && x.secondary) {
    rows.push(meter(t('codexWeekly'), x.secondary.reset ? t('wasReset') : tf('used', { n: Math.round(x.secondary.used * 100) }), x.secondary.used, 'accent'));
  }
  if (!rows.length) return ui.vstack([ui.text(t('emptyTitle'), { style: 'title' }),
    ui.text(t('emptyHint'), { style: 'callout', color: 'white/55' })], { spacing: 4 });
  return ui.vstack(rows, { spacing: 12 });
}

function compact() {
  var u = notch.ai.usage();
  if (!u) return null;
  var x = u.codex, c = u.claude, mode = notch.settings.get('compact');
  var limit = (notch.settings.get('alert') || 80) / 100;
  if (x && x.primary && x.primary.used >= limit && alerted !== x.primary.resetsAt) {
    alerted = x.primary.resetsAt;
    notch.flash(tf('alert', { n: Math.round(x.primary.used * 100) }), 'exclamationmark.triangle.fill');
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
