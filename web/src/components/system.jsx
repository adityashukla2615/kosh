import { Component, useEffect, useState } from 'react';
import { connection, onConnection } from '../lib/api.js';

/**
 * Stops one broken component from taking the whole page with it.
 *
 * A white screen is the worst failure mode in front of an audience: there is
 * nothing to read and nothing to do. This keeps the shell, says what happened
 * and offers the two ways out.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Somewhere to look when a judge says "it went blank".
    console.error('[kosh] render failed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" style={{ maxWidth: 560, margin: '40px auto' }} role="alert">
        <h2>This page stopped working.</h2>
        <p className="muted">
          The rest of Kosh is fine - the numbers behind it are computed on the server and nothing has been lost.
        </p>
        <p className="mono small muted">{this.state.error.message}</p>
        <div className="row">
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            Try this page again
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload Kosh
          </button>
        </div>
      </div>
    );
  }
}

/**
 * One honest line about the connection, shown only when there is something to
 * say. The host sleeps when idle and takes up to a minute to wake, which looks
 * identical to a hang unless somebody says otherwise.
 */
export function ConnectionBanner() {
  const [c, setC] = useState(connection);
  useEffect(() => onConnection(setC), []);

  if (!c.online) {
    return (
      <div className="conn err" role="status">
        You’re offline. Kosh needs the server to run a simulation - the numbers on screen are the last ones it computed.
      </div>
    );
  }
  if (c.waking) {
    return (
      <div className="conn" role="status">
        <i className="spin" aria-hidden="true" />
        Waking the server. It sleeps when idle, so the first request can take up to a minute.
      </div>
    );
  }
  if (c.failing) {
    return (
      <div className="conn err" role="status">
        The server isn’t answering. Kosh retried once already; the numbers on screen are the last good ones.
      </div>
    );
  }
  return null;
}
