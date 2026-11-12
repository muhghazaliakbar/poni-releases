// Air Quality — US AQI, PM2.5/PM10 and the next 12 hours for one city, from Open-Meteo's air quality data.

var STRINGS = {
  en: {
    loading: 'Checking the air in {city}…', notFound: 'Can’t find “{city}”. Check the city in the settings.',
    failed: 'Can’t get air quality data right now.', stale: 'Offline: showing data from {t}.',
    levels: ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'],
    advice: [
      'Great air. Enjoy being outside.',
      'Fine for most people. If you’re very sensitive, take it easy outdoors.',
      'Children, older people and anyone with asthma should cut down on long outdoor exertion.',
      'Limit time outside; wear a mask (N95/KF94) if you go out.',
      'Stay indoors with windows closed; run an air purifier if you have one.',
      'Health warning: avoid going outside.'
    ],
    next: 'Next 12 hours', best: 'Cleanest: {h} (AQI {v})', source: 'Data: Open-Meteo (CAMS)', ozone: 'Ozone', no2: 'NO₂'
  },
  id: {
    loading: 'Memeriksa udara di {city}…', notFound: 'Kota “{city}” tidak ditemukan. Periksa kota di pengaturan.',
    failed: 'Data kualitas udara tidak bisa diambil saat ini.', stale: 'Offline: data dari {t}.',
    levels: ['Baik', 'Sedang', 'Tidak sehat bagi kelompok sensitif', 'Tidak sehat', 'Sangat tidak sehat', 'Berbahaya'],
    advice: [
      'Udara bagus. Nikmati waktu di luar.',
      'Aman untuk kebanyakan orang. Jika sangat sensitif, kurangi aktivitas berat di luar.',
      'Anak-anak, lansia, dan penderita asma sebaiknya mengurangi aktivitas berat di luar.',
      'Batasi waktu di luar; pakai masker (N95/KF94) bila keluar.',
      'Tetap di dalam dengan jendela tertutup; nyalakan air purifier bila ada.',
      'Peringatan kesehatan: hindari keluar rumah.'
    ],
    next: '12 jam ke depan', best: 'Paling bersih: {h} (AQI {v})', source: 'Data: Open-Meteo (CAMS)', ozone: 'Ozon', no2: 'NO₂'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'rose'];
var EVERY = 30 * 60000;

function clock() { return Date.now(); } // tests replace this

var data = notch.storage.get('data') || null; // { city, place, current, hours: [{ time, aqi }], at }
var error = null, loading = false, lastFetch = 0;

function city() { return String(notch.settings.get('city') || 'Jakarta').trim() || 'Jakarta'; }

/// US EPA breakpoints: 0–50, 51–100, 101–150, 151–200, 201–300, 301+.
function level(aqi) {
  return aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5;
}

/// The next 12 hours from the hourly series, starting at the current hour.
function upcoming(json) {
  var times = (json.hourly && json.hourly.time) || [], values = (json.hourly && json.hourly.us_aqi) || [];
  var now = (json.current && json.current.time) || '';
  var start = 0;
  while (start < times.length && times[start] < now) start++;
  var out = [];
  for (var i = start; i < times.length && out.length < 12; i++) if (values[i] !== null && values[i] !== undefined) out.push({ time: times[i], aqi: values[i] });
  return out;
}

function load() {
  if (loading) return;
  loading = true;
  lastFetch = clock();
  var name = city();
  notch.fetchJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + (notch.locale === 'id' ? 'id' : 'en') +
    '&name=' + encodeURIComponent(name), function (geo, err) {
    if (err || !geo) { loading = false; error = 'failed'; retrySoon(); return; }
    if (!geo.results || !geo.results.length) { loading = false; error = 'notFound'; return; }
    var place = geo.results[0];
    notch.fetchJSON('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + place.latitude + '&longitude=' + place.longitude +
      '&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&hourly=us_aqi&forecast_days=2&timezone=auto', function (json, err2) {
      loading = false;
      if (err2 || !json || !json.current || json.current.us_aqi === null || json.current.us_aqi === undefined) {
        error = 'failed'; retrySoon(); return;
      }
      error = null;
      data = { city: name, place: place.name, current: json.current, hours: upcoming(json), at: clock() };
      notch.storage.set('data', data);
      notch.refresh();
    });
  });
}

/// No answer (offline, or the permission was just being asked): try again in 10 s.
function retrySoon() { lastFetch = clock() - EVERY + 10000; notch.refresh(); }

function pollutant(label, value) {
  return ui.vstack([
    ui.text(label + ' · µg/m³', { style: 'caption', lines: 1 }),
    ui.text(value === null || value === undefined ? '–' : String(Math.round(value)), { style: 'monoHeadline' })
  ], { spacing: 2, padding: 8, background: 'white', fill: true });
}

function hourLabel(iso) { return String(iso).slice(11, 13); }

function render() {
  if (clock() - lastFetch > EVERY || (data && data.city !== city() && !loading)) load();
  var current = data && data.city === city() ? data : null;
  if (!current) {
    var msg = error === 'notFound' ? tf('notFound', { city: city() }) : error ? t('failed') : tf('loading', { city: city() });
    return ui.text(msg, { style: 'headline' });
  }
  var c = current.current, aqi = Math.round(c.us_aqi), lv = level(aqi);
  var hours = current.hours || [];
  var best = hours.reduce(function (b, h) { return !b || h.aqi < b.aqi ? h : b; }, null);
  var parts = [
    ui.hstack([
      ui.vstack([
        ui.text(String(aqi), { style: 'monoLarge', color: COLORS[lv] }),
        ui.text('US AQI', { style: 'caption' })
      ], { spacing: 0, align: 'center' }),
      ui.vstack([
        ui.text(t('levels')[lv] + ' · ' + current.place, { style: 'headline', color: COLORS[lv], lines: 1 }),
        ui.text(t('advice')[lv], { style: 'caption', lines: 2 })
      ], { spacing: 4 }),
      ui.spacer()
    ], { spacing: 14, padding: 12, background: COLORS[lv], fill: true }),
    ui.hstack([
      pollutant('PM2.5', c.pm2_5), pollutant('PM10', c.pm10), pollutant(t('ozone'), c.ozone), pollutant(t('no2'), c.nitrogen_dioxide)
    ], { spacing: 8 })
  ];
  if (hours.length > 1) {
    parts.push(ui.hstack([
      ui.text(t('next'), { style: 'caption' }), ui.spacer(),
      ui.text(tf('best', { h: hourLabel(best.time) + ':00', v: Math.round(best.aqi) }), { style: 'caption', color: 'green' })
    ]));
    parts.push(ui.bars(hours.map(function (h) { return h.aqi; }), {
      labels: hours.map(function (h) { return hourLabel(h.time); }), color: '#ff9f43', height: 36, barWidth: 10,
      highlight: hours.indexOf(best), max: Math.max(150, Math.max.apply(null, hours.map(function (h) { return h.aqi; })))
    }));
  }
  var at = new Date(current.at);
  parts.push(ui.text(error ? tf('stale', { t: at.getHours() + ':' + (at.getMinutes() < 10 ? '0' : '') + at.getMinutes() }) : t('source'),
    { style: 'caption', color: error ? 'orange' : 'tertiary' }));
  return ui.vstack(parts, { spacing: 8 });
}

function compact() {
  if (!data || data.city !== city() || notch.settings.get('beside') === false) return null;
  var aqi = Math.round(data.current.us_aqi);
  if (aqi <= 100) return null;
  return { symbol: 'lucide:wind', text: 'AQI ' + aqi, color: COLORS[level(aqi)] };
}
