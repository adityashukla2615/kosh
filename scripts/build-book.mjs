// Precompute the screened book.
//
// Screening is a pure function of a fixed seed, a fixed engine and a fixed set
// of assumptions, so computing it on every container start is waste: about six
// seconds on a laptop and nearly forty on a small shared instance, paid by
// whoever opens the book first. It is computed once here, at build time, and
// shipped.
//
// Custom assumptions still recompute at runtime - that path is the point of the
// Assumptions page - and the UI reports progress while it does.
//
// `npm run build:book`, and the test suite asserts this file still matches a
// fresh screening so it cannot go stale unnoticed.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBook } from '../api/src/data/book.js';
import { screenBook } from '../api/src/engine/surveillance.js';
import { DEFAULT_ASSUMPTIONS } from '../api/src/engine/assumptions.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'src', 'data', 'book-screened.json');

const started = Date.now();
const book = screenBook(generateBook(), DEFAULT_ASSUMPTIONS, { queueSize: 12 });
const next = { ...book, precomputed: true };

// `generatedAt` and `computeMs` describe the build that produced the file, not
// the data in it, and they change on every run. Rewriting the file for them
// alone means `npm run build` dirties the repository every time and a real
// change to the screening is invisible in the diff. So: compare everything
// except those two, and leave the file alone when the substance is identical.
const volatile = ({ generatedAt, computeMs, ...rest }) => rest;
const unchanged =
  existsSync(out) && JSON.stringify(volatile(JSON.parse(readFileSync(out, 'utf8')))) === JSON.stringify(volatile(next));

const size = (JSON.stringify(next).length / 1024).toFixed(0);
const took = ((Date.now() - started) / 1000).toFixed(1);

if (unchanged) {
  console.log(`screened ${book.stats.households} households in ${took}s → unchanged, book-screened.json left as is (${size} KB)`);
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(next));
  console.log(`screened ${book.stats.households} households in ${took}s → book-screened.json updated (${size} KB)`);
}
