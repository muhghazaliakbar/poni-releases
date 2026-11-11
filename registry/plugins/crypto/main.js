// Crypto — prices in IDR from the CoinGecko public API.

var STRINGS = {
  en: { failed: 'Couldn’t load prices', loading: 'Loading prices…', title: 'Crypto prices (IDR)', day: '24h' },
  id: { failed: 'Gagal memuat harga', loading: 'Memuat harga…', title: 'Harga Kripto (IDR)', day: '24 jam' }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function numberLocale() { return notch.locale === 'id' ? 'id-ID' : 'en-US'; }

var COINS = [
  ['bitcoin', 'Bitcoin', 'BTC', 'bitcoinsign.circle.fill'],
  ['ethereum', 'Ethereum', 'ETH', 'diamond.fill'],
  ['solana', 'Solana', 'SOL', 'sun.max.fill']
];
var prices = null;
var error = null; // { detail } from the network, or { key } for a message in STRINGS
var lastFetch = 0;

function load() {
  lastFetch = Date.now();
  var ids = COINS.map(function (c) { return c[0]; }).join(',');
  notch.fetchJSON('https://api.coingecko.com/api/v3/simple/price?vs_currencies=idr&include_24hr_change=true&ids=' + ids,
    function (json, err) {
      if (err || !json || !json.bitcoin) { error = err ? { detail: err } : { key: 'failed' }; return; }
      prices = json;
      error = null;
    });
}

function rupiah(n) {
  return 'Rp ' + Math.round(n).toLocaleString(numberLocale());
}

function pct(n) { return (n >= 0 ? '+' : '') + n.toLocaleString(numberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }

function init() { load(); }

function render() {
  if (Date.now() - lastFetch > 2 * 60000) load();
  if (!prices) return ui.text(error ? (error.detail || t(error.key)) : t('loading'), { style: 'headline' });

  return ui.vstack([
    ui.hstack([ui.text(t('title'), { style: 'headline' }), ui.spacer(), ui.text(t('day'), { style: 'caption' })]),
    ui.vstack(COINS.map(function (c) {
      var p = prices[c[0]];
      var change = p.idr_24h_change || 0;
      return ui.hstack([
        ui.symbol(c[3], { size: 16, color: 'secondary' }),
        ui.text(c[1] + ' · ' + c[2]),
        ui.spacer(),
        ui.text(rupiah(p.idr), { style: 'headline' }),
        ui.text(pct(change), { style: 'caption', color: change >= 0 ? 'green' : 'red' })
      ], { spacing: 8 });
    }), { spacing: 10 })
  ], { spacing: 12 });
}

function compact() {
  if (!prices) return null;
  var change = prices.bitcoin.idr_24h_change || 0;
  return { symbol: 'bitcoinsign.circle.fill', text: pct(change), color: change >= 0 ? 'green' : 'red' };
}
