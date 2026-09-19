// Small, hand-written knowledge base the advisor can search.
// Written as plain-language notes, the way a friend who happens to be a planner
// would explain things. General education only - rates change, check before acting.

export const GUIDES = [
  {
    id: 'emergency-fund',
    title: 'Emergency fund: how much and where',
    tags: ['emergency', 'liquid fund', 'job loss', 'savings account', 'sweep fd', 'runway'],
    body: `Keep 6 months of expenses plus EMIs somewhere you can reach in a day or two. Single income households or people in volatile jobs should lean towards 9-12 months.
Where: a mix of savings account (1 month), sweep-in FD, and a liquid or overnight mutual fund. Liquid funds are usually redeemed in one working day and have historically returned slightly more than a savings account.
Do not keep your emergency money in equity, it tends to fall exactly when you lose your job (recessions).
Once the cushion is full, stop adding to it. Extra cash beyond this should be invested for goals.`,
  },
  {
    id: 'term-insurance',
    title: 'Term life insurance',
    tags: ['term', 'life insurance', 'cover', 'dependents', 'endowment', 'ulip', 'lic'],
    body: `If anyone depends on your income, a pure term plan is the cheapest way to protect them. Rule of thumb: 10-15x yearly income plus outstanding loans.
Endowment, money-back and ULIP policies mix insurance with investment; they typically give low cover and low returns. Many people with a ₹25 L LIC endowment actually need ₹2-3 Cr of cover.
Buy it young, premiums are locked for the policy term. Disclose all health history and habits (smoking, alcohol). Non-disclosure is a leading cause of rejected claims.
Cover till 60-65, i.e. till your dependents are no longer dependent.`,
  },
  {
    id: 'health-insurance',
    title: 'Health insurance and super top-ups',
    tags: ['health', 'mediclaim', 'hospital', 'super top-up', 'employer cover', 'family floater'],
    body: `Employer group cover ends when the job ends and is often too small (₹3-5 L) for a metro hospital stay. Buy a personal policy while you are healthy - waiting periods for pre-existing diseases (typically 2-3 years) only start when you buy.
A cheap way to get big cover: a base policy of ₹5-10 L plus a super top-up of ₹25-50 L with a deductible equal to the base cover.
Parents above 60 are expensive to insure; a separate policy for them keeps your family floater premium lower.`,
  },
  {
    id: 'sip-step-up',
    title: 'SIPs and step-ups',
    tags: ['sip', 'step-up', 'top-up', 'mutual fund', 'monthly investing', 'automate'],
    body: `A SIP is just an automatic monthly investment into a mutual fund. The real benefit is behavioural: money gets invested before you can spend it.
A step-up (top-up) SIP raises the amount every year, say by 10%. Because salaries usually rise, a step-up keeps your savings rate from slowly falling.
Over 20 years, a 10% yearly step-up on a ₹10,000 SIP roughly doubles the final corpus compared with a flat SIP at the same return.
Schedule SIPs 1-3 days after salary credit.`,
  },
  {
    id: 'asset-allocation',
    title: 'Asset allocation by goal horizon',
    tags: ['allocation', 'equity', 'debt', 'gold', 'horizon', 'rebalancing', 'risk'],
    body: `Money needed within 2-3 years should mostly sit in debt (FDs, short-duration or liquid funds). Equity can fall 30-40% in a bad year and may take 2-4 years to recover.
Money needed in 7+ years can take much more equity; historically Indian equity has beaten inflation over long periods, with big swings along the way.
A sensible glide path: as a goal gets closer, move money from equity to debt gradually, e.g. over the last 3 years.
Rebalance once a year or when the mix drifts by more than 5-10 percentage points from the target.
Gold at 5-10% is a reasonable diversifier; it tends to do well when equity is under stress.`,
  },
  {
    id: 'fd-inflation',
    title: 'Why FDs alone rarely beat inflation',
    tags: ['fd', 'fixed deposit', 'inflation', 'tax', 'real return', 'retirement'],
    body: `FD interest is taxed at your slab rate every year. At 7% interest and a 30% slab, the post-tax return is ~4.9%. With inflation near 5-6%, the real return is roughly zero or negative.
FDs are great for safety and for money needed soon. For money needed 7+ years away, keeping everything in FDs means your purchasing power barely grows.
Senior citizens get higher FD rates and the Senior Citizens Savings Scheme (SCSS), which can be useful post-retirement for steady income.`,
  },
  {
    id: 'debt-prepay',
    title: 'Prepay the loan or invest?',
    tags: ['prepay', 'loan', 'home loan', 'credit card', 'personal loan', 'interest', 'debt'],
    body: `Credit card debt (36-45% a year) and personal loans (13-20%) should almost always be cleared before investing. No investment reliably beats those rates.
Home loans (8-9%) are different: interest may be tax-deductible under the old regime, and long-term equity returns have historically been higher than home-loan rates. Many people split surplus between prepaying and investing for peace of mind.
When prepaying a home loan, ask the bank to reduce tenure (not EMI) - it saves more interest.
Never pay only the "minimum due" on a credit card; interest is charged on the whole balance.`,
  },
  {
    id: 'ppf-epf-nps',
    title: 'PPF, EPF and NPS in one page',
    tags: ['ppf', 'epf', 'nps', 'retirement', 'lock-in', 'vpf', '80c', '80ccd'],
    body: `EPF: deducted from salary, employer matches. Interest was 8.25% for FY 2023-24. Voluntary PF (VPF) lets you add more at the same rate. Treat it as retirement money.
PPF: 15-year lock-in, government backed, tax-free interest (7.1% for several years now, reset quarterly). Max ₹1.5 L a year.
NPS: market-linked retirement account, locked till 60 with limited partial withdrawals. At 60, at least 40% of the corpus must buy an annuity under current rules. Employer contributions under 80CCD(2) are deductible in both tax regimes.
All three are debt-heavy (NPS lets you choose up to 75% equity), so they balance an equity SIP well.`,
  },
  {
    id: 'tax-regimes',
    title: 'Old vs new tax regime (quick orientation)',
    tags: ['tax', '80c', 'new regime', 'old regime', 'elss', 'deduction', 'hra'],
    body: `The new regime is the default and has lower slab rates but almost no deductions. Under the Budget for FY 2025-26, income up to ₹12 L (₹12.75 L for salaried with standard deduction) effectively pays no tax.
The old regime still allows 80C (₹1.5 L across EPF, PPF, ELSS, life premium, principal on home loan), 80D (health premium), home-loan interest (24b) and HRA. It tends to win only when these deductions are large.
Do not buy an investment product just to save tax. Pick the regime after comparing both on your actual numbers - or ask a CA.
Rules change every Budget; confirm before acting.`,
  },
  {
    id: 'retirement-number',
    title: 'How big should the retirement corpus be?',
    tags: ['retirement', 'corpus', 'fire', 'withdrawal rate', 'independence', '4% rule'],
    body: `A common planning shortcut: corpus = 25 to 33 years of expenses at retirement. We use ~28x (a withdrawal rate around 3.5%) because Indian inflation is higher than the US data the famous 4% rule came from.
Expenses at retirement are today's expenses grown by inflation - at 6% inflation, prices double roughly every 12 years.
Healthcare costs rise faster than general inflation; a good health policy before 50 is part of retirement planning.
Retiring 2-3 years later helps a lot: more years of saving, more years of growth, fewer years of withdrawals.`,
  },
  {
    id: 'sequence-risk',
    title: 'Near a goal? Watch sequence risk',
    tags: ['sequence risk', 'crash', 'market fall', 'near retirement', 'glide path', 'wedding', 'down payment'],
    body: `A 30% market fall hurts most right before you need the money. At 25, a crash is an opportunity; at 57 with retirement in a year, it can permanently lower your lifestyle.
Protect near-term goals by moving their money to debt 2-3 years ahead. For retirement, keep 3-5 years of expenses in debt/FDs (a "bucket") so you are never forced to sell equity in a bad year.`,
  },
  {
    id: 'lifestyle-creep',
    title: 'Lifestyle creep and spending leaks',
    tags: ['spending', 'budget', 'food delivery', 'subscriptions', 'shopping', 'lifestyle', 'save more'],
    body: `As income rises, small upgrades add up: more food delivery, more subscriptions, quick-commerce top-ups. None feel big alone.
What works better than a strict budget: decide the savings amount first (automate it on payday) and spend the rest freely.
A quarterly 15-minute review of UPI and card statements usually finds 2-3 habits worth trimming.
Cutting 25% from one high category is often easier than cutting 5% everywhere.`,
  },
  {
    id: 'home-down-payment',
    title: 'Saving for a home down payment',
    tags: ['home', 'house', 'flat', 'down payment', 'home loan', 'rent vs buy'],
    body: `Banks typically finance 75-90% of a property's value, so plan for 20-25% down payment plus 7-10% for stamp duty, registration and interiors.
Keep the EMI under ~35-40% of take-home including other EMIs.
If the purchase is 5+ years away, a mix of equity and debt is fine; move it to debt over the last 2-3 years.
Buying is a lifestyle decision as much as a financial one - in many Indian metros rent yields are 2-3%, so renting and investing the difference can come out ahead on pure numbers.`,
  },
  {
    id: 'child-education',
    title: "Planning for a child's education",
    tags: ['education', 'college', 'child', 'school fees', 'sukanya', 'abroad'],
    body: `Education costs have historically risen faster than general inflation (we assume ~9%). A ₹25 L course today could cost ₹70 L+ in 13 years.
Start early, mostly equity while the goal is far, and glide into debt in the last 3 years.
Sukanya Samriddhi Yojana is a good debt component for a daughter's education (government backed, tax-free).
Do not stop your own retirement savings for a child's education; loans exist for education, not for retirement.`,
  },
  {
    id: 'about-kosh',
    title: 'How Kosh works out its numbers',
    tags: ['how', 'method', 'monte carlo', 'probability', 'assumption', 'simulation', 'kosh'],
    body: `Kosh simulates hundreds of possible market futures (Monte Carlo). A "70% chance" means that in 70 out of 100 simulated futures you reach the goal on time.
Short-term goals use safer, debt-heavy mixes; long-term goals use more equity, depending on your risk profile.
Your existing savings are earmarked to the nearest goals first, and your monthly SIP goes to must-have goals first.
Every assumption - inflation, returns, volatility - is visible on the Assumptions page and can be changed.
Kosh never recommends specific funds or stocks, and it is not a SEBI-registered adviser; it is a planning and education tool.`,
  },
];
