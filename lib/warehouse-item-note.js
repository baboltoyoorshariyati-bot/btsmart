'use strict';
// Warehouse staff attach one short free-text note to each weighed item.
// The note belongs to the warehouse stage only: sales can read it, but never
// write it, and it survives later sales edits because it lives on the item row.
const { fail } = require('./http');

const MAX_LENGTH = 300;

// Normalizes one note: undefined/null clears it, whitespace collapses to single
// spaces (the note is rendered in one compact line), length is capped.
function normalize(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(400, 'توضیح انبار معتبر نیست.');
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if ([...text].length > MAX_LENGTH) fail(400, `توضیح انبار حداکثر ${MAX_LENGTH} نویسه است.`);
  return text;
}

// Writes (or clears) the note on the item row together with its author stamp.
function record(item, value, actor, now) {
  const text = normalize(value);
  if (!text) {
    delete item.warehouseNote;
    delete item.warehouseNoteAt;
    delete item.warehouseNoteBy;
    delete item.warehouseNoteByName;
    return '';
  }
  Object.assign(item, {
    warehouseNote: text,
    warehouseNoteAt: now,
    warehouseNoteBy: actor?.id || null,
    warehouseNoteByName: actor?.fullName || actor?.username || '',
  });
  return text;
}

module.exports = { MAX_LENGTH, normalize, record };
