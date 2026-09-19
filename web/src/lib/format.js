const trim = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

export function inr(v, { short = true } = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  let s;
  if (short && a >= 1e7) s = `₹${trim((a / 1e7).toFixed(2))} Cr`;
  else if (short && a >= 1e5) s = `₹${trim((a / 1e5).toFixed(1))} L`;
  else s = `₹${Math.round(a).toLocaleString('en-IN')}`;
  return v < 0 ? `−${s}` : s;
}

// axis ticks want to be tiny
export function inrAxis(v) {
  const a = Math.abs(v);
  if (a >= 1e7) return `${trim((v / 1e7).toFixed(1))}Cr`;
  if (a >= 1e5) return `${trim((v / 1e5).toFixed(0))}L`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
}

export const pct = (p, digits = 0) => (p == null ? '—' : `${(p * 100).toFixed(digits)}%`);

export function signed(n, fmt = (x) => x) {
  if (!n) return fmt(0);
  return n > 0 ? `+${fmt(n)}` : `−${fmt(Math.abs(n))}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const firstName = (name = '') => name.split(/[\s&]/)[0];

export const STATUS_LABEL = { 'on-track': 'On track', watch: 'Worth watching', 'off-track': 'Off track' };
export const PRIORITY_LABEL = { essential: 'Must-have', important: 'Important', nice: 'Nice to have' };
