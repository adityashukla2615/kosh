import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import { prefetch } from './lib/query.js';
import { useKeyboard, focusRegistered } from './lib/keys.js';
import { cacheKeys } from './lib/cache-keys.js';
import { ErrorBoundary, ConnectionBanner } from './components/system.jsx';
import Welcome from './pages/Welcome.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Overview from './pages/Overview.jsx';
import Goals from './pages/Goals.jsx';
import WhatIf from './pages/WhatIf.jsx';
import Actions from './pages/Actions.jsx';
import Spending from './pages/Spending.jsx';
import Advisor from './pages/Advisor.jsx';
import Review from './pages/Review.jsx';
import Assumptions from './pages/Assumptions.jsx';
import Book from './pages/Book.jsx';
import Record from './pages/Record.jsx';

const PAGES = [
  { id: 'overview', label: 'Overview', C: Overview },
  { id: 'goals', label: 'Goals', C: Goals },
  { id: 'whatif', label: 'What if…', C: WhatIf },
  { id: 'actions', label: 'Next steps', C: Actions },
  { id: 'spending', label: 'Spending', C: Spending },
  { id: 'ask', label: 'Ask Kosh', C: Advisor },
  { id: 'review', label: 'Monthly review', C: Review },
  { id: 'assumptions', label: 'Assumptions', C: Assumptions },
];

/** Warm whichever request the page about to be opened will make. */
function warmPage(pageId, profileId, assumptions) {
  if (pageId === 'overview' || pageId === 'goals') {
    prefetch(cacheKeys.overview(profileId, assumptions), () => api.overview(profileId, assumptions));
  } else if (pageId === 'actions') {
    prefetch(cacheKeys.actions(profileId, assumptions), () => api.actions(profileId, assumptions));
  } else if (pageId === 'spending') {
    prefetch(cacheKeys.spending(profileId), () => api.spending(profileId));
  }
}

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode etc - fine */
  }
};

