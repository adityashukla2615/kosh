import { GUIDES } from '../data/guides.js';

// Plain BM25 over ~15 short notes. A vector DB would be overkill for this corpus;
// swapping in a vector store later only means replacing search().

const STOP = new Set('a an and are as at be but by can do does for from how i if in is it its me my of on or should so than that the this to was what when where which who why will with you your we our'.split(' '));

const tokenize = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9₹\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

const docs = GUIDES.map((g) => {
  const toks = tokenize(`${g.title} ${g.title} ${g.tags.join(' ')} ${g.tags.join(' ')} ${g.body}`);
  const tf = new Map();
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
  return { g, tf, len: toks.length };
});
const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length;
const df = new Map();
for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

export function search(query, k = 3) {
  const q = tokenize(query);
  const k1 = 1.4;
  const b = 0.75;
  const N = docs.length;
  const scored = docs.map((d) => {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / avgLen));
    }
    return { id: d.g.id, title: d.g.title, score, body: d.g.body };
  });
  return scored
    .filter((x) => x.score > 0.5)
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map((x) => ({ ...x, score: Math.round(x.score * 100) / 100 }));
}
