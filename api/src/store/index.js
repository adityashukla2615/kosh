// Tiny key-value store, behind an interface so the rest of the app never
// knows where things are kept.
//
// The implementation is in-memory: profiles someone creates through onboarding
// and statements they import live for as long as the process does. That is the
// right trade for this build - the three sample households and the adviser's
// book are code, not stored data, so they survive a restart regardless, and
// there is no account model to persist anything against.
//
// Swapping in a durable store means writing one more object with these four
// methods and choosing it here. Nothing else changes.

let impl;

function memoryStore() {
  const m = new Map();
  return {
    kind: 'memory',
    async get(key) {
      // Clone on the way out so a caller cannot mutate what is stored.
      const v = m.get(key);
      return v ? structuredClone(v) : null;
    },
    async put(key, value) {
      m.set(key, structuredClone(value));
    },
    async del(key) {
      m.delete(key);
    },
  };
}

export async function getStore() {
  if (impl) return impl;
  impl = memoryStore();
  return impl;
}
