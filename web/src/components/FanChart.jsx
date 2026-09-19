import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { inr, inrAxis } from '../lib/format.js';

// p10-p90 band + median line. Optional second series for a scenario.
export default function FanChart({ series, compare, payouts = [], height = 280 }) {
  const data = series.map((s, i) => {
    const row = { year: s.year, band: [s.p10, s.p90], p50: s.p50, p10: s.p10, p90: s.p90 };
    if (compare?.[i]) {
      row.band2 = [compare[i].p10, compare[i].p90];
      row.s50 = compare[i].p50;
      row.s10 = compare[i].p10;
      row.s90 = compare[i].p90;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e3ddd0" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: '#d6cfbf' }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickFormatter={inrAxis} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={<Tip hasCompare={!!compare} />} />
        {payouts.map((p) => (
          <ReferenceLine key={p.id} x={p.year} stroke="#b9ae97" strokeDasharray="3 3" label={{ value: p.name.split(' ').slice(0, 2).join(' '), position: 'insideTopLeft', fontSize: 10, fill: '#8a8272' }} />
        ))}
        <Area dataKey="band" stroke="none" fill="#1f5c4a" fillOpacity={compare ? 0.08 : 0.14} isAnimationActive={false} />
        <Line dataKey="p50" stroke="#1f5c4a" strokeWidth={compare ? 1.5 : 2.2} strokeDasharray={compare ? '4 3' : undefined} dot={false} isAnimationActive={false} />
        {compare && <Area dataKey="band2" stroke="none" fill="#2c5a85" fillOpacity={0.14} isAnimationActive={false} />}
        {compare && <Line dataKey="s50" stroke="#2c5a85" strokeWidth={2.2} dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Tip({ active, payload, label, hasCompare }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="tt">
      <div className="caps" style={{ marginBottom: 4 }}>{label} · today’s money</div>
      <div>
        {hasCompare ? 'Now: ' : 'Middle case: '}
        <b>{inr(r.p50)}</b> <span className="muted">({inr(r.p10)} – {inr(r.p90)})</span>
      </div>
      {hasCompare && (
        <div style={{ color: '#2c5a85' }}>
          With change: <b>{inr(r.s50)}</b> <span className="muted">({inr(r.s10)} – {inr(r.s90)})</span>
        </div>
      )}
    </div>
  );
}
