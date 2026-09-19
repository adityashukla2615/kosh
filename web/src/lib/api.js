const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body && typeof body !== 'string' ? { 'content-type': 'application/json', ...headers } : headers,
    body: body && typeof body !== 'string' ? JSON.stringify(body) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  meta: () => request('/meta'),
  health: () => request('/health'),
  createProfile: (form) => request('/profiles', { method: 'POST', body: form }),
  overview: (id, assumptions) => request(`/profiles/${id}/overview`, { method: 'POST', body: { assumptions } }),
  simulate: (id, scenario, assumptions) => request(`/profiles/${id}/simulate`, { method: 'POST', body: { scenario, assumptions } }),
  solveGoal: (id, goalId, targetProbability, assumptions) => request(`/profiles/${id}/goals/${goalId}/solve`, { method: 'POST', body: { targetProbability, assumptions } }),
  actions: (id, assumptions) => request(`/profiles/${id}/actions`, { method: 'POST', body: { assumptions } }),
  spending: (id) => request(`/profiles/${id}/spending`, { method: 'POST', body: {} }),
  importCsv: (id, csv) => request(`/profiles/${id}/transactions/import`, { method: 'POST', body: csv, headers: { 'content-type': 'text/csv' } }),
  clearImport: (id) => request(`/profiles/${id}/transactions/import`, { method: 'DELETE' }),
  chat: (id, message, history, assumptions) => request(`/profiles/${id}/chat`, { method: 'POST', body: { message, history, assumptions } }),
  review: (id, assumptions) => request(`/profiles/${id}/review`, { method: 'POST', body: { assumptions } }),
};
