// ₹ in the way people here actually say it: ₹45,000 / ₹12.4 L / ₹1.25 Cr
const trim = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

export function inr(v) {
  const a = Math.abs(v);
  const s = a >= 1e7 ? `₹${trim((a / 1e7).toFixed(2))} Cr` : a >= 1e5 ? `₹${trim((a / 1e5).toFixed(1))} L` : `₹${Math.round(a).toLocaleString('en-IN')}`;
  return v < 0 ? `-${s}` : s;
}
