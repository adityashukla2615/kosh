# Demo video script (~4 minutes)

Record at 1440×900, browser zoom 100%. Hit `/api/health` once beforehand to warm the Lambda. Clear localStorage so you start on the welcome screen.

Talking points are a guide, not a script to read - say them in your own words.

---

### 0:00 - The problem (20s)

*Welcome screen.*

> "Most money apps show you a balance and a pie chart. They don't tell you whether you'll actually be able to buy the house, or what to do about it. Kosh does that - and it shows its working."

Click **Farhan & Zoya Sheikh**.

### 0:20 - Where they stand (45s)

*Overview.*

- Health score 56. Tap **Insurance** - "₹50 L of life cover against ₹3.8 Cr suggested for two dependents. Health cover only through work."
- Point at the fan chart: "Net worth in today's rupees, middle case and the range of 8 in 10 futures. That dip is Aarav's college being paid for."
- Goals: "College fund 36%, retirement at 60 around 16%. These are probabilities from hundreds of simulated markets, not a single straight-line guess."

### 1:05 - What if (45s)

*What if → click "10% yearly step-up".*

> "One setting in their fund app. Retirement goes from 16% to 92%, college from 36% to 72%. Both lines use the same simulated markets, so the difference is the change, not noise."

Click **Lose my job for 6 months**, then **Market falls 30%**. "Job loss barely moves long goals but eats the emergency fund. A crash hurts the college fund most - it's the nearest equity-heavy goal."

### 1:50 - Next steps (35s)

*Next steps.*

> "Every suggestion here was tested before it was ranked - we apply it to a copy of their plan and re-run everything."

Open #1: show **Why / How / Assuming** and the confidence chip. Point out the term plan and emergency fund ranking high: "Protection gaps with dependents outrank squeezing out more return."

Click **Try it in What if →** on one to show the hand-off.

### 2:25 - Ask Kosh (50s)

*Ask Kosh → "Can I afford a car of 10 lakh next year?"*

- Read the short answer: "They can pay for it, but it comes out of the college fund."
- Expand **How I worked this out**: "It read the plan, ran the purchase as a scenario, looked up the note on loans. Four steps."
- Point at **all figures traced**: "Every rupee and percentage in the answer is checked against the calculations before it's shown. If the model invents a number, it gets sent back to fix it."

(If Claude is connected, also ask something open-ended: "We're thinking of having a second child in two years - what changes?")

### 3:15 - Monthly review (30s)

*Monthly review → Run.*

> "This is the agent workflow. Eight specialists in order: spending analyst, goal planner, a risk officer running stress tests, a strategist, a compliance reviewer that strips product names, a writer, and a fact checker. The maths is deterministic; the model only writes the note."

Let the stages tick through; read the first two lines of the note.

### 3:45 - Trust & close (15s)

*Assumptions page.* Change equity return to 9%, click Apply, jump to Overview - numbers move.

> "Every assumption is visible and editable. Kosh runs on AWS - Lambda, DynamoDB, CloudFront, Claude on Bedrock - deployed from GitHub Actions. Thanks."

---

**Backup lines if something breaks live:** the offline planner answers the same questions without a model; say "this is the offline mode - same numbers, simpler words" and carry on.
