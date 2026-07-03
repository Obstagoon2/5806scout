# FRC Scouting App

## Problem
FRC scouts (in the stands) and the team admin (coordinating strategy) currently rely on person-to-person communication — paper, spreadsheets, or verbal relay — to move scouting data during live matches. This is too slow for the pace of a match cycle and creates bottlenecks and transcription/relay errors, which degrades the quality of data available for alliance selection and in-match strategy.

## Evidence
- Assumption — needs validation via observed behavior at a live competition (specific incidents/timing not yet logged).

## Users
- **Primary**: Scouts (12+, in-stands, submitting live match/pit data via phone/tablet) and the team Admin (overseeing submissions, coordinating scouts, running picklist/strategy) — both experience the communication bottleneck directly and are treated as co-primary users.
- **Not for**: Teams outside FRC's scouting workflow (this is scoped to FRC-style pit/match scouting, not a general data-collection tool).

## Hypothesis
We believe **a real-time, schema-driven digital scouting app (replacing paper/spreadsheet relay with live Firestore submissions)** will **eliminate the person-to-person communication bottleneck during matches** for **scouts and the admin**.
We'll know we're right when **data submitted by a scout (pit or match) is visible to the admin and the rest of the team within seconds of submission**, replacing verbal/paper relay entirely.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Submission-to-visibility latency | Data visible to admin/team within ~5-10 seconds of scout submission | Manual timing check during a live event or simulated match cycle |
| Elimination of manual relay | Zero verbal/paper handoffs needed during matches | Observed team behavior at first live event using the app |

## Scope
**MVP** — Core real-time scouting loop: Auth (login/signup, scout/admin roles) + App Shell (navigation) + Pit Scout form + Match Scout (schema-driven form) + Data tab (raw + aggregated views). This validates that live data flows from scout submission to team-visible data without manual relay.

**Out of scope (for MVP; later milestones)**
- Picklist tab — deferred until core data flow is validated
- Talkie (request/task tab) — deferred until core data flow is validated
- Game Manual Q&A chatbot (RAG) — deferred; also blocked on game manual release
- Offline mode — explicitly excluded; app assumes stable internet connection at all times
- Robot photo upload (Pit Scout) — deferred 2026-07-02: Firebase Cloud Storage requires the Blaze billing plan on new projects; revisit when the team decides between Blaze + Cloud Storage vs. compressed data-URL photos in Firestore

**Scope addition — multi-team support**
- Originally scoped as single-team (5806) with multi-season support via schema-driven Match Scout. Now expanded to **multi-team**: other FRC teams should be able to use the same app for their own scouting, which requires team-scoped data, accounts, and event configuration (multi-tenant architecture) rather than a single hardcoded team. This is a meaningful scope increase from the original build spec and should be accounted for in the data model from the start (e.g., team ID as a partition key across Firestore collections) even though full multi-tenant admin tooling (e.g., team signup/onboarding flow) may land after the MVP.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Auth + App Shell | Scouts and admins can sign up, log in, and see role-appropriate navigation, scoped to a team | complete | — |
| 2 | Pit Scout | Scouts can submit a one-time pit form per team, admin-configurable fields, visible in real time | complete | — |
| 3 | Match Scout (schema-driven) | Scouts submit live match data via a configurable form; submissions are visible to the team within seconds | complete | — |
| 4 | Data tab | Raw (filterable) and aggregated (per-team rollup) views of scouting data are available to scouts/admin | complete | — |
| 5 | TBA + Statbotics integration | Event code lookup auto-populates team list, match schedule, results, and EPA stats | complete | Event tab; server proxy at /api/event/[eventKey]; needs TBA_API_KEY in .env.local |
| 6 | Picklist | Manual, drag-and-drop alliance-selection ranking tool with reference data | complete | Drag + arrow reorder, strike-through on pick; EPA + scouting rollups as reference |
| 7 | Talkie | Request/task inbox with assignment and status tracking between scouts and admin | complete | Real-time inbox, roster assignment, open/in-progress/done |
| 8 | Game Manual Q&A (RAG chatbot) | Admin uploads game manual; scouts/admin get cited natural-language rule answers | complete | Paste-text upload → Firestore chunks; keyword retrieval + Claude (needs ANTHROPIC_API_KEY) |
| 9 | Multi-team onboarding | Other FRC teams can create their own team workspace and use the app independently | complete | Team-scoped data everywhere; team name at signup; Team roster page with admin activate/deactivate |

## Open Questions
- [ ] What are the 2027 game's specific Match Scout fields (autonomous/teleop/endgame scoring elements, penalties)? — blocked on game reveal (January).
- [ ] Game manual content and structure for the RAG chatbot — blocked on game manual release (January).
- [ ] TBA API key registration process, and whether Statbotics requires a key — needs a walkthrough before milestone 5.
- [ ] Vector store choice for Game Manual Q&A (Firestore-backed vs. external like Pinecone/Supabase pgvector) — needs a decision before milestone 8.
- [ ] How much multi-team support changes the milestone 1-4 data model (team-scoped Firestore structure) vs. being purely additive later — needs a decision before implementation starts, since retrofitting team-scoping later is costly.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Multi-team scope increases MVP complexity beyond original single-team design | Medium | Medium | Bake team-scoped data model into milestone 1 (Auth + Shell) even if multi-team onboarding UI ships later |
| 2027 game specifics unknown until January | High | Low | Match Scout built schema-driven per original spec; field definitions filled in once game is revealed |
| No hard evidence yet that communication bottleneck is the true root cause | Medium | Medium | Validate assumption at first live event use; adjust success metric if a different bottleneck emerges |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
