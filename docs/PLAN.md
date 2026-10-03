# CodeSnap — Project Plan

## The idea

A contractor or sub on a job site snaps a photo of what they're building (a deck
ledger connection, an electrical panel, a stair stringer, a bathroom vent run —
anything), tells the app their state and county, and gets back:

1. A plain-language explanation of how to do that specific thing correctly.
2. The specific building/electrical/plumbing code section that actually
   governs it, with a link to read the real, current, officially adopted text
   for that state.

## The hard constraint this whole app is built around

Building codes are not a clean, free, machine-readable dataset. In nearly
every U.S. state, the actual enforced code is a **model code** — the
International Residential Code (IRC), International Building Code (IBC), the
National Electrical Code (NEC), the International Plumbing Code (IPC), etc.,
published by the International Code Council (ICC) or NFPA — adopted by the
state, almost always with **local amendments** layered on top at the county or
city level. The model codes are copyrighted. Local amendments exist, if at
all, as PDFs scattered across thousands of individual county/city government
sites, not a single clean database.

That means this app can **never** safely claim to show "the exact current law
for Wake County, NC" by reproducing invented or remembered text — getting that
wrong isn't a cosmetic bug, it's a contractor failing an inspection, or worse,
building something unsafe on bad advice.

**The decision this app is built on (confirmed with the project owner):**
CodeSnap cites the specific, well-established *model code* section that
nationally governs the kind of work shown (e.g. "IRC Section R311.7 —
Stairways," "NEC Article 210.8 — GFCI Protection") — numbers and section
names that are stable across most adopted editions — and always links the
contractor to **codes.iccsafe.org**, ICC's own real, free, public-access
portal where anyone can read the actual current code text their state has
adopted, including local amendments where the state has filed them. CodeSnap
never invents or reproduces copyrighted code text itself, and never claims to
know a specific county's local amendment unless that amendment is genuinely
well-known and stable (and even then, flagged as "verify locally").

Every single result the app shows carries a plain disclaimer: this is
guidance to help you ask the right questions and check the right section, not
a substitute for your local building department, a licensed inspector, or a
licensed engineer/electrician's own sign-off.

## MVP scope (v1)

- **Input:** a photo (phone camera or file upload), the user's state (dropdown,
  all 50 states + DC) and county/jurisdiction (free-text), and an optional
  short note describing what they're doing.
- **Analysis:** Claude's own vision (via the Anthropic API) looks at the photo,
  identifies the likely project/trade category, and generates:
  - A detailed, correct, trade-appropriate description of how to do that work
    properly (framing, fasteners, clearances, venting, GFCI placement,
    whatever applies).
  - 1–3 relevant model code citations (code family + section number + plain
    name, e.g. "IRC R507.2 — Deck Ledger Connection") with a short explanation
    of what that section actually requires.
  - A link to codes.iccsafe.org so the contractor can read the real, current,
    state-adopted text themselves.
  - The standing disclaimer.
- **No accounts in v1.** Every analysis is a one-off — nothing saved
  server-side yet. (A "save my past jobs" account layer is a natural v2 if
  this proves useful, same pattern as Circle Squared's Family Contacts.)
- **Photo only in v1, not video.** Video means frame extraction and a bigger
  pipeline; starting with a single photo keeps the MVP buildable and testable
  quickly. Video capture is a clearly-scoped v2 feature, not dropped, just
  sequenced after the photo path is proven.

## Architecture (same pattern as Circle Squared's ElevenLabs integration and Cadence)

- **Frontend:** plain HTML/CSS/JS (`public/index.html`, `public/style.css`,
  `public/app.js`), deployed as a Cloudflare Pages static site. No framework
  needed for v1.
- **Backend:** a single Cloudflare Pages Function, `functions/api/analyze-project.js`,
  which holds the real Anthropic API key server-side (`ANTHROPIC_API_KEY`,
  set in the Cloudflare dashboard, never committed to this repo) and is the
  only thing that ever calls the Anthropic API. The browser never sees the
  key — same discipline as Circle Squared's `elevenlabs-tts.js`.
- **Why a real backend call, not a client-side API key:** the Anthropic API
  key is a billable secret. Same reasoning as the ElevenLabs integration: a
  key embedded in client-side code can be copied from the network tab and
  used to run up the project owner's bill.

## Explicit non-goals for v1

- Not a permit-filing tool.
- Not a replacement for an inspector or licensed engineer's sign-off.
- Not a guarantee of exact local-amendment text — only a correct pointer to
  where to go read it for real.
- Not video analysis yet.
- Not multi-user accounts/history yet.
