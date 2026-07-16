// Shared class passcode. NOTE: this check happens in the browser only,
// so it is a light gate for a friendly class board — not real security.
const CLASS_PASSCODE = 'gobears2026';

const API = '/api/profiles';

// --- Passcode gate ---
const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateForm = document.getElementById('gate-form');
const gateError = document.getElementById('gate-error');

function unlock() {
  gate.hidden = true;
  app.hidden = false;
  loadProfiles();
}

// Stay unlocked for the session so a refresh doesn't re-prompt.
if (sessionStorage.getItem('unlocked') === 'yes') {
  unlock();
}

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = document.getElementById('passcode').value.trim();
  if (value === CLASS_PASSCODE) {
    sessionStorage.setItem('unlocked', 'yes');
    unlock();
  } else {
    gateError.hidden = false;
  }
});

// --- Profile form ---
const form = document.getElementById('profile-form');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const file = document.getElementById('photo').files[0];
    const photo = file ? await fileToResizedDataUrl(file) : null;

    const payload = {
      firstName: document.getElementById('firstName').value.trim(),
      major: document.getElementById('major').value.trim(),
      year: document.getElementById('year').value,
      region: document.getElementById('region').value.trim(),
      photo,
    };

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not save your card.');
    }

    form.reset();
    await loadProfiles();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add my card';
  }
});

// Resize/compress the chosen image to keep uploads small (max 512px, JPEG).
function fileToResizedDataUrl(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Board rendering ---
const board = document.getElementById('board');

async function loadProfiles() {
  try {
    const res = await fetch(API);
    const profiles = await res.json();
    renderBoard(profiles);
  } catch {
    board.innerHTML = '<p class="empty">Could not load profiles.</p>';
  }
}

function renderBoard(profiles) {
  if (!profiles.length) {
    board.innerHTML = '<p class="empty">No cards yet — be the first!</p>';
    return;
  }
  board.innerHTML = profiles.map(cardHtml).join('');
}

function cardHtml(p) {
  const avatar = p.photoUrl
    ? `<img class="avatar" src="${p.photoUrl}" alt="${esc(p.firstName)}" loading="lazy" />`
    : `<div class="avatar" style="background:${colorFor(p.firstName)}">${initial(p.firstName)}</div>`;

  return `
    <article class="profile">
      ${avatar}
      <h3>${esc(p.firstName)}</h3>
      <p class="major">${esc(p.major)}</p>
      <p>${esc(p.year)}</p>
      <p>${esc(p.region)}</p>
    </article>`;
}

// Simple colored avatar from the first initial.
function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (const ch of name || '') hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
