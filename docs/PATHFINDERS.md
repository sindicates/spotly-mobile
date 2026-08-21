# Pathfinders Challenge

Reference page for the competition Spotly is being submitted to.

**Source:** [stellic.com/pathfinders](https://www.stellic.com/pathfinders) — check the live page before relying on any date here. Last verified against that page on **13 Aug 2026**.

This file is the competition itself, plus how Spotly should lead on each judging criterion.

---

## What it is

The Pathfinders Challenge is a student build competition run by Stellic, a higher-ed software company founded by people who had trouble navigating college themselves. The prompt asks students to **"Create something that helps you navigate your college journey, and what comes after."**

Partners providing free tooling credits: **Lovable** (no-code app building from natural language) and **Claude** (API credits, usable via Claude Code or direct API). You pick which one you want at registration.

---

## Categories

Four. One entry per category is needed for the category prizes:

1. **Degree Planning & Discovery** — charting, changing, or understanding an academic path
2. **Overcoming Obstacles** — cost, paperwork, scheduling, requirements, general friction
3. **Campus Connection** — community, belonging, and how students find each other
4. **College to Career** — bridging graduation and what follows

**Spotly's category: Campus Connection.** It's a slight stretch — the category is written around students finding *each other*, and Spotly is about students finding *places*. The through-line worth making explicit in the write-up: the reviews and occupancy reports are students helping other students navigate shared physical campus life. Worth stating outright rather than leaving implied.

---

## Eligibility

- Enrolled student, 18 or older, at a college in the US, Canada, Mexico, or Australia
- Undergrad or grad; international students fine as long as the school is in one of those countries
- School does not need to be a Stellic customer
- Solo or teams up to three, and teammates can be from different schools
- Prize is split evenly across a winning team
- You can appear on up to three submissions but take home only one cash prize (the higher one)

### Build window — needs resolving

The project has to be **built during the challenge window, July 20 – Aug 21**. Open-source libraries, public APIs, and normal dev tools are fine, but the project itself must be new. FAQ on the live page: *"Can I submit something I already started? No."*

Spotly had setup, schema, and auth work done before this. Two options: scope the submission to what's genuinely built inside the window (the Expo rebuild, occupancy, semantic search, review carousel — which is most of the current product anyway), or email pathfinders@stellic.com to clarify before submitting. **Resolve this before spending more build time.** Stated response time is 2–3 business days.

---

## Timeline

From the live page. No time-of-day is published there — treat Aug 21 as a hard close and confirm on the page / in the terms before submitting.

| Date | Milestone |
| --- | --- |
| July 13 | Registration opened |
| July 20 | Submissions opened / build window starts |
| **Aug 21** | **Submissions close** |
| Early September | Finalists announced |
| Sept 23 | Top three present at Stellic Summit |

Summit is an annual gathering of Stellic's partner colleges. Press materials place the 2026 Summit in Philadelphia; the Pathfinders page itself does not name a city.

---

## What gets submitted

Five things:

- [ ] Title and category
- [ ] 500-word write-up — what you built, the problem, who it's for
- [ ] Two-minute demo video (YouTube, Vimeo, or Loom)
- [ ] A working link a judge can open — live URL, Figma, or GitHub
- [ ] A list of every tool used, AI included

### Judge access (Spotly-specific)

~~The `.edu` gate blocks every judge on a `stellic.com` address, and weakening the gate would undercut the feature the pitch leads with. Ship a pre-made, already-onboarded test account alongside the link. Decide before recording the demo video — the video is the fallback if a judge never gets in.~~ **Superseded 2026-08-21:** the sign-in screen provides an "I'm a judge" button that creates a temporary anonymous Supabase session, skips onboarding, and enables authenticated features. It does not weaken the `case.edu` requirement for students or share one judge account between evaluators. See [authentication](features/authentication.md).

---

## Judging

Five criteria, **weighted equally**:

1. Does it solve a real student problem
2. Is it original
3. How much it could help students if it scaled
4. Design and experience
5. How well it's built

AI tools are explicitly encouraged — just list them. Judges are stated to care about student impact rather than technical sophistication, so a non-coder's Lovable build competes on even footing.

### What to lead with in the write-up

This decides emphasis in the 500-word write-up. It does not add scope.

**1. Solves a real student problem** — strongest section. Lead with occupancy: it answers a question no existing tool answers, and the pain is immediate and physical. Support with semantic search and amenity filters.

**2. Originality** — lead with the search index being built from student writing rather than official metadata. Support with crowdsourced live occupancy and the verified-but-anonymous model, which most review products can't hold simultaneously.

**3. Scale potential** — the criterion needing the most deliberate work, since it's least visible in a two-minute demo. Lead with the compounding-data argument: check-ins feed busy-time prediction, reviews densify the embedding space, so adoption improves the product rather than just enlarging it. Support with the `.edu` gate replicating per campus.

**4. Design and experience** — lead with cards-where-earned and honest empty states. Support with mobile-first-not-mobile-adapted and passwordless entry.

**5. How well it's built** — lead with the moderation path shipping in v1 rather than after; unmoderated anonymous review is the obvious hole a judge would probe. Support with rate limiting, decay logic, and a schema that carries every roadmap item without migration.

---

## Prizes

$12,000 total pool.

| Placement | Prize |
| --- | --- |
| Grand prize | $5,000 + a 90-minute career conversation with Stellic leadership |
| Finalists (×2) | $2,500 each |
| Category winners (×4) | $500 + a feature across Stellic's channels |
| Top ~15% | Honorable mention |
| Every qualifying entry | Digital badge for your portfolio |

Finalists each send one delegate to present at Summit on Sept 23; travel and lodging are covered. Conflicts should be flagged early. Stellic says they will help with justification to attend if needed.

---

## Other notes

- **You keep ownership of the idea.** Entering grants Stellic permission to feature the work and learn from it. Full terms are linked at registration and worth reading before building.
- Questions go to pathfinders@stellic.com or the Pathfinders Discord; stated response time is 2–3 business days.

---

## Links

- [Competition page](https://www.stellic.com/pathfinders)
- Official terms — linked at registration, not published as a standalone URL on the Pathfinders page. Read them before submitting.
