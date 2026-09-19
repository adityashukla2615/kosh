const initials = (n) =>
  n
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export default function Welcome({ meta, onPick, onCustom, current, onResume }) {
  return (
    <div className="welcome">
      <div className="brand" style={{ padding: 0, marginBottom: 40 }}>
        <b>Kosh</b>
        <span>wealth, explained</span>
      </div>

      <div className="hero">
        <h1>Your money, explained back to you - with the working shown.</h1>
        <p>
          Kosh looks at what you earn, spend, save and owe, simulates hundreds of possible futures, and tells you the few things worth doing next. Every number
          has a reason you can open, and every assumption can be changed.
        </p>
      </div>

      {current && (
        <div className="row" style={{ marginTop: 24 }}>
          <button className="btn primary" onClick={onResume}>
            Continue with {current.name} →
          </button>
        </div>
      )}

      <div className="caps" style={{ marginTop: 44 }}>
        Pick a sample household
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
