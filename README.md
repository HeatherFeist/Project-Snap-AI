# CodeSnap

Snap a photo of what you're building. Tell it your state (and optionally your
county). Get back guidance on how to do the work correctly, and the specific
code section that governs it — with a link to read the real, current,
officially-adopted text for your state at [codes.iccsafe.org](https://codes.iccsafe.org/).

See [`docs/PLAN.md`](docs/PLAN.md) for the full design rationale, especially
**why this app never invents or reproduces copyrighted code text** — that
constraint shapes everything else about how it works.

## Stack

- Static frontend: `public/index.html`, `public/style.css`, `public/app.js`, `public/states.js`
- Backend: a single Cloudflare Pages Function, `functions/api/analyze-project.js`,
  which holds the real Anthropic API key server-side and is the only thing
  that calls the Anthropic API. The browser never sees the key.

## Running locally / deploying

This is built for Cloudflare Pages (same pattern as Circle Squared's
ElevenLabs integration):

1. Push this repo to GitHub and connect it to a new Cloudflare Pages project,
   with `public` as the build output directory (no build step needed for v1 —
   it's plain static files).
2. In the Cloudflare Pages project's **Settings → Environment variables**,
   add `ANTHROPIC_API_KEY` with a real Anthropic API key. Never commit this
   key to the repo.
3. Deploy. `/api/analyze-project` will be served automatically from
   `functions/api/analyze-project.js` (Cloudflare Pages' file-based Functions
   routing).

## What this app deliberately does NOT do

- It does not reproduce copyrighted model-code text, and it never invents a
  specific county's local amendment.
- It is not a substitute for a licensed inspector, a licensed engineer or
  electrician's sign-off, or your local building department's own
  determination.
- v1 handles a single photo per analysis — no video yet, no saved history/
  accounts yet. See `docs/PLAN.md`'s "Explicit non-goals for v1."
