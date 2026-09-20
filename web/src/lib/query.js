// A small stale-while-revalidate cache, shared by every page.
//
// Why this exists: each page used to fetch on mount and blank itself while it
// waited, so walking Overview -> Goals -> Overview cost two round trips and two
// skeleton flashes for data that had not changed. Simulations take the better
// part of a second, and that is the difference between an app that feels
// considered and one that feels like a series of page loads.
//
// Overview and Goals read the same /overview payload, so visiting either one
// warms the other for free.

const cache = new Map(); // key -> { data, error, at, promise }
const subscribers = new Map(); // key -> Set<() => void>

// How long a cached payload is served without a background refresh. Long enough
// to make navigation feel instant, short enough that nothing goes visibly stale
// in a demo.
const FRESH_MS = 30_000;

function emit(key) {
  const set = subscribers.get(key);
  if (set) set.forEach((fn) => fn());
}

function subscribe(key, fn) {
  let set = subscribers.get(key);
  if (!set) subscribers.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) subscribers.delete(key);
  };
}

/** Fetch unless a fresh copy or an in-flight request already exists. */
export function fetchQuery(key, fn, { force = false } = {}) {
  const entry = cache.get(key);
  if (entry?.promise) return entry.promise;
  if (!force && entry && entry.data !== undefined && Date.now() - entry.at < FRESH_MS) {
    return Promise.resolve(entry.data);
  }

  const promise = fn().then(
    (data) => {
      cache.set(key, { data, error: null, at: Date.now() });
      emit(key);
      return data;
    },
    (error) => {
      // Keep any data we already had: a failed refresh should not wipe the screen.
      const prev = cache.get(key);
      cache.set(key, { data: prev?.data, error, at: Date.now() });
      emit(key);
      throw error;
    },
  );

  cache.set(key, { ...entry, promise });
  emit(key);
  return promise;
}

/** Warm the cache without rendering anything. Failures are deliberately ignored. */
export function prefetch(key, fn) {
  fetchQuery(key, fn).catch(() => {});
}

/** Drop every entry whose key starts with `prefix` (e.g. after a CSV import). */
export function invalidate(prefix) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      emit(key);
    }
  }
}

export { cache as _cache, subscribe as _subscribe };
