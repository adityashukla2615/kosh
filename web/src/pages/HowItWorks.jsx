import { api } from '../lib/api.js';
import { inr, pct } from '../lib/format.js';
import { useQuery, PageHead, Loading } from '../components/bits.jsx';
import { cacheKeys } from '../lib/cache-keys.js';

/**
 * How the numbers are made.
 *
 * Written against *this* household rather than in the abstract: a page that
 * says "we run a Monte Carlo simulation" teaches nobody anything, but one that
 * says "your retirement number came from 800 simulated markets, 31 of which
 * ran out of money" is checkable. Everything below pulls from the same
 * endpoints the rest of the app uses.
 */
export default function HowItWorks({ profileId, meta, assumptions, go }) {
  const { data, loading } = useQuery(cacheKeys.overview(profileId, assumptions), () => api.overview(profileId, assumptions));
  const paths = meta?.assumptions?.defaults?.simulations ?? 800;

  if (loading) return <Loading shape="page" label="Reading your plan" />;

  const goals = data?.goals?.goals || [];
  const weakest = [...goals].filter((g) => g.probability != null).sort((a, b) => a.probability - b.probability)[0];
  const health = data?.health;
  const s = data?.summary;
  const failed = weakest ? Math.round((1 - weakest.probability) * paths) : null;

  return (
    <div className="howto">
      <PageHead
        title="How this works"
        sub="Every number in Kosh comes from a calculation you can inspect. This page explains where they come from, using your own plan rather than an example."
      />

      <Step n="1" title="Your position is arithmetic, not a model">
        <p>
          Income, spending, EMIs, SIPs and EPF are added up exactly as you entered them. Nothing is estimated here and nothing is inferred.
        </p>
        {s && (
          <Figures
            items={[
              ['Take-home a month', inr(s.monthlyIncome)],
              ['Spending + EMIs', inr(s.monthlyNeed)],
              ['Left over', inr(s.surplus)],
              ['Savings rate', pct(s.savingsRate)],
            ]}
          />
        )}
      </Step>

      <Step n="2" title={`Your future is ${paths} futures, not one`}>
        <p>
          A single projection at an average return is a straight line that will never happen. Kosh simulates <b>{paths} different markets</b> for
          every goal — each year's return drawn at random from the return and volatility on the{' '}
          <button className="linkish" onClick={() => go('assumptions')}>
            Assumptions page
          </button>{' '}
          — and counts how many of them funded the goal in time.
        </p>
        {weakest && (
          <div className="callout">
            <b>
              “{weakest.name}” is at {pct(weakest.probability)}
            </b>
            <p className="small">
              That means {paths - failed} of {paths} simulated markets funded it fully and on time, and <b>{failed} did not</b>. It is a
              probability, not a prediction — and the {failed} is the part most tools never show you.
            </p>
          </div>
        )}
      </Step>

      <Step n="3" title="A “what if” is compared against the same markets">
        <p>
          When you move a slider, Kosh runs the new plan against <b>the identical {paths} simulated markets</b> as your current plan. This is
          deliberate: with different random markets, saving more could come back looking worse purely by chance, and you would be reading noise as
          if it were advice.
        </p>
        <p className="small muted">
          The technique is called common random numbers. It is the single most important correctness detail in the simulation.
        </p>
      </Step>

      <Step n="4" title="Nothing is recommended until it has been simulated">
        <p>
          There are no rules of the form “if you are over 50, suggest X”. Every candidate action is applied to a copy of your plan and{' '}
          <b>the whole thing is re-run</b>. They are ranked by what actually moved, for you.
        </p>
        {data?.actions?.[0] && (
          <div className="callout">
            <b>{data.actions[0].title}</b>
            <p className="small">
              Ranked first because of its measured effect: {data.actions[0].impact.headline.toLowerCase()}. Open it on{' '}
              <button className="linkish" onClick={() => go('actions')}>
                Next steps
              </button>{' '}
              to see why, how, and what it assumes.
            </p>
          </div>
        )}
      </Step>

      <Step n="5" title="The AI plans and explains. It never does the maths.">
        <p>
          This is the rule the whole system is built around. A language model asked to compute a retirement corpus will give you a confident,
          plausible, wrong number. So Claude never calculates anything — it decides <i>which</i> calculation to run, and puts the result in plain
          language.
        </p>
        <p>It can reach the engine through seven tools and nothing else:</p>
        <div className="toolgrid">
          {[
            ['get_snapshot', 'your current position'],
            ['run_scenario', 'a what-if, simulated'],
            ['check_goal', 'one goal in detail'],
            ['next_best_actions', 'the ranked list'],
            ['analyze_spending', 'category trends'],
            ['search_guides', 'the finance notes'],
            ['get_assumptions', 'what it is assuming'],
          ].map(([name, what]) => (
            <div key={name}>
              <code>{name}</code>
              <span className="tiny muted">{what}</span>
            </div>
          ))}
        </div>
      </Step>

      <Step n="6" title="Every figure is checked before you see it">
        <p>
          After the model writes an answer, a checker pulls out <b>every rupee amount and percentage</b> in it and matches each one against the
          calculations that were actually run. A number the engine never produced gets sent back to be rewritten.
        </p>
        <p className="small muted">
          That is what “all N figures traced” means under an answer on{' '}
          <button className="linkish" onClick={() => go('ask')}>
            Ask Kosh
          </button>
          . If a figure could not be traced, it says so instead of hiding it.
        </p>
      </Step>

      <Step n="7" title="The monthly review is eight specialists in order">
        <p>
          Not one prompt — a pipeline, where each stage does one job and hands a structured result to the next. The maths is deterministic at every
          stage; the model writes one paragraph at the end, and a fact checker verifies it against the pipeline.
        </p>
        <ol className="pipeline-list small">
          {[
            ['Intake', 'is the data complete enough to plan on'],
            ['Spending analyst', 'trends and leaks'],
            ['Goal planner', 're-runs every goal'],
            ['Risk officer', 'job loss, market crash, both'],
            ['Strategist', 'simulates and ranks moves'],
            ['Compliance reviewer', 'strips product names'],
            ['Writer', 'drafts the note'],
            ['Fact checker', 'every ₹ and % must trace back'],
          ].map(([who, what]) => (
            <li key={who}>
              <b>{who}</b> — {what}
            </li>
          ))}
        </ol>
      </Step>

      <Step n="8" title="Every assumption is yours to change">
        <p>
          Nineteen assumptions sit behind these numbers — inflation, expected returns, volatility, how much of an unplanned surplus quietly
          disappears. All of them are listed with a plain-language note, all editable, and changing one re-runs everything.
        </p>
        {health && (
          <p className="small muted">
            Your health score of {health.score} and every probability on this site would move if you changed them. That is the point:{' '}
            <button className="linkish" onClick={() => go('assumptions')}>
              go and change one
            </button>{' '}
            and watch.
          </p>
        )}
      </Step>

      <div className="card limits">
        <h3>What this does not do</h3>
        <ul className="small">
          <li>
            <b>It does not compute your tax.</b> Doing that properly needs your salary structure, which Kosh does not collect. It points at the
            questions worth asking instead.
          </li>
          <li>
            <b>Returns are modelled as normally distributed.</b> Real markets have fatter tails — more very bad years than this model allows for.
            Planning to 80% odds partly compensates for that, but not entirely.
          </li>
          <li>
            <b>Insurance figures are rules of thumb</b> by age band, not underwritten quotes.
          </li>
          <li>
            <b>It never recommends a product.</b> No fund, scheme, insurer or stock — only positions to change. Nothing here is paid for by anyone.
          </li>
          <li>
            <b>It is not investment advice.</b> Kosh is a planning and education tool, not a SEBI-registered investment adviser, and every
            household in it is made up.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <section className="howstep">
      <div className="howstep-n num" aria-hidden="true">
        {n}
      </div>
      <div className="howstep-body">
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Figures({ items }) {
  return (
    <div className="figrow">
      {items.map(([label, value]) => (
        <div key={label}>
          <span className="caps">{label}</span>
          <span className="v num">{value}</span>
        </div>
      ))}
    </div>
  );
}
