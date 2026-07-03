# FRC Team 5806 Scouting App — Update Spec (v2)

This is a set of changes to the existing scouting app (Firebase Auth + Firestore, Next.js, TBA + Statbotics integration, tabs: Pit Scout, Match Scout, Picklist, Talkie, Data, Game Manual Q&A). Apply these four fixes/additions to the current codebase.

---

## 1. Admin Signup with Secret Code

Currently only scouts can sign up. Add the option to create an admin account directly from the sign-in/signup page.

- On the signup form, add a toggle or checkbox: "Sign up as Admin."
- If selected, show an additional required field: **Admin Code**.
- The correct admin code should be stored server-side only (e.g., as an environment variable like `ADMIN_SIGNUP_CODE`, checked in a Cloud Function or server-side API route — never compare it client-side, since that would expose the code in the JS bundle).
- If the entered code doesn't match, block account creation and show an error ("Invalid admin code").
- If it matches, create the Firebase user as normal and set their Firestore role field to `admin` instead of `scout`.
- Regular scout signup (name, team number, email, password) stays exactly as it is — this just adds a parallel path for admin accounts.

## 2. Game Manual Q&A — Remove Upload Step

Previously spec'd as "admin uploads the manual." Change this:

- Remove the admin upload UI entirely from the Game Manual Q&A tab.
- Instead, I (the developer) will tell Claude Code which file to use for the manual directly in our conversation/session — Claude Code should read that file from disk, chunk it, generate embeddings, and load it into the vector store as part of the build/setup process.
- The chat interface itself (ask a question → RAG retrieval → Claude API answer with citations) stays the same as previously spec'd — only the ingestion method changes, from in-app upload to a one-time build-time/setup-time ingestion step that Claude Code runs directly.
- **Model choice:** use a small, fast, cheap model for the actual Q&A responses rather than a top-tier model — this is a simple retrieval + answer task on a single manual, not complex reasoning, and keeping cost/latency low matters more here. Use Claude Haiku (model string `claude-haiku-4-5-20251001`) via the Anthropic API for this tab. Keep the model string in a single config/env variable so it's easy to swap later if needed.

## 3. Fix Event Tab — TBA API Key Not Configured

Current bug: the Event tab throws `TBA_API_KEY is not configured. Get a read key at thebluealliance.com/account and add it to .env.local.`

Please walk me through, step by step, exactly how to fix this:
1. Confirm the exact URL/page on thebluealliance.com where I generate a **Read API Key** (not the write key).
2. Tell me exactly what to name the environment variable in `.env.local` (matching whatever the code currently expects — check the codebase for the exact variable name being referenced, likely `TBA_API_KEY`).
3. Show me the exact line(s) to add to `.env.local`, e.g.:
   ```
   TBA_API_KEY=your_key_here
   ```
4. Confirm whether this needs to be prefixed (e.g., `NEXT_PUBLIC_TBA_API_KEY`) depending on whether the key is used in a server-side API route (preferred, so the key isn't exposed to the browser) or client-side code. If it's currently being called client-side, refactor it to go through a server-side API route instead so the key stays private.
5. Confirm I need to restart the dev server after adding the env variable.
6. Verify the fix by testing an actual event code lookup end-to-end and confirming team list/match data populates correctly.

## 4. Talkie Tab Fixes

Update the Talkie tab with the following rules:

- **Assignment permission:** Only admin accounts can assign a request to a scout. Regular scouts can submit requests but cannot assign them (to themselves or anyone else) — assignment is an admin-only action.
- **Mark as Done button:** Add a "Mark as Done" button visible to both the admin and the assigned scout. Either party clicking it immediately marks the request as Done/Closed (no dual-confirmation needed).
- **Click-to-expand results:** Make each request clickable/expandable. When clicked, show a text box where a result/update can be written (e.g., what was found, what was done). This results text box should be **visible and editable by all scouts and the admin** — not restricted to just the assignee.
- Updated status flow: Open → Assigned (admin only) → Done (either side) — with the results text box available at any point in that flow, not just at the end.

## 5. Pit Scout — Add Full Question Set

Add the following questions to the Pit Scout form, in this exact order, positioned **before** the existing general Notes box. Keep them grouped under two clear headers as shown.

### Before talking to anyone:
- Is it a KitBot?
- Does the robot look durable?
- Is the team working on repairing / attaching something? If so, what is that piece?
- What is the most advanced piece of machinery in their pit?

### Questions to ask a team rep:
*(Note in the UI: "Please make sure they answer ALL parts of these questions")*
- What is your drivetrain?
- What is your max capacity?
- How fast is your cycle? (it's ok if they don't know)
- What is your BPS (balls per second)?
- How do you rank your intake, indexer, and shooter speed? (super fast / fast / average / slow / very slow)
  - Intake:
  - Indexer:
  - Shooter:
- Have you had ANY jams? If so, where? (including getting stuck on ramp or trench)
- Does your driver feel comfortable playing defense?
- What is your auton path, and about how many balls do you score?
- Do you have a turret or a fixed shooter? (if fixed, how many shooters at once?)
- Do you use code-assisted (AprilTag alignment) or driver-based (no AprilTag alignment) aiming?
- What is your team's ideal role / specialization? (shooter, passer, defensive bot)
- What is the most advanced piece of machinery you used this season?
- What problems have you encountered with either hardware or software? Please be specific.
- What features set your robot apart?
- Last question: if you could start over and change one thing about your robot, what would it be and why?

Implementation notes:
- The "rank intake/indexer/shooter speed" question should render as three separate dropdown/select fields (Intake, Indexer, Shooter), each with the five options listed.
- All other questions can be free-text fields, except naturally boolean ones (KitBot?, durable?, defense-comfortable?, any jams?, turret or fixed?) which should use appropriate short-answer/select inputs rather than free text where it makes sense — but keep it simple and don't over-engineer; free text is fine as a fallback.
- Keep this section clearly separated visually from the general Notes box that follows it.

---

## Build Approach
Please apply these four fixes incrementally and confirm each works before moving to the next:
1. Admin signup with secret code (server-side validated)
2. Remove Game Manual upload flow; set up direct file ingestion for the manual I provide
3. Fix TBA API key configuration and verify Event tab works end-to-end
4. Talkie tab logic (admin-only assignment, Mark as Done, click-to-expand results box)
5. Pit Scout question set addition

Ask me clarifying questions if anything about the current codebase structure isn't clear.
