const BASE = import.meta.env.VITE_API_BASE || '/api';

// Simulations are CPU-bound and the agent pipeline is slower still, so one
// timeout does not fit every call. These are ceilings, not expectations.
const TIMEOUT = { default: 25_000, long: 150_000 };

// A request that has not answered by this point is worth telling the user about
// rather than leaving them looking at a skeleton.
const SLOW_AFTER = 1_200;

/** Errors carry a kind so callers can say something useful instead of echoing a stack. */
export class ApiError extends Error {
  constructor(message, { kind = 'app', status = null, retryable = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind; // network | timeout | server | app
    this.status = status;
    this.retryable = retryable;
  }
}

// --- connection state -------------------------------------------------------
// One place that knows whether the backend is answering, so the shell can show
// a single honest banner instead of every page inventing its own.

const listeners = new Set();
let state = { online: navigator.onLine, slow: false, waking: false, failing: false };

function setState(patch) {
  const next = { ...state, ...patch };
  if (Object.keys(patch).every((k) => state[k] === next[k])) return;
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function connection() {
  return state;
}
export function onConnection(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
}

// The host sleeps when idle and takes the better part of a minute to wake. Until
// one request has come back we treat slowness as a cold start, because that is
// what it almost always is.
let everSucceeded = false;
let inFlight = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(path, { method, body, headers, timeout, signal }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort('timeout'), timeout);

  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body && typeof body !== 'string' ? { 'content-type': 'application/json', ...headers } : headers,
      body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
      signal: ctrl.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 5xx and 429 are worth another go; a 400 never is.
      const retryable = res.status >= 500 || res.status === 429;
      throw new ApiError(data.error || `The server returned ${res.status}.`, {
        kind: retryable ? 'server' : 'app',
        status: res.status,
        retryable,
      });
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted && signal?.aborted) throw e; // caller cancelled - not an error
    if (ctrl.signal.aborted) {
      throw new ApiError(
        everSucceeded ? 'That took too long and was stopped.' : 'The server is taking an unusually long time to start.',
        { kind: 'timeout', retryable: true },
      );
    }
    throw new ApiError('Could not reach the server.', { kind: 'network', retryable: true });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function request(path, { method = 'GET', body, headers, long = false, signal } = {}) {
  const timeout = long ? TIMEOUT.long : TIMEOUT.default;
  inFlight++;
  const slowTimer = setTimeout(() => setState({ slow: true, waking: !everSucceeded }), SLOW_AFTER);

  try {
    // One retry, after a short pause. Enough to ride out a dropped connection or
    // a restarting instance; not so many that a real outage looks like a hang.
    for (let attempt = 0; ; attempt++) {
      try {
        const data = await once(path, { method, body, headers, timeout, signal });
        everSucceeded = true;
        setState({ failing: false });
        return data;
      } catch (e) {
        if (signal?.aborted) throw e;
        if (!e.retryable || attempt >= 1) {
          setState({ failing: e.kind === 'network' || e.kind === 'timeout' });
          throw e;
        }
        await sleep(600);
      }
    }
  } finally {
    clearTimeout(slowTimer);
    if (--inFlight === 0) setState({ slow: false, waking: false });
  }
}

export const api = {
  meta: () => request('/meta'),
  // Screening the whole book is cached server-side; the first call after a cold
  // start does the work, the rest are lookups.
  book: (assumptions, full = false) =>
    request(`/book?${new URLSearchParams({ ...(Object.keys(assumptions || {}).length ? { assumptions: JSON.stringify(assumptions) } : {}), ...(full ? { full: '1' } : {}) })}`, { long: true }),
  record: (id, assumptions) =>
    request(`/book/households/${id}/record`, { method: 'POST', body: { assumptions } }),
  verifyRecord: (record) => request('/book/records/verify', { method: 'POST', body: { record } }),
  bookStatus: (assumptions) =>
    request(`/book/status?${new URLSearchParams(Object.keys(assumptions || {}).length ? { assumptions: JSON.stringify(assumptions) } : {})}`),
  health: () => request('/health'),
  createProfile: (form) => request('/profiles', { method: 'POST', body: form }),
  overview: (id, assumptions) => request(`/profiles/${id}/overview`, { method: 'POST', body: { assumptions } }),
  simulate: (id, scenario, assumptions, signal) =>
    request(`/profiles/${id}/simulate`, { method: 'POST', body: { scenario, assumptions }, signal }),
  solveGoal: (id, goalId, targetProbability, assumptions) =>
    request(`/profiles/${id}/goals/${goalId}/solve`, { method: 'POST', body: { targetProbability, assumptions } }),
  actions: (id, assumptions) => request(`/profiles/${id}/actions`, { method: 'POST', body: { assumptions } }),
  spending: (id) => request(`/profiles/${id}/spending`, { method: 'POST', body: {} }),
  importCsv: (id, csv) =>
    request(`/profiles/${id}/transactions/import`, { method: 'POST', body: csv, headers: { 'content-type': 'text/csv' } }),
  clearImport: (id) => request(`/profiles/${id}/transactions/import`, { method: 'DELETE' }),
  // The agent pipelines take their time; they get the long ceiling.
  chat: (id, message, history, assumptions) =>
    request(`/profiles/${id}/chat`, { method: 'POST', body: { message, history, assumptions }, long: true }),
  review: (id, assumptions) => request(`/profiles/${id}/review`, { method: 'POST', body: { assumptions }, long: true }),
};
