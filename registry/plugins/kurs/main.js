// Kurs Rupiah — exchange rates from open.er-api.com (free, no key).

var CURRENCIES = [
  ['USD', 'Dolar AS', 'dollarsign.circle.fill'],
  ['SGD', 'Dolar Singapura', 'dollarsign.circle'],
  ['EUR', 'Euro', 'eurosign.circle.fill'],
  ['JPY', 'Yen Jepang', 'yensign.circle.fill'],
  ['MYR', 'Ringgit Malaysia', 'banknote.fill']
];
var rates = null;
var updated = null;
var error = null;
var lastFetch = 0;

function load() {
  lastFetch = Date.now();
  notch.fetchJSON('https://open.er-api.com/v6/latest/IDR', function (json, err) {
    if (err || !json || json.result !== 'success') { error = err || 'Gagal memuat kurs'; return; }
    rates = json.rates;
    updated = new Date(json.time_last_update_unix * 1000);
    error = null;
  });
}

function rupiah(n) {
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function init() { load(); }

function render() {
  if (Date.now() - lastFetch > 60 * 60000) load();
  if (!rates) return ui.text(error || 'Memuat kurs…', { style: 'headline' });

  return ui.vstack([
    ui.hstack([
      ui.text('Kurs ke Rupiah', { style: 'headline' }),
      ui.spacer(),
      ui.text('Update ' + updated.toLocaleDateString('id-ID'), { style: 'caption' })
    ]),
    ui.vstack(CURRENCIES.map(function (c, i) {
      return ui.row('1 ' + c[0] + ' · ' + c[1], rupiah(1 / rates[c[0]]), { symbol: c[2], highlight: i === 0 });
    }), { spacing: 2 })
  ], { spacing: 10 });
}

function compact() {
  if (!rates) return null;
  return { symbol: 'dollarsign.circle.fill', text: rupiah(1 / rates.USD), color: 'green' };
}
