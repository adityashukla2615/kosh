import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { PageHead, Trace } from '../components/bits.jsx';

const STARTERS = [
  'What should I do first?',
  'Am I on track for retirement?',
  'Can I afford a car of 10 lakh next year?',
  'What if I lose my job for 6 months?',
  'Where is my money going?',
  'Do I need term insurance?',
];

// per-household chat history survives page switches, not reloads
const memory = new Map();

export default function Advisor({ profileId, meta, assumptions }) {
  const [msgs, setMsgs] = useState(() => memory.get(profileId) || []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    memory.set(profileId, msgs);
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, profileId]);

  const send = async (q) => {
    const message = (q ?? text).trim();
    if (!message || busy) return;
    setText('');
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const r = await api.chat(profileId, message, history, assumptions);
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply, trace: r.trace, ms: r.ms, grounding: r.grounding, suggestions: r.suggestions, mode: r.mode }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Something went wrong: ${e.message}`, trace: [] }]);
    } finally {
      setBusy(false);
    }
  };

  const llm = meta?.llm;
  const last = msgs[msgs.length - 1];

  return (
    <div>
      <PageHead
        title="Ask Kosh"
        sub={
          llm?.provider === 'offline'
            ? 'Running on the offline planner: it picks the right calculations for your question and explains the result. Connect Claude (see README) for free-form conversation.'
            : `Powered by ${llm?.model}. It can only quote numbers it has calculated for you - every answer shows its working.`
        }
      />
      <div className="chat">
        <div className="msgs">
          {!msgs.length && (
            <div className="card" style={{ maxWidth: 640 }}>
              <h3>Ask anything about your money.</h3>
              <p className="muted small" style={{ marginTop: 4 }}>
                Kosh reads your plan, runs what-ifs, checks goals and looks things up in its notes before answering. Some places to start:
              </p>
              <div className="row wrap" style={{ marginTop: 12 }}>
                {STARTERS.map((s) => (
                  <button key={s} className="chip btnlike" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="msg user">
                {m.content}
              </div>
            ) : (
              <div key={i} className="msg bot">
                <div className="bubble">{m.content}</div>
                {m.trace?.length > 0 && <Trace trace={m.trace} ms={m.ms} grounding={m.grounding} />}
              </div>
            ),
          )}
          {busy && (
            <div className="msg bot">
              <div className="bubble typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {!busy && last?.suggestions?.length > 0 && (
            <div className="row wrap">
              {last.suggestions.map((s) => (
                <button key={s} className="chip btnlike" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. What if I get a 15% raise?" disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
