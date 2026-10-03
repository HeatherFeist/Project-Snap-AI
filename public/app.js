// CodeSnap -- client-side app logic. No API keys live here; all analysis
// calls go through /api/analyze-project (functions/api/analyze-project.js),
// which holds the real Anthropic API key server-side. See docs/PLAN.md.

var MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB, matches the backend's own cap

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function(el) { el.classList.remove('active'); });
  var target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
}

function populateStates() {
  var select = document.getElementById('state-select');
  US_STATES.forEach(function(state) {
    var opt = document.createElement('option');
    opt.value = state;
    opt.textContent = state;
    select.appendChild(opt);
  });
}

// Reads a File into a {base64, mimeType} pair, stripping the data-URL prefix
// (the backend expects raw base64 only, matching the Anthropic API's own
// image source format).
function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var result = reader.result; // "data:image/jpeg;base64,/9j/4AAQ..."
      var commaIdx = result.indexOf(',');
      resolve(result.slice(commaIdx + 1));
    };
    reader.onerror = function() { reject(new Error('Could not read the selected photo.')); };
    reader.readAsDataURL(file);
  });
}

var _selectedFile = null;
var _selectedPreviewUrl = null;

function handlePhotoSelected(file) {
  if (!file) return;
  if (file.size > MAX_PHOTO_BYTES) {
    setIntakeStatus('That photo is too large (max 10MB). Please choose a smaller one.');
    return;
  }
  _selectedFile = file;
  if (_selectedPreviewUrl) URL.revokeObjectURL(_selectedPreviewUrl);
  _selectedPreviewUrl = URL.createObjectURL(file);

  var img = document.getElementById('photo-preview');
  var placeholder = document.getElementById('photo-placeholder');
  img.src = _selectedPreviewUrl;
  img.style.display = 'block';
  placeholder.style.display = 'none';
  setIntakeStatus('');
}

function setIntakeStatus(msg) {
  document.getElementById('intake-status').textContent = msg || '';
}

// Renders the analysis text with minimal, safe formatting: lines starting
// with a recognizable heading-ish pattern get bolded, everything else is
// plain text. Deliberately simple -- no markdown library needed for v1, and
// textContent-based escaping keeps this safe against anything odd the model
// might emit.
function renderAnalysis(container, text) {
  container.innerHTML = '';
  var lines = text.split('\n');
  lines.forEach(function(line) {
    var p = document.createElement('p');
    var trimmed = line.trim();
    // A short, all-non-lowercase-ish line or one ending in ':' reads as a
    // section heading in the model's own output style -- bold it.
    if (trimmed && trimmed.length < 60 && (trimmed.endsWith(':') || /^[A-Z0-9][A-Z0-9 \-—:]*$/.test(trimmed))) {
      var strong = document.createElement('strong');
      strong.textContent = trimmed;
      p.appendChild(strong);
    } else {
      p.textContent = line;
    }
    container.appendChild(p);
  });
}

