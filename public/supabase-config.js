// CodeSnap's own Supabase project credentials -- see docs/SUPABASE_SETUP.md
// for how to create this project and fill these in. The anon/public key is
// safe to expose client-side by design; every write it allows is still
// enforced by the Row Level Security policies in
// supabase/job_history_schema.sql, same discipline Circle Squared uses.
//
// Until these are filled in, sign-in and My Jobs are simply unavailable --
// the rest of the app (photo analysis) keeps working normally either way.
var SUPABASE_URL = '';
var SUPABASE_KEY = '';
