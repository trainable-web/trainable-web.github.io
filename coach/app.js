const API = 'https://txrsajvaqhqrlpsgjeyn.supabase.co';
const KEY = 'sb_publishable_omyeFX4y5d9FtUUvg0b4Xg_5rO4atSa';
const LIVE_COACH_URL = 'https://trainable-web.github.io/coach/';
const SESSION_KEY = 'trainable_web_session';
const OAUTH_KEY = 'trainable_coach_oauth_intent';
let memorySession = null;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const ZONES = [['recovery', 'Z1 · Recovery'], ['endurance', 'Z2 · Endurance'], ['tempo', 'Z3 · Tempo'], ['sweet_spot', 'Sweet spot'], ['threshold', 'Z4 · Threshold'], ['vo2max', 'Z5 · VO₂max'], ['anaerobic', 'Z6 · Anaerobic'], ['open', 'Open effort']];
const TYPES = [['warmup', 'Warm-up'], ['work', 'Work'], ['recovery', 'Recovery'], ['cooldown', 'Cool-down']];
const state = { roster: [], athleteId: null, athlete: null, builder: null, meeting: null, weekDraft: null, weekSelection: null,
  sharedWith: [], trigger: null, editorDirty: false, noteToArchive: null, weekReset: null, resetTrigger: null,
  weekGenerating: false, weekPublishing: false, weekResetting: false, noteSaving: false, mobileDetailOpen: false, athleteRequest: 0,
  calendarWeek: null, calendarDay: null, calendarLayout: 'week', athleteSection: 'calendar', attention: null, attentionFilter: 'open', devices: null,
  wearableWorkouts: [], removeGarminTrigger: null, intervals: null, removeIntervalsTrigger: null };
const $ = (selector) => document.querySelector(selector);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const title = (value) => String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const dateLabel = (iso) => iso ? new Date(iso.includes('T') ? iso : iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const minutesLabel = (n) => n ? (n >= 60 ? Math.floor(n / 60) + 'h ' + (n % 60 ? (n % 60) + 'm' : '') : n + 'm') : 'Rest';
const trainingMinutesLabel = (n) => n ? minutesLabel(n) : '0m';
const localDate = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
const currentWeek = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };

