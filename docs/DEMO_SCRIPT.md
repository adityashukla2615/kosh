# Demo video script (~5.5 minutes)

Record at 1440×900, browser zoom 100%. Demo: <https://kosh-2w6y.onrender.com>. Open it a minute beforehand - a free
Render instance sleeps when idle and takes ~50 s to wake, and you do not want that on tape.
Clear localStorage so you start on the welcome screen.

The hosted demo runs the **offline planner**: same tools, same engine numbers, plainer wording,
no model calls. Say so once, at the Ask Kosh step, and carry on.

Talking points are a guide, not a script to read - say them in your own words.

---

### 0:00 - The problem (25s)

*Welcome screen.*

> "Advice is easy to give. It is hard to evidence. Kosh simulates a household's whole plan - and keeps the working. That turns out to be worth three different things to three different people."

Click **Open the adviser book**.

### 0:25 - The book (55s)

*Adviser book.*

- Point at the top right: "214 households. 171,200 simulated market paths. Precomputed at build, served in under a second."
- **The structural findings, first:** "92% of this book is underfunded for retirement. That is not 196 alerts - that is one fact about the book. Raising it 196 times would bury the households who actually need a call this week. Alert fatigue is how surveillance systems die."
- **The queue:** "So the system picks twelve - roughly what an adviser can actually get through in a week - and publishes the cutoff, so you can see how close the thirteenth was."
- Expand **#1**. "Every finding carries the numbers that produced it and the basis it was judged on. 'Protection gap' is an opinion. 'One dependent, no term cover at all, against ₹2.03 Cr of need' is a meeting."

### 1:20 - The record (50s)

Click **Suitability record** on that household.

> "Ranking a recommendation means simulating every alternative against that household. So at the moment of ranking, the engine is already holding what a compliance reviewer will ask for in two years. Most systems throw it away."

- Scroll to **Alternatives considered**: "What else was on the table, what each was projected to do, and why it lost - with both numbers."
- **Checks**, then **Integrity**: click **Verify this record**. "Digested when generated, so alteration is detectable."
- Point at the regulatory context: "SEBI reg. 17 and Reg BI's Care Obligation ask for materially this. 'Reasonably available alternatives considered' is the clause firms spend the most money failing to evidence, because nobody wrote them down. Here it falls out of how ranking works."

Click **Open this household →**.

### 2:10 - Where they stand (40s)

*Overview — the household you just opened from the queue.*

> "Same engine, one household. This is what the adviser sees when they make the call."

Read the numbers **off the screen**, not off this page — they move with the assumptions, and the
whole point is that they are computed rather than written down.

- Tap a **health pillar** to open it: "every part of the score takes itself apart."
- Point at the fan chart: "Net worth in today's rupees, middle case and the range of 8 in 10 futures. The dips are goals being paid for."
- Goals: "Probabilities from 800 simulated markets, not a single straight-line guess."

### 2:50 - What if (40s)

*What if → click "10% yearly step-up".*

> "One setting in their fund app. Watch both lines — they use the same simulated markets, so the difference you see is the change and not noise."

Click **Lose my job for 6 months**, then **Market falls 30%**. "Job loss barely moves the long goals but eats the emergency fund. A crash hurts the nearest equity-heavy goal most."

### 3:30 - Next steps (30s)

*Next steps.*

> "Every suggestion here was tested before it was ranked - we apply it to a copy of their plan and re-run everything."

Open #1: show **Why / How / Assuming** and the confidence chip. "Protection gaps with dependents outrank squeezing out more return — and that ordering is measured, not hand-written."

Click **Try it in What if →** on one to show the hand-off.

### 4:00 - Ask Kosh (45s)

*Ask Kosh → "Can I afford a car of 10 lakh next year?"*

- Read the short answer off the screen: the trade-off it finds is always against a named goal.
- Expand **How I worked this out**: "It read the plan, ran the purchase as a scenario, looked up the note on loans. Four steps."
- Point at **all figures traced**: "Every rupee and percentage in the answer is checked against the calculations before it's shown. If the model invents a number, it gets sent back to fix it."

(On the hosted demo the advisor is the offline planner - the numbers above are all real, the wording is just plainer. Say "this is offline mode, same numbers, simpler words" and move on. With Claude connected, this is also where you ask something open-ended: "We're thinking of having a second child in two years - what changes?")

### 4:45 - Monthly review (30s)

*Monthly review → Run.*

> "This is the agent workflow. Eight specialists in order: spending analyst, goal planner, a risk officer running stress tests, a strategist, a compliance reviewer that strips product names, a writer, and a fact checker. The maths is deterministic; the model only writes the note."

Let the stages tick through; read the first two lines of the note.

### 5:15 - Close (20s)

*Assumptions page.* Change equity return to 9%, click Apply, jump to Overview - numbers move.

> "Every assumption is visible and editable - and changing one re-screens all 214 households, because nothing is cached for a question the engine has not been asked before. One container: the same code runs on a laptop, on this host, and on the AWS stack in the repo. Thanks."

---

**Backup if something breaks live:** run it locally (`npm run dev:api` + `npm run dev:web`) - same
app, no network. Read numbers off the screen rather than from this script; they move when the
assumptions do.
