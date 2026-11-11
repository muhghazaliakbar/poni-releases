// Exchange Rates — rupiah exchange rates from open.er-api.com (free, no key).

var STRINGS = {
  en: {
    names: { USD: 'US dollar', SGD: 'Singapore dollar', EUR: 'Euro', JPY: 'Japanese yen', MYR: 'Malaysian ringgit' },
    failed: 'Couldn’t load rates', loading: 'Loading rates…', title: 'Rates in rupiah', updated: 'Updated {date}'
  },
  id: {
    names: { USD: 'Dolar AS', SGD: 'Dolar Singapura', EUR: 'Euro', JPY: 'Yen Jepang', MYR: 'Ringgit Malaysia' },
    failed: 'Gagal memuat kurs', loading: 'Memuat kurs…', title: 'Kurs ke Rupiah', updated: 'Update {date}'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function numberLocale() { return notch.locale === 'id' ? 'id-ID' : 'en-US'; }

// [code, SF Symbol]; the name comes from t('names').
var CURRENCIES = [
  ['USD', 'dollarsign.circle.fill'],
  ['SGD', 'dollarsign.circle'],
  ['EUR', 'eurosign.circle.fill'],
  ['JPY', 'yensign.circle.fill'],
  ['MYR', 'banknote.fill']
];
var rates = null;
var updated = null;
var error = null; // { detail } from the network, or { key } for a message in STRINGS
var lastFetch = 0;

function load() {
  lastFetch = Date.now();
  notch.fetchJSON('https://open.er-api.com/v6/latest/IDR', function (json, err) {
    if (err || !json || json.result !== 'success') { error = err ? { detail: err } : { key: 'failed' }; return; }
    rates = json.rates;
    updated = new Date(json.time_last_update_unix * 1000);
    error = null;
  });
}

function rupiah(n) {
  return 'Rp ' + Math.round(n).toLocaleString(numberLocale());
}

function init() { load(); }

function render() {
  if (Date.now() - lastFetch > 60 * 60000) load();
  if (!rates) return ui.text(error ? (error.detail || t(error.key)) : t('loading'), { style: 'headline' });

  return ui.vstack([
    ui.hstack([
      ui.text(t('title'), { style: 'headline' }),
      ui.spacer(),
      ui.text(t('updated').replace('{date}', updated.toLocaleDateString(numberLocale())), { style: 'caption' })
    ]),
    ui.vstack(CURRENCIES.map(function (c, i) {
      return ui.row('1 ' + c[0] + ' · ' + t('names')[c[0]], rupiah(1 / rates[c[0]]), { symbol: c[1], highlight: i === 0 });
    }), { spacing: 2 })
  ], { spacing: 10 });
}

function compact() {
  if (!rates) return null;
  return { symbol: 'dollarsign.circle.fill', text: rupiah(1 / rates.USD), color: 'green' };
}
