# Supabase Setup (sign-in + saved job history)

CodeSnap's v2 "My Jobs" feature (sign in, save and revisit past analyses)
needs its own Supabase project — separate from any other app's Supabase
project. Supabase is free for this scale of usage.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in or create an account.
2. Click **New Project**. Pick any name (e.g. "codesnap") and a strong
   database password (you won't need to type this password day-to-day —
   Supabase manages the connection for you).
3. Wait a minute or two for the project to finish provisioning.

## 2. Run the schema

1. In your new project, go to **SQL Editor** → **New query**.
2. Paste the entire contents of this repo's `supabase/job_history_schema.sql`
   and click **Run**.

## 3. Turn on email magic-link sign-in

1. Go to **Authentication → Providers**, and confirm **Email** is enabled
   (it is by default).
2. Go to **Authentication → URL Configuration**, and add your real deployed
   site URL (e.g. `https://codesnap.pages.dev`, or your custom domain once
   you have one) to **Redirect URLs** — this step matters: Circle Squared hit
   a real bug once where a magic link silently failed because its custom
   domain wasn't in this list. Add both the `.pages.dev` URL and any custom
   domain you plan to use.

## 4. Get your API credentials and wire them in

1. Go to **Settings → API**.
2. Copy the **Project URL** and the **anon / public key** (NOT the
   `service_role` key — that one must never go in client-side code).
3. Open `public/supabase-config.js` in this repo and fill in the two
   placeholder constants:
   ```js
   var SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE';
   var SUPABASE_KEY = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';
   ```
   The anon/public key is safe to put in client-side code — it's designed for
   this, and every write it allows is still enforced by the Row Level
   Security policies in `job_history_schema.sql`.
4. Commit and push, and Cloudflare Pages will redeploy automatically.

Once this is done, visitors can tap **Sign In** to get a magic link, and any
analysis they run while signed in is saved automatically to **My Jobs**.
