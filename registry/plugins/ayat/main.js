// Daily Verse — one verse of the Qur'an a day, chosen from the date so it stays the same all day.
// Text from alquran.cloud: Uthmani Arabic, the Indonesian Ministry of Religious Affairs translation and Saheeh International.

var STRINGS = {
  en: {
    today: 'Today’s verse', other: 'Another verse', loading: 'Loading today’s verse…',
    failed: 'Can’t load the verse right now. Check your connection.',
    another: 'Another', copy: 'Copy', back: 'Today', copied: 'Verse copied',
    source: 'Translation: Saheeh International', cite: 'Qur’an {s}:{a} ({name})'
  },
  id: {
    today: 'Ayat hari ini', other: 'Ayat lain', loading: 'Memuat ayat hari ini…',
    failed: 'Ayat tidak bisa dimuat saat ini. Periksa koneksi Anda.',
    another: 'Ayat lain', copy: 'Salin', back: 'Hari ini', copied: 'Ayat disalin',
    source: 'Terjemahan: Kemenag RI', cite: 'QS. {name} {s}:{a}'
  }
};
function lang() { return notch.locale === 'id' ? 'id' : 'en'; }
function t(key) { return STRINGS[lang()][key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

/// Surah number → [name, English meaning, Indonesian meaning].
var SURAHS = {
  1: ['Al-Fatihah', 'The Opening', 'Pembukaan'], 2: ['Al-Baqarah', 'The Cow', 'Sapi'],
  3: ['Ali ‘Imran', 'The Family of Imran', 'Keluarga Imran'], 6: ['Al-An‘am', 'The Cattle', 'Binatang Ternak'],
  7: ['Al-A‘raf', 'The Heights', 'Tempat Tertinggi'], 8: ['Al-Anfal', 'The Spoils of War', 'Rampasan Perang'],
  9: ['At-Taubah', 'The Repentance', 'Pengampunan'], 10: ['Yunus', 'Jonah', 'Yunus'], 12: ['Yusuf', 'Joseph', 'Yusuf'],
  13: ['Ar-Ra‘d', 'The Thunder', 'Guruh'], 14: ['Ibrahim', 'Abraham', 'Ibrahim'], 16: ['An-Nahl', 'The Bee', 'Lebah'],
  17: ['Al-Isra’', 'The Night Journey', 'Memperjalankan Malam Hari'], 18: ['Al-Kahf', 'The Cave', 'Goa'],
  20: ['Taha', 'Ta-Ha', 'Taha'], 21: ['Al-Anbiya’', 'The Prophets', 'Para Nabi'], 25: ['Al-Furqan', 'The Criterion', 'Pembeda'],
  28: ['Al-Qasas', 'The Stories', 'Kisah-Kisah'], 29: ['Al-‘Ankabut', 'The Spider', 'Laba-Laba'], 31: ['Luqman', 'Luqman', 'Luqman'],
  33: ['Al-Ahzab', 'The Clans', 'Golongan yang Bersekutu'], 39: ['Az-Zumar', 'The Groups', 'Rombongan'],
  40: ['Ghafir', 'The Forgiver', 'Maha Pengampun'], 41: ['Fussilat', 'Explained in Detail', 'Yang Dijelaskan'],
  47: ['Muhammad', 'Muhammad', 'Muhammad'], 49: ['Al-Hujurat', 'The Rooms', 'Kamar-Kamar'], 50: ['Qaf', 'Qaf', 'Qaf'],
  51: ['Az-Zariyat', 'The Winnowing Winds', 'Angin yang Menerbangkan'], 55: ['Ar-Rahman', 'The Most Merciful', 'Maha Pengasih'],
  59: ['Al-Hasyr', 'The Exile', 'Pengusiran'], 64: ['At-Tagabun', 'Mutual Loss', 'Pengungkapan Kesalahan'],
  65: ['At-Talaq', 'Divorce', 'Talak'], 67: ['Al-Mulk', 'The Sovereignty', 'Kerajaan'], 68: ['Al-Qalam', 'The Pen', 'Pena'],
  93: ['Ad-Duha', 'The Morning Hours', 'Duha'], 94: ['Al-Insyirah', 'The Relief', 'Lapang'], 95: ['At-Tin', 'The Fig', 'Buah Tin']
};

/// Verses that stand on their own and fit the notch, in the order the days walk through them.
var VERSES = [
  '94:5', '2:152', '13:28', '3:139', '39:53', '65:3', '2:153', '49:10', '14:7', '1:5', '29:69', '93:5', '3:190', '31:17',
  '2:45', '50:16', '16:128', '7:199', '3:8', '9:51', '12:87', '18:46', '2:156', '40:60', '21:107', '17:24', '28:24', '59:18',
  '67:2', '55:13', '3:200', '25:74', '16:18', '7:23', '47:7', '41:34', '2:201', '20:46', '64:16', '31:18', '3:185', '51:56',
  '16:97', '14:40', '10:62', '68:4', '2:155', '95:4', '17:80', '8:46', '18:10', '33:41', '6:162', '25:63', '7:56'
];

function clock() { return Date.now(); } // tests replace this

var cache = notch.storage.get('cache') || {}; // 'surah:ayah' → { ar, en, id }
var pick = notch.storage.get('pick') || { date: '', offset: 0 };
var pending = {}, retryAt = {}, failed = false;

function localDay(ms) {
  var d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function dateKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/// "Another verse" lasts until midnight; a new day starts again from that day's verse.
function offset() {
  if (pick.date !== dateKey(clock())) { pick = { date: dateKey(clock()), offset: 0 }; notch.storage.set('pick', pick); }
  return pick.offset;
}
function refFor(day, extra) { return VERSES[((day + extra) % VERSES.length + VERSES.length) % VERSES.length]; }
function currentRef() { return refFor(localDay(clock()), offset()); }

function load(ref) {
  if (cache[ref] || pending[ref] || (retryAt[ref] && clock() < retryAt[ref])) return;
  pending[ref] = true;
  notch.fetch('https://api.alquran.cloud/v1/ayah/' + ref + '/editions/quran-uthmani,en.sahih,id.indonesian', {}, function (text, err, status) {
    delete pending[ref];
    var editions = null;
    try { editions = JSON.parse(text).data; } catch (e) { editions = null; }
    if (err || status !== 200 || !editions || editions.length < 3) {
      // Not allowed yet (the permission prompt is up) or offline: try again shortly.
      var asking = !status && /permission/i.test(String(err));
      retryAt[ref] = clock() + (asking ? 5000 : 10000);
      if (ref === currentRef() && !asking) failed = true;
      notch.refresh();
      return;
    }
    delete retryAt[ref];
    failed = false;
    cache[ref] = { ar: editions[0].text, en: editions[1].text, id: editions[2].text };
    prune();
    notch.storage.set('cache', cache);
    notch.refresh();
  });
}

/// Keep the store small: the verses for today and tomorrow, plus the most recent others.
function prune() {
  var keep = {}, day = localDay(clock());
  keep[refFor(day, 0)] = keep[refFor(day + 1, 0)] = keep[currentRef()] = true;
  var keys = Object.keys(cache);
  for (var i = 0; keys.length - i > 30; i++) if (!keep[keys[i]]) delete cache[keys[i]];
}

function parts(ref) { var p = ref.split(':'); return { s: +p[0], a: +p[1] }; }
function surahName(ref) { return SURAHS[parts(ref).s][0]; }
function cite(ref) { var p = parts(ref); return tf('cite', { s: p.s, a: p.a, name: surahName(ref) }); }

function render() {
  var ref = currentRef();
  load(ref);
  load(refFor(localDay(clock()) + 1, 0)); // tomorrow's, so it's there offline
  var verse = cache[ref];
  if (!verse) return ui.text(failed ? t('failed') : t('loading'), { style: 'headline', color: failed ? 'orange' : undefined });
  var p = parts(ref), surah = SURAHS[p.s], showArabic = notch.settings.get('arabic') !== false;
  var rows = [
    ui.hstack([
      ui.symbol('lucide:book-open', { size: 18, color: 'mint' }),
      ui.vstack([
        ui.text(surah[0] + ' · ' + p.s + ':' + p.a, { style: 'headline', lines: 1 }),
        ui.text((offset() ? t('other') : t('today')) + ' · ' + surah[lang() === 'id' ? 2 : 1], { style: 'caption', lines: 1 })
      ], { spacing: 1 }),
      ui.spacer()
    ], { spacing: 10 })
  ];
  if (showArabic) rows.push(ui.hstack([ui.spacer(), ui.text(verse.ar, { style: 'title', weight: 'regular', align: 'trailing' })]));
  rows.push(ui.text(verse[lang()], { style: 'callout', color: 'secondary' }));
  var buttons = [
    ui.button(t('another'), 'another', { symbol: 'lucide:shuffle', compact: true }),
    ui.button(t('copy'), 'copy', { symbol: 'lucide:copy', compact: true })
  ];
  if (offset()) buttons.push(ui.button(t('back'), 'today', { symbol: 'lucide:rotate-ccw', compact: true }));
  buttons.push(ui.spacer());
  buttons.push(ui.text(t('source'), { style: 'caption', color: 'tertiary', lines: 1 }));
  rows.push(ui.hstack(buttons, { spacing: 8 }));
  return ui.vstack(rows, { spacing: 10 });
}

function onAction(action) {
  if (action === 'another') {
    offset();
    pick.offset = (pick.offset + 1) % VERSES.length;
    notch.storage.set('pick', pick);
  } else if (action === 'today') {
    pick.offset = 0;
    notch.storage.set('pick', pick);
  } else if (action === 'copy') {
    var ref = currentRef(), verse = cache[ref];
    if (!verse) return;
    var showArabic = notch.settings.get('arabic') !== false;
    notch.clipboard.set((showArabic ? verse.ar + '\n\n' : '') + verse[lang()] + '\n\n— ' + cite(ref));
    notch.flash(t('copied'), 'lucide:copy');
  }
  notch.refresh();
}

function compact() { return null; }