async function analyzePhoto() {
  if (!_selectedFile) {
    setIntakeStatus('Please choose or take a photo first.');
    return;
  }
  var state = document.getElementById('state-select').value;
  if (!state) {
    setIntakeStatus('Please select a state.');
    return;
  }
  var county = document.getElementById('county-input').value.trim();
  var notes = document.getElementById('notes-input').value.trim();

  var analyzeBtn = document.getElementById('analyze-btn');
  analyzeBtn.disabled = true;
  showScreen('loading');

  try {
    var base64 = await fileToBase64(_selectedFile);
    var res = await fetch('/api/analyze-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: _selectedFile.type,
        state: state,
        county: county,
        notes: notes
      })
    });
    var data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.error) || 'Could not analyze this photo.');
    }

    document.getElementById('result-photo').src = _selectedPreviewUrl;
    document.getElementById('result-meta').textContent = state + (county ? (', ' + county) : '');
    renderAnalysis(document.getElementById('result-content'), data.analysis);
    showScreen('result');

    var saveStatusEl = document.getElementById('result-save-status');
    var session = authGetSession();
    if (session && session.access_token) {
      saveStatusEl.textContent = 'Saving to your job history…';
      saveJobToHistory({ state: state, county: county, notes: notes, analysis_text: data.analysis })
        .then(function() { saveStatusEl.textContent = '✓ Saved to My Jobs'; })
        .catch(function(err) { saveStatusEl.textContent = 'Could not save to your job history: ' + ((err && err.message) || 'unknown error'); });
    } else {
      saveStatusEl.textContent = '';
    }
  } catch (err) {
    document.getElementById('error-message').textContent = (err && err.message) || 'Something went wrong. Please try again.';
    showScreen('error');
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ===========================
// AUTH -- Supabase magic-link sign-in. See docs/SUPABASE_SETUP.md. Mirrors
// Circle Squared's own magic-link pattern (SUB_SESSION_KEY / subGetSession
// etc.), renamed here since CodeSnap has no subscription concept -- this is
// just "are you signed in or not," gating My Jobs, not any paid feature.
// ===========================
var AUTH_SESSION_KEY = 'codesnap_session';

function isSupabaseConfigured() {
  return !!(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL && typeof SUPABASE_KEY !== 'undefined' && SUPABASE_KEY);
}

function authGetSession() {
  try {
    var raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function authSetSession(session) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function authSignOut() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function authSendMagicLink(email) {
  if (!isSupabaseConfigured()) return Promise.reject(new Error('Sign-in is not configured yet.'));
  return fetch(SUPABASE_URL + '/auth/v1/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email: email, create_user: true })
  }).then(function(res) {
    if (!res.ok) throw new Error('Could not send magic link. Please check the email address and try again.');
  });
}

// Parses '#access_token=...&...' out of the URL after a magic-link redirect
// and stores the session. No-op (resolves to false) if the hash isn't a
// Supabase auth redirect, so this is always safe to call on every page load.
function handleMagicLinkRedirect() {
  if (window.location.hash.indexOf('access_token=') === -1) return false;
  var params = new URLSearchParams(window.location.hash.slice(1));
  var accessToken = params.get('access_token');
  if (!accessToken) return false;
  // The JWT's payload (middle segment) carries the signed-in user's id and
  // email -- decoded here purely to display/key by them client-side; the
  // server-side RLS policies are what actually enforce access, not this.
  var payload = {};
  try { payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) {}
  authSetSession({ access_token: accessToken, user_id: payload.sub, email: payload.email });
  window.history.replaceState(null, '', window.location.pathname);
  return true;
}

function refreshAccountBar() {
  var session = authGetSession();
  var signinLink = document.getElementById('signin-link');
  var signedinPanel = document.getElementById('signedin-panel');
  var signinNudge = document.getElementById('signin-nudge');
  if (session && session.access_token) {
    signinLink.style.display = 'none';
    signedinPanel.style.display = 'inline';
    document.getElementById('account-email').textContent = session.email || '';
    if (signinNudge) signinNudge.style.display = 'none';
  } else {
    signinLink.style.display = 'inline';
    signedinPanel.style.display = 'none';
    if (signinNudge) signinNudge.style.display = 'block';
  }
}

// ===========================
// JOB HISTORY -- signed-in users only, enforced server-side by the Row
// Level Security policies in supabase/job_history_schema.sql, not just this
// client-side check.
// ===========================
function fetchJobHistory() {
  var session = authGetSession();
  if (!session || !session.access_token) return Promise.reject(new Error('Please sign in first.'));
  return fetch(SUPABASE_URL + '/rest/v1/job_history?select=id,state,county,notes,analysis_text,created_at&order=created_at.desc', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token }
  }).then(function(res) {
    if (!res.ok) throw new Error('Could not load your job history (status ' + res.status + ').');
    return res.json();
  });
}

function saveJobToHistory(job) {
  var session = authGetSession();
  if (!session || !session.access_token) return Promise.reject(new Error('Please sign in first.'));
  return fetch(SUPABASE_URL + '/rest/v1/job_history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      user_id: session.user_id,
      state: job.state,
      county: job.county || null,
      notes: job.notes || null,
      analysis_text: job.analysis_text
    })
  }).then(function(res) {
    if (!res.ok) throw new Error('Could not save this job (status ' + res.status + ').');
  });
}

function deleteJobFromHistory(id) {
  var session = authGetSession();
  if (!session || !session.access_token) return Promise.reject(new Error('Please sign in first.'));
  return fetch(SUPABASE_URL + '/rest/v1/job_history?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token }
  }).then(function(res) {
    if (!res.ok) throw new Error('Could not delete this job (status ' + res.status + ').');
  });
}

var _jobsCache = [];

