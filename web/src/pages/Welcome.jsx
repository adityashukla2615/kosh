const initials = (n) =>
  n
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export default function Welcome({ meta, onPick, onCustom, current, onResume, onBook }) {
  return (
    <div className="welcome">
      <div className="brand" style={{ padding: 0, marginBottom: 40 }}>
        <b>Kosh</b>
        <span>wealth, explained</span>
      </div>

      <div className="hero">
        <h1>Advice you can show your working for.</h1>
        <p>
          Kosh simulates a household's whole plan - every goal, every what-if, every recommendation - and keeps the working. One household sees why. An
          adviser sees which of their book needs them this week. A reviewer sees what was considered and rejected, two years later.
        </p>
      </div>

      {/* The adviser view is the point of the product, so it leads. */}
      <button className="card entry" onClick={onBook}>
        <span>
          <span className="caps">Start here</span>
          <h2>Open the adviser book</h2>
          <span className="muted">
            214 households, screened by the same engine. Who needs a call this week, why, and the suitability record behind every recommendation.
          </span>
        </span>
        <span className="entry-go" aria-hidden="true">
          →
        </span>
      </button>

      {current && (
        <div className="row" style={{ marginTop: 24 }}>
          <button className="btn primary" onClick={onResume}>
            Continue with {current.name} →
          </button>
        </div>
      )}

      <div className="caps" style={{ marginTop: 44 }}>
        Or go straight into a household
      </div>
      <div className="personas" style={{ marginTop: 12 }}>
        {(meta?.personas || [1, 2, 3]).map((p, i) =>
          typeof p === 'number' ? (
            <div key={i} className="card skeleton" style={{ height: 150 }} />
          ) : (
            <button key={p.id} className="card persona" onClick={() => onPick(p)}>
              <span className="initials">{initials(p.name)}</span>
              <h3>{p.name}</h3>
              <span className="muted">{p.tagline}</span>
            </button>
          ),
        )}
      </div>

      <div className="card" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3>Or use your own numbers</h3>
          <p className="muted small">About 3 minutes. Rough figures are fine. Nothing leaves this demo and nothing is linked to your identity.</p>
        </div>
        <button className="btn" onClick={onCustom}>
          Start →
        </button>
      </div>

      <p className="foot-note">
        Hackathon build. All sample households are fictional and all data is synthetic. Kosh is a planning and education tool, not a SEBI-registered investment
        adviser, and never recommends specific funds, stocks or insurers.
      </p>
    </div>
  );
}
