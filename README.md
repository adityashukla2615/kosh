# Kosh

*कोश (kosh): treasury, store of wealth.*

Kosh simulates a household's whole financial plan — every goal, every what-if, every
recommendation — and **keeps the working**.

That produces three things, for three different people:

| | |
|---|---|
| **A household** sees where they stand, what happens if, and what to do next — with the reason behind every number. |
| **An adviser** sees which of 214 households needs a call this week, ranked, with the evidence for each. |
| **A reviewer** sees what was recommended, what else was considered, and why it was rejected — two years later. |

The third one is the interesting one, and it was nearly free. Ranking a recommendation
already means simulating every alternative against that household, so at the moment of
ranking the engine is holding exactly what a compliance reviewer will later ask for. Most
systems throw it away. This one keeps it, digests it so alteration is detectable, and
exports it.

Built by **Team Br_Tesla** for the BroadBridge hackathon, *AI Wealth Navigator* track.
All households are synthetic.

---

## Try it

**Live: <https://kosh-2w6y.onrender.com>** — nothing to install. It sleeps when idle, so
the first load can take ~50 seconds; after that it's quick.

Start at **the adviser book**. That is the product.

Or locally, in two minutes:

```bash
npm install
npm run dev:api     # terminal 1 -> http://localhost:8787
npm run dev:web     # terminal 2 -> http://localhost:5173
```

No keys needed: without a model configured, the advisor runs on an offline planner that uses
the same tools and the same numbers, just with plainer wording.

To switch on Claude:

```bash
cp .env.example .env
ANTHROPIC_API_KEY=sk-ant-...           # Claude API
# or, with AWS credentials in your shell
USE_BEDROCK=1  AWS_REGION=us-east-1    # Claude on Amazon Bedrock
```

Tests: `npm test` (41 tests: engine properties, book surveillance, suitability records,
agent grounding, HTTP API).

## The adviser's book

214 synthetic households, generated from a fixed seed — so the number in the deck is the
number you see. Screening runs the real engine over every one: **171,200 market paths**,
computed at build time and served in 39ms.

Two decisions did most of the work here.

**Base rates are not alerts.** 92% of this book is below a 70% chance of funding retirement.
Raising that 196 times would bury the eleven households with something fixable *this week* —
the standard way a surveillance system becomes shelfware. Retirement underfunding is
reported once, as a finding about the book. A school fee due in 2030 at 0% *is* an alert:
dated, specific, still fixable.

**The queue has a capacity, not a display limit.** An adviser can have about a dozen real
conversations in a week. So the system picks twelve, and publishes the cutoff score so you
can see how close the thirteenth was.

Every flag carries the numbers that produced it and the basis it was judged on. A flag that
says "protection gap" is an opinion; one that says "1 dependent, no term cover at all
against roughly ₹2.03 Cr of need" is something an adviser can take into a meeting.

## The suitability record

For any recommendation: what was advised, what else was simulated, what each alternative was
projected to do, why it lost, every assumption relied on, and a SHA-256 digest so alteration
is detectable. Exportable as JSON, printable as a document.

Two regimes ask for materially this evidence:

- **SEBI (Investment Advisers) Regulations 2013, reg. 17** — reasonable basis for advice, and
  a record of that basis.
- **SEC Regulation Best Interest, Care Obligation** — reasonably available alternatives
  considered.

That last clause is the one firms spend the most money failing to evidence, because nobody
wrote the alternatives down. Here they are a by-product of how the recommendation was ranked.

It generates evidence. It does not certify compliance, and it says so.

## The three households

We made them deliberately different so each one exercises a different part of the engine.

| | Who | What Kosh finds |
|---|---|---|
| **Ananya Rao** | 27, product designer, Pune | ₹50k a month "left over" that nobody's planned for. Food delivery up 35%. A credit card at 42%. Retirement odds 4% today - a 10% SIP step-up alone takes it to ~69%. |
| **Farhan & Zoya Sheikh** | 36/34, two incomes, one kid, home loan, Bengaluru | 3 months of emergency money, ₹50 L life cover against a ₹3.8 Cr need, health cover only through work. College fund at 36%. |
| **Venkatesh Iyer** | 52, bank manager, Chennai | Saves 60% of income but it's almost all FDs and EPF. Retirement at 58 is a coin flip until the idle surplus gets automated (38% → 98%). |

## What's actually going on

```
React (Vite)  ──►  one container (or CloudFront + Lambda)  ──►  DynamoDB / memory
                                     │
                                     ├─ engine/      simulation, goals, health score, next-best actions,
                                     │               book surveillance, suitability records
                                     ├─ data/        personas, the generated book, finance notes
                                     ├─ agent/       advisor tool loop, offline planner, review pipeline,
                                     │               BM25 retrieval, number grounding
                                     └─ Claude (Bedrock or API) - optional
```

