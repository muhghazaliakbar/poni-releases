// World Clock — a few cities side by side: their time, day or night, and the difference from here.

var STRINGS = {
  en: {
    add: 'Add a city: Tokyo, Dubai, or a time zone like Europe/Paris', unknown: 'Unknown city. Try a time zone like Asia/Tokyo.',
    full: 'Up to 8 cities', same: 'Same time', h: 'h', m: 'm', edit: 'Edit', done: 'Done',
    today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', dup: '{c} is already here'
  },
  id: {
    add: 'Tambah kota: Tokyo, Dubai, atau zona waktu seperti Europe/Paris', unknown: 'Kota tidak dikenal. Coba zona waktu seperti Asia/Tokyo.',
    full: 'Maksimal 8 kota', same: 'Sama', h: 'j', m: 'm', edit: 'Ubah', done: 'Selesai',
    today: 'Hari ini', tomorrow: 'Besok', yesterday: 'Kemarin', dup: '{c} sudah ada'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

// City → IANA time zone. Anything else that is a valid zone id (Europe/Paris) works too.
var CITIES = {
  'jakarta': 'Asia/Jakarta', 'bandung': 'Asia/Jakarta', 'surabaya': 'Asia/Jakarta', 'yogyakarta': 'Asia/Jakarta',
  'semarang': 'Asia/Jakarta', 'medan': 'Asia/Jakarta', 'palembang': 'Asia/Jakarta', 'pontianak': 'Asia/Pontianak',
  'bali': 'Asia/Makassar', 'denpasar': 'Asia/Makassar', 'makassar': 'Asia/Makassar', 'balikpapan': 'Asia/Makassar',
  'manado': 'Asia/Makassar', 'mataram': 'Asia/Makassar', 'jayapura': 'Asia/Jayapura', 'ambon': 'Asia/Jayapura',
  'singapore': 'Asia/Singapore', 'singapura': 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur',
  'bangkok': 'Asia/Bangkok', 'ho chi minh': 'Asia/Ho_Chi_Minh', 'hanoi': 'Asia/Bangkok', 'manila': 'Asia/Manila',
  'hong kong': 'Asia/Hong_Kong', 'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'taipei': 'Asia/Taipei',
  'tokyo': 'Asia/Tokyo', 'seoul': 'Asia/Seoul', 'mumbai': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata', 'kathmandu': 'Asia/Kathmandu', 'dhaka': 'Asia/Dhaka', 'karachi': 'Asia/Karachi',
  'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', 'riyadh': 'Asia/Riyadh', 'mecca': 'Asia/Riyadh', 'makkah': 'Asia/Riyadh',
  'mekah': 'Asia/Riyadh', 'madinah': 'Asia/Riyadh', 'medina': 'Asia/Riyadh', 'doha': 'Asia/Qatar', 'cairo': 'Africa/Cairo',
  'kairo': 'Africa/Cairo', 'istanbul': 'Europe/Istanbul', 'tehran': 'Asia/Tehran', 'moscow': 'Europe/Moscow',
  'london': 'Europe/London', 'dublin': 'Europe/Dublin', 'lisbon': 'Europe/Lisbon', 'paris': 'Europe/Paris',
  'amsterdam': 'Europe/Amsterdam', 'berlin': 'Europe/Berlin', 'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome',
  'zurich': 'Europe/Zurich', 'stockholm': 'Europe/Stockholm', 'athens': 'Europe/Athens', 'johannesburg': 'Africa/Johannesburg',
  'lagos': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'new york': 'America/New_York', 'boston': 'America/New_York',
  'toronto': 'America/Toronto', 'chicago': 'America/Chicago', 'austin': 'America/Chicago', 'denver': 'America/Denver',
  'los angeles': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles',
  'vancouver': 'America/Vancouver', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', 'honolulu': 'Pacific/Honolulu', 'sydney': 'Australia/Sydney',
  'melbourne': 'Australia/Melbourne', 'perth': 'Australia/Perth', 'darwin': 'Australia/Darwin', 'auckland': 'Pacific/Auckland',
  'utc': 'UTC'
};
var DEFAULTS = [
  { name: 'Jakarta', zone: 'Asia/Jakarta' }, { name: 'Singapore', zone: 'Asia/Singapore' },
  { name: 'London', zone: 'Europe/London' }, { name: 'New York', zone: 'America/New_York' }
];

var cities = notch.storage.get('cities') || DEFAULTS.slice();
var editing = false;

function validZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date()); return true; } catch (e) { return false; }
}

