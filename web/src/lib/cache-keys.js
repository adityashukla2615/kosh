/**
 * Cache keys, in one place so a page and a prefetch can't disagree about what
 * they are naming. Assumption objects are serialised with sorted keys, because
 * `{a,b}` and `{b,a}` are the same request and must not be two cache entries.
 */
const stable = (o) =>
  JSON.stringify(
    Object.keys(o || {})
      .sort()
      .reduce((acc, k) => ((acc[k] = o[k]), acc), {}),
  );

export const cacheKeys = {
  // Overview and Goals render from the same payload, so they share a key and
  // each one warms the other.
  overview: (id, assumptions) => `overview:${id}:${stable(assumptions)}`,
  actions: (id, assumptions) => `actions:${id}:${stable(assumptions)}`,
  spending: (id) => `spending:${id}`,
  outcome: (id, assumptions) => `outcome:${id}:${stable(assumptions)}`,
  profile: (id) => `profile:${id}`,
  book: (assumptions) => `book:${stable(assumptions)}`,
  record: (id, assumptions) => `record:${id}:${stable(assumptions)}`,
};
