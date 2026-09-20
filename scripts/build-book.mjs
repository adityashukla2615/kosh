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

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBook } from '../api/src/data/book.js';
import { screenBook } from '../api/src/engine/surveillance.js';
import { DEFAULT_ASSUMPTIONS } from '../api/src/engine/assumptions.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'src', 'data', 'book-screened.json');

const started = Date.now();
const book = screenBook(generateBook(), DEFAULT_ASSUMPTIONS, { queueSize: 12 });

mkdirSync(dirname(out), { recursive: true });
// generatedAt and computeMs describe this build, not the request that reads it.
writeFileSync(out, JSON.stringify({ ...book, precomputed: true }));

const size = (JSON.stringify(book).length / 1024).toFixed(0);
console.log(`screened ${book.stats.households} households in ${((Date.now() - started) / 1000).toFixed(1)}s → book-screened.json (${size} KB)`);