/// "tokyo" → { name: 'Tokyo', zone: 'Asia/Tokyo' }; "Europe/Paris" → { name: 'Paris', zone: 'Europe/Paris' }.
function lookup(text) {
  var q = String(text || '').trim();
  if (!q) return null;
  var zone = CITIES[q.toLowerCase()];
  var name = q.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  if (!zone && q.indexOf('/') > 0 && validZone(q)) {
    zone = q;
    name = q.split('/').pop().replace(/_/g, ' ');
  }
  return zone ? { name: name, zone: zone } : null;
}

/// The wall-clock time in `zone` at `now`, and that zone's offset from UTC in minutes.
function clock(zone, now) {
  var parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
  }).formatToParts(now).forEach(function (p) { parts[p.type] = +p.value; });
  var wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
  var offset = Math.round((wall - Math.floor(now.getTime() / 60000) * 60000) / 60000);
  return { y: parts.year, mo: parts.month, d: parts.day, h: parts.hour % 24, m: parts.minute, offset: offset };
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function timeText(c) {
  if (notch.settings.get('hour24') === false) {
    var h = c.h % 12 || 12;
    return h + ':' + pad(c.m) + (c.h < 12 ? ' AM' : ' PM');
  }
  return pad(c.h) + (notch.locale === 'id' ? '.' : ':') + pad(c.m);
}

/// "+5h 30m" (ahead of here), "−3h" (behind), "Same time".
function difference(minutes) {
  if (minutes === 0) return t('same');
  var a = Math.abs(minutes), h = Math.floor(a / 60), m = a % 60;
  return (minutes > 0 ? '+' : '−') + (h ? h + t('h') : '') + (h && m ? ' ' : '') + (m ? m + t('m') : '');
}

function dayLabel(c, here) {
  var a = Date.UTC(c.y, c.mo - 1, c.d), b = Date.UTC(here.getFullYear(), here.getMonth(), here.getDate());
  return a > b ? t('tomorrow') : a < b ? t('yesterday') : t('today');
}

function card(city, index, now) {
  var c = clock(city.zone, now);
  var day = c.h >= 6 && c.h < 18;
  var local = -now.getTimezoneOffset();
  return ui.vstack([
    ui.hstack([
      ui.symbol(day ? 'lucide:sun' : 'lucide:moon', { size: 13, color: day ? 'yellow' : 'purple' }),
      ui.text(city.name, { style: 'headline', lines: 1 }),
      ui.spacer()
    ].concat(editing ? [ui.button('', 'remove:' + index, { symbol: 'lucide:x', compact: true })] : []), { spacing: 6 }),
    ui.text(timeText(c), { style: 'monoTitle' }),
    ui.text(dayLabel(c, now) + ' · ' + difference(c.offset - local), { style: 'caption', lines: 1 })
  ], { spacing: 4, padding: 10, background: 'white', fill: true });
}

function render() {
  var now = new Date();
  var rows = [];
  for (var i = 0; i < cities.length; i += 4) {
    rows.push(ui.hstack(cities.slice(i, i + 4).map(function (city, j) { return card(city, i + j, now); }), { spacing: 8 }));
  }
  rows.push(ui.hstack([
    ui.input(t('add'), 'add'),
    ui.button(editing ? t('done') : t('edit'), 'edit', { symbol: editing ? 'lucide:check' : 'lucide:pencil', compact: true })
  ], { spacing: 8 }));
  return ui.vstack(rows, { spacing: 8 });
}

function compact() {
  if (!notch.settings.get('beside') || !cities.length) return null;
  var c = clock(cities[0].zone, new Date());
  return { symbol: 'lucide:globe', text: cities[0].name + ' ' + timeText(c), color: 'accent' };
}

function save() { notch.storage.set('cities', cities); }

function onAction(action, value) {
  if (action === 'add') {
    var city = lookup(value);
    if (!city) { notch.flash(t('unknown'), 'exclamationmark.triangle.fill'); return; }
    if (cities.some(function (c) { return c.name === city.name && c.zone === city.zone; })) {
      notch.flash(tf('dup', { c: city.name }), 'info.circle.fill'); return;
    }
    if (cities.length >= 8) { notch.flash(t('full'), 'exclamationmark.triangle.fill'); return; }
    cities.push(city); save();
  }
  if (action === 'edit') editing = !editing;
  if (action.indexOf('remove:') === 0) {
    cities.splice(+action.slice(7), 1); save();
  }
}
