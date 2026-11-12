// Healthy Breaks — eye breaks (20-20-20), stretching and water, each on its own timer.

var STRINGS = {
  en: {
    eyes: 'Rest your eyes', stretch: 'Stand up & stretch', water: 'Drink water',
    eyesNow: 'Look at something 6 m away for 20 seconds.', stretchNow: 'Stand up, roll your shoulders, walk a little.',
    waterNow: 'Have a glass of water.', eyesShort: 'Look away', stretchShort: 'Stand up', waterShort: 'Drink',
    in: 'in {t}', now: 'Now', start: 'Start 20 s', done: 'Done', snooze: '5 min', skip: 'Skip',
    pause: 'Pause', resume: 'Resume', paused: 'Paused: no reminders until you resume.',
    next: 'Next break in {t}', allOff: 'Turn on a reminder in the settings.', today: 'Today',
    rested: 'Eyes rested. Nice!', keepLooking: 'Keep looking far away…'
  },
  id: {
    eyes: 'Istirahatkan mata', stretch: 'Berdiri & peregangan', water: 'Minum air',
    eyesNow: 'Lihat benda sejauh 6 m selama 20 detik.', stretchNow: 'Berdiri, putar bahu, berjalan sebentar.',
    waterNow: 'Minum segelas air.', eyesShort: 'Lihat jauh', stretchShort: 'Berdiri', waterShort: 'Minum',
    in: '{t} lagi', now: 'Sekarang', start: 'Mulai 20 dtk', done: 'Selesai', snooze: '5 mnt', skip: 'Lewati',
    pause: 'Jeda', resume: 'Lanjutkan', paused: 'Dijeda: tidak ada pengingat sampai dilanjutkan.',
    next: 'Istirahat berikutnya {t} lagi', allOff: 'Nyalakan pengingat di pengaturan.', today: 'Hari ini',
    rested: 'Mata sudah istirahat. Bagus!', keepLooking: 'Terus lihat ke kejauhan…'
  }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }
function tf(key, vals) { return t(key).replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }

var KINDS = [
  { id: 'eyes', every: 'eyesEvery', fallback: 20, symbol: 'lucide:eye', color: 'teal' },
  { id: 'stretch', every: 'stretchEvery', fallback: 50, symbol: 'lucide:person-standing', color: 'orange' },
  { id: 'water', every: 'waterEvery', fallback: 60, symbol: 'lucide:glass-water', color: 'accent' }
];
var EYE_SECONDS = 20;
var SNOOZE = 5 * 60000;

function clock() { return Date.now(); } // tests replace this

var state = notch.storage.get('state') || {};
state.next = state.next || {};         // kind → when it's due (ms)
state.notified = state.notified || {}; // kind → the due time we already announced
function save() { notch.storage.set('state', state); }

function enabled(k) { return notch.settings.get(k.id) !== false; }
function interval(k) { return Math.max(1, +(notch.settings.get(k.every) || k.fallback)) * 60000; }
function kinds() { return KINDS.filter(enabled); }
function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

function counts() {
  var today = dayKey(clock());
  if (!state.counts || state.counts.day !== today) state.counts = { day: today, eyes: 0, stretch: 0, water: 0 };
  return state.counts;
}

function due(k) { return !state.paused && state.next[k.id] && clock() >= state.next[k.id]; }

/// Every second: schedule new timers, announce what just became due, finish the 20-second eye break.
function tick() {
  if (state.paused) return;
  var now = clock(), changed = false;
  kinds().forEach(function (k) {
    // A new timer, or a shorter interval than the one it was set with.
    if (!state.next[k.id] || state.next[k.id] - now > interval(k)) { state.next[k.id] = now + interval(k); changed = true; }
    if (now >= state.next[k.id] && state.notified[k.id] !== state.next[k.id]) {
      state.notified[k.id] = state.next[k.id];
      changed = true;
      notch.notify(t(k.id), t(k.id + 'Now'));
      notch.flash(t(k.id + 'Short'), k.symbol);
      if (notch.settings.get('sound') !== false) notch.sound.play('Glass');
    }
  });
  if (state.eyeEnds && now >= state.eyeEnds) {
    state.eyeEnds = null;
    complete(KINDS[0]);
    notch.flash(t('rested'), 'lucide:eye');
    if (notch.settings.get('sound') !== false) notch.sound.play('Hero');
    changed = true;
  }
  if (changed) save();
}

function complete(k) {
  counts()[k.id]++;
  state.next[k.id] = clock() + interval(k);
  save();
}