A few decisions worth calling out:

- **The model never does the maths.** All numbers come from a deterministic engine (Monte Carlo with seeded, common random numbers, so a "what if" is compared against the *same* market paths as the baseline). Claude plans which tools to call and explains the result.
- **Recommendations are simulated, not templated.** Each candidate action is applied to a copy of the profile and the whole plan is re-run. Ranking is by what actually moved.
- **Goals plan for ~80% odds, not the average.** Planning on average returns gives you a coin flip. We earmark money and size SIPs on a "mediocre market" return and say so.
- **Money keeps its real mix.** Savings already set aside for a goal grow at whatever they're actually invested in (FDs stay FDs); only new money follows the goal's ideal mix. That's why "move FDs to equity" shows up as a measurable improvement for Mr. Iyer and not for Ananya.
- **Assumptions are a page, not a footnote.** Inflation, returns, volatility, how much of unplanned surplus leaks away - all editable, all re-run everything, including the whole book.
- **Base rates are separated from alerts.** Something true of 92% of the book is a finding about the book, not 196 alerts. Alert fatigue is how surveillance systems die.
- **The default screening is precomputed.** It is a pure function of a fixed seed and fixed assumptions, so it is computed at build time and served in 39ms rather than costing 37 seconds of a judge's attention. A test fails if it drifts from the engine.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repo map

```
api/            Node 22 + Express. Same app runs locally and in Lambda.
  src/engine/   the maths - no I/O, pure functions, easy to test
                surveillance.js (book triage), suitability.js (the record)
  src/agent/    advisor loop, offline planner, review pipeline, retrieval, grounding
  src/data/     personas, the generated book, finance notes, the precomputed screening
  test/         node:test, no extra framework
web/            React 18 + Vite + Recharts. Hand-written CSS.
infra/          AWS SAM template (Lambda, Function URL, DynamoDB, S3, CloudFront, alarm)
.github/        CI (test, build, template lint) and CD (OIDC -> sam deploy -> s3 sync)
scripts/        build-book.mjs (precomputes the screening), deploy-hf.sh
docs/           architecture, deployment guide, demo script, deck
render.yaml     blueprint for the live demo (one Docker service)
deploy/         Hugging Face Space config, if you deploy there instead
samples/        a sample bank statement CSV for the import feature
```

## Deploying

The live demo is one Docker service on Render - API and web app on a single origin, from
`render.yaml` at the root: <https://kosh-2w6y.onrender.com>. It runs the offline planner, so it costs nothing
and needs no key; putting Claude behind it is a secret and a variable in the dashboard.
There is a Hugging Face Space path too; both are in the guide.

AWS is the architecture this was designed for and `infra/template.yaml` is real (CI lints it
on every push): `sam build && sam deploy --guided` from `infra/`, then sync `web/dist` to the
bucket it prints, or push to `main` with the GitHub OIDC role set up. We host the demo
elsewhere only because our AWS account was suspended mid-build. Nothing in the app is tied
to AWS: the store falls back to memory without `TABLE_NAME`, and the advisor takes Bedrock
or the Claude API.

Every path, step by step, in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Things we know are rough

We'd rather say these than have a judge find them:

- **Tax is shallow.** We point people at employer NPS and the old-vs-new regime question but don't compute tax. Getting that right needs salary structure we don't collect.
- **Returns are normally distributed log-returns.** Real markets have fatter tails. Planning to 80% odds partly compensates; a proper fix would be bootstrapping from historical Nifty/gilt data.
- **Insurance premiums are ballparks** by age band, labelled as such.
- **The book is generated, not real.** Distributions are shaped to be plausible for urban Indian households with an adviser relationship; they are not sampled from real data, and the insurance need figures are rules of thumb rather than underwriting.
- **Retrieval is BM25 over 15 hand-written notes.** It's the right size for the corpus. Swapping in Bedrock Knowledge Bases is a one-function change in `agent/retrieval.js`.
- **The Lambda Function URL is public** (CloudFront in front). For anything beyond a demo, put Cognito in front and switch the URL to IAM auth with CloudFront OAC.
- Custom profiles have no login. On AWS they sit in DynamoDB with a 30-day TTL; on the hosted demo they are in the container's memory and vanish on restart. The three sample households are code, so they always survive. Fine for a hackathon, not for real money.

## Not advice

Kosh is a planning and education tool. It isn't a SEBI-registered investment adviser, doesn't recommend specific funds, stocks or insurers, and every household in it is made up.
