// functions/api/analyze-project.js
//
// A CLOUDFLARE PAGES FUNCTION. File-based routing: this file handles
// requests to /api/analyze-project. See docs/PLAN.md for the full
// architecture rationale.
//
// WHY THIS EXISTS AS A BACKEND FUNCTION AND NOT A DIRECT CLIENT CALL: the
// Anthropic API key is a real, billable secret. It must never be embedded in
// public/app.js, where anyone viewing page source or the network tab could
// copy it and run up the project owner's bill. This function holds the key
// server-side (an environment variable, set in the Cloudflare dashboard --
// Pages project -> Settings -> Environment variables -- never committed to
// git) and is the ONLY thing that ever talks to the Anthropic API. The
// browser talks to this function instead.
//
// WHAT THIS FUNCTION DOES NOT DO: it never invents or reproduces copyrighted
// building-code text, and it never claims to know a specific county's local
// amendment. The prompt below explicitly constrains the model to name only
// well-established, broadly-stable MODEL code section numbers (IRC/IBC/NEC/
// IPC/IFGC) and to always point the user to codes.iccsafe.org -- ICC's real,
// free, public-access portal -- to read the actual current text their state
// has adopted. See docs/PLAN.md for why this is the only safe design here.

function jsonResponse(statusCode, bodyObj) {
  return new Response(JSON.stringify(bodyObj), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' }
  });
}

var ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
var MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB -- comfortably under Anthropic's own per-image limit

var SYSTEM_PROMPT = 'You are CodeSnap, a careful assistant for contractors and subcontractors who need to do residential/commercial work correctly and know what code governs it. You are looking at a photo from a real job site.\n\n'
  + 'Your job, in order:\n'
  + '1. Identify the specific trade and project type shown (e.g. "deck ledger board attachment," "electrical sub-panel", "bathroom exhaust vent termination", "stair stringer framing"). If the photo is unclear or could be several things, say so honestly and give your best read plus what would clarify it.\n'
  + '2. Give a detailed, correct, trade-appropriate explanation of how this specific work should be done properly -- fasteners, flashing, clearances, venting, GFCI/AFCI placement, load paths, whatever genuinely applies to what is shown. Be specific to what you actually see in the photo, not generic.\n'
  + '3. Name 1-3 relevant code citations using ONLY well-established, broadly-stable MODEL code section numbers and names -- IRC (International Residential Code), IBC (International Building Code), NEC (National Electrical Code), IPC (International Plumbing Code), IFGC (International Fuel Gas Code), or NFPA standards where relevant. Format each as "Code family + section number + plain-language section name" (e.g. "IRC R507.2 — Deck Ledger Connection to Band Joist"). Briefly explain what that section actually requires.\n'
  + '4. NEVER invent, guess, or reproduce a specific county or city\'s local amendment text. If local amendments commonly apply to this kind of work (they often do for decks, electrical, and egress), say so explicitly and tell the user their local amendment may be stricter or different.\n'
  + '5. Always close by telling the user to verify the exact, current, officially-adopted text for their own state at codes.iccsafe.org (ICC\'s real, free, public-access portal), and that local building department staff can confirm any local amendments on top of it.\n\n'
  + 'Never state a specific numeric clearance, fastener size, or load value as a certainty unless it is part of a real, well-known model code requirement you are confident about; when uncertain, say so plainly rather than guessing. This is guidance to help a contractor ask the right questions and check the right section -- it is not a substitute for a licensed inspector, a licensed engineer\'s sign-off, or the local building department\'s own determination, and you should make that plain in your answer.';

export async function onRequestPost(context) {
  var env = context.env;
  var apiKey = env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('analyze-project: ANTHROPIC_API_KEY not set in this Pages project’s environment variables.');
    return jsonResponse(501, { error: 'This tool is not configured yet.' });
  }

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  var imageBase64 = body && body.imageBase64;
  var mimeType = body && body.mimeType;
  var state = body && body.state;
  var county = body && body.county;
  var notes = (body && body.notes) || '';

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return jsonResponse(400, { error: 'No photo provided.' });
  }
  if (!mimeType || ALLOWED_IMAGE_TYPES.indexOf(mimeType) === -1) {
    return jsonResponse(400, { error: 'Unsupported image type. Please use JPEG, PNG, WEBP, or GIF.' });
  }
  // Base64 is ~4/3 the size of the raw bytes -- this is a generous, simple
  // server-side cap so an unexpectedly huge upload is rejected before it
  // reaches the Anthropic API and gets billed.
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    return jsonResponse(400, { error: 'This photo is too large. Please use a photo under 10MB.' });
  }
  if (!state || typeof state !== 'string') {
    return jsonResponse(400, { error: 'Please select a state.' });
  }

  var locationLine = 'Location: ' + state + (county ? (', ' + county + ' county/jurisdiction') : ' (county not specified)') + '.';
  var notesLine = notes.trim() ? ('Contractor’s note: ' + notes.trim()) : '';

  var anthropicRes;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: locationLine + (notesLine ? ('\n' + notesLine) : '') + '\n\nWhat is this, how should it be done correctly, and what code governs it?' }
          ]
        }]
      })
    });
  } catch (networkErr) {
    console.error('analyze-project: network error calling Anthropic:', networkErr);
    return jsonResponse(502, { error: 'Could not reach the analysis service.' });
  }

  if (!anthropicRes.ok) {
    var errText = '';
    try { errText = await anthropicRes.text(); } catch (e2) {}
    console.error('analyze-project: Anthropic returned status ' + anthropicRes.status + ': ' + errText);
    return jsonResponse(anthropicRes.status, { error: 'The analysis service could not process this photo.' });
  }

  var data = await anthropicRes.json();
  var analysisText = (data && data.content && data.content[0] && data.content[0].text) || '';
  if (!analysisText) {
    return jsonResponse(502, { error: 'The analysis service returned an empty response.' });
  }

  return jsonResponse(200, { analysis: analysisText });
}