function loadJobsList() {
  var statusEl = document.getElementById('jobs-status');
  var listEl = document.getElementById('jobs-list');
  var emptyEl = document.getElementById('jobs-empty');
  statusEl.textContent = 'Loading your jobs…';
  listEl.innerHTML = '';
  emptyEl.style.display = 'none';

  fetchJobHistory().then(function(jobs) {
    statusEl.textContent = '';
    _jobsCache = jobs;
    if (!jobs.length) { emptyEl.style.display = 'block'; return; }
    listEl.innerHTML = jobs.map(function(j) {
      var dateStr = new Date(j.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      var snippet = j.analysis_text.split('\n')[0];
      return '<div class="job-row" data-job-id="' + j.id + '">'
        + '<div class="job-row-main">'
        + '<div class="job-row-location">' + escapeHtml(j.state) + (j.county ? (', ' + escapeHtml(j.county)) : '') + '</div>'
        + '<div class="job-row-date">' + dateStr + '</div>'
        + '<div class="job-row-snippet">' + escapeHtml(snippet) + '</div>'
        + '</div></div>';
    }).join('');
  }).catch(function(err) {
    statusEl.textContent = (err && err.message) || 'Could not load your job history.';
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var _currentJobDetailId = null;

function openJobDetail(id) {
  var job = _jobsCache.filter(function(j) { return j.id === id; })[0];
  if (!job) return;
  _currentJobDetailId = id;
  document.getElementById('job-detail-meta').textContent = job.state + (job.county ? (', ' + job.county) : '');
  renderAnalysis(document.getElementById('job-detail-content'), job.analysis_text);
  showScreen('job-detail');
}

function resetIntake() {
  _selectedFile = null;
  if (_selectedPreviewUrl) { URL.revokeObjectURL(_selectedPreviewUrl); _selectedPreviewUrl = null; }
  document.getElementById('photo-preview').style.display = 'none';
  document.getElementById('photo-placeholder').style.display = 'flex';
  document.getElementById('photo-input').value = '';
  setIntakeStatus('');
  showScreen('intake');
}

function goToSigninScreen() {
  var session = authGetSession();
  var outPanel = document.getElementById('signin-out-panel');
  var inPanel = document.getElementById('signin-in-panel');
  if (session && session.access_token) {
    outPanel.style.display = 'none';
    inPanel.style.display = 'block';
    document.getElementById('signin-in-email').textContent = session.email || '';
  } else {
    outPanel.style.display = 'block';
    inPanel.style.display = 'none';
    document.getElementById('signin-status').textContent = isSupabaseConfigured() ? '' : 'Sign-in is not configured yet.';
    document.getElementById('signin-send-btn').disabled = !isSupabaseConfigured();
  }
  showScreen('signin');
}

document.addEventListener('DOMContentLoaded', function() {
  populateStates();
  handleMagicLinkRedirect();
  refreshAccountBar();

  document.getElementById('photo-drop').addEventListener('click', function() {
    document.getElementById('photo-input').click();
  });
  document.getElementById('photo-input').addEventListener('change', function(e) {
    handlePhotoSelected(e.target.files[0]);
  });
  document.getElementById('analyze-btn').addEventListener('click', analyzePhoto);
  document.getElementById('back-btn').addEventListener('click', resetIntake);
  document.getElementById('error-back-btn').addEventListener('click', resetIntake);

  // Account bar + sign-in screen
  document.getElementById('signin-link').addEventListener('click', function(e) { e.preventDefault(); goToSigninScreen(); });
  document.getElementById('signin-nudge-link').addEventListener('click', function(e) { e.preventDefault(); goToSigninScreen(); });
  document.getElementById('signin-back-btn').addEventListener('click', resetIntake);
  document.getElementById('signout-link').addEventListener('click', function(e) {
    e.preventDefault();
    authSignOut();
    refreshAccountBar();
    resetIntake();
  });
  document.getElementById('signin-send-btn').addEventListener('click', function() {
    var email = document.getElementById('signin-email-input').value.trim();
    var statusEl = document.getElementById('signin-status');
    if (!email || email.indexOf('@') === -1) { statusEl.textContent = 'Please enter a valid email address.'; return; }
    statusEl.textContent = 'Sending magic link…';
    authSendMagicLink(email).then(function() {
      statusEl.textContent = 'Check your email for a sign-in link.';
    }).catch(function(err) {
      statusEl.textContent = (err && err.message) || 'Could not send magic link.';
    });
  });
  document.getElementById('go-to-jobs-btn').addEventListener('click', function() {
    showScreen('jobs');
    loadJobsList();
  });

  // My Jobs screen
  document.getElementById('my-jobs-link').addEventListener('click', function(e) {
    e.preventDefault();
    showScreen('jobs');
    loadJobsList();
  });
  document.getElementById('jobs-back-btn').addEventListener('click', resetIntake);
  document.getElementById('jobs-list').addEventListener('click', function(e) {
    var row = e.target.closest('.job-row');
    if (row) openJobDetail(row.getAttribute('data-job-id'));
  });

  // Job detail screen
  document.getElementById('job-detail-back-btn').addEventListener('click', function() {
    showScreen('jobs');
    loadJobsList();
  });
  document.getElementById('job-detail-delete-btn').addEventListener('click', function() {
    if (!_currentJobDetailId) return;
    if (!confirm('Delete this saved job? This cannot be undone.')) return;
    var btn = document.getElementById('job-detail-delete-btn');
    btn.disabled = true;
    deleteJobFromHistory(_currentJobDetailId).then(function() {
      showScreen('jobs');
      loadJobsList();
    }).catch(function(err) {
      alert((err && err.message) || 'Could not delete this job.');
      btn.disabled = false;
    });
  });
});
