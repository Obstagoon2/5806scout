# FRC Team 5806 Scouting App — Build Spec

## Overview
Build a web app (mobile + laptop responsive) for FRC Team 5806's scouting operations. Used by 12+ scouts simultaneously at competitions, plus one admin who oversees them. Built for the 2027 game season, but Match Scout should be a **configurable/generic template** (not hardcoded to one game's scoring elements) since the game changes every year.

## Tech Stack
- **Frontend:** React (Next.js recommended) — responsive for both phones/tablets (in-stands scouting) and laptops (pit/admin use)
- **Auth + Database:** Firebase (Firebase Authentication + Firestore)
- **Hosting:** Suggest a host that pairs well with Firebase (e.g., Firebase Hosting or Vercel) — pick whichever is simpler to wire up with Firebase Auth
- **External APIs:** The Blue Alliance (TBA) API, Statbotics API

Note: this app **requires a stable internet connection at all times** — no offline mode needs to be built. Assume scouts have reliable wifi/hotspot at events.

---

## 1. Auth (Login/Signup)
- Use Firebase Authentication (email/password).
- Signup form collects: email, password, full name, team number.
- Two roles: **Scout** and **Admin**. Admin is a separate account type/flag, not self-service — admin status should be set manually (e.g., via a Firestore field) rather than selectable at signup.
- Admin capabilities:
  - View/edit all scouts' submitted data
  - Approve new scout signups (or at least see a list of all registered scouts)
  - Manage scout accounts (activate/deactivate)
  - Receive and assign Talkie requests (see section 5)
- After successful login, route to the main app shell.

## 2. Main App Shell
Once logged in, show a clean, modern nav (tabs on desktop, bottom nav or hamburger on mobile) with 6 sections:
1. Pit Scout
2. Match Scout
3. Picklist
4. Talkie
5. Data
6. Game Manual Q&A (AI chatbot)

## 3. Pit Scout
One-time form filled out per team before/during an event, covering:
- Drivetrain type
- Robot weight
- Dimensions
- Autonomous capabilities/routines
- General robot capabilities/mechanisms (configurable list of checkboxes or short text fields)
- Notes field
- Photo upload of the robot
Keep this configurable/extensible so fields can be adjusted year to year without a rebuild (e.g., driven by a config file or admin-editable schema).

## 4. Match Scout
- **Configurable/generic template** — build this as a schema-driven form (e.g., a JSON/config object defining fields: autonomous period fields, teleop period fields, endgame fields, penalties, notes) rather than hardcoding 2027 game elements. This lets the team update it each January when the new game is released without a full rebuild.
- Include standard fields regardless of game: match number, team number, alliance color, scout name (auto-filled from logged-in user).
- Submissions write directly to Firestore in real time (no offline queue needed, per stable-connection assumption).

## 5. Talkie
A request/task tab, not a chat:
- Any scout can submit a request (free text + optional category) — this goes to the admin.
- Admin sees an inbox of incoming requests and can assign each one to a specific scout.
- Assigned scout sees their assigned tasks and can mark them complete.
- Basic status tracking: Open → Assigned → Complete.

## 6. Picklist
- Manual ranking tool for alliance selection.
- Show all scouted teams in a list/table alongside their data: Statbotics EPA, aggregated scouting stats (from Data tab), and pit scout summary.
- Scouts/admin can manually drag-and-drop to reorder the picklist and add notes per team.
- No auto-ranking algorithm needed — this is purely a manual tool with data displayed for reference.

## 7. Data
Combine both:
- **Raw view:** table of individual scouting submissions (filterable by team, match, scout).
- **Aggregated view:** per-team rollups/averages/graphs (e.g., average scoring per match, consistency, trends across matches) computed from Match Scout submissions.

## 8. Game Manual Q&A (AI Chatbot)
- Admin can upload the official game manual (PDF) once it's released each January.
- Parse and chunk the manual, generate embeddings, and store them in a vector store (e.g., a Firestore-backed vector solution, or a lightweight external vector DB like Pinecone/Supabase pgvector — pick whichever integrates most simply with the existing Firebase stack).
- Chat interface where any user (scout or admin) can ask natural-language questions about the rules (e.g., "how many points is climbing worth?" or "what's the penalty for a foul in the endgame?").
- Use retrieval-augmented generation (RAG): retrieve the most relevant manual chunks for the question, then send them + the question to an LLM (Claude via the Anthropic API) to generate an answer.
- Answers should cite the relevant rule/section number from the manual when possible, so scouts can double check.
- Keep a simple chat history per user session; no need for persistent multi-session chat memory unless easy to add.
- If no manual has been uploaded yet, show a friendly empty state prompting the admin to upload one.

## 9. External API Integration
- Add an "Event Code" input (e.g., on a settings/event page or during setup).
- When an event code is entered, auto-fetch and populate:
  - From **The Blue Alliance**: team list for the event, match schedule, match results
  - From **Statbotics**: EPA and other predictive stats for each team at that event
  Blue alliance read API Key: (stored in .env.local as TBA_API_KEY — not committed)
- Statbotics just requires the website: 
curl -X 'GET' \
  'https://api.statbotics.io/v3/' \
  -H 'accept: application/json'

## 10. Create Admin page
-- Create an option to make an admin account when I sign up 



## Build Approach
Please build this incrementally:
1. Firebase project setup + Auth (login/signup, role handling)
2. App shell + navigation
3. Pit Scout form + Firestore storage
4. Match Scout (schema-driven form) + Firestore storage
5. TBA + Statbotics integration (event code lookup)
6. Data tab (raw + aggregated views)
7. Picklist tab
8. Talkie tab
9. Game Manual Q&A chatbot (upload, embeddings/vector store, RAG chat interface)
10. Create the admin page


Ask me clarifying questions at each step if the 2027 game-specific Match Scout fields or exact data schema aren't clear yet — I'll fill those in once the game is revealed in January.