function session() {
  try { const saved = localStorage.getItem(SESSION_KEY); if (saved) return JSON.parse(saved); } catch { /* Try the prior tab session. */ }
  try { const previous = sessionStorage.getItem(SESSION_KEY); if (previous) { const value = JSON.parse(previous); saveSession(value); return value; } } catch { /* Keep the current page usable. */ }
  return memorySession;
}
function saveSession(value) {
  const expires = Number(value.expires_at) || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600);
  const saved = JSON.stringify({ ...value, expires_at: expires });
  memorySession = JSON.parse(saved);
  try { localStorage.setItem(SESSION_KEY, saved); sessionStorage.removeItem(SESSION_KEY); return true; }
  catch { try { sessionStorage.setItem(SESSION_KEY, saved); } catch { /* In-memory session lasts until this page closes. */ } return false; }
}
function clearSession() { memorySession = null; try { localStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ } try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ } }
function setStatus(message, isError = false, area = '#global-status') {
  const node = $(area); if (!node) return; node.textContent = message; node.classList.toggle('is-error', isError);
}
async function authRequest(path, options = {}) {
  const response = await fetch(API + '/auth/v1/' + path, { ...options, headers: { apikey: KEY, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.msg || data.error_description || data.message || data.error || 'Could not sign in.'); error.status = response.status; throw error; }
  return data;
}
let refreshPending = null;
function refreshSession(current) {
  if (!refreshPending) refreshPending = authRequest('token?grant_type=refresh_token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: current.refresh_token }) })
    .then((updated) => { const next = { ...updated, user: updated.user || current.user }; saveSession(next); return session() || next; })
    .catch((error) => { if (error.status === 400 || error.status === 401) error.authInvalid = true; throw error; })
    .finally(() => { refreshPending = null; });
  return refreshPending;
}
async function token() {
  let current = session();
  if (!current?.access_token || !current?.refresh_token) { const error = new Error('Please sign in again.'); error.authInvalid = true; throw error; }
  if (!current.expires_at || current.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    current = await refreshSession(current);
  }
  return current.access_token;
}
async function portal(action, payload = {}) {
  const request = (accessToken) => fetch(API + '/functions/v1/coach-portal', { method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }) });
  let response = await request(await token());
  if (response.status === 401 && session()?.refresh_token) {
    const updated = await refreshSession(session());
    response = await request(updated.access_token);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Trainable could not complete that action.'); error.status = response.status; error.authInvalid = response.status === 401; throw error; }
  return data;
}
async function wearables(action, payload = {}) {
  const request = (accessToken) => fetch(API + '/functions/v1/wearables-portal', { method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }) });
  let response = await request(await token());
  if (response.status === 401 && session()?.refresh_token) {
    const updated = await refreshSession(session()); response = await request(updated.access_token);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Device connection could not complete.'); error.status = response.status; error.authInvalid = response.status === 401; throw error; }
  return data;
}
async function intervals(action) {
  const request = (accessToken) => fetch(API + '/functions/v1/intervals-portal', { method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }) });
  let response = await request(await token());
  if (response.status === 401 && session()?.refresh_token) {
    const updated = await refreshSession(session()); response = await request(updated.access_token);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Intervals.icu could not complete that action.'); error.status = response.status; throw error; }
  return data;
}
function showAuth(message = '') {
  $('#auth-page').hidden = false; $('#workspace').hidden = true; $('#sign-out').hidden = true;
  $('#workspace').classList.remove('mobile-detail-open'); state.mobileDetailOpen = false;
  $('#account-name').textContent = ''; $('#retry-workspace').hidden = true; setStatus(message, Boolean(message), '#auth-status');
}
function showWorkspace(email) {
  $('#auth-page').hidden = true; $('#workspace').hidden = false; $('#sign-out').hidden = false;
  $('#retry-workspace').hidden = true; $('#account-name').textContent = email || '';
}
function showFieldError(id, message) {
  const input = $('#' + id); const error = $('#' + id + '-error');
  input.setAttribute('aria-invalid', 'true'); error.textContent = message; error.hidden = false;
}
function clearFieldError(id) {
  $('#' + id).removeAttribute('aria-invalid'); $('#' + id + '-error').hidden = true;
}
async function handleOAuth() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (!hash.has('access_token') && !hash.has('error')) return false;
  history.replaceState(null, '', location.pathname + location.search);
  const started = Number(sessionStorage.getItem(OAUTH_KEY)); sessionStorage.removeItem(OAUTH_KEY);
  if (!started || Date.now() - started > 10 * 60 * 1000) { showAuth('That sign-in request expired. Try again.'); return true; }
  if (hash.has('error')) { showAuth(hash.get('error_description') || 'Could not sign in.'); return true; }
  const access_token = hash.get('access_token'); const refresh_token = hash.get('refresh_token');
  if (!access_token || !refresh_token) { showAuth('Sign-in did not return a complete session.'); return true; }
  try {
    const user = await authRequest('user', { headers: { Authorization: 'Bearer ' + access_token } });
    saveSession({ access_token, refresh_token, user, expires_at: Math.floor(Date.now() / 1000) + Number(hash.get('expires_in') || 3600) });
    await resumeWorkspace();
  } catch (error) { showAuth(error.message); }
  return true;
}
async function loadWorkspace() {
  const result = await portal('bootstrap');
  state.roster = result.roster || []; state.sharedWith = result.shared_with || [];
  showWorkspace(result.email || session()?.user?.email);
  const route = location.hash.slice(1).split('/');
  renderRoster();
  if (route[0] === 'devices') { await showDevices(); return; }
  if (route[0] === 'attention') { await showAttention(); return; }
  showAthletes(false, false);
  const wanted = ['athlete', 'builder', 'meeting', 'week', 'note'].includes(route[0]) ? route[1] : null;
  const validWanted = state.roster.some((p) => p.id === wanted) ? wanted : null;
  const openDetail = Boolean(validWanted) || state.roster.length === 1;
  state.mobileDetailOpen = openDetail;
  $('#workspace').classList.toggle('mobile-detail-open', openDetail);
  await selectAthlete(validWanted || (state.roster.some((p) => p.id === state.athleteId) ? state.athleteId : state.roster[0]?.id), { updateRoute: openDetail || !matchMedia('(max-width: 767.98px)').matches });
  if (route[0] === 'builder' && wanted === state.athleteId) openBuilder();
  if (route[0] === 'meeting' && wanted === state.athleteId) openMeeting();
  if (route[0] === 'week' && wanted === state.athleteId) openWeek();
  if (route[0] === 'note' && wanted === state.athleteId) openNote();
}
function setWorkspaceView(view) {
  $('#workspace').dataset.view = view;
  $('#workspace-title').textContent = { athletes: 'Training calendar', attention: 'Needs attention', devices: 'Connections' }[view];
  $('#workspace-subtitle').textContent = { athletes: 'Select an athlete to plan and review their week.', attention: 'Review check-ins, planning needs, and missing data.', devices: 'Manage the training data shared with Trainable.' }[view];
  $('#attention-view').hidden = view !== 'attention';
  $('#devices-view').hidden = view !== 'devices';
  $('.split-pane').hidden = view !== 'athletes';
  $('#show-attention').setAttribute('aria-current', view === 'attention' ? 'page' : 'false');
  $('#show-athletes').setAttribute('aria-current', view === 'athletes' ? 'page' : 'false');
  $('#show-devices').setAttribute('aria-current', view === 'devices' ? 'page' : 'false');
}
async function showDevices() {
  state.mobileDetailOpen = false; $('#workspace').classList.remove('mobile-detail-open');
  setWorkspaceView('devices');
  if (location.hash !== '#devices') history.pushState(null, '', '#devices');
  $('#devices-content').innerHTML = '<div class="devices-panel"><p>Checking your data sources…</p></div>';
  try {
    const [status, workouts] = await Promise.all([wearables('status'), wearables('workouts', { athlete_id: session()?.user?.id })]);
    state.devices = { ...status, workouts: workouts.workouts || [] }; renderDevices();
  } catch (error) {
    $('#devices-content').innerHTML = `<div class="devices-panel"><strong>Device status is unavailable</strong><p>${safe(error.message)}</p><button type="button" class="secondary" data-device-retry>Try again</button></div>`;
  }
  try { state.intervals = await intervals('status'); }
  catch (error) { state.intervals = { error: error.message }; }
  $('#devices-content').insertAdjacentHTML('afterbegin', renderIntervals());
  const outcome = new URL(location.href).searchParams.get('intervals');
  if (outcome) {
    history.replaceState(null, '', location.pathname + '#devices');
    if (outcome === 'connected') setStatus('Intervals.icu connected. Import your recent data when ready.');
    else if (outcome === 'cancelled') setStatus('Intervals.icu connection cancelled.');
    else setStatus('Intervals.icu could not connect. Try again or check its app permissions.', true);
  }
}
function renderIntervals() {
  const account = state.intervals || {};
  if (account.error) return `<section class="devices-panel"><p class="eyebrow">INTERVALS.ICU</p><h3>Connection status unavailable</h3><p>${safe(account.error)}</p><button type="button" class="secondary" data-device-retry>Try again</button></section>`;
  const connected = account.connected;
  const records = (account.wellness || []).slice(0, 7);
  const activities = (account.activities || []).slice(0, 5);
  const rows = records.map((day) => {
    const values = [day.sleep_s != null ? `${(day.sleep_s / 3600).toFixed(1)} h sleep` : '',
      day.hrv_ms != null ? `${Math.round(day.hrv_ms)} ms HRV` : '',
      day.resting_hr != null ? `${Math.round(day.resting_hr)} bpm resting HR` : '',
      day.steps != null ? `${Math.round(day.steps).toLocaleString()} steps` : ''].filter(Boolean);
    const more = [day.sleep_score != null ? `Sleep score ${Math.round(day.sleep_score)}` : '',
      day.spo2_pct != null ? `SpO₂ ${Math.round(day.spo2_pct)}%` : '',
      day.body_battery_min != null || day.body_battery_max != null ? `Body Battery ${day.body_battery_min ?? '–'}–${day.body_battery_max ?? '–'}` : '',
      day.weight_kg != null ? `Weight ${day.weight_kg.toFixed(1)} kg` : '',
      day.vo2max != null ? `VO₂ max ${day.vo2max.toFixed(1)}` : ''].filter(Boolean);
    return `<div class="device-workout intervals-day"><div><strong>${safe(day.day)}</strong><small>${safe(values.join(' · ') || 'No common measurements for this day')}</small>${more.length ? `<details><summary>More measurements</summary><p>${safe(more.join(' · '))}</p></details>` : ''}</div></div>`;
  }).join('');
  const heading = connected ? account.status === 'reauthorize' ? 'Reconnect to keep importing' : 'Connected' :
    account.configured ? 'Connect your Intervals.icu account' : 'Awaiting Intervals.icu app approval';
  const activityRows = activities.map((ride) => `<div class="device-workout"><div><strong>${safe(ride.name || ride.sport)}</strong><small>${safe(dateLabel(ride.started_at))} · Garmin via Intervals.icu${ride.device ? ' · ' + safe(ride.device) : ''}</small></div><span>${safe(minutesLabel(Math.round(ride.duration_s / 60)))}</span></div>`).join('');
  return `<section class="devices-panel intervals-panel"><div class="device-setting"><div><p class="eyebrow">INTERVALS.ICU / GARMIN ROUTE</p><h3>${heading}</h3><p>Connect Garmin in Intervals.icu and enable its activity and wellness downloads. Then approve Trainable’s read-only access to your Intervals.icu account.</p></div><div class="device-controls">${account.configured && (!connected || account.status === 'reauthorize') ? '<button type="button" class="primary" data-intervals-connect>Connect Intervals.icu</button>' : ''}${connected && account.status === 'connected' ? '<button type="button" class="secondary" data-intervals-sync>Import recent data</button>' : ''}</div></div><p class="device-fineprint">${connected ? `Last import: ${account.last_synced_at ? safe(dateLabel(account.last_synced_at)) : 'not yet imported'}. ` : ''}Wellness may come from Garmin or another Intervals.icu source; workout summaries below are Garmin sourced. Imports are for your review only and do not change training load or plans. Charts may include data from Garmin devices.</p>${connected ? `<div class="intervals-history"><p class="eyebrow">RECENT WELLNESS</p><div class="device-workouts">${rows || '<p class="list-empty">No wellness imported yet. Enable Garmin wellness downloads in Intervals.icu, then import here.</p>'}</div></div><div class="intervals-history"><p class="eyebrow">GARMIN ACTIVITIES</p><div class="device-workouts">${activityRows || '<p class="list-empty">No Garmin-sourced activities imported yet.</p>'}</div></div><button type="button" class="danger intervals-remove" data-intervals-remove>Disconnect and delete Intervals.icu data</button>` : '<p class="device-next-step"><a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer">Open Intervals.icu settings</a> to connect Garmin and enable wellness downloads.</p>'}</section>`;
}
function renderDevices() {
  const device = state.devices; if (!device) return;
  const ready = device.configured && device.garmin_available;
  const active = device.connected;
  const status = !device.configured ? 'Trainable is preparing the Garmin connection.'
    : active ? (device.pilot_access ? 'Connected to Garmin Connect' : 'Garmin is connected. Importing is paused for this account.')
    : !device.pilot_access ? 'The Garmin pilot is not enabled for this account yet.'
    : !device.garmin_available ? 'Garmin is not enabled on the connection server yet.'
    : device.account_state === 'provisioning' ? 'Connection setup paused. Remove this request to retry.'
    : device.account_state === 'deleting' ? 'Removal is still in progress. Try again.' : 'Ready to connect';
  const workouts = device.workouts || [];
  const rows = workouts.map((w) => `<div class="device-workout"><div><strong>${safe(w.name || title(w.sport))}</strong><small>${safe(dateLabel(w.started_at))} · Garmin${w.device ? ' · ' + safe(w.device) : ''}</small></div><span>${safe(minutesLabel(Math.round(w.duration_s / 60)))}</span></div>`).join('');
  $('#devices-content').innerHTML = `<div class="devices-panel"><div class="device-setting"><div><p class="eyebrow">GARMIN CONNECT</p><h3>${safe(status)}</h3><p>Connect with Garmin’s own approval screen. Trainable stores a source-labelled workout summary; your Garmin password stays with Garmin.</p></div><div class="device-controls">${ready && !active && (!device.account_state || device.account_state === 'ready') ? '<button type="button" class="primary" data-device-connect>Connect Garmin</button>' : ''}${active && device.pilot_access ? '<button type="button" class="secondary" data-device-sync>Import latest workouts</button>' : ''}</div></div><p class="device-fineprint">Garmin imports are shown for review and do not change training load or workouts yet. A ride may also be present through Strava or Apple Health. Garmin history can take time to arrive after approval.</p></div>
    <section class="devices-panel device-history"><div class="section-head"><div><p class="eyebrow">RECENTLY IMPORTED</p><h3>Garmin workouts</h3></div><strong>${workouts.length}</strong></div><div class="device-workouts">${rows || '<p class="list-empty">No Garmin workouts imported yet.</p>'}</div></section>
    ${device.account_state ? `<section class="device-danger"><h3>Remove connection and data</h3><p>Remove the Open Wearables account and Garmin imports linked to your Trainable account.</p><button type="button" class="danger" data-device-remove>Remove Garmin data</button></section>` : ''}`;
}
async function showAttention() {
  state.mobileDetailOpen = false; $('#workspace').classList.remove('mobile-detail-open');
  setWorkspaceView('attention');
  if (location.hash !== '#attention') history.pushState(null, '', '#attention');
  $('#attention-list').innerHTML = '<div class="attention-empty"><strong>Checking available evidence…</strong><p>Recent check-ins, training data, and next week’s saved plans.</p></div>';
  try {
    state.attention = await portal('attention', { client_date: localDate() });
    renderAttention();
  } catch (error) {
    $('#attention-summary').textContent = '';
    $('#attention-list').innerHTML = `<div class="attention-empty"><strong>Could not load attention</strong><p>${safe(error.message)}</p><button type="button" class="secondary" data-attention-retry>Try again</button></div>`;
  }
}
function showAthletes(updateRoute = true, loadSelection = true) {
  setWorkspaceView('athletes');
  if (updateRoute) { state.mobileDetailOpen = false; $('#workspace').classList.remove('mobile-detail-open'); }
  if (updateRoute && (location.hash === '#attention' || location.hash === '#devices')) history.pushState(null, '', '#team');
  if (loadSelection && !state.athlete && state.roster.length) selectAthlete(state.roster[0].id, { updateRoute: false });
}
function renderAttention() {
  const data = state.attention; if (!data) return;
  const open = data.items.filter((item) => !item.reviewed_at);
  const review = open.filter((item) => item.priority === 'review');
  const planning = open.filter((item) => item.priority === 'planning');
  const gaps = open.filter((item) => item.priority === 'data');
  $('#attention-summary').innerHTML = `<div><strong>${data.athlete_count}</strong><span>${data.athlete_count === 1 ? 'athlete' : 'athletes'} accessible</span></div><div><strong>${review.length}</strong><span>check-ins to review</span></div><div><strong>${planning.length}</strong><span>plans to prepare</span></div><div><strong>${gaps.length}</strong><span>data gaps</span></div>`;
  $('#attention-coverage').hidden = !data.activity_coverage_limited;
  $('#attention-coverage').textContent = data.activity_coverage_limited ? 'Activity volume exceeded this quick review. Data-gap alerts were suppressed; open an athlete for a closer look.' : '';
  const filter = state.attentionFilter;
  document.querySelectorAll('[data-attention-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.attentionFilter === filter)));
  const shown = data.items.filter((item) => filter === 'all' || (filter === 'reviewed' ? item.reviewed_at : !item.reviewed_at));
  if (!shown.length) {
    const headline = filter === 'reviewed' ? 'No reviewed items yet' : filter === 'open' ? 'No open items in the available data' : 'No items yet';
    const detail = filter === 'reviewed' ? 'Items you mark reviewed will appear here.' : 'Review an athlete’s training or connect a data source to expand what Trainable can check.';
    $('#attention-list').innerHTML = `<div class="attention-empty"><strong>${headline}</strong><p>${detail}</p><button type="button" class="secondary" data-attention-athletes>Review athletes</button></div>`;
    return;
  }
  $('#attention-list').innerHTML = shown.map((item) => `<article class="attention-item ${item.reviewed_at ? 'is-reviewed' : ''}"><div class="attention-item-main"><div class="attention-item-top"><span class="attention-type ${safe(item.priority)}">${safe(item.priority === 'review' ? 'Check-in' : item.priority === 'planning' ? 'Planning' : 'Data gap')}</span><span class="attention-date">${safe(dateLabel(item.observed_at))}</span></div><h3>${safe(item.athlete_name)} · ${safe(item.headline)}</h3><p>${safe(item.explanation)}</p><details><summary>View evidence</summary><ul>${item.evidence.map((line) => `<li>${safe(line)}</li>`).join('')}</ul><small>${item.evidence_kind === 'athlete_reported' ? 'Athlete-reported' : 'Observed'} · ${item.data_quality === 'limited' ? 'Limited data' : 'Direct evidence'}</small></details></div><div class="attention-actions"><button type="button" class="primary small-button" data-attention-athlete="${safe(item.athlete_id)}" data-attention-plan="${item.priority === 'planning'}">${safe(item.next_action)}</button>${item.reviewed_at ? '<span class="attention-reviewed">Reviewed</span>' : `<button type="button" class="quiet small-button" data-attention-review="${safe(item.id)}">Mark reviewed</button>`}</div></article>`).join('');
}
function renderRoster() {
  const query = $('#roster-query').value.trim().toLocaleLowerCase();
  const filtered = state.roster.filter((p) => (p.display_name || (p.is_self ? 'Your training' : 'Athlete')).toLocaleLowerCase().includes(query));
  $('#roster-count').textContent = `${state.roster.length} ${state.roster.length === 1 ? 'athlete' : 'athletes'}`;
  $('#roster-list').innerHTML = filtered.length ? filtered.map((p) => {
    const name = p.display_name || (p.is_self ? 'Your training' : 'Athlete');
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
    return `<button type="button" class="roster-item ${p.id === state.athleteId ? 'active' : ''}" data-athlete="${safe(p.id)}" aria-current="${p.id === state.athleteId ? 'page' : 'false'}"><span class="roster-avatar" aria-hidden="true">${safe(initials)}</span><span class="roster-copy"><strong>${safe(name)}</strong><small>${p.is_self ? 'Your training' : 'Coach access'} · ${safe(title(p.primary_sport || 'training'))}</small></span><span class="roster-arrow" aria-hidden="true">›</span></button>`;
  }).join('') : `<div class="roster-empty"><strong>No athletes found</strong><p>Try another name or clear your search.</p><button type="button" class="secondary small-button" data-clear-roster>Clear search</button></div>`;
}
async function selectAthlete(id, options = {}) {
  if (!id) { $('#athlete-pane').innerHTML = '<div class="list-empty"><h2>Connect your first athlete</h2><p>Use an invite code from the athlete to open their training calendar.</p><button type="button" class="primary" data-action="connect-athlete">Connect an athlete</button></div>'; return; }
  const request = ++state.athleteRequest;
  if (id !== state.athleteId) { state.calendarWeek = currentWeek(); state.calendarDay = null; state.athleteSection = 'calendar'; }
  if (options.openDetail != null) {
    state.mobileDetailOpen = options.openDetail;
    $('#workspace').classList.toggle('mobile-detail-open', state.mobileDetailOpen);
  }
  state.athleteId = id; state.athlete = null; state.wearableWorkouts = []; renderRoster(); $('#athlete-pane').innerHTML = `<div class="calendar-loading" role="status"><p>Loading the training week…</p><div class="loading-week" aria-hidden="true">${ORDER.map((day) => `<div>${DAYS[day]}</div>`).join('')}</div></div>`;
  try {
    const [athlete, imported] = await Promise.all([portal('read_athlete', { athlete_id: id }),
      wearables('workouts', { athlete_id: id }).catch(() => ({ workouts: [] }))]);
    if (request !== state.athleteRequest) return;
    state.athlete = athlete; state.wearableWorkouts = imported.workouts || [];
    if (options.updateRoute !== false && location.hash !== '#athlete/' + id) history[options.pushRoute ? 'pushState' : 'replaceState'](null, '', '#athlete/' + id);
    renderAthlete();
  } catch (error) { if (request === state.athleteRequest) $('#athlete-pane').innerHTML = '<div class="list-empty"><h2>Could not load this athlete</h2><p>' + safe(error.message) + '</p><button type="button" class="secondary" data-action="retry-athlete">Try again</button></div>'; }
}
function renderAthlete() {
  const data = state.athlete; if (!data) return;
  const p = data.profile || {}; const isSelf = state.roster.find((r) => r.id === state.athleteId)?.is_self;
  const week = state.calendarWeek || currentWeek(); state.calendarWeek = week;
  const plan = data.plans.find((x) => x.week_start_date === week);
  const workouts = data.workouts.filter((x) => x.plan_id === plan?.id);
  const name = p.display_name || (isSelf ? 'Your training' : 'Athlete');
  const metrics = data.metrics;
  const cells = [
    ['Fitness', metrics?.ctl == null ? '—' : Math.round(metrics.ctl), 'CTL · 42-day load'],
    ['Fatigue', metrics?.atl == null ? '—' : Math.round(metrics.atl), 'ATL · 7-day load'],
    ['Form', metrics?.tsb == null ? '—' : Math.round(metrics.tsb), 'TSB · Fitness − fatigue'],
    ['FTP', data.zones?.ftp_watts ? Math.round(data.zones.ftp_watts) + ' W' : '—', 'Cycling threshold'],
    ['Energy', data.readiness?.checkin_energy != null ? data.readiness.checkin_energy + ' / 5' : '—', data.readiness?.metric_date ? 'Check-in · ' + dateLabel(data.readiness.metric_date) : 'No check-in yet'],
  ];
  const meetingRows = data.meetings.length ? data.meetings.map((m, mi) => `<div class="meeting-row"><strong>${safe(dateLabel(m.happened_at))} · Coach call</strong><p>${safe(m.summary)}</p>${m.meeting_url ? '<small>Google Meet linked</small>' : ''}<div class="meeting-changes">${(m.proposed_changes || []).map((c, ci) => `<button type="button" data-change="${mi}:${ci}">Draft workout from: ${safe(c)}</button>`).join('')}</div></div>`).join('') : '<div class="list-empty"><strong>No coach calls yet</strong><p>Review a Google Meet transcript to turn agreed changes into a clear plan.</p><button type="button" class="secondary small-button" data-action="new-meeting">Add call notes</button></div>';
  const activityRows = data.activities.length ? data.activities.slice(0, 4).map((a) => `<div class="activity-row"><strong>${safe(title(a.sport_type))} · ${safe(minutesLabel(Math.round(a.duration_s / 60)))}</strong><br><small>${safe(dateLabel(a.start_date))}${a.raw_tss ? ' · ' + Math.round(a.raw_tss) + ' TSS' : ''}</small></div>`).join('') : '<div class="list-empty">Recent activities will appear after a training source syncs.</div>';
  const garminRows = state.wearableWorkouts.slice(0, 4).map((w) => `<div class="activity-row"><strong>${safe(w.name || title(w.sport))} · ${safe(minutesLabel(Math.round(w.duration_s / 60)))}</strong><br><small>${safe(dateLabel(w.started_at))} · Garmin import · Review only</small></div>`).join('');
  const noteKinds = { observation: 'Training response', preference: 'Preference', goal: 'Goal', constraint: 'Constraint' };
  const noteRows = data.coach_notes?.length ? data.coach_notes.map((n) => `<div class="note-row"><div><small>${safe(noteKinds[n.kind] || 'Note')} · ${n.author_id === state.athleteId ? 'Athlete' : 'Coach'} · ${n.visibility === 'coach_private' ? 'Only you' : 'Shared'} · ${safe(dateLabel(n.created_at))}</small><p>${safe(n.body)}</p></div>${isSelf || n.author_id === session()?.user?.id ? `<button type="button" class="quiet small-button" data-archive-note="${safe(n.id)}">Archive</button>` : ''}</div>`).join('') : '<div class="list-empty"><strong>No athlete notes yet</strong><p>Add a training response, goal or preference so the assistant can consider it when drafting.</p><button type="button" class="secondary small-button" data-action="new-note">Add athlete note</button></div>';
  const section = state.athleteSection;
  $('#athlete-pane').innerHTML = `
    <button type="button" class="mobile-back quiet" data-action="back-to-roster">← All athletes</button>
    <header class="athlete-top"><div class="athlete-identity"><h2>${safe(name)}</h2><p>${safe(title(p.primary_sport || 'Training'))}${isSelf ? ' · Your training' : ' · Athlete'}</p></div><div class="athlete-actions">${week >= currentWeek() ? `<button type="button" class="primary" data-action="new-workout">Add workout</button><button type="button" class="secondary" data-action="build-week">Plan week</button>` : '<button type="button" class="secondary" data-action="this-week">Go to this week</button>'}</div></header>
    <div class="metrics" aria-label="Athlete training measures">${cells.map((c) => `<div class="metric"><span>${safe(c[0])}</span><strong>${safe(c[1])}</strong><small>${safe(c[2])}</small></div>`).join('')}</div>
    <div class="athlete-section-nav" role="group" aria-label="Athlete view">${[['calendar','Calendar'],['activity','Recent activity'],['notes','Notes & calls']].map(([value,label]) => `<button type="button" data-athlete-section="${value}" aria-pressed="${section === value}">${label}</button>`).join('')}<span class="metric-date">${metrics?.metric_date ? 'Load updated ' + safe(dateLabel(metrics.metric_date)) : 'No load data yet'}</span></div>
    <section class="week-section" ${section !== 'calendar' ? 'hidden' : ''}>${renderCalendar(week, workouts)}</section>
    <section class="recent-section" ${section !== 'activity' ? 'hidden' : ''}><div class="section-head"><h3>Recent activity</h3></div><p class="helper">Latest synced activities. Recorded time can differ from the planned session.</p><div class="activity-list">${activityRows}</div>${garminRows ? `<div class="garmin-preview"><p class="eyebrow">GARMIN / REVIEW ONLY</p><div class="activity-list">${garminRows}</div><p class="foot-note">Garmin imports are separate from load calculations while duplicate sources are checked.</p></div>` : ''}</section>
    <div class="context-column" ${section !== 'notes' ? 'hidden' : ''}><section class="profile-notes"><div class="section-head"><h3>Athlete notes</h3><button type="button" class="secondary" data-action="new-note">Add note</button></div><div class="meeting-list">${noteRows}</div></section><section class="calls-section"><div class="section-head"><h3>Coach calls</h3><button type="button" class="secondary" data-action="new-meeting">Add call notes</button></div><div class="meeting-list">${meetingRows}</div></section></div>`;
}
function calendarDate(week, day) {
  const date = new Date(week + 'T12:00:00'); date.setDate(date.getDate() + (day + 6) % 7);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function calendarWeeks() {
  return [...new Set([currentWeek(), nextWeek(), ...(state.athlete?.plans || []).map((p) => p.week_start_date)])].filter((w) => w <= nextWeek()).sort();
}
function workoutStatus(workout, date) {
  if (workout.completed) return ['completed', 'Completed'];
  if (workout.workout_type === 'rest') return ['rest', 'Rest day'];
  if (date < localDate()) return ['unconfirmed', 'Not marked complete'];
  return ['planned', 'Planned'];
}
function workoutChart(workout) {
  const steps = (workout.structured_steps || []).filter((s) => Number(s.duration_s) > 0);
  if (!steps.length) return '';
  const ceiling = Math.max(1, ...steps.map((s) => Number(s.target_high) || Number(s.target_low) || 0));
  return `<span class="workout-profile" aria-hidden="true">${steps.map((step) => {
    const height = Math.max(12, Math.min(100, ((Number(step.target_high) || Number(step.target_low) || 0) / ceiling) * 100));
    return `<span style="flex-grow:${Number(step.duration_s)};height:${height}%"></span>`;
  }).join('')}</span>`;
}
function renderCalendar(week, workouts) {
  const today = localDate(); const weeks = calendarWeeks(); const index = weeks.indexOf(week);
  const end = calendarDate(week, 0); const editable = week >= currentWeek();
  const planned = workouts.reduce((n, w) => n + (Number(w.target_duration_min) || 0), 0);
  const sessions = workouts.filter((w) => w.workout_type !== 'rest');
  const complete = sessions.filter((w) => w.completed).length;
  const tssValues = sessions.map((w) => w.target_tss ?? w.computed_tss).filter((v) => v != null && Number.isFinite(Number(v)));
  const tss = tssValues.reduce((n, v) => n + Number(v), 0);
  const days = ORDER.map((day) => {
    const date = calendarDate(week, day); const items = workouts.filter((w) => w.day_of_week === day);
    const canAdd = editable && date >= today && !items.length;
    return `<div class="calendar-cell ${date === today ? 'is-today' : ''}"><div class="calendar-cell-heading"><span>${DAYS[day]}</span><strong>${Number(date.slice(-2))}</strong>${date === today ? '<small>Today</small>' : ''}</div><div class="calendar-cell-sessions">${items.map((w) => {
      const [status, label] = workoutStatus(w, date); const load = w.target_tss ?? w.computed_tss;
      return `<button type="button" class="workout-card ${status}" data-workout-preview="${safe(w.id)}"><span class="workout-card-kind">${safe(title(w.workout_type || 'Workout'))}</span><strong class="workout-card-title">${safe(w.headline || title(w.workout_type))}</strong><span class="workout-card-time">${safe(minutesLabel(w.target_duration_min))}</span>${load != null ? `<small>${Math.round(Number(load))} TSS</small>` : ''}${workoutChart(w)}<span class="workout-card-status">${w.completed ? '✓ ' : ''}${label}</span>${w.prescription_source === 'human_coach' ? '<small class="workout-card-source">Coach prescribed</small>' : ''}</button>`;
    }).join('') || `<p class="calendar-empty">${date < today ? 'No planned session' : 'No workout planned'}</p>`}</div>${canAdd ? `<button type="button" class="calendar-add" data-add-calendar-day="${day}" aria-label="Add workout for ${DAYS[day]}, ${safe(dateLabel(date))}">+ Add</button>` : ''}</div>`;
  }).join('');
  return `<div class="calendar-toolbar"><div class="calendar-controls"><button type="button" class="secondary" data-week-shift="-1" aria-label="Previous available week" ${index <= 0 ? 'disabled' : ''}>‹<span class="control-tooltip" role="tooltip">Previous available week</span></button><h3>${safe(dateLabel(week))} – ${safe(dateLabel(end))}<small>${week === currentWeek() ? 'This week' : week === nextWeek() ? 'Next week' : 'Saved week · Read only'}</small></h3><button type="button" class="secondary" data-week-shift="1" aria-label="Next available week" ${index >= weeks.length - 1 ? 'disabled' : ''}>›<span class="control-tooltip" role="tooltip">Next available week</span></button><button type="button" class="quiet" data-action="this-week">Today</button></div><div class="calendar-view-switch" role="group" aria-label="Calendar layout"><button type="button" data-calendar-layout="week" aria-pressed="${state.calendarLayout === 'week'}">Week</button><button type="button" data-calendar-layout="agenda" aria-pressed="${state.calendarLayout === 'agenda'}">Agenda</button></div></div>
    ${state.calendarLayout === 'week' ? '<p class="calendar-scroll-hint">Scroll across the week, or choose Agenda for a list.</p>' : ''}<div class="calendar-body"><div class="calendar-grid planner-grid ${state.calendarLayout === 'agenda' ? 'agenda' : ''}" role="group" tabindex="0" aria-label="Training week of ${safe(dateLabel(week))}">${days}</div><aside class="calendar-summary" aria-label="Week summary"><h4>Week summary</h4><div class="summary-duration"><strong>${safe(trainingMinutesLabel(planned))}</strong><span>planned time</span></div><dl><div><dt>Planned TSS</dt><dd>${tssValues.length ? Math.round(tss) : '—'}</dd></div><div><dt>Sessions</dt><dd>${sessions.length}</dd></div><div><dt>Completed</dt><dd>${complete} / ${sessions.length}</dd></div><div><dt>Unplanned days</dt><dd>${7 - new Set(workouts.map((w) => w.day_of_week)).size}</dd></div></dl><progress max="${Math.max(sessions.length, 1)}" value="${complete}" aria-label="${complete} of ${sessions.length} sessions marked complete"></progress><p class="summary-caption">${tssValues.length < sessions.length ? 'Some sessions have no TSS estimate. ' : ''}Completion reflects the athlete’s saved plan.</p>${week === currentWeek() ? '<button type="button" class="secondary full" data-action="review-week">Suggest a change</button><p class="summary-caption">The assistant suggests one session change for your review.</p>' : editable ? '<p class="summary-caption">Use Plan week to draft and review next week before publishing.</p>' : '<p class="summary-caption">Only saved weeks are available here.</p>'}</aside></div>
    <div class="calendar-key" aria-label="Workout status key"><span><i class="key-planned"></i>Planned</span><span><i class="key-completed"></i>Completed</span><span><i class="key-unconfirmed"></i>Not marked complete</span><span>Open a workout for instructions and session blocks.</span></div>`;
}
function previewWorkout(id) {
  const workout = state.athlete?.workouts.find((w) => w.id === id); if (!workout) return;
  const week = state.athlete.plans.find((p) => p.id === workout.plan_id)?.week_start_date || state.calendarWeek;
  const date = calendarDate(week, workout.day_of_week); const [, status] = workoutStatus(workout, date);
  const steps = workout.structured_steps || [];
  const rows = steps.map((step, index) => `<li><span>${index + 1}. ${safe(title(step.type || 'Work'))}</span><strong>${safe(trainingMinutesLabel(Math.round(Number(step.duration_s || 0) / 60)))}</strong><small>${step.target_type === 'power' && step.target_low != null ? `${safe(step.target_low)}–${safe(step.target_high ?? step.target_low)} W` : safe(title(step.target_type || 'Open effort'))}</small></li>`).join('');
  openDrawer(`${DAYS[workout.day_of_week]} · ${dateLabel(date)} · ${status}`, workout.headline || title(workout.workout_type), `<div class="workout-preview-meta"><strong>${safe(minutesLabel(workout.target_duration_min))}</strong><span>${safe(title(workout.workout_type))}</span><span>${workout.prescription_source === 'human_coach' ? 'Coach prescribed' : 'Trainable plan'}</span></div><h3>Athlete instructions</h3><p class="workout-instructions">${safe(workout.description || 'No instructions added for this session.')}</p>${workout.why_line ? `<h3>Purpose</h3><p>${safe(workout.why_line)}</p>` : ''}${rows ? `<h3>Session blocks</h3>${workoutChart(workout)}<ol class="session-step-list">${rows}</ol>` : ''}<p class="foot-note">${workout.completed ? 'This session is marked complete.' : date < localDate() ? 'This session has not been marked complete. Check recent activity before adjusting the plan.' : 'This is the session saved in the athlete’s plan.'}</p><button type="button" class="secondary" data-close>Back to calendar</button>`);
}

function openDrawer(kicker, titleText, markup) {
  state.trigger = document.activeElement;
  $('#drawer').classList.remove('page-mode'); $('#drawer').setAttribute('role', 'dialog'); $('#drawer').setAttribute('aria-modal', 'true');
  $('#drawer-kicker').textContent = kicker; $('#drawer-title').textContent = titleText; $('#drawer-body').innerHTML = markup;
  $('#close-drawer').textContent = 'Close'; $('#drawer-backdrop').hidden = false; $('#drawer').hidden = false;
  document.body.style.overflow = 'hidden'; $('#close-drawer').focus();
}
function openEditor(route, kicker, titleText, markup) {
  if (!$('#drawer').classList.contains('page-mode')) state.trigger = document.activeElement;
  $('#drawer').classList.add('page-mode'); $('#drawer').setAttribute('role', 'main'); $('#drawer').removeAttribute('aria-modal');
  $('#drawer-kicker').textContent = kicker; $('#drawer-title').textContent = titleText; $('#drawer-body').innerHTML = markup;
  $('#close-drawer').textContent = 'Back to week'; $('#drawer-backdrop').hidden = true; $('#drawer').hidden = false;
  $('#workspace').hidden = true; document.body.style.overflow = '';
  if (location.hash !== '#' + route + '/' + state.athleteId) history.replaceState(null, '', '#' + route + '/' + state.athleteId);
  window.scrollTo(0, 0);
}
function closeDrawer(force = false) {
  const wasPage = $('#drawer').classList.contains('page-mode');
  if (wasPage && state.editorDirty && !force) { $('#discard-dialog').showModal(); $('#keep-draft').focus(); return; }
  $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; document.body.style.overflow = '';
  $('#drawer').classList.remove('page-mode');
  if (wasPage) { $('#workspace').hidden = false; history.replaceState(null, '', '#athlete/' + state.athleteId); }
  state.builder = null; state.meeting = null; state.weekDraft = null; state.editorDirty = false;
  if (state.trigger?.isConnected) state.trigger.focus(); state.trigger = null;
}
function optionMarkup(options, selected) { return options.map(([value, label]) => `<option value="${safe(value)}" ${value === selected ? 'selected' : ''}>${safe(label)}</option>`).join(''); }
function builderBlocksMarkup() {
  return state.builder.blocks.map((b, i) => `<div class="block-row" data-block="${i}" draggable="true"><div><label for="block-type-${i}">Block</label><select id="block-type-${i}" data-block-field="type">${optionMarkup(TYPES, b.type)}</select></div><div><label for="block-zone-${i}">Zone</label><select id="block-zone-${i}" data-block-field="zone">${optionMarkup(ZONES, b.zone)}</select></div><div><label for="block-duration-${i}">Minutes</label><input id="block-duration-${i}" data-block-field="duration_min" type="number" min="1" max="180" value="${safe(b.duration_min)}"></div><div class="move-controls"><button type="button" class="icon-button" data-move="${i}:-1" aria-label="Move block ${i + 1} up">↑</button><button type="button" class="icon-button" data-move="${i}:1" aria-label="Move block ${i + 1} down">↓</button><button type="button" class="icon-button" data-remove="${i}" aria-label="Remove block ${i + 1}">×</button></div></div>`).join('');
}
function captureBuilder() {
  if (!state.builder) return;
  state.builder.prompt = $('#workout-prompt')?.value || '';
  state.builder.day_of_week = Number($('#workout-day')?.value ?? state.builder.day_of_week);
  state.builder.headline = $('#workout-headline')?.value || '';
  state.builder.description = $('#workout-description')?.value || '';
  state.builder.why_line = $('#workout-why')?.value || '';
  state.builder.blocks = [...$('#block-list').querySelectorAll('.block-row')].map((row) => ({
    type: row.querySelector('[data-block-field="type"]').value,
    zone: row.querySelector('[data-block-field="zone"]').value,
    duration_min: Number(row.querySelector('[data-block-field="duration_min"]').value),
  }));
}
function renderBuilder() {
  const b = state.builder;
  const total = b.blocks.reduce((sum, x) => sum + Number(x.duration_min || 0), 0);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const days = ORDER.filter((d) => (d + 6) % 7 >= todayIndex).map((d) => [String(d), DAYS[d]]);
  openEditor('builder', 'WORKOUT BUILDER', 'Create a session', `<p>Describe the ride, then shape each block. The assistant only drafts; saving is your decision.</p><div class="prompt-box"><label for="workout-prompt">Ask the assistant</label><textarea id="workout-prompt" placeholder="3 hours of Z2 with short bursts at the end">${safe(b.prompt)}</textarea><button type="button" class="secondary" data-draft>Draft workout</button><p id="draft-status" class="status" role="status"></p></div><div class="form-group"><label for="workout-day">Day this week</label><select id="workout-day">${optionMarkup(days, String(b.day_of_week))}</select></div><div class="form-group"><label for="workout-headline">Workout title</label><input id="workout-headline" maxlength="60" value="${safe(b.headline)}" placeholder="Long endurance with late surges"></div><div class="form-group"><label for="workout-description">Athlete instructions</label><textarea id="workout-description" rows="3" placeholder="Ride steadily in Z2, then finish with short controlled bursts.">${safe(b.description)}</textarea></div><div class="form-group"><label for="workout-why">Why this session</label><textarea id="workout-why" rows="2" placeholder="Build aerobic durability without a full intensity day.">${safe(b.why_line)}</textarea></div><div class="form-group"><label>Session blocks</label><div id="block-list" class="block-list">${builderBlocksMarkup()}</div><div class="builder-total"><span>Total planned time</span><strong id="builder-duration">${safe(minutesLabel(total))}</strong></div><button type="button" class="secondary" data-add-block>Add block</button><p class="helper">Drag blocks to reorder on desktop, or use the move buttons. Power targets follow the athlete’s FTP. The safety limit can shorten a session before it reaches the app.</p></div><p id="builder-error" class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="primary" data-save-workout>Save to athlete’s week</button><button type="button" class="quiet" data-close>Cancel</button></div>`);
  $('#workout-prompt').focus();
}
function openBuilder(prompt = '', day = new Date().getDay()) {
  state.editorDirty = false;
  state.builder = { prompt, day_of_week: day, headline: '', description: '', why_line: '', workout_type: 'endurance', intent: 'aerobic_base', blocks: [{ type: 'work', zone: 'endurance', duration_min: 60 }] };
  renderBuilder();
}
async function draftWorkout() {
  captureBuilder(); const b = state.builder;
  if (b.prompt.trim().length < 8) { $('#draft-status').textContent = 'Describe the workout in a sentence first.'; return; }
  $('#draft-status').textContent = 'Drafting the session…';
  try {
    const result = await portal('draft_workout', { athlete_id: state.athleteId, client_date: localDate(), prompt: b.prompt });
    state.builder = { ...b, ...result.draft, prompt: b.prompt, day_of_week: b.day_of_week };
    state.editorDirty = true;
    renderBuilder(); $('#draft-status').textContent = 'Draft ready. Review the blocks before saving.';
  } catch (error) { setStatus(error.message, true, '#draft-status'); }
}
async function saveWorkout() {
  captureBuilder(); const b = state.builder;
  if (!b.headline.trim()) { $('#builder-error').textContent = 'Add a workout title.'; $('#workout-headline').focus(); return; }
  if (!b.blocks.length) { $('#builder-error').textContent = 'Add at least one session block.'; return; }
  if (b.blocks.some((x) => !Number.isInteger(x.duration_min) || x.duration_min < 1 || x.duration_min > 180)) { $('#builder-error').textContent = 'Each block needs 1–180 minutes.'; return; }
  $('#builder-error').textContent = 'Saving the workout…';
  try {
    const result = await portal('save_workout', { athlete_id: state.athleteId, client_date: localDate(), week_start_date: currentWeek(), day_of_week: b.day_of_week,
      headline: b.headline, description: b.description, why_line: b.why_line, workout_type: b.workout_type, intent: b.intent, blocks: b.blocks });
    closeDrawer(true); await selectAthlete(state.athleteId);
    setStatus(result.safety_adjusted ? 'Workout saved. Trainable shortened it to the athlete’s safety limit; review the updated duration.' : 'Workout saved to the athlete’s live week.');
  } catch (error) { $('#builder-error').textContent = error.message; }
}
async function reviewWeek() {
  setStatus('The assistant is reviewing the week…');
  try {
    const result = await portal('suggest_week', { athlete_id: state.athleteId, client_date: localDate() });
    const d = result.draft;
    state.editorDirty = true;
    state.builder = { ...d, prompt: '', day_of_week: result.suggested_day_of_week };
    renderBuilder(); $('#draft-status').textContent = 'Assistant suggestion. Check the day and blocks before saving.';
    setStatus('');
  } catch (error) { setStatus(error.message, true); }
}
function nextWeek() { const d = new Date(currentWeek() + 'T12:00:00'); d.setDate(d.getDate() + 7); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
function weekMinutes(day) { return day.locked ? (day.existing || []).reduce((n, w) => n + (Number(w.target_duration_min) || 0), 0)
  : day.rest ? 0 : (day.blocks || []).reduce((n, b) => n + (Number(b.duration_min) || 0), 0); }
function weekBlocksMarkup(day) {
  return (day.blocks || []).map((b, i) => `<div class="block-row" data-week-block="${i}"><div><label for="week-type-${day.day_of_week}-${i}">Block</label><select id="week-type-${day.day_of_week}-${i}" data-week-block-field="type">${optionMarkup(TYPES, b.type)}</select></div><div><label for="week-zone-${day.day_of_week}-${i}">Zone</label><select id="week-zone-${day.day_of_week}-${i}" data-week-block-field="zone">${optionMarkup(ZONES, b.zone)}</select></div><div><label for="week-duration-${day.day_of_week}-${i}">Minutes</label><input id="week-duration-${day.day_of_week}-${i}" data-week-block-field="duration_min" type="number" min="1" max="180" value="${safe(b.duration_min)}"></div><div class="move-controls"><button type="button" class="icon-button" data-week-move="${day.day_of_week}:${i}:-1" aria-label="Move block ${i + 1} up">↑</button><button type="button" class="icon-button" data-week-move="${day.day_of_week}:${i}:1" aria-label="Move block ${i + 1} down">↓</button><button type="button" class="icon-button" data-week-remove="${day.day_of_week}:${i}" aria-label="Remove block ${i + 1}">×</button></div></div>`).join('');
}
function weekDayMarkup(day) {
  const label = DAYS[day.day_of_week];
  if (day.locked) return `<article class="week-edit-day locked"><div class="week-edit-heading"><strong>${label}</strong><span>Preserved · ${safe(minutesLabel(weekMinutes(day)))}</span></div><p>${safe((day.existing || []).map((w) => w.headline || title(w.workout_type)).join(' + ') || 'Past day')}</p><small>Completed sessions, races and existing coach sessions stay in place.</small></article>`;
  return `<article class="week-edit-day" data-week-day="${day.day_of_week}"><div class="week-edit-heading"><strong>${label}</strong><span>${safe(minutesLabel(weekMinutes(day)))}</span></div><div class="week-day-choice"><label for="week-mode-${day.day_of_week}">Plan for ${label}</label><select id="week-mode-${day.day_of_week}" data-week-field="mode"><option value="ride" ${day.rest ? '' : 'selected'}>Workout</option><option value="rest" ${day.rest ? 'selected' : ''}>Rest day</option></select></div>${day.rest ? `<p class="helper">Recovery is part of the plan. Change to Workout if needed.</p>` : `<details><summary>${safe(day.headline || 'Edit workout')} · Edit details and blocks</summary><div class="week-day-details"><div class="form-group"><label for="week-headline-${day.day_of_week}">Workout title</label><input id="week-headline-${day.day_of_week}" data-week-field="headline" maxlength="60" value="${safe(day.headline)}"></div><div class="form-group"><label for="week-description-${day.day_of_week}">Athlete instructions</label><textarea id="week-description-${day.day_of_week}" data-week-field="description" rows="3">${safe(day.description)}</textarea></div><div class="form-group"><label for="week-why-${day.day_of_week}">Why this session</label><textarea id="week-why-${day.day_of_week}" data-week-field="why_line" rows="2">${safe(day.why_line)}</textarea></div><div class="block-list">${weekBlocksMarkup(day)}</div><button type="button" class="secondary small-button" data-week-add="${day.day_of_week}">Add block</button></div></details>`}</article>`;
}
function captureWeekEditor() {
  const draft = state.weekDraft; if (!draft) return;
  draft.focus = $('#week-focus')?.value ?? draft.focus;
  for (const row of document.querySelectorAll('[data-week-day]')) {
    const day = draft.days.find((d) => d.day_of_week === Number(row.dataset.weekDay)); if (!day) continue;
    day.rest = row.querySelector('[data-week-field="mode"]').value === 'rest';
    if (day.rest) continue;
    for (const field of ['headline', 'description', 'why_line']) {
      const input = row.querySelector(`[data-week-field="${field}"]`); if (input) day[field] = input.value;
    }
    const blocks = [...row.querySelectorAll('[data-week-block]')].map((block) => ({
      type: block.querySelector('[data-week-block-field="type"]').value,
      zone: block.querySelector('[data-week-block-field="zone"]').value,
      duration_min: Number(block.querySelector('[data-week-block-field="duration_min"]').value),
    }));
    day.blocks = blocks.length ? blocks : day.blocks?.length ? day.blocks : [{ type: 'work', zone: 'endurance', duration_min: 45 }];
  }
}
function updateWeekTotal() {
  if (!state.weekDraft) return;
  const total = state.weekDraft.days.reduce((n, d) => n + weekMinutes(d), 0);
  const limit = Math.round(state.weekDraft.evidence.baseline_cap_min * 1.2);
  $('#week-total').textContent = trainingMinutesLabel(total);
  $('#week-load-warning').hidden = total <= limit;
}
function renderWeekEditor() {
  const d = state.weekDraft;
  const selected = d?.week_start_date || state.weekSelection || currentWeek();
  const storedPlan = state.athlete?.plans?.find((p) => p.week_start_date === selected);
  const hasStoredDays = state.athlete?.workouts?.some((w) => w.plan_id === storedPlan?.id);
  const selector = `<div class="form-group"><label for="week-start">Planning week</label><select id="week-start"><option value="${currentWeek()}" ${selected === currentWeek() ? 'selected' : ''}>This week · ${safe(dateLabel(currentWeek()))}</option><option value="${nextWeek()}" ${selected === nextWeek() ? 'selected' : ''}>Next week · ${safe(dateLabel(nextWeek()))}</option></select></div>`;
  const focus = `<div class="form-group"><label for="week-focus">Coach focus, optional</label><textarea id="week-focus" rows="2" maxlength="500" placeholder="Build aerobic base, with one sprint session">${safe(d?.focus || '')}</textarea><p class="helper">A short direction for the assistant. You can change every draft day before publishing.</p></div>`;
  const content = d ? `<div class="callout"><strong>Conservative baseline</strong><p>${safe(d.summary || 'A balanced starting point for coach review.')}</p><small>Recent cycling average: ${safe(trainingMinutesLabel(d.evidence.recent_average_min))} per week · Draft ceiling: ${safe(trainingMinutesLabel(d.evidence.baseline_cap_min))} · Single-session evidence limit: ${safe(trainingMinutesLabel(d.evidence.session_cap_min))}. ${d.notes_considered ? `${d.notes_considered} athlete note${d.notes_considered === 1 ? '' : 's'} considered.` : 'No athlete notes yet.'}${d.evidence.sessions < 2 ? ' Recent riding is limited, so review the starting load closely.' : ''}</small></div><div class="week-edit-list">${d.days.map(weekDayMarkup).join('')}</div><div class="week-review"><div><span>Reviewed week</span><strong id="week-total"></strong></div><p>AI prepared the baseline. You decide whether to publish it; fixed days stay in place.</p><div id="week-load-warning" class="callout warning" hidden><label class="acknowledge"><input id="week-acknowledge" type="checkbox"> I reviewed the added load above the conservative baseline.</label></div><p id="week-error" class="form-error" role="alert"></p><button type="button" class="primary" data-publish-week>Publish reviewed week</button><button type="button" class="quiet" data-generate-week>Generate a new baseline</button></div>` : `<div class="list-empty"><strong>Start with a safe baseline</strong><p>The assistant drafts the whole week from recent training, recovery, goals and athlete notes. Completed work and races stay fixed.</p><button type="button" class="primary" data-generate-week>Generate baseline week</button></div>`;
  const resetAction = hasStoredDays ? `<div class="reset-week-action"><p>Want to start this planned week again? Review what can be removed before rebuilding it.</p><button type="button" class="quiet" data-reset-week>Delete planned week</button></div>` : '';
  openEditor('week', 'WEEK BUILDER', 'Build the full week', `<p>Build a conservative starting week, then make the coaching decisions together.</p>${selector}${focus}<p id="week-status" class="status" role="status"></p>${content}${resetAction}`);
  if (d) updateWeekTotal();
}
function openWeek(weekStart = currentWeek()) { state.weekDraft = null; state.weekSelection = weekStart; state.editorDirty = false; renderWeekEditor(); }
function rerenderWeek() {
  const y = window.scrollY;
  const openDays = [...document.querySelectorAll('[data-week-day] details[open]')]
    .map((details) => details.closest('[data-week-day]').dataset.weekDay);
  renderWeekEditor();
  for (const day of openDays) { const details = document.querySelector(`[data-week-day="${day}"] details`); if (details) details.open = true; }
  window.scrollTo(0, y);
}
async function generateWeek(afterReset = false) {
  if (state.weekGenerating) return;
  const week_start_date = $('#week-start').value; const focus = $('#week-focus').value.trim();
  state.weekGenerating = true;
  const button = $('[data-generate-week]'); if (button) button.disabled = true;
  $('#week-status').textContent = 'Building a conservative week…';
  try {
    const result = await portal('draft_week', { athlete_id: state.athleteId, week_start_date,
      client_date: localDate(), focus });
    state.weekSelection = week_start_date; state.weekDraft = { ...result, focus }; state.editorDirty = true;
    renderWeekEditor(); $('#week-status').textContent = afterReset
      ? 'Planned days deleted. Your new baseline is ready to review.'
      : 'Baseline ready. Review each day before publishing.';
  } catch (error) { setStatus(afterReset ? `Planned days deleted. Generate a new baseline when ready. ${error.message}` : error.message, true, '#week-status'); }
  finally { state.weekGenerating = false; if (button?.isConnected) button.disabled = false; }
}
async function previewResetWeek() {
  if (state.weekResetting || state.weekReset) return;
  const week_start_date = $('#week-start')?.value;
  const button = $('[data-reset-week]');
  if (button) button.disabled = true;
  setStatus('Checking this planned week…', false, '#week-status');
  try {
    const result = await portal('preview_reset_week', { athlete_id: state.athleteId,
      week_start_date, client_date: localDate() });
    if (!result.removable?.length) {
      setStatus('This week has no editable planned days to delete. Completed work, races and past days stay in place.', false, '#week-status');
      return;
    }
    state.weekReset = { ...result, week_start_date };
    state.resetTrigger = button;
    const athlete = state.athlete?.profile?.display_name || 'this athlete';
    $('#reset-week-title').textContent = `Delete the ${dateLabel(week_start_date)} week for ${athlete}?`;
    const count = result.removable.length;
    $('#reset-week-copy').textContent = `This removes ${count} editable planned day${count === 1 ? '' : 's'} and prepares a fresh baseline for coach review. ${result.preserved.length} protected day${result.preserved.length === 1 ? '' : 's'} will stay. Past days, completed sessions, races and recorded work are always kept.${state.weekDraft ? ' Your unsaved draft will also be discarded.' : ''}`;
    setStatus('', false, '#week-status');
    $('#reset-week-dialog').returnValue = 'cancel';
    $('#reset-week-dialog').showModal(); $('#cancel-reset-week').focus();
  } catch (error) { setStatus(error.message, true, '#week-status'); }
  finally { if (button?.isConnected) button.disabled = false; }
}
async function resetWeek(snapshot) {
  if (state.weekResetting) return;
  state.weekResetting = true;
  setStatus('Deleting editable planned days…', false, '#week-status');
  let removed = false;
  try {
    await portal('reset_week', { athlete_id: state.athleteId,
      week_start_date: snapshot.week_start_date, client_date: localDate(), confirmed: true,
      expected_plan_id: snapshot.plan_id, expected_rows: snapshot.expected_rows });
    removed = true;
    state.weekDraft = null; state.editorDirty = false; state.weekSelection = snapshot.week_start_date;
    state.athlete = await portal('read_athlete', { athlete_id: state.athleteId });
    renderAthlete(); renderWeekEditor();
    await generateWeek(true);
  } catch (error) {
    setStatus(removed ? `Planned days were deleted, but the view could not refresh. ${error.message}` : error.message, true, '#week-status');
  } finally {
    state.weekResetting = false;
    state.resetTrigger = null;
    $('#week-start')?.focus();
  }
}
async function publishWeek() {
  if (state.weekPublishing) return;
  captureWeekEditor(); const draft = state.weekDraft; if (!draft) return;
  const editable = draft.days.filter((d) => !d.locked);
  const invalid = editable.find((d) => !d.rest && (!d.headline?.trim() || !d.blocks?.length
    || d.blocks.some((b) => !Number.isInteger(b.duration_min) || b.duration_min < 1 || b.duration_min > 180)));
  if (invalid) {
    $('#week-error').textContent = `Review the title and blocks for ${DAYS[invalid.day_of_week]}.`;
    const row = document.querySelector(`[data-week-day="${invalid.day_of_week}"]`);
    const details = row?.querySelector('details'); if (details) details.open = true;
    const field = !invalid.headline?.trim() ? row?.querySelector('[data-week-field="headline"]')
      : [...(row?.querySelectorAll('[data-week-block-field="duration_min"]') || [])]
        .find((input) => !Number.isInteger(Number(input.value)) || Number(input.value) < 1 || Number(input.value) > 180);
    field?.setAttribute('aria-invalid', 'true'); field?.focus(); return;
  }
  const total = draft.days.reduce((n, d) => n + weekMinutes(d), 0);
  const acknowledge_load = total <= draft.evidence.baseline_cap_min * 1.2 || $('#week-acknowledge')?.checked === true;
  if (!acknowledge_load) { $('#week-error').textContent = 'Review the added load and tick the confirmation before publishing.'; $('#week-acknowledge').focus(); return; }
  state.weekPublishing = true;
  const button = $('[data-publish-week]'); if (button) button.disabled = true;
  $('#week-error').textContent = 'Publishing the reviewed week…';
  try {
    const result = await portal('publish_week', { athlete_id: state.athleteId,
      week_start_date: draft.week_start_date, client_date: localDate(),
      days: editable, confirmed: true, acknowledge_load });
    closeDrawer(true); await selectAthlete(state.athleteId);
    setStatus(result.safety_adjusted ? 'Week published. Trainable shortened a session to the athlete’s safety limit; review its duration.' : 'Reviewed week published to the athlete’s plan.');
  } catch (error) { $('#week-error').textContent = error.message; }
  finally { state.weekPublishing = false; if (button?.isConnected) button.disabled = false; }
}
function openNote() {
  state.editorDirty = false;
  const isSelf = state.roster.find((person) => person.id === state.athleteId)?.is_self;
  const visibility = isSelf ? '<p class="callout">This note is shared with your connected coach.</p>'
    : '<div class="form-group"><label for="note-visibility">Who can see this?</label><select id="note-visibility"><option value="coach_private">Only me</option><option value="shared">Athlete and connected coaches</option></select><p class="helper">Private notes stay with you. Shared notes may inform assistant drafts when the athlete allows AI sharing.</p></div>';
  openEditor('note', 'ATHLETE CONTEXT', 'Add an athlete note', `<p>Record an observation, preference, goal or constraint. Choose who can see it before saving.</p><div class="form-group"><label for="note-kind">Note type</label><select id="note-kind"><option value="observation">Training response</option><option value="preference">Preference</option><option value="goal">Goal</option><option value="constraint">Constraint</option></select></div>${visibility}<div class="form-group"><label for="note-body">What should the coach remember?</label><textarea id="note-body" rows="5" maxlength="500" required aria-describedby="note-error" placeholder="Sprints late in a long Z2 ride tend to feel flat; try them earlier."></textarea><p class="helper">Describe an observation, not a diagnosis. You can archive it when it stops being useful.</p></div><p id="note-error" class="form-error" role="alert"></p><button type="button" class="primary" data-save-note>Save note</button>`);
  $('#note-body').focus();
}
async function saveNote() {
  if (state.noteSaving) return;
  const body = $('#note-body').value.trim();
  if (body.length < 3) { $('#note-error').textContent = 'Add a few words about this athlete.';
    $('#note-body').setAttribute('aria-invalid', 'true'); $('#note-body').focus(); return; }
  state.noteSaving = true;
  const button = $('[data-save-note]'); if (button) button.disabled = true;
  $('#note-error').textContent = 'Saving note…';
  try {
    await portal('add_note', { athlete_id: state.athleteId, kind: $('#note-kind').value,
      visibility: $('#note-visibility')?.value || 'shared', body });
    closeDrawer(true); await selectAthlete(state.athleteId); setStatus('Note saved.');
  } catch (error) { $('#note-error').textContent = error.message; }
  finally { state.noteSaving = false; if (button?.isConnected) button.disabled = false; }
}
async function archiveNote() {
  const noteId = state.noteToArchive; state.noteToArchive = null;
  if (!noteId) return;
  try {
    await portal('archive_note', { athlete_id: state.athleteId, note_id: noteId });
    await selectAthlete(state.athleteId); setStatus('Athlete note archived.');
  } catch (error) { setStatus(error.message, true); }
}
function meetingMarkup() {
  const m = state.meeting;
  return `<p>Paste a Google Meet transcript after the call. Trainable drafts minutes and suggestions for your review. The transcript is not saved.</p><div class="form-group"><label for="meeting-link">Google Meet link</label><input id="meeting-link" type="url" value="${safe(m.meeting_url)}" placeholder="https://meet.google.com/abc-defg-hij"></div><div class="form-group"><label for="meeting-date">Call date and time</label><input id="meeting-date" type="datetime-local" value="${safe(m.happened_at)}"></div><div class="prompt-box"><label for="meeting-transcript">Transcript</label><textarea id="meeting-transcript" rows="7" placeholder="Paste the call transcript here">${safe(m.transcript)}</textarea><button type="button" class="secondary" data-analyze-minutes>Draft minutes</button><p id="minutes-status" class="status" role="status"></p></div><div class="form-group"><label for="meeting-summary">Summary for the athlete</label><textarea id="meeting-summary" rows="4">${safe(m.summary)}</textarea></div><div class="form-group"><label for="meeting-decisions">Agreed decisions</label><textarea id="meeting-decisions" rows="4" placeholder="One decision per line">${safe(m.decisions)}</textarea></div><div class="form-group"><label for="meeting-changes">Possible workout changes</label><textarea id="meeting-changes" rows="4" placeholder="One suggestion per line">${safe(m.proposed_changes)}</textarea><p class="helper">These stay as suggestions until you create and save a workout.</p></div><p id="meeting-error" class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="primary" data-save-minutes>Save reviewed minutes</button><button type="button" class="quiet" data-close>Cancel</button></div>`;
}
function captureMeeting() {
  const m = state.meeting;
  m.meeting_url = $('#meeting-link').value.trim(); m.happened_at = $('#meeting-date').value;
  m.transcript = $('#meeting-transcript').value; m.summary = $('#meeting-summary').value;
  m.decisions = $('#meeting-decisions').value; m.proposed_changes = $('#meeting-changes').value;
}
function openMeeting() {
  const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  state.editorDirty = false;
  state.meeting = { meeting_url: '', happened_at: local, transcript: '', summary: '', decisions: '', proposed_changes: '' };
  openEditor('meeting', 'GOOGLE MEET NOTES', 'Review a coach call', meetingMarkup());
  $('#meeting-link').focus();
}
async function analyzeMinutes() {
  captureMeeting(); const m = state.meeting;
  if (m.transcript.trim().length < 40) { $('#minutes-status').textContent = 'Paste at least a few lines of transcript.'; return; }
  $('#minutes-status').textContent = 'Drafting minutes…';
  try {
    const result = await portal('analyze_minutes', { athlete_id: state.athleteId, transcript: m.transcript });
    m.summary = result.minutes.summary; m.decisions = result.minutes.decisions.join('\n');
    m.proposed_changes = result.minutes.proposed_changes.join('\n');
    state.editorDirty = true;
    openEditor('meeting', 'GOOGLE MEET NOTES', 'Review a coach call', meetingMarkup());
    $('#minutes-status').textContent = 'Draft ready. Edit and save the minutes you agree with.';
  } catch (error) { setStatus(error.message, true, '#minutes-status'); }
}
async function saveMinutes() {
  captureMeeting(); const m = state.meeting;
  if (!m.summary.trim()) { $('#meeting-error').textContent = 'Add a short summary before saving.'; $('#meeting-summary').focus(); return; }
  $('#meeting-error').textContent = 'Saving minutes…';
  try {
    await portal('save_minutes', { athlete_id: state.athleteId, meeting_url: m.meeting_url,
      happened_at: new Date(m.happened_at).toISOString(), summary: m.summary,
      decisions: m.decisions.split('\n').map((s) => s.trim()).filter(Boolean),
      proposed_changes: m.proposed_changes.split('\n').map((s) => s.trim()).filter(Boolean) });
    closeDrawer(true); await selectAthlete(state.athleteId); setStatus('Reviewed minutes saved. Workout ideas are still suggestions.');
  } catch (error) { $('#meeting-error').textContent = error.message; }
}
function invitePanel() {
  openDrawer('ATHLETE ACCESS', 'Invite your coach', `<p>Create a one-time code and share it privately with your coach. They sign in to Trainable and choose “Use invite code.” You can remove access here at any time.</p><button type="button" class="primary" data-create-invite>Create invite code</button><div id="invite-result"></div><div class="section-head"><h3>Coaches with access</h3></div><div class="meeting-list">${state.sharedWith.length ? state.sharedWith.map((x) => `<div class="meeting-row"><strong>${safe(x.display_name || 'Coach account')}</strong><p>Connected ${safe(dateLabel(x.created_at))}</p><button type="button" class="secondary small-button" data-revoke="${safe(x.coach_id)}">Remove access</button></div>`).join('') : '<div class="list-empty">No coach has access yet.</div>'}</div>`);
}
async function createInvite() {
  const box = $('#invite-result'); box.textContent = 'Creating invite…';
  try {
    const result = await portal('create_invite');
    const workspaceUrl = new URL('./', location.href).href;
    box.innerHTML = `<p class="helper">Valid for seven days and one use. Send your coach this workspace address and code. Trainable does not show the code again.</p><p><a href="${safe(workspaceUrl)}">${safe(workspaceUrl)}</a></p><div class="invite-code">${safe(result.code)}</div><button class="secondary" type="button" data-copy-code>Copy invitation</button>`;
    box.dataset.code = 'Open ' + workspaceUrl + ' and sign in to Trainable. Choose “Use invite code” and enter: ' + result.code;
  } catch (error) { box.textContent = error.message; }
}
function joinPanel() {
  openDrawer('COACH ACCESS', 'Join an athlete', '<p>Ask the athlete for their one-time code. After you connect, their live training week appears in your list.</p><div class="form-group"><label for="invite-input">Invite code</label><input id="invite-input" maxlength="48" spellcheck="false" autocomplete="off" placeholder="48-character code"></div><p id="join-error" class="form-error" role="alert"></p><button class="primary" type="button" data-redeem>Connect to athlete</button>');
}
async function redeemInvite() {
  const code = $('#invite-input').value.trim();
  if (!/^[0-9a-f]{48}$/i.test(code)) { $('#join-error').textContent = 'Enter the complete 48-character code.'; return; }
  $('#join-error').textContent = 'Connecting…';
  try { const result = await portal('redeem_invite', { code }); closeDrawer(); await loadWorkspace(); await selectAthlete(result.athlete_id); setStatus('Athlete connected. You can now see the live training week.'); }
  catch (error) { $('#join-error').textContent = error.message; }
}

$('#sign-in-form').addEventListener('submit', async (event) => {
  event.preventDefault(); clearFieldError('email'); clearFieldError('password');
  const email = $('#email').value.trim(); const password = $('#password').value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('email', 'Enter an email like name@example.com.'); $('#email').focus(); return; }
  if (!password) { showFieldError('password', 'Enter your password.'); $('#password').focus(); return; }
  setStatus('Signing in…', false, '#auth-status');
  try { const current = await authRequest('token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); saveSession(current); await resumeWorkspace(); }
  catch (error) { setStatus(error.message, true, '#auth-status'); }
});
for (const id of ['email', 'password']) {
  $('#' + id).addEventListener('blur', () => { if (!$('#' + id).value.trim()) showFieldError(id, id === 'email' ? 'Enter your email.' : 'Enter your password.'); });
  $('#' + id).addEventListener('focus', () => clearFieldError(id));
  $('#' + id).addEventListener('input', () => clearFieldError(id));
}
for (const [id, provider] of [['google-sign-in', 'google']]) {
  $('#' + id).addEventListener('click', () => {
    if (location.protocol === 'file:') { location.assign(LIVE_COACH_URL); return; }
    sessionStorage.setItem(OAUTH_KEY, String(Date.now()));
    sessionStorage.setItem('trainable_web_oauth_intent', String(Date.now()));
    sessionStorage.setItem('trainable_coach_return', String(Date.now()));
    const url = new URL(API + '/auth/v1/authorize');
    url.searchParams.set('provider', provider); url.searchParams.set('redirect_to', new URL('../billing.html', location.href).href);
    location.assign(url.toString());
  });
}
$('#sign-out').addEventListener('click', async () => {
  try { await authRequest('logout', { method: 'POST', headers: { Authorization: 'Bearer ' + await token() } }); } catch { /* Clear the local session even if the server is unavailable. */ }
  clearSession(); state.roster = []; state.athlete = null; state.athleteId = null; showAuth('');
});
$('#retry-workspace').addEventListener('click', resumeWorkspace);
$('#show-attention').addEventListener('click', showAttention);
$('#show-athletes').addEventListener('click', () => showAthletes());
$('#show-devices').addEventListener('click', showDevices);
$('#devices-content').addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-device-retry')) { await showDevices(); return; }
  if (button.hasAttribute('data-intervals-connect')) {
    button.disabled = true; button.textContent = 'Opening Intervals.icu…';
    try { const result = await intervals('connect');
      const url = new URL(result.authorization_url);
      if (url.origin !== 'https://intervals.icu' || url.pathname !== '/oauth/authorize') throw new Error('Intervals.icu returned an unexpected sign-in address.');
      location.assign(url.href);
    } catch (error) { button.disabled = false; button.textContent = 'Connect Intervals.icu'; setStatus(error.message, true); }
    return;
  }
  if (button.hasAttribute('data-intervals-sync')) {
    button.disabled = true; button.textContent = 'Importing…';
    try { const result = await intervals('sync'); await showDevices(); setStatus(`Checked ${result.wellness_days} wellness days and ${result.garmin_activities} Garmin activities.`); }
    catch (error) { button.disabled = false; button.textContent = 'Import recent data'; setStatus(error.message, true); }
    return;
  }
  if (button.hasAttribute('data-intervals-remove')) {
    state.removeIntervalsTrigger = button; $('#remove-intervals-dialog').showModal(); $('#keep-intervals').focus(); return;
  }
  if (button.hasAttribute('data-device-remove')) {
    state.removeGarminTrigger = button; $('#remove-garmin-dialog').showModal(); $('#keep-garmin').focus(); return;
  }
  if (button.hasAttribute('data-device-connect')) {
    button.disabled = true; button.textContent = 'Opening Garmin…';
    try { const result = await wearables('connect'); location.assign(result.authorization_url); }
    catch (error) { button.disabled = false; button.textContent = 'Connect Garmin'; setStatus(error.message, true); }
  }
  if (button.hasAttribute('data-device-sync')) {
    button.disabled = true; button.textContent = 'Importing…';
    try { const result = await wearables('sync'); await showDevices();
      setStatus(result.has_more ? 'Imported the first batch. Import again for older workouts.' : `Garmin import finished: ${result.imported} workouts checked.`); }
    catch (error) { button.disabled = false; button.textContent = 'Import latest workouts'; setStatus(error.message, true); }
  }
});
$('#remove-intervals-dialog').addEventListener('close', async () => {
  const trigger = state.removeIntervalsTrigger; state.removeIntervalsTrigger = null;
  if ($('#remove-intervals-dialog').returnValue !== 'confirm') { trigger?.focus(); return; }
  try { const result = await intervals('disconnect'); await showDevices();
    setStatus(result.revocation_pending ? 'Imported data deleted. Intervals.icu access revocation is queued for retry.' : 'Intervals.icu disconnected and imported data deleted.');
    $('#show-devices').focus(); }
  catch (error) { setStatus(error.message, true); trigger?.focus(); }
});
$('#remove-garmin-dialog').addEventListener('close', async () => {
  const trigger = state.removeGarminTrigger; state.removeGarminTrigger = null;
  if ($('#remove-garmin-dialog').returnValue !== 'confirm') { trigger?.focus(); return; }
  try { await wearables('remove'); await showDevices(); setStatus('Garmin connection and imported data removed.'); $('#show-devices').focus(); }
  catch (error) { setStatus(error.message, true); trigger?.focus(); }
});
$('#refresh-attention').addEventListener('click', showAttention);
$('.attention-filters').addEventListener('click', (event) => {
  const filter = event.target.closest('[data-attention-filter]')?.dataset.attentionFilter;
  if (!filter) return; state.attentionFilter = filter; renderAttention();
});
$('#attention-list').addEventListener('click', async (event) => {
  if (event.target.closest('[data-attention-retry]')) { await showAttention(); return; }
  if (event.target.closest('[data-attention-athletes]')) { showAthletes(); return; }
  const review = event.target.closest('[data-attention-review]');
  if (review) {
    review.disabled = true;
    try {
      await portal('review_attention', { item_id: review.dataset.attentionReview, client_date: localDate() });
      const item = state.attention.items.find((row) => row.id === review.dataset.attentionReview);
      if (item) item.reviewed_at = new Date().toISOString();
      renderAttention();
      ($('#attention-list [data-attention-review]') || $('#attention-list [data-attention-athlete]') || $('[data-attention-filter="reviewed"]')).focus();
    } catch (error) { review.disabled = false; setStatus(error.message, true); }
    return;
  }
  const athlete = event.target.closest('[data-attention-athlete]');
  if (athlete) {
    showAthletes(false, false);
    await selectAthlete(athlete.dataset.attentionAthlete, { openDetail: true, pushRoute: true });
    if (athlete.dataset.attentionPlan === 'true' && state.athleteId === athlete.dataset.attentionAthlete && state.athlete) openWeek(nextWeek());
    scrollTo(0, 0);
  }
});
addEventListener('storage', (event) => { if (event.key === SESSION_KEY && !event.newValue && !$('#workspace').hidden) { state.roster = []; state.athlete = null; state.athleteId = null; showAuth('Signed out in another tab.'); } });
$('#roster-query').addEventListener('input', renderRoster);
$('#roster-list').addEventListener('click', (event) => {
  if (event.target.closest('[data-clear-roster]')) { $('#roster-query').value = ''; renderRoster(); $('#roster-query').focus(); return; }
  const button = event.target.closest('[data-athlete]');
  if (button) { selectAthlete(button.dataset.athlete, { openDetail: true, pushRoute: true }); if (matchMedia('(max-width: 767.98px)').matches) scrollTo(0, 0); }
});
$('#roster-list').addEventListener('keydown', (event) => {
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  const items = [...$('#roster-list').querySelectorAll('[data-athlete]')];
  const index = items.indexOf(document.activeElement);
  if (index < 0) return;
  if (event.key === 'Enter') { event.preventDefault(); $('#athlete-pane').focus(); return; }
  event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
});
addEventListener('popstate', () => {
  const route = location.hash.slice(1).split('/');
  if (route[0] === 'attention') { showAttention(); return; }
  if (route[0] === 'devices') { showDevices(); return; }
  if (route[0] === 'team' || !route[0]) { showAthletes(false); state.mobileDetailOpen = false; $('#workspace').classList.remove('mobile-detail-open'); return; }
  if (route[0] === 'athlete' && state.roster.some((p) => p.id === route[1])) { showAthletes(false, false); selectAthlete(route[1], { openDetail: true, updateRoute: false }); }
});
$('#athlete-pane').addEventListener('click', (event) => {
  const section = event.target.closest('[data-athlete-section]');
  if (section) { state.athleteSection = section.dataset.athleteSection; renderAthlete(); $(`[data-athlete-section="${state.athleteSection}"]`).focus(); return; }
  const layout = event.target.closest('[data-calendar-layout]');
  if (layout) { state.calendarLayout = layout.dataset.calendarLayout; renderAthlete(); $(`[data-calendar-layout="${state.calendarLayout}"]`).focus(); return; }
  const preview = event.target.closest('[data-workout-preview]');
  if (preview) { preview.focus(); previewWorkout(preview.dataset.workoutPreview); return; }
  const shift = event.target.closest('[data-week-shift]');
  if (shift) { const weeks = calendarWeeks(); const next = weeks[weeks.indexOf(state.calendarWeek) + Number(shift.dataset.weekShift)]; if (next) { state.calendarWeek = next; renderAthlete(); const control = $(`[data-week-shift="${shift.dataset.weekShift}"]`); (control.disabled ? $('[data-action="this-week"]') : control).focus(); } return; }
  const addDay = event.target.closest('[data-add-calendar-day]');
  if (addDay) { if (state.calendarWeek === currentWeek()) openBuilder('', Number(addDay.dataset.addCalendarDay)); else openWeek(state.calendarWeek); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'back-to-roster') { state.mobileDetailOpen = false; $('#workspace').classList.remove('mobile-detail-open'); history.pushState(null, '', '#team'); $('#roster-query').focus(); scrollTo(0, 0); return; }
  if (action === 'new-workout') { if (state.calendarWeek === nextWeek()) openWeek(nextWeek()); else openBuilder(); }
  if (action === 'this-week') { state.calendarWeek = currentWeek(); state.athleteSection = 'calendar'; renderAthlete(); $('[data-action="this-week"]').focus(); }
  if (action === 'retry-athlete') selectAthlete(state.athleteId);
  if (action === 'connect-athlete') joinPanel();
  if (action === 'new-meeting') openMeeting();
  if (action === 'new-note') openNote();
  if (action === 'build-week') openWeek(state.calendarWeek || currentWeek());
  if (action === 'review-week') reviewWeek();
  const noteId = event.target.closest('[data-archive-note]')?.dataset.archiveNote;
  if (noteId) { state.noteToArchive = noteId; $('#archive-note-dialog').showModal(); $('#keep-note').focus(); }
  const change = event.target.closest('[data-change]')?.dataset.change;
  if (change) { const [mi, ci] = change.split(':').map(Number); openBuilder(state.athlete.meetings[mi]?.proposed_changes[ci] || ''); }
});
$('#invite-coach').addEventListener('click', invitePanel);
$('#join-team').addEventListener('click', joinPanel);
$('#close-drawer').addEventListener('click', () => closeDrawer());
$('#drawer-backdrop').addEventListener('click', () => closeDrawer());
$('#discard-dialog').addEventListener('close', () => { if ($('#discard-dialog').returnValue === 'confirm') closeDrawer(true); else $('#close-drawer').focus(); });
$('#archive-note-dialog').addEventListener('close', () => { if ($('#archive-note-dialog').returnValue === 'confirm') archiveNote(); else state.noteToArchive = null; });
$('#reset-week-dialog').addEventListener('close', () => {
  const snapshot = state.weekReset; state.weekReset = null;
  if ($('#reset-week-dialog').returnValue === 'confirm' && snapshot) resetWeek(snapshot);
  else if (state.resetTrigger?.isConnected) state.resetTrigger.focus();
  state.resetTrigger = null;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#drawer').hidden && !$('#revoke-dialog').open && !$('#discard-dialog').open
    && !$('#archive-note-dialog').open && !$('#reset-week-dialog').open) closeDrawer();
  if (event.key === 'Tab' && !$('#drawer').hidden && !$('#drawer').classList.contains('page-mode')) {
    const focusable = [...$('#drawer').querySelectorAll('button, input, textarea, select, a[href]')].filter((el) => !el.disabled && !el.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
$('#drawer-body').addEventListener('click', async (event) => {
  const el = event.target.closest('button'); if (!el) return;
  if (el.hasAttribute('data-close')) closeDrawer();
  if (el.hasAttribute('data-draft')) draftWorkout();
  if (el.hasAttribute('data-save-workout')) saveWorkout();
  if (el.hasAttribute('data-add-block')) { captureBuilder(); state.editorDirty = true; state.builder.blocks.push({ type: 'work', zone: 'endurance', duration_min: 10 }); renderBuilder(); }
  if (el.hasAttribute('data-remove')) { captureBuilder(); state.editorDirty = true; state.builder.blocks.splice(Number(el.dataset.remove), 1); renderBuilder(); }
  if (el.hasAttribute('data-move')) {
    captureBuilder(); state.editorDirty = true; const [from, offset] = el.dataset.move.split(':').map(Number); const to = from + offset;
    if (to >= 0 && to < state.builder.blocks.length) { const [item] = state.builder.blocks.splice(from, 1); state.builder.blocks.splice(to, 0, item); renderBuilder(); }
  }
  if (el.hasAttribute('data-analyze-minutes')) analyzeMinutes();
  if (el.hasAttribute('data-save-minutes')) saveMinutes();
  if (el.hasAttribute('data-save-note')) saveNote();
  if (el.hasAttribute('data-generate-week')) generateWeek();
  if (el.hasAttribute('data-reset-week')) previewResetWeek();
  if (el.hasAttribute('data-publish-week')) publishWeek();
  if (el.hasAttribute('data-week-add')) {
    captureWeekEditor(); const day = state.weekDraft.days.find((d) => d.day_of_week === Number(el.dataset.weekAdd));
    if (day) { day.blocks.push({ type: 'work', zone: 'endurance', duration_min: 10 }); state.editorDirty = true; rerenderWeek(); }
  }
  if (el.hasAttribute('data-week-remove')) {
    captureWeekEditor(); const [dayNo, index] = el.dataset.weekRemove.split(':').map(Number);
    const day = state.weekDraft.days.find((d) => d.day_of_week === dayNo);
    if (day && day.blocks.length > 1) { day.blocks.splice(index, 1); state.editorDirty = true; rerenderWeek(); }
    else $('#week-error').textContent = 'Keep at least one block or choose Rest day.';
  }
  if (el.hasAttribute('data-week-move')) {
    captureWeekEditor(); const [dayNo, from, offset] = el.dataset.weekMove.split(':').map(Number);
    const day = state.weekDraft.days.find((d) => d.day_of_week === dayNo); const to = from + offset;
    if (day && to >= 0 && to < day.blocks.length) { const [item] = day.blocks.splice(from, 1); day.blocks.splice(to, 0, item); state.editorDirty = true; rerenderWeek(); }
  }
  if (el.hasAttribute('data-create-invite')) createInvite();
  if (el.hasAttribute('data-copy-code')) {
    try { await navigator.clipboard.writeText($('#invite-result').dataset.code); el.textContent = 'Copied'; }
    catch { el.textContent = 'Select the code above to copy it'; }
  }
  if (el.hasAttribute('data-redeem')) redeemInvite();
  if (el.hasAttribute('data-revoke')) {
    const coachId = el.dataset.revoke; const coach = state.sharedWith.find((x) => x.coach_id === coachId);
    $('#revoke-title').textContent = 'Remove access for ' + (coach?.display_name || 'coach ' + coachId.slice(0, 8)) + '?';
    closeDrawer(true); $('#revoke-dialog').showModal(); $('#keep-access').focus();
    $('#revoke-dialog').addEventListener('close', async function onClose() {
      this.removeEventListener('close', onClose);
      if (this.returnValue !== 'confirm') return;
      try { await portal('revoke_access', { coach_id: coachId }); const result = await portal('bootstrap'); state.sharedWith = result.shared_with || []; invitePanel(); setStatus('Coach access removed.'); }
      catch (error) { setStatus(error.message, true); }
    });
  }
});
let dragged = null;
$('#drawer-body').addEventListener('dragstart', (event) => { const row = event.target.closest('[data-block]'); if (!row || !state.builder) return; dragged = Number(row.dataset.block); row.classList.add('dragging'); });
$('#drawer-body').addEventListener('dragover', (event) => { const row = event.target.closest('[data-block]'); if (!row || dragged === null) return; event.preventDefault(); row.classList.add('drag-target'); });
$('#drawer-body').addEventListener('dragleave', (event) => { event.target.closest('.block-row')?.classList.remove('drag-target'); });
$('#drawer-body').addEventListener('drop', (event) => {
  const row = event.target.closest('[data-block]'); if (!row || dragged === null) return; event.preventDefault();
  const to = Number(row.dataset.block); captureBuilder(); state.editorDirty = true; const [item] = state.builder.blocks.splice(dragged, 1); state.builder.blocks.splice(to, 0, item); dragged = null; renderBuilder();
});
$('#drawer-body').addEventListener('dragend', () => { dragged = null; document.querySelectorAll('.block-row').forEach((row) => row.classList.remove('dragging', 'drag-target')); });
$('#drawer-body').addEventListener('input', (event) => {
  if ($('#drawer').classList.contains('page-mode')) state.editorDirty = true;
  if (event.target.id === 'note-body' || event.target.matches('[data-week-block-field="duration_min"], [data-week-field="headline"]'))
    event.target.removeAttribute('aria-invalid');
  if (event.target.closest('[data-week-day]')) { captureWeekEditor(); updateWeekTotal(); }
  if (event.target.matches('[data-block-field="duration_min"]')) {
    const total = [...document.querySelectorAll('[data-block-field="duration_min"]')].reduce((sum, input) => sum + Number(input.value || 0), 0);
    $('#builder-duration').textContent = minutesLabel(total);
  }
  if (event.target.closest('#drawer-body')) { const err = $('#builder-error') || $('#meeting-error') || $('#week-error') || $('#note-error'); if (err) err.textContent = ''; }
});
$('#drawer-body').addEventListener('focusout', (event) => {
  if (event.target.id === 'note-body' && event.target.value.trim().length < 3) {
    event.target.setAttribute('aria-invalid', 'true');
    $('#note-error').textContent = 'Add a few words about this athlete.';
  }
  if (event.target.matches('[data-week-field="headline"]') && !event.target.value.trim()) {
    event.target.setAttribute('aria-invalid', 'true');
    $('#week-error').textContent = `Add a title for ${DAYS[Number(event.target.closest('[data-week-day]').dataset.weekDay)]}.`;
  }
  if (event.target.matches('[data-week-block-field="duration_min"]')) {
    const minutes = Number(event.target.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      event.target.setAttribute('aria-invalid', 'true');
      $('#week-error').textContent = 'Each workout block needs 1–180 minutes.';
    }
  }
});
$('#drawer-body').addEventListener('focusin', (event) => {
  if (event.target.id === 'note-body') { event.target.removeAttribute('aria-invalid'); $('#note-error').textContent = ''; }
});
$('#drawer-body').addEventListener('change', (event) => {
  if (event.target.id === 'note-kind') state.editorDirty = true;
  if (event.target.id === 'week-start') {
    const wanted = event.target.value;
    if (state.weekDraft && wanted !== state.weekDraft.week_start_date && !window.confirm('Discard this week draft and switch weeks?')) {
      event.target.value = state.weekDraft.week_start_date; return;
    }
    state.weekSelection = wanted; state.weekDraft = null; state.editorDirty = false; renderWeekEditor(); return;
  }
  if (event.target.matches('[data-week-field="mode"]')) {
    const row = event.target.closest('[data-week-day]');
    const day = state.weekDraft?.days.find((d) => d.day_of_week === Number(row?.dataset.weekDay));
    captureWeekEditor();
    if (day && !day.rest && day.workout_type === 'rest') Object.assign(day, { headline: 'Easy endurance',
      description: 'Ride steadily in Z2.', why_line: 'A controlled endurance session.',
      workout_type: 'endurance', intent: 'aerobic_base',
      blocks: [{ type: 'work', zone: 'endurance', duration_min: 45 }] });
    state.editorDirty = true; rerenderWeek();
  }
});
async function resumeWorkspace() {
  try {
    await loadWorkspace();
    let persistent = false;
    try { persistent = Boolean(localStorage.getItem(SESSION_KEY)); } catch { /* Browser storage is restricted. */ }
    if (!persistent) setStatus('This browser is not saving your sign-in after the tab closes. Check its site storage settings.', true);
    return true;
  }
  catch (error) {
    if (error.authInvalid) { clearSession(); showAuth('Your sign-in expired. Please sign in again.'); }
    else { showAuth('Your sign-in is saved, but Coach could not load right now. Check your connection and try again.'); $('#retry-workspace').hidden = false; }
    return false;
  }
}
async function start() {
  if (location.protocol === 'file:') {
    showAuth('');
    $('#auth-title').textContent = 'Open Trainable Coach online.';
    $('#auth-status').textContent = 'This saved copy cannot sign you in or show your current training.';
    $('#google-sign-in').textContent = 'Open live Trainable Coach';
    $('#sign-in-form').hidden = true;
    return;
  }
  if (await handleOAuth()) return;
  if (session()?.access_token) { await resumeWorkspace(); return; }
  showAuth('');
}
start();
