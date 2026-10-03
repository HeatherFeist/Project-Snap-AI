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
  } catch (err) {
    document.getElementById('error-message').textContent = (err && err.message) || 'Something went wrong. Please try again.';
    showScreen('error');
  } finally {
    analyzeBtn.disabled = false;
  }
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

document.addEventListener('DOMContentLoaded', function() {
  populateStates();

  document.getElementById('photo-drop').addEventListener('click', function() {
    document.getElementById('photo-input').click();
  });
  document.getElementById('photo-input').addEventListener('change', function(e) {
    handlePhotoSelected(e.target.files[0]);
  });
  document.getElementById('analyze-btn').addEventListener('click', analyzePhoto);
  document.getElementById('back-btn').addEventListener('click', resetIntake);
  document.getElementById('error-back-btn').addEventListener('click', resetIntake);
});