function mmss(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

/// The kind due soonest, and how long until then.
function soonest() {
  var best = null;
  kinds().forEach(function (k) {
    var at = state.next[k.id] || 0;
    if (!best || at < best.at) best = { kind: k, at: at };
  });
  return best;
}

function card(k) {
  var now = clock(), isDue = due(k), at = state.next[k.id] || now;
  var eyeRunning = k.id === 'eyes' && state.eyeEnds;
  var buttons;
  if (eyeRunning) {
    buttons = [ui.text(mmss(state.eyeEnds - now), { style: 'monoHeadline', color: 'teal' })];
  } else if (isDue) {
    buttons = [
      ui.button(t('snooze'), 'snooze:' + k.id, { symbol: 'lucide:alarm-clock', compact: true }),
      k.id === 'eyes'
        ? ui.button(t('start'), 'eyesStart', { symbol: 'lucide:play', compact: true, style: 'primary' })
        : ui.button(t('done'), 'done:' + k.id, { symbol: 'lucide:check', compact: true, style: 'primary' })
    ];
  } else {
    buttons = [ui.button(t('skip'), 'skip:' + k.id, { symbol: 'lucide:skip-forward', compact: true })];
  }
  var left = 1 - Math.max(0, at - now) / interval(k);
  return ui.vstack([
    ui.hstack([
      ui.symbol(k.symbol, { size: 18, color: k.color }),
      ui.vstack([
        ui.text(t(k.id), { style: 'headline', lines: 1 }),
        ui.text(eyeRunning ? t('keepLooking') : isDue ? t(k.id + 'Now') : tf('in', { t: mmss(at - now) }),
          { style: 'caption', lines: 1, color: isDue && !eyeRunning ? k.color : undefined })
      ], { spacing: 2 }),
      ui.spacer()
    ].concat(buttons), { spacing: 10 }),
    ui.progress(eyeRunning ? 1 - (state.eyeEnds - now) / (EYE_SECONDS * 1000) : Math.min(1, left),
      { color: k.color, height: 4 })
  ], { spacing: 8, padding: 10, background: 'white', fill: true });
}

function render() {
  tick();
  var list = kinds();
  var c = counts();
  var header = ui.hstack([
    ui.text(state.paused ? t('paused') : list.length ? (function () {
      var s = soonest();
      return due(s.kind) ? t('now') + ': ' + t(s.kind.id) : tf('next', { t: mmss(s.at - clock()) });
    })() : t('allOff'), { style: 'headline', lines: 1 }),
    ui.spacer(),
    ui.text(t('today') + ':  👁 ' + c.eyes + '   🧍 ' + c.stretch + '   💧 ' + c.water, { style: 'caption' }),
    ui.button(state.paused ? t('resume') : t('pause'), 'pause',
      { symbol: state.paused ? 'lucide:play' : 'lucide:pause', compact: true })
  ], { spacing: 10 });
  return ui.vstack([header].concat(state.paused ? [] : list.map(card)), { spacing: 8 });
}

function compact() {
  if (state.paused) return null;
  var now = clock();
  if (state.eyeEnds) return { symbol: 'lucide:eye', text: mmss(state.eyeEnds - now), color: 'teal' };
  var d = kinds().filter(due)[0];
  if (d) return { symbol: d.symbol, text: t(d.id + 'Short'), color: 'orange' };
  if (!notch.settings.get('beside')) return null;
  var s = soonest();
  return s ? { symbol: s.kind.symbol, text: mmss(s.at - now), color: s.kind.color } : null;
}

function kind(id) { return KINDS.filter(function (k) { return k.id === id; })[0]; }

function onAction(action) {
  var now = clock();
  var parts = action.split(':'), k = kind(parts[1]);
  if (parts[0] === 'done' && k) complete(k);
  if (parts[0] === 'skip' && k) { state.next[k.id] = now + interval(k); save(); }
  if (parts[0] === 'snooze' && k) { state.next[k.id] = now + SNOOZE; save(); }
  if (action === 'eyesStart') { state.eyeEnds = now + EYE_SECONDS * 1000; save(); }
  if (action === 'pause') {
    if (state.paused) {
      // Resume where we left off: the timers move on by however long the pause lasted.
      var away = now - state.pausedAt;
      Object.keys(state.next).forEach(function (id) { state.next[id] += away; });
      state.paused = false;
    } else {
      state.paused = true;
      state.pausedAt = now;
      state.eyeEnds = null;
    }
    save();
  }
}

setInterval(tick, 1000);
