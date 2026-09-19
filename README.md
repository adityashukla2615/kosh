# Kosh

*कोश (kosh): treasury, store of wealth.*

Kosh is a financial wellness app for Indian households. You tell it (roughly) what you earn, spend, own and owe, and what you're saving for. It simulates a few hundred possible futures and comes back with three things:

1. **Where you stand** - a health score you can take apart, and the odds of each goal actually happening.
2. **What happens if…** - move a slider (save more, lose your job, markets crash, buy a car) and the whole plan re-runs.
3. **What to do next** - a short ranked list of moves, each one *tested against your plan before it's recommended*, with the reasons and assumptions right there.

There's also an advisor you can talk to, and a monthly review run by a small pipeline of agents. The advisor can only quote numbers it has actually calculated; a checker traces every ₹ and % in its answer back to a tool result before you see it.

Built by **Team Br_Tesla** for the BroadBridge hackathon, *AI Wealth Navigator* track. All data is synthetic.

---

## Try it in two minutes

```bash
npm install
npm run dev:api     # terminal 1 -> http://localhost:8787
npm run dev:web     # terminal 2 -> http://localhost:5173
```

Pick one of the three sample households. No keys needed: without a model configured, the advisor runs on an offline planner that uses the same tools and numbers, just with simpler wording.

To switch on Claude:

```bash
cp .env.example .env
# either
ANTHROPIC_API_KEY=sk-ant-...           # Claude API
# or, with AWS credentials in your shell
USE_BEDROCK=1  AWS_REGION=us-east-1    # Claude on Amazon Bedrock
```

Docker, if you'd rather: `docker build -t kosh . && docker run -p 8787:8787 kosh` and open http://localhost:8787.

Tests: `npm test` (27 tests: engine properties, agent/grounding, HTTP API).

## The three households

We made them deliberately different so each one exercises a different part of the engine.

| | Who | What Kosh finds |
|---|---|---|
| **Ananya Rao** | 27, product designer, Pune | ₹50k a month "left over" that nobody's planned for. Food delivery up 35%. A credit card at 42%. Retirement odds 4% today - a 10% SIP step-up alone takes it to ~69%. |
| **Farhan & Zoya Sheikh** | 36/34, two incomes, one kid, home loan, Bengaluru | 3 months of emergency money, ₹50 L life cover against a ₹3.8 Cr need, health cover only through work. College fund at 36%. |
| **Venkatesh Iyer** | 52, bank manager, Chennai | Saves 60% of income but it's almost all FDs and EPF. Retirement at 58 is a coin flip until the idle surplus gets automated (38% → 98%). |

## What's actually going on

```
React (Vite)  ──►  CloudFront  ──►  Lambda (Express)  ──►  DynamoDB
                                     │
                                     ├─ engine/      simulation, goals, health score, next-best actions
                                     ├─ agent/       advisor tool loop, offline planner, review pipeline,
                                     │               BM25 retrieval over finance notes, number grounding
                                     └─ Claude (Bedrock or API) - optional
```

A few decisions worth calling out:

- **The model never does the maths.** All numbers come from a deterministic engine (Monte Carlo with seeded, common random numbers, so a "what if" is compared against the *same* market paths as the baseline). Claude plans which tools to call and explains the result.
- **Recommendations are simulated, not templated.** Each candidate action is applied to a copy of the profile and the whole plan is re-run. Ranking is by what actually moved.
- **Goals plan for ~80% odds, not the average.** Planning on average returns gives you a coin flip. We earmark money and size SIPs on a "mediocre market" return and say so.
- **Money keeps its real mix.** Savings already set aside for a goal grow at whatever they're actually invested in (FDs stay FDs); only new money follows the goal's ideal mix. That's why "move FDs to equity" shows up as a measurable improvement for Mr. Iyer and not for Ananya.
- **Assumptions are a page, not a footnote.** Inflation, returns, volatility, how much of unplanned surplus leaks away - all editable, all re-run everything.

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repo map

```
api/            Node 22 + Express. Same app runs locally and in Lambda.
  src/engine/   the maths - no I/O, pure functions, easy to test
  src/agent/    advisor loop, offline planner, review pipeline, retrieval, grounding
  src/data/     personas + the plain-language finance notes the advisor searches
  test/         node:test, no extra framework
web/            React 18 + Vite + Recharts. Hand-written CSS.
infra/          AWS SAM template (Lambda, Function URL, DynamoDB, S3, CloudFront, alarm)
.github/        CI (test, build, template lint) and CD (OIDC -> sam deploy -> s3 sync)
docs/           architecture, deployment guide, demo script, deck
samples/        a sample bank statement CSV for the import feature
```

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Short version: `sam build && sam deploy --guided` from `infra/`, then sync `web/dist` to the bucket it prints. Or push to `main` with the GitHub OIDC role set up and let the workflow do it.

## Things we know are rough

We'd rather say these than have a judge find them:

- **Tax is shallow.** We point people at employer NPS and the old-vs-new regime question but don't compute tax. Getting that right needs salary structure we don't collect.
- **Returns are normally distributed log-returns.** Real markets have fatter tails. Planning to 80% odds partly compensates; a proper fix would be bootstrapping from historical Nifty/gilt data.
- **Insurance premiums are ballparks** by age band, labelled as such.
- **Retrieval is BM25 over 15 hand-written notes.** It's the right size for the corpus. Swapping in Bedrock Knowledge Bases is a one-function change in `agent/retrieval.js`.
- **The Lambda Function URL is public** (CloudFront in front). For anything beyond a demo, put Cognito in front and switch the URL to IAM auth with CloudFront OAC.
- Custom profiles live in DynamoDB with a 30-day TTL and no login. Fine for a hackathon, not for real money.

## Not advice

Kosh is a planning and education tool. It isn't a SEBI-registered investment adviser, doesn't recommend specific funds, stocks or insurers, and every household in it is made up.
