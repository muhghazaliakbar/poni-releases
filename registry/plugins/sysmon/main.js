// System Monitor — notch.system.stats()

var STRINGS = {
  en: {
    perSec: '/s', h: 'h', m: 'm', noPermission: '“System info” permission not granted', cores: 'CPU · {n} cores',
    memory: 'Memory', free: '{n} free', toFull: ' to full',
    thermal: { fair: 'warm', serious: 'hot', critical: 'critical' }
  },
  id: {
    perSec: '/d', h: 'j', m: 'm', noPermission: 'Izin "Info sistem" belum diberikan', cores: 'CPU · {n} inti',
    memory: 'RAM', free: '{n} kosong', toFull: ' sampai penuh',
    thermal: { fair: 'hangat', serious: 'panas', critical: 'kritis' }
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }

var hot = 0;

function pct(x) { return Math.round((x || 0) * 100) + '%'; }
function gb(b) { return (b / 1073741824).toFixed(1) + ' GB'; }
function rate(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB' + t('perSec');
  if (b >= 1024) return Math.round(b / 1024) + ' KB' + t('perSec');
  return Math.round(b) + ' B' + t('perSec');
}
function tone(x) { return x > 0.85 ? 'red' : x > 0.6 ? 'orange' : 'green'; }

function meter(symbol, label, value, detail, color) {
  return ui.vstack([
    ui.hstack([ui.symbol(symbol, { size: 12, color: 'secondary' }), ui.text(label, { style: 'caption' }), ui.spacer(),
      ui.text(detail, { style: 'mono', color: 'secondary' })], { spacing: 6 }),
    ui.progress(value, { color: color })
  ], { spacing: 5 });
}

function render() {
  var s = notch.system.stats();
  if (!s) return ui.text(t('noPermission'), { style: 'caption' });
  var mem = s.memory, rows = [
    meter('cpu', t('cores').replace('{n}', s.cores), s.cpu, pct(s.cpu), tone(s.cpu)),
    meter('memorychip', t('memory'), mem.pressure, gb(mem.used) + ' / ' + gb(mem.total), tone(mem.pressure))
  ];
  if (s.disk) {
    var used = 1 - s.disk.free / s.disk.total;
    rows.push(meter('internaldrive', 'Disk', used, t('free').replace('{n}', gb(s.disk.free)), tone(used)));
  }
  var foot = [
    ui.symbol('arrow.down.circle', { size: 12, color: 'secondary' }), ui.text(rate(s.network.down), { style: 'mono' }),
    ui.symbol('arrow.up.circle', { size: 12, color: 'secondary' }), ui.text(rate(s.network.up), { style: 'mono' }),
    ui.spacer()
  ];
  if (s.battery) {
    var b = s.battery;
    foot.push(ui.symbol(b.charging ? 'battery.100.bolt' : b.level < 0.2 ? 'battery.25' : 'battery.75',
      { size: 13, color: b.level < 0.2 && !b.charging ? 'red' : 'secondary' }));
    foot.push(ui.text(pct(b.level) + (b.minutesRemaining ? ' · ' + Math.floor(b.minutesRemaining / 60) + t('h') + ' ' +
      (b.minutesRemaining % 60) + t('m') + (b.charging ? t('toFull') : '') : ''), { style: 'mono' }));
  }
  if (s.thermal !== 'nominal') foot.push(ui.text('🌡 ' + (t('thermal')[s.thermal] || s.thermal), { style: 'caption', color: 'orange' }));
  rows.push(ui.hstack(foot, { spacing: 6 }));
  return ui.vstack(rows, { spacing: 10 });
}

function compact() {
  var s = notch.system.stats();
  if (!s) return null;
  var limit = (notch.settings.get('cpuAlert') || 100) / 100;
  if (limit < 1 && s.cpu > limit) { hot++; if (hot === 5) notch.flash('CPU ' + pct(s.cpu), 'flame.fill'); }
  else hot = 0;

  switch (notch.settings.get('compact')) {
    case 'cpu': return { symbol: 'cpu', text: pct(s.cpu), color: tone(s.cpu) };
    case 'memory': return { symbol: 'memorychip', text: pct(s.memory.pressure), color: tone(s.memory.pressure) };
    case 'battery': return s.battery ? { symbol: s.battery.charging ? 'battery.100.bolt' : 'battery.75', text: pct(s.battery.level) } : null;
    case 'network': return { symbol: 'arrow.down', text: rate(s.network.down) };
    default: return null;
  }
}