function readHash() {
  const [, page, sub] = window.location.hash.match(/^#\/?([\w-]*)\/?([\w-]*)?/) || [];
  return { page: page || '', sub: sub || '' };
}

export default function App() {
  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState(null);
  const [profile, setProfile] = useState(() => load('kosh.profile', null)); // { id, name }
  const [assumptions, setAssumptions] = useState(() => load('kosh.assumptions', {}));
  const [route, setRoute] = useState(readHash);
  const [pendingScenario, setPendingScenario] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setMetaErr(e.message));
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => save('kosh.profile', profile), [profile]);
  useEffect(() => save('kosh.assumptions', assumptions), [assumptions]);

  const go = useCallback((page) => {
    window.location.hash = `/${page}`;
  }, []);

  const pick = (p) => {
    if (p.fromBook) prefetch(cacheKeys.record(p.id, assumptions), () => api.record(p.id, assumptions));
    // Start the simulation before the shell renders, so the Overview usually has
    // its numbers by the time the user is looking at it.
    prefetch(cacheKeys.overview(p.id, assumptions), () => api.overview(p.id, assumptions));
    setProfile({ id: p.id, name: p.name, custom: !!p.custom, fromBook: !!p.fromBook });
    go('overview');
  };

  // Warm the pages a user reaches for next. Browsers run this off the critical
  // path, and a warm cache is what makes the nav feel instant rather than fetched.
  useEffect(() => {
    if (!profile) return;
    const warm = () => {
      prefetch(cacheKeys.overview(profile.id, assumptions), () => api.overview(profile.id, assumptions));
      prefetch(cacheKeys.actions(profile.id, assumptions), () => api.actions(profile.id, assumptions));
      prefetch(cacheKeys.spending(profile.id), () => api.spending(profile.id));
    };
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = idle(warm);
    return () => cancel(handle);
  }, [profile, assumptions]);

  const pageIndex = PAGES.findIndex((p) => p.id === route.page);

  // Keep the tab title in step with where you are - it is how a second tab
  // stays usable and how history entries read.
  useEffect(() => {
    const label = PAGES[pageIndex]?.label;
    document.title = profile && label ? `${label} · ${profile.name} · Kosh` : 'Kosh · wealth, explained';
  }, [pageIndex, profile]);

  const keyHandlers = useMemo(
    () => ({
      digit: (i) => PAGES[i] && profile && go(PAGES[i].id),
      help: () => setShowKeys((v) => !v),
      search: () => focusRegistered(),
      escape: () => {
        if (showKeys) {
          setShowKeys(false);
          return true;
        }
        return false;
      },
    }),
    [go, profile, showKeys],
  );
  useKeyboard(keyHandlers);

  // open the what-if page with levers pre-set (from Next steps / Goals)
  const tryScenario = (scenario) => {
    setPendingScenario(scenario);
    go('whatif');
  };

  const page = PAGES.find((p) => p.id === route.page);
  const assumptionsChanged = useMemo(() => Object.keys(assumptions).length > 0, [assumptions]);

  if (metaErr) {
    return (
      <div className="welcome">
        <div className="banner err">Can’t reach the Kosh API ({metaErr}). Is the backend running on port 8787?</div>
      </div>
    );
  }

  // The book and a record are adviser surfaces: they sit outside the household
  // shell, because neither belongs to one household.
  if (route.page === 'book') {
    return (
      <div className="adviser">
        <TopBar onHome={() => go('')} />
        <ErrorBoundary>
          <ConnectionBanner />
          <Book meta={meta} assumptions={assumptions} onOpenHousehold={(row) => pick({ id: row.id, name: row.name, fromBook: true })} />
        </ErrorBoundary>
      </div>
    );
  }

  if (route.page === 'record' && route.sub) {
    return (
      <div className="adviser">
        <TopBar onHome={() => go('')} />
        <ErrorBoundary>
          <ConnectionBanner />
          <Record householdId={route.sub} assumptions={assumptions} onBack={() => go('book')} />
        </ErrorBoundary>
      </div>
    );
  }

  if (route.page === 'start') return <Onboarding onDone={pick} onBack={() => go('')} />;
  if (!profile || !page) return <Welcome meta={meta} onPick={pick} onCustom={() => go('start')} current={profile} onResume={() => go('overview')} onBook={() => go('book')} />;

  const Page = page.C;
  const llm = meta?.llm;

  return (
    <div className="shell">
      <a className="skip btn" href="#main">
        Skip to content
      </a>
      <aside className="side">
        <div className="brand">
          <b>Kosh</b>
          <span>wealth, explained</span>
        </div>
        <button className="who" onClick={() => go(profile.fromBook ? 'book' : '')} title={profile.fromBook ? 'Back to the book' : 'Switch household'}>
          <span className="caps">Planning for</span>
          <span className="name">{profile.name}</span>
          <span className="small muted">
            {profile.fromBook ? '← back to book' : profile.custom ? 'Your numbers' : 'Sample household · switch'}
          </span>
        </button>
        <nav className="nav" aria-label="Sections">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              className={p.id === page.id ? 'on' : ''}
              aria-current={p.id === page.id ? 'page' : undefined}
              onClick={() => go(p.id)}
              // Hovering a link is a strong signal you are about to click it.
              onPointerEnter={() => warmPage(p.id, profile.id, assumptions)}
              onFocus={() => warmPage(p.id, profile.id, assumptions)}
            >
              <span className="k" aria-hidden="true">
                {i + 1}
              </span>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span className="mode">
            <i className={`dot ${llm && llm.provider !== 'offline' ? 'live' : ''}`} />
            {llm ? (llm.provider === 'offline' ? 'Advisor: offline planner' : `Advisor: ${llm.model}`) : '…'}
          </span>
          {assumptionsChanged && (
            <span className="mode">
              <i className="dot" /> Custom assumptions on
            </span>
          )}
          <span className="tiny muted">Synthetic data · not investment advice</span>
        </div>
      </aside>
      <main className="main" id="main" ref={mainRef} tabIndex={-1} key={`${profile.id}:${page.id}`}>
        <ConnectionBanner />
        <ErrorBoundary key={page.id}>
          <Page
            profileId={profile.id}
            meta={meta}
            assumptions={assumptions}
            setAssumptions={setAssumptions}
            go={go}
            tryScenario={tryScenario}
            pendingScenario={pendingScenario}
            clearPendingScenario={() => setPendingScenario(null)}
          />
        </ErrorBoundary>
      </main>
      {showKeys && <Shortcuts pages={PAGES} onClose={() => setShowKeys(false)} />}
    </div>
  );
}

function Shortcuts({ pages, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement;
    node?.focus();

    // Trap Tab inside the sheet and hand focus back where it came from.
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };

    node?.addEventListener('keydown', onKey);
    return () => {
      node?.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2>Keyboard</h2>
          <button className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="keys">
          {pages.map((p, i) => (
            <div key={p.id}>
              <dt>
                <kbd>{i + 1}</kbd>
              </dt>
              <dd>{p.label}</dd>
            </div>
          ))}
          <div>
            <dt>
              <kbd>/</kbd>
            </dt>
            <dd>Jump to the input on this page</dd>
          </div>
          <div>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>This list</dd>
          </div>
          <div>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Close</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Masthead for the adviser-level surfaces, which have no household sidebar. */
function TopBar({ onHome }) {
  return (
    <div className="topbar">
      <button className="brand plain" onClick={onHome}>
        <b>Kosh</b>
        <span>wealth, explained</span>
      </button>
      <span className="tiny muted">Synthetic data · not investment advice</span>
    </div>
  );
}
