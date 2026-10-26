/* Dated observations of settings, never an inferred measurement history. */
const SETTINGS_HISTORY_KINDS = {ftp_watts:{label:'FTP',unit:'W'},body_mass_kg:{label:'Body mass',unit:'kg'},threshold_hr_bpm:{label:'Threshold heart rate',unit:'bpm'}};
const settingsHistoryCache = new Map();
let settingsHistoryKind = '';
function settingsHistoryContext(kind = settingsHistoryKind) {
  if (!state.athleteId) return null;
  const actor = typeof session === 'function' ? session()?.user?.id || 'unsigned' : 'unsigned';
  return {key:JSON.stringify([actor,state.athleteId,kind]),actor,athlete:state.athleteId,kind,sourceRequest:state.athleteRequest};
}
function settingsHistoryEntry() {
  const context = settingsHistoryContext(); if (!context) return null;
  let entry = settingsHistoryCache.get(context.key);
  if (!entry || entry.sourceRequest !== context.sourceRequest) {
    if (entry) entry.request++;
    entry = {status:'idle',rows:[],current:[],next:null,warnings:[],error:'',reason:'',request:0,sourceRequest:context.sourceRequest,more:false};
    settingsHistoryCache.set(context.key,entry);
    while (settingsHistoryCache.size > 6) { const key = settingsHistoryCache.keys().next().value; settingsHistoryCache.get(key).request++; settingsHistoryCache.delete(key); }
  }
  return entry;
}
// deno-lint-ignore no-unused-vars
function resetSettingsHistory() {
  for (const entry of settingsHistoryCache.values()) entry.request++;
  settingsHistoryCache.clear(); settingsHistoryKind = '';
  const root = document.getElementById('settings-history-content'); if (root) root.innerHTML = '';
}
// deno-lint-ignore no-unused-vars
function invalidateSettingsHistory(athleteId) {
  for (const [key,entry] of settingsHistoryCache) if (JSON.parse(key)[1] === athleteId) { entry.request++; settingsHistoryCache.delete(key); }
}
function settingsHistoryInstant(value) {
  const milliseconds = Date.parse(value); if (!Number.isFinite(milliseconds)) return null;
  const fraction = /\.(\d+)/.exec(value)?.[1] || '';
  return BigInt(milliseconds) * 1000000n + BigInt(fraction.slice(3).padEnd(6,'0').slice(0,6) || '0');
}
function settingsHistoryResponseError(result, context, cursor) {
  const fail = 'The connection did not return valid dated settings for this athlete. Refresh history to try again.';
  if (result?.version !== 'athlete-setting-history-v1' || result.athlete_id !== context.athlete || !['available','unavailable'].includes(result.status)) return fail;
  if (result.status === 'unavailable') return '';
  if (!Array.isArray(result.rows) || !Array.isArray(result.current) || !Array.isArray(result.warnings)) return fail;
  const rowValid = row => row && typeof row.id === 'string' && row.id && row.athlete_id === context.athlete && SETTINGS_HISTORY_KINDS[row.kind]?.unit === row.unit && typeof row.value === 'number' && Number.isFinite(row.value) && row.value > 0 && Number.isSafeInteger(row.revision) && row.revision > 0 && Number.isFinite(Date.parse(row.valid_from)) && Number.isFinite(Date.parse(row.recorded_at)) && (row.valid_to === null || Number.isFinite(Date.parse(row.valid_to)) && settingsHistoryInstant(row.valid_to) > settingsHistoryInstant(row.valid_from)) && ['migration_baseline','athlete_edit','coach_or_service_edit'].includes(row.origin) && ['You','Athlete','Coach or service','Actor not recorded'].includes(row.actor_label);
  if ([...result.rows,...result.current].some(row => !rowValid(row)) || result.current.some(row => row.valid_to !== null) || new Set(result.rows.map(row=>row.id)).size !== result.rows.length || new Set(result.current.map(row=>row.kind)).size !== result.current.length || result.rows.some(row=>context.kind && row.kind !== context.kind)) return fail;
  if (result.next_cursor !== null && (!result.next_cursor || typeof result.next_cursor.id !== 'string' || !Number.isFinite(Date.parse(result.next_cursor.recorded_at)) || cursor && result.next_cursor.id === cursor.id && result.next_cursor.recorded_at === cursor.recorded_at)) return fail;
  return '';
}
async function loadSettingsHistory({more = false, refresh = false} = {}) {
  const context = settingsHistoryContext(), entry = settingsHistoryEntry(); if (!context || !entry) return;
  if (entry.status === 'loading' && !refresh || !more && !refresh && entry.status !== 'idle') { paintSettingsHistory(); return; }
  if (more && !entry.next) return;
  const cursor = more ? entry.next : null, request = ++entry.request;
  if (!more) { entry.rows = []; entry.current = []; entry.next = null; entry.warnings = []; }
  entry.status = 'loading'; entry.more = more; entry.error = ''; entry.reason = ''; paintSettingsHistory();
  try {
    const result = await portal('athlete_settings_history',{athlete_id:context.athlete,...(context.kind ? {kind:context.kind} : {}),...(cursor ? {cursor} : {})});
    if (settingsHistoryContext()?.key !== context.key || state.athleteRequest !== context.sourceRequest || entry.request !== request || settingsHistoryCache.get(context.key) !== entry) return;
    const error = settingsHistoryResponseError(result,context,cursor); if (error) throw new Error(error);
    if (result.status === 'unavailable') { entry.status = 'unavailable'; entry.rows = []; entry.current = []; entry.next = null; entry.reason = result.reason || 'history_unavailable'; entry.warnings = Array.isArray(result.warnings) ? result.warnings : []; }
    else {
      const ids = new Set(entry.rows.map(row=>row.id));
      entry.rows = [...entry.rows,...result.rows.filter(row=>!ids.has(row.id))]; entry.current = result.current; entry.next = result.next_cursor; entry.warnings = result.warnings; entry.status = 'ready';
    }
  } catch (error) {
    if (settingsHistoryContext()?.key !== context.key || state.athleteRequest !== context.sourceRequest || entry.request !== request || settingsHistoryCache.get(context.key) !== entry) return;
    entry.status = 'error'; entry.error = error.message || 'Could not load dated settings. Try again.';
  }
  paintSettingsHistory();
}
function settingsHistoryDate(value) {
  return value ? new Date(value).toLocaleString(undefined,{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}) + ' UTC' : 'Not recorded';
}
function settingsHistoryOrigin(row) { return row.origin === 'migration_baseline' ? 'Initial known record' : row.origin === 'athlete_edit' ? 'Athlete setting change' : 'Coach or service setting change'; }
function settingsHistoryContents(entry) {
  const loaded = entry.rows.length, hasRows = loaded > 0;
  if (entry.status === 'unavailable') return `<div class="sh-empty"><strong>Dated history is unavailable</strong><p>The current profile can still be reviewed above. Historical values remain unknown; current values will not be used to fill earlier dates.</p><button type="button" class="secondary" data-sh-refresh>Retry history</button></div>`;
  if (entry.status === 'idle' || entry.status === 'loading' && !hasRows) return '<p class="sh-loading">Loading dated settings…</p>';
  const current = entry.current.map(row=>[row.kind,row]);
  return `${entry.current.length || entry.status === 'ready' ? `<div class="sh-current" aria-label="Current dated settings">${Object.entries(SETTINGS_HISTORY_KINDS).map(([kind,definition])=>{const row = current.find(([key])=>key===kind)?.[1];return `<div><span>${definition.label}</span><strong>${row ? numberLabel(row.value,' '+row.unit,3) : 'Not recorded'}</strong><p>${row ? `Known since ${safe(settingsHistoryDate(row.valid_from))}` : 'No current dated record is available.'}</p></div>`;}).join('')}</div>` : ''}${entry.warnings.length ? `<details class="sh-notes"><summary>History coverage notes</summary><ul>${entry.warnings.map(warning=>`<li>${safe(warning)}</li>`).join('')}</ul></details>` : ''}${entry.status === 'error' ? `<p class="form-error" role="alert">${safe(entry.error)}${hasRows ? ' Previously loaded records remain below.' : ''}</p>` : ''}${hasRows ? `<div class="sh-records">${entry.rows.map(row=>`<article class="sh-record"><div class="sh-record-summary"><div><h5>${SETTINGS_HISTORY_KINDS[row.kind].label}</h5><strong>${numberLabel(row.value,' '+row.unit,3)}</strong></div><dl><div><dt>Known from</dt><dd>${safe(settingsHistoryDate(row.valid_from))}</dd></div><div><dt>Known until</dt><dd>${row.valid_to ? safe(settingsHistoryDate(row.valid_to)) + ' (exclusive)' : 'Current · no end recorded'}</dd></div><div><dt>Recorded by</dt><dd>${safe(row.actor_label)}</dd></div></dl></div><details class="sh-source" data-sh-source="${safe(row.id)}"><summary>${settingsHistoryOrigin(row)} · Revision ${row.revision}</summary><dl><div><dt>Record ID</dt><dd>${safe(row.id)}</dd></div><div><dt>Recorded at</dt><dd>${safe(settingsHistoryDate(row.recorded_at))}</dd></div><div><dt>Exact valid-from timestamp</dt><dd>${safe(row.valid_from)}</dd></div><div><dt>Exact valid-until timestamp</dt><dd>${safe(row.valid_to || 'Open')}</dd></div></dl>${row.origin === 'migration_baseline' ? '<p>This is the first date this setting was known to the history system. It does not establish a measurement date or an earlier value.</p>' : ''}</details></article>`).join('')}</div>` : entry.status === 'ready' ? '<div class="sh-empty"><strong>No dated records for this selection</strong><p>Earlier values remain unknown. Future setting changes appear here when dated history is available.</p></div>' : ''}<div class="sh-actions">${entry.status === 'loading' ? '<button type="button" class="secondary" data-sh-more aria-disabled="true">Loading more records…</button>' : entry.status === 'error' ? `<button type="button" class="secondary" ${entry.more ? 'data-sh-more' : 'data-sh-refresh'}>Retry ${entry.more ? 'loading more' : 'history'}</button>` : entry.next ? '<button type="button" class="secondary" data-sh-more>Load more records</button>' : ''}${hasRows ? '<button type="button" class="secondary" data-sh-export>Export loaded records (CSV)</button>' : ''}</div>${hasRows ? `<p class="sh-export-note">${loaded} loaded ${loaded === 1 ? 'record' : 'records'}${entry.next ? ' · More records are available' : ' · End of this selection'}. CSV exports only the loaded records${settingsHistoryKind ? ` for ${SETTINGS_HISTORY_KINDS[settingsHistoryKind].label}` : ''}.</p>` : ''}`;
}
// deno-lint-ignore no-unused-vars
function settingsHistoryMarkup() {
  const entry = settingsHistoryEntry();
  return `<section class="settings-panel settings-history" aria-labelledby="settings-history-title"><div class="sh-heading"><div><h4 id="settings-history-title">Dated settings</h4><p>FTP, body mass and threshold heart rate as known at the time. Dates are UTC. Records are ordered by recording time; known-from dates show when each value took effect. Values before the first known record stay unknown.</p></div><button type="button" class="secondary" data-sh-refresh>Refresh history</button></div><label class="sh-filter">Show setting<select id="settings-history-kind"><option value="">All settings</option>${Object.entries(SETTINGS_HISTORY_KINDS).map(([key,value])=>`<option value="${key}" ${settingsHistoryKind === key ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label><p id="settings-history-status" class="sh-status" role="status" aria-live="polite"></p><div id="settings-history-content">${entry ? settingsHistoryContents(entry) : ''}</div></section>`;
}
function paintSettingsHistory() {
  const root = document.getElementById('settings-history-content'), entry = settingsHistoryEntry(); if (!root || !entry) return;
  const focused = document.activeElement, more = focused?.hasAttribute('data-sh-more'), refresh = focused?.hasAttribute('data-sh-refresh');
  const openSources = Array.from(root.querySelectorAll('.sh-source[open]')).map(node=>node.dataset.shSource), focusedSource = focused?.closest('[data-sh-source]')?.dataset.shSource;
  root.innerHTML = settingsHistoryContents(entry);
  for (const disclosure of root.querySelectorAll('.sh-source')) { if (openSources.includes(disclosure.dataset.shSource)) disclosure.open = true; if (focusedSource === disclosure.dataset.shSource) disclosure.querySelector('summary')?.focus({preventScroll:true}); }
  const status = document.getElementById('settings-history-status');
  if (status) status.textContent = entry.status === 'loading' ? entry.more ? 'Loading more dated settings.' : 'Loading dated settings.' : entry.status === 'ready' ? `${entry.rows.length} dated records loaded${entry.next ? '. More records are available.' : '.'}` : '';
  if (more) { const next = root.querySelector('[data-sh-more],[data-sh-export]'); next?.focus({preventScroll:true}); }
  if (refresh && !focused?.isConnected) document.querySelector('.sh-heading [data-sh-refresh]')?.focus({preventScroll:true});
}
function settingsHistoryExportRows() {
  const entry = settingsHistoryEntry(), context = settingsHistoryContext();
  const headers = ['athlete_id','setting_id','kind','value','unit','sport','valid_from','valid_to','revision','origin','actor_id','actor_label','recorded_at','selected_filter','loaded_record_count','more_records_available','response_version'];
  return {headers,rows:(entry?.rows || []).map(row=>[row.athlete_id,row.id,row.kind,row.value,row.unit,row.sport,row.valid_from,row.valid_to,row.revision,row.origin,row.actor_id,row.actor_label,row.recorded_at,context.kind || 'all',entry.rows.length,Boolean(entry.next),'athlete-setting-history-v1'])};
}
function exportSettingsHistory() {
  const {headers,rows} = settingsHistoryExportRows(); if (!rows.length) return;
  const cell = value => { if (typeof value === 'number') return String(value); const text = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"','""') + '"'; };
  const csv = [headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})), link = document.createElement('a'); link.href = url; link.download = `trainable-dated-settings-${state.athleteId}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',event=>{ const button = event.target.closest('[data-sh-refresh],[data-sh-more],[data-sh-export]'); if (!button) return; if (button.hasAttribute('data-sh-export')) exportSettingsHistory(); else loadSettingsHistory({more:button.hasAttribute('data-sh-more'),refresh:button.hasAttribute('data-sh-refresh')}); });
document.addEventListener('change',event=>{ if (event.target.id !== 'settings-history-kind') return; const previous = settingsHistoryEntry(); if (previous?.status === 'loading') { previous.request++; previous.status = previous.rows.length ? 'ready' : 'idle'; } settingsHistoryKind = Object.hasOwn(SETTINGS_HISTORY_KINDS,event.target.value) ? event.target.value : ''; loadSettingsHistory(); });
