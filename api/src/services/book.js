// Screening 214 households is about ten seconds of arithmetic on a laptop and
// rather more on a small container. It is also the same answer every time for a
// given set of assumptions, so it is computed once and kept.
//
// The cache is keyed by assumptions because changing an assumption is exactly
// the operation that invalidates every number in the book - and being able to
// change one and watch the whole book move is the point of the Assumptions page.

import { generateBook } from '../data/book.js';
import { screenBook } from '../engine/surveillance.js';
import { DEFAULT_ASSUMPTIONS } from '../engine/assumptions.js';

const cache = new Map();
const inFlight = new Map();
const MAX_ENTRIES = 4;

const keyOf = (a) => JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)));

export function bookStatus(a) {
  const key = keyOf(a);
  if (cache.has(key)) return { state: 'ready', ...cache.get(key).meta };
  if (inFlight.has(key)) return { state: 'computing', ...(inFlight.get(key).progress || {}) };
  return { state: 'cold' };
}

/**
 * The screened book for these assumptions. Concurrent callers share one
 * computation rather than each starting their own.
 */
export function getScreenedBook(a, { queueSize = 12 } = {}) {
  const key = keyOf(a);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit.value);
  if (inFlight.has(key)) return inFlight.get(key).promise;

  const entry = { progress: { done: 0, total: 0 } };
  entry.promise = new Promise((resolve, reject) => {
    // Yield to the event loop first: a screening run is CPU-bound and long
    // enough that starting it synchronously inside a request handler would
    // stall every other request behind it.
    setImmediate(() => {
      try {
        const households = generateBook();
        entry.progress.total = households.length;
        const value = screenBook(households, a, {
          queueSize,
          onProgress: (done, total) => {
            entry.progress = { done, total };
          },
        });
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { value, meta: { computeMs: value.computeMs, generatedAt: value.generatedAt, households: value.stats.households } });
        resolve(value);
      } catch (err) {
        reject(err);
      } finally {
        inFlight.delete(key);
      }
    });
  });

  inFlight.set(key, entry);
  return entry.promise;
}

/**
 * Start the default screening in the background at boot, so the first person to
 * open the book is not the one who pays for it.
 */
export function warmBook() {
  getScreenedBook(DEFAULT_ASSUMPTIONS).catch((err) => console.error('[kosh] book warm-up failed', err.message));
}
