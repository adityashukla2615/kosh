---
title: Kosh
emoji: 🪙
colorFrom: indigo
colorTo: green
sdk: docker
app_port: 8787
pinned: false
license: mit
short_description: A wealth navigator for Indian households that explains itself
---

# Kosh

*कोश (kosh): treasury, store of wealth.*

A financial wellness app for Indian households. Tell it roughly what you earn,
spend, own and owe, and what you're saving for. It simulates a few hundred
possible futures and returns where you stand, what happens if things change, and
a ranked list of next moves — each one simulated against your own plan before it
is recommended.

All numbers come from a deterministic Monte Carlo engine. Claude plans which
tools to call and explains the result; a grounding checker traces every ₹ and %
in an answer back to a tool result before it is shown.

Built by **Team Br_Tesla** for the BroadBridge hackathon, *AI Wealth Navigator*
track. All households in the app are synthetic.

**Source, architecture notes and the AWS SAM template:**
<https://github.com/adityashukla2615/kosh>

### Running here

This Space runs the production container: Express API plus the built React app on
one port. Without `ANTHROPIC_API_KEY` set as a Space secret, the advisor falls
back to an offline planner that uses the same tools and the same numbers in
simpler wording — nothing breaks.

### Not advice

Kosh is a planning and education tool. It isn't a SEBI-registered investment
adviser, doesn't recommend specific funds, stocks or insurers, and every
household in it is made up.
