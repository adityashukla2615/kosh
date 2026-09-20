import { PERSONAS, profileFromForm } from '../data/personas.js';
import { getHousehold } from '../data/book.js';
import { generateTransactions } from '../engine/spending.js';
import { getStore } from '../store/index.js';
import { randomUUID } from 'node:crypto';

const txnCache = new Map();

export async function loadProfile(id) {
  const persona = PERSONAS.find((p) => p.id === id);
  if (persona) return structuredClone(persona);
  // A household from the adviser's book is an ordinary profile. Resolving it
  // here rather than in a parallel set of routes means every existing surface -
  // plan, goals, what-if, the adviser and the monthly review - works for all 214
  // of them without knowing the book exists.
  const fromBook = getHousehold(id);
  if (fromBook) return structuredClone(fromBook);
  const store = await getStore();
  return store.get(`profile#${id}`);
}

export async function createProfile(form) {
  const id = `u-${randomUUID().slice(0, 8)}`;
  const profile = profileFromForm(form, id);
  const store = await getStore();
  await store.put(`profile#${id}`, profile);
  return profile;
}

// synthetic history + whatever the user uploaded
export async function loadTransactions(profile) {
  const store = await getStore();
  const imported = (await store.get(`txn#${profile.id}`)) || [];
  if (imported.length) return imported;
  if (!txnCache.has(profile.id)) txnCache.set(profile.id, generateTransactions(profile));
  return txnCache.get(profile.id);
}

export async function saveImportedTransactions(profileId, rows) {
  const store = await getStore();
  await store.put(`txn#${profileId}`, rows.slice(-3000));
}

export async function clearImportedTransactions(profileId) {
  const store = await getStore();
  await store.del(`txn#${profileId}`);
}
