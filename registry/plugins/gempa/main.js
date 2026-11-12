// Earthquakes (BMKG) — the latest quake and the recent felt ones, from BMKG's open data (data.bmkg.go.id).
// BMKG asks that its data be credited; the tab says "Source: BMKG".

var STRINGS = {
  en: {
    loading: 'Checking BMKG…', offline: 'Can’t reach BMKG right now; showing the last data.', none: 'Can’t reach BMKG right now.',
    latest: 'Latest earthquake', felt: 'Recently felt', depth: '{d} deep', feltIn: 'Felt: {w}', source: 'Source: BMKG',
    map: 'Map', shakemap: 'Shake map', ago: '{t} ago', justNow: 'just now', m: 'min', h: 'h', d: 'd',
    tsunami: 'Potential tsunami', noTsunami: 'No tsunami potential', feltPublic: 'Felt; passed on to the public',
    notifyTitle: 'M{m} earthquake · {p}', notifyTsunami: '⚠️ Potential tsunami · M{m} · {p}', sea: 'at sea', land: 'on land',
    epicentre: 'Epicentre {where} {rest}'
  },
  id: {
    loading: 'Memeriksa BMKG…', offline: 'BMKG tidak bisa dihubungi; menampilkan data terakhir.', none: 'BMKG tidak bisa dihubungi saat ini.',
    latest: 'Gempa terbaru', felt: 'Baru dirasakan', depth: 'kedalaman {d}', feltIn: 'Dirasakan: {w}', source: 'Sumber: BMKG',
    map: 'Peta', shakemap: 'Peta guncangan', ago: '{t} lalu', justNow: 'baru saja', m: 'mnt', h: 'jam', d: 'hari',
    tsunami: 'Berpotensi tsunami', noTsunami: 'Tidak berpotensi tsunami', feltPublic: 'Dirasakan, diteruskan ke masyarakat',
    notifyTitle: 'Gempa M{m} · {p}', notifyTsunami: '⚠️ Berpotensi tsunami · M{m} · {p}', sea: 'di laut', land: 'di darat',
    epicentre: 'Pusat gempa {where} {rest}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var BASE = 'https://data.bmkg.go.id/DataMKG/TEWS/';
var EVERY = 5 * 60000;

function clock() { return Date.now(); } // tests replace this

var cache = notch.storage.get('cache') || {}; // { latest, felt: [], at }
var lastSeen = notch.storage.get('lastSeen') || null; // DateTime of the newest quake we've looked at
var failed = false, loading = false, lastCheck = 0;

// MARK: Reading BMKG's data

function quake(g) {
  if (!g || !g.DateTime) return null;
  var c = String(g.Coordinates || '').split(',');
  return {
    at: g.DateTime, mag: parseFloat(g.Magnitude), depth: g.Kedalaman || '', region: g.Wilayah || '',
    potential: g.Potensi || '', felt: g.Dirasakan || '', shakemap: g.Shakemap || '',
    lat: parseFloat(c[0]), lon: parseFloat(c[1]), local: (g.Tanggal || '') + ' ' + (g.Jam || '')
  };
}

/// "Tidak berpotensi tsunami" is the all-clear; any other mention of tsunami is a warning.
function tsunamiRisk(q) { return /tsunami/i.test(q.potential) && !/tidak/i.test(q.potential); }

function potentialText(q) {
  if (notch.locale === 'id') return q.potential;
  if (tsunamiRisk(q)) return t('tsunami');
  if (/tidak berpotensi tsunami/i.test(q.potential)) return t('noTsunami');
  if (/dirasakan/i.test(q.potential)) return t('feltPublic');
  return q.potential;
}

/// BMKG writes regions in Indonesian; in English the fixed opening words are translated, place names stay.
function regionText(q) {
  var m = q.region.match(/^Pusat gempa berada di (laut|darat)\s+(.*)$/i);
  if (!m) return q.region;
  return tf('epicentre', { where: t(m[1].toLowerCase() === 'laut' ? 'sea' : 'land'), rest: m[2] });
}

function check(force) {
  if (loading || (!force && clock() - lastCheck < EVERY)) return;
  loading = true;
  lastCheck = clock();
  var pending = 2, latest = null, felt = null, ok = true;
  function done() {
    if (--pending) return;
    loading = false;
    failed = !ok || !latest;
    // No answer (offline, or the network permission was just being asked): try again in 15 s, not 5 min.
    if (failed) { lastCheck = clock() - EVERY + 15000; notch.refresh(); return; }
    cache = { latest: latest, felt: felt || cache.felt || [], at: clock() };
    notch.storage.set('cache', cache);
    announce(latest);
    notch.refresh();
  }
  notch.fetchJSON(BASE + 'autogempa.json', function (json, err) {
    if (err || !json || !json.Infogempa) ok = false; else latest = quake(json.Infogempa.gempa);
    done();
  });
  notch.fetchJSON(BASE + 'gempadirasakan.json', function (json, err) {
    if (!err && json && json.Infogempa && json.Infogempa.gempa) felt = [].concat(json.Infogempa.gempa).map(quake).filter(Boolean);
    done();
  });
}

function threshold() { return parseFloat(notch.settings.get('minMagnitude') || '5'); }
function strong(q) { return tsunamiRisk(q) || q.mag >= threshold(); }

/// One notification per new quake. The very first check only sets the starting point.
function announce(q) {
  if (q.at === lastSeen) return;
  var first = lastSeen === null;
  lastSeen = q.at;
  notch.storage.set('lastSeen', lastSeen);
  if (first || !strong(q)) return;
  var title = tf(tsunamiRisk(q) ? 'notifyTsunami' : 'notifyTitle', { m: q.mag.toFixed(1), p: regionText(q) });
  notch.notify(title, q.local + ' · ' + tf('depth', { d: q.depth }) + (q.felt ? ' · ' + tf('feltIn', { w: q.felt }) : ''));
  notch.flash('M' + q.mag.toFixed(1) + ' · ' + regionText(q), 'lucide:activity');
}

// MARK: Showing it

function magColor(m) { return m >= 6 ? 'red' : m >= 5 ? 'orange' : m >= 4 ? 'yellow' : 'green'; }

function ago(iso) {
  var ms = clock() - new Date(iso).getTime();
  if (isNaN(ms)) return '';
  var min = Math.floor(ms / 60000);
  if (min < 1) return t('justNow');
  if (min < 60) return tf('ago', { t: min + ' ' + t('m') });
  if (min < 48 * 60) return tf('ago', { t: Math.floor(min / 60) + ' ' + t('h') });
  return tf('ago', { t: Math.floor(min / 1440) + ' ' + t('d') });
}

function latestCard(q) {
  var risk = tsunamiRisk(q);
  var lines = [
    ui.text(regionText(q), { style: 'headline', lines: 2 }),
    ui.text(q.local + ' · ' + ago(q.at) + ' · ' + tf('depth', { d: q.depth }), { style: 'caption', lines: 1 }),
    ui.text(potentialText(q), { style: 'caption', lines: 1, color: risk ? 'red' : 'secondary' })
  ];
  if (q.felt) lines.push(ui.text(tf('feltIn', { w: q.felt }), { style: 'caption', lines: 1 }));
  var buttons = [];
  if (!isNaN(q.lat)) buttons.push(ui.button(t('map'), 'map', { symbol: 'lucide:map-pin', compact: true }));
  if (q.shakemap) buttons.push(ui.button(t('shakemap'), 'shakemap', { symbol: 'lucide:waves', compact: true }));
  return ui.hstack([
    ui.vstack([
      ui.text(q.mag.toFixed(1), { style: 'monoLarge', color: magColor(q.mag) }),
      ui.text('M', { style: 'caption' })
    ], { spacing: 0, align: 'center' }),
    ui.vstack(lines, { spacing: 3 }),
    ui.spacer(),
    ui.vstack(buttons, { spacing: 6 })
  ], { spacing: 14, padding: 12, background: risk ? 'red' : 'white', fill: true });
}

function feltRow(q) {
  return ui.hstack([
    ui.text('M' + q.mag.toFixed(1), { style: 'monoFootnote', color: magColor(q.mag) }),
    ui.text(regionText(q), { style: 'caption', lines: 1 }),
    ui.spacer(),
    ui.text(ago(q.at), { style: 'caption' })
  ], { spacing: 8 });
}

function render() {
  check(false);
  var q = cache.latest;
  if (!q) return ui.text(failed ? t('none') : t('loading'), { style: 'caption' });
  var others = (cache.felt || []).filter(function (f) { return f.at !== q.at; }).slice(0, 3);
  var parts = [latestCard(q)];
  if (others.length) parts.push(ui.text(t('felt'), { style: 'caption' }), ui.vstack(others.map(feltRow), { spacing: 4 }));
  parts.push(ui.hstack([
    ui.text(failed ? t('offline') : t('source'), { style: 'caption', color: failed ? 'orange' : 'tertiary' }),
    ui.spacer(),
    ui.button('', 'refresh', { symbol: 'lucide:refresh-cw', compact: true })
  ]));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  var q = cache.latest;
  if (!q || notch.settings.get('beside') === false || !strong(q)) return null;
  if (clock() - new Date(q.at).getTime() > 60 * 60000) return null; // only the first hour
  return { symbol: 'lucide:activity', text: 'M' + q.mag.toFixed(1), color: tsunamiRisk(q) ? 'red' : magColor(q.mag) };
}

function onAction(action) {
  var q = cache.latest;
  if (action === 'refresh') check(true);
  if (action === 'map' && q) notch.open('https://www.openstreetmap.org/?mlat=' + q.lat + '&mlon=' + q.lon + '#map=7/' + q.lat + '/' + q.lon);
  if (action === 'shakemap' && q && q.shakemap) notch.open(BASE + encodeURIComponent(q.shakemap));
}

setInterval(function () { check(false); }, 15000);
