// Notes — tiny notes list stored per plugin.

var STRINGS = {
  en: { placeholder: 'Write a note and press Return…', empty: 'No notes yet.', more: '+{n} more notes', open: '{n} notes', one: '1 note' },
  id: { placeholder: 'Tulis catatan lalu tekan Enter…', empty: 'Belum ada catatan.', more: '+{n} catatan lain', open: '{n} catatan', one: '1 catatan' }
};
function t(key) { return (STRINGS[notch.locale] || STRINGS.en)[key]; }

var notes = notch.storage.get('notes') || [];

function save() { notch.storage.set('notes', notes); }

function render() {
  var rows = notes.slice(0, 6).map(function (n, i) {
    return ui.hstack([
      ui.symbol(n.done ? 'checkmark.circle.fill' : 'circle', { size: 14, color: n.done ? 'green' : 'secondary' }),
      ui.text(n.text, { color: n.done ? 'tertiary' : 'primary', lines: 1 }),
      ui.spacer(),
      ui.button('', 'toggle:' + i, { symbol: n.done ? 'arrow.uturn.left' : 'checkmark' }),
      ui.button('', 'delete:' + i, { symbol: 'trash' })
    ], { spacing: 8 });
  });
  return ui.vstack([
    ui.input(t('placeholder'), 'add'),
    notes.length ? ui.vstack(rows, { spacing: 6 }) : ui.text(t('empty'), { style: 'caption' }),
    notes.length > 6 ? ui.text(t('more').replace('{n}', notes.length - 6), { style: 'caption' }) : ui.spacer()
  ], { spacing: 10 });
}

function compact() {
  var open = notes.filter(function (n) { return !n.done; }).length;
  return open ? { symbol: 'note.text', text: open === 1 ? t('one') : t('open').replace('{n}', open), color: 'yellow' } : null;
}

function onAction(action, value) {
  var parts = action.split(':');
  var i = +parts[1];
  if (parts[0] === 'add' && value && value.trim()) notes.unshift({ text: value.trim(), done: false });
  if (parts[0] === 'toggle' && notes[i]) notes[i].done = !notes[i].done;
  if (parts[0] === 'delete') notes.splice(i, 1);
  save();
}
