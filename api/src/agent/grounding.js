// "Did the model make that number up?"
// We pull every ₹ amount and percentage out of the final answer and look for it in
// the tool outputs of the same turn. Anything we can't trace gets reported - and in
// LLM mode, the model gets one chance to fix it before the answer is shown.

const UNIT = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

export function extractFigures(text) {
  const figures = [];
  const s = String(text || '');
  const money = /₹\s?(-?[\d,]+(?:\.\d+)?)\s?(k|thousand|lakhs?|lacs?|l|cr|crores?)?\b/gi;
  let m;
  while ((m = money.exec(s))) {
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const unit = m[2] ? UNIT[m[2].toLowerCase()] : 1;
    const decimals = (m[1].split('.')[1] || '').length;
    figures.push({ raw: m[0].trim(), kind: 'money', value: base * unit, precision: unit * Math.pow(10, -decimals) * 0.5 });
  }
  const pct = /(-?\d+(?:\.\d+)?)\s?%/g;
  while ((m = pct.exec(s))) figures.push({ raw: m[0], kind: 'pct', value: Number(m[1]) });
  return figures;
}

function collectNumbers(obj, acc = []) {
  if (obj == null) return acc;
  if (typeof obj === 'number') acc.push(obj);
  else if (typeof obj === 'string') {
    for (const f of extractFigures(obj)) acc.push(f.kind === 'pct' ? f.value / 100 : f.value);
    const plain = obj.match(/-?\d[\d,]*(?:\.\d+)?/g);
    if (plain) for (const p of plain) acc.push(Number(p.replace(/,/g, '')));
  } else if (Array.isArray(obj)) obj.forEach((x) => collectNumbers(x, acc));
  else if (typeof obj === 'object') Object.values(obj).forEach((x) => collectNumbers(x, acc));
  return acc;
}

export function groundingCheck(answer, toolOutputs, extraKnown = []) {
  const figures = extractFigures(answer);
  const known = collectNumbers(toolOutputs).concat(extraKnown).filter(Number.isFinite);
  // allow simple derived values: differences and sums of pairs are too permissive,
  // so we only add "per year" (x12) and "per month" (/12) variants.
  const variants = known.flatMap((v) => [v, v * 12, v / 12]);

  const traced = [];
  const untraced = [];
  for (const f of figures) {
    let ok;
    if (f.kind === 'money') {
      const tol = Math.max(f.precision, Math.abs(f.value) * 0.03, 50);
      ok = variants.some((v) => Math.abs(v - f.value) <= tol);
    } else {
      ok = known.some((v) => Math.abs(v * 100 - f.value) <= 1.5 || Math.abs(v - f.value) <= 1.5);
    }
    (ok ? traced : untraced).push(f.raw);
  }
  return { total: figures.length, traced: traced.length, untraced: [...new Set(untraced)] };
}
