/* Analytics / Reporting: editable session drafts, measured from original stored samples. */
const INTERVAL_WORKBENCH_LIMIT = 20;
const intervalWorkbenchDrafts = new Map();
let intervalWorkbenchSequence = 0;
const intervalWorkbenchDefaults = () => ({ threshold_w: 250, min_duration_s: 45, recovery_gap_s: 10, max_duration_s: 1800 });
const intervalWorkbenchIdle = () => ({ status: 'idle', value: null, error: '' });
function intervalWorkbenchContext() {
  const actor = typeof session === 'function' ? session()?.user?.id || 'unsigned' : 'unsigned';
  return analysis.detail?.activity?.id ? { key: JSON.stringify([actor, state.athleteId, analysis.detail.activity.id]), athlete: state.athleteId, activity: analysis.detail.activity.id, request: analysis.detailRequest } : null;
}
// deno-lint-ignore no-unused-vars
function resetIntervalWorkbenchDrafts() {
  for (const draft of intervalWorkbenchDrafts.values()) { draft.detectionRequest++; draft.comparisonRequest++; draft.windows = []; draft.detection = intervalWorkbenchIdle(); draft.comparison = intervalWorkbenchIdle(); }
  intervalWorkbenchDrafts.clear();
  const root = document.getElementById('interval-workbench-controls'); if (root) root.innerHTML = '';
}
function intervalWorkbenchSession() {
  const context = intervalWorkbenchContext(); if (!context) return null;
  let session = intervalWorkbenchDrafts.get(context.key);
  if (!session) {
    session = { windows: [], version: 0, sourceRequest: context.request, options: intervalWorkbenchDefaults(), detection: intervalWorkbenchIdle(), comparison: intervalWorkbenchIdle(), detectionRequest: 0, comparisonRequest: 0, undo: null, message: '' };
    intervalWorkbenchDrafts.set(context.key, session);
  }
  if (session.sourceRequest !== context.request) {
    session.sourceRequest = context.request; session.detectionRequest++; session.comparisonRequest++;
    session.detection = intervalWorkbenchIdle(); session.comparison = intervalWorkbenchIdle();
  }
  return session;
}
function intervalWorkbenchWindowError(window) {
  const end = analysis.detail?.stream_duration_s;
  if (!window.label?.trim() || window.label.length > 80) return 'Enter an interval name of 1–80 characters.';
  if (![window.from_s, window.to_s, end].every(Number.isFinite) || window.from_s < 0 || window.to_s <= window.from_s || window.to_s > end) return `Choose a start and later end within 0–${numberLabel(end, ' seconds', 3)} of the recorded trace.`;
  return '';
}
function intervalWorkbenchOptionsError(options) {
  if (!Object.values(options).every(Number.isFinite)) return 'Enter a number for every detection setting.';
  if (!(options.threshold_w > 0 && options.threshold_w <= 2500)) return 'Choose a power threshold above 0 and at most 2,500 W.';
  if (!(options.min_duration_s >= 1 && options.min_duration_s <= 3600)) return 'Choose a minimum effort from 1 to 3,600 seconds.';
  if (!(options.recovery_gap_s >= 0 && options.recovery_gap_s <= 60)) return 'Choose an allowed recovery gap from 0 to 60 seconds.';
  if (!(options.max_duration_s >= options.min_duration_s && options.max_duration_s <= 7200)) return 'Choose a maximum effort at least as long as the minimum and no longer than 7,200 seconds.';
  return '';
}
function intervalWorkbenchChanged(session) {
  session.version++; session.comparisonRequest++; session.comparison = intervalWorkbenchIdle();
}
function intervalWorkbenchAdd(windows) {
  const session = intervalWorkbenchSession(); if (!session) return false;
  const fresh = windows.filter(window => !window.origin_key || !session.windows.some(existing => existing.origin_key === window.origin_key));
  if (!fresh.length) { session.message = 'That source interval is already in this draft.'; return false; }
  if (session.windows.length + fresh.length > INTERVAL_WORKBENCH_LIMIT) { session.message = 'Keep up to 20 intervals in this comparison. Remove an interval before adding another.'; return false; }
  for (const window of fresh) { const error = intervalWorkbenchWindowError(window); if (error) { session.message = error; return false; } }
  const now = new Date().toISOString();
  for (const window of fresh) {
    const initial = { label: window.label.trim(), from_s: window.from_s, to_s: window.to_s };
    session.windows.push({ id: `iw-${++intervalWorkbenchSequence}`, ...initial, selected: true, origin: window.origin || 'manual', origin_key: window.origin_key || '', original: { ...initial, ...(window.original || {}) }, revisions: [{ revision: 0, ...initial, changed_at: now }], detection_options: window.detection_options ? { ...window.detection_options } : null });
  }
  intervalWorkbenchChanged(session); session.message = `${fresh.length} ${fresh.length === 1 ? 'interval added' : 'intervals added'} to this session draft.`; return true;
}
function intervalWorkbenchUpdate(id, patch) {
  const session = intervalWorkbenchSession(), window = session?.windows.find(row => row.id === id); if (!window) return 'This draft interval is no longer available.';
  const previous = window.pending || window;
  const next = { label: patch.label ?? previous.label, from_s: patch.from_s ?? previous.from_s, to_s: patch.to_s ?? previous.to_s };
  next.label = next.label.trim();
  const error = intervalWorkbenchWindowError(next); if (error) { window.pending = next; intervalWorkbenchChanged(session); return error; }
  delete window.pending;
  if (next.label === window.label && next.from_s === window.from_s && next.to_s === window.to_s) return '';
  Object.assign(window, next); window.revisions.push({ revision: window.revisions.length, ...next, changed_at: new Date().toISOString() });
  intervalWorkbenchChanged(session); session.message = 'Draft updated. Compare again to calculate the edited bounds.'; return '';
}
function intervalWorkbenchRequestCurrent(context, session, request, mode, version) {
  const active = intervalWorkbenchContext();
  return active?.key === context.key && active.request === context.request && session[`${mode}Request`] === request && (mode !== 'comparison' || session.version === version);
}
function intervalWorkbenchValidateResponse(result, context, mode, windows) {
  if (result?.version !== 'activity-intervals-v1' || result.activity_id !== context.activity || result.mode !== mode || !Array.isArray(result.intervals)) throw new Error('This connection did not return the requested interval evidence. Reload and try again.');
  const ids = result.intervals.map(row => row.id);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) throw new Error('The interval response contains invalid source identifiers. Try again.');
  if (mode === 'compare' && (ids.length !== windows.length || result.intervals.some(row => { const window = windows.find(item => item.id === row.id); return !window || row.from_s !== window.from_s || row.to_s !== window.to_s; }))) throw new Error('Some interval boundaries were not returned exactly. Compare again to retry.');
  if (result.intervals.length > (mode === 'detect' ? 100 : 20) || result.intervals.some(row => !Number.isFinite(row.from_s) || !Number.isFinite(row.to_s) || row.to_s <= row.from_s || !row.metrics || !row.coverage || !row.normalized_power)) throw new Error('The interval evidence is incomplete. Try again.');
}
async function intervalWorkbenchRequest(mode) {
  const context = intervalWorkbenchContext(), session = intervalWorkbenchSession(); if (!context || !session) return;
  const key = mode === 'detect' ? 'detection' : 'comparison';
  if (session[key].status === 'loading') return;
  const windows = session.windows.filter(window => window.selected).map(({id, label, from_s, to_s}) => ({id, label, from_s, to_s}));
  const error = mode === 'detect' ? intervalWorkbenchOptionsError(session.options) : !windows.length ? 'Add or select at least one interval to compare.' : session.windows.filter(window => window.selected).map(window => intervalWorkbenchWindowError(window.pending || window)).find(Boolean);
  if (error) { session[key] = { status: 'error', value: null, error }; paintIntervalWorkbench(); return; }
  const request = ++session[`${key}Request`], version = session.version;
  session[key] = { status: 'loading', value: null, error: '' }; paintIntervalWorkbench();
  try {
    const result = await portal('activity_intervals', { athlete_id: context.athlete, activity_id: context.activity, mode, ...(mode === 'detect' ? { options: { ...session.options } } : { windows }) });
    if (!intervalWorkbenchRequestCurrent(context, session, request, key, version)) return;
    intervalWorkbenchValidateResponse(result, context, mode, windows);
    session[key] = { status: 'ready', value: result, error: '' };
    if (mode === 'compare') session.message = `Comparison calculated for ${windows.length} selected ${windows.length === 1 ? 'interval' : 'intervals'}.`;
  } catch (caught) {
    if (!intervalWorkbenchRequestCurrent(context, session, request, key, version)) return;
    session[key] = { status: 'error', value: null, error: caught.message || 'Could not calculate interval evidence. Try again.' };
  }
  paintIntervalWorkbench();
}
function intervalWorkbenchCancel(key) {
  const session = intervalWorkbenchSession(); if (!session) return;
  session[`${key}Request`]++; session[key] = intervalWorkbenchIdle(); session.message = 'Calculation stopped. No partial results were kept.'; paintIntervalWorkbench();
}
function intervalWorkbenchLapWindows() {
  return (analysis.detail?.laps || []).map((lap, index) => {
    const original = { label: lap.name || `Lap ${index + 1}`, from_s: Number(lap.start_s || 0), to_s: Number(lap.start_s || 0) + Number(lap.elapsed_s || 0) };
    return { ...original, from_s: Math.max(0, original.from_s), to_s: Math.min(analysis.detail.stream_duration_s, original.to_s), original, origin: 'lap', origin_key: `lap:${index}` };
  });
}
function intervalWorkbenchAddSelection() {
  const session = intervalWorkbenchSession(); if (!session) return;
  intervalWorkbenchAdd([{label: `Interval ${session.windows.length + 1}`, from_s: Number(document.getElementById('segment-from')?.value), to_s: Number(document.getElementById('segment-to')?.value), origin: 'manual'}]);
  setActivityPanel('intervals'); document.getElementById('interval-workbench-drafts')?.scrollIntoView({ block: 'start' });
}
function intervalWorkbenchFocus(id) {
  const session = intervalWorkbenchSession(), window = session?.windows.find(row => row.id === id); if (!window || window.pending || intervalWorkbenchWindowError(window)) return;
  analysis.segmentRequest = (analysis.segmentRequest || 0) + 1; analysis.traceSelection = null; analysis.traceRange = [window.from_s, window.to_s];
  setActivityPanel('intervals');
  document.getElementById('segment-from').value = window.from_s; document.getElementById('segment-to').value = window.to_s;
  document.getElementById('segment-result').innerHTML = `<p><strong>${safe(window.label)}</strong> · ${elapsedLabel(window.from_s)}–${elapsedLabel(window.to_s)}. Compare intervals below for measured statistics using the interval workbench policy.</p>`;
  document.getElementById('activity-trace')?.scrollIntoView({ block: 'start' });
  document.getElementById('trace-position')?.focus({ preventScroll: true });
}
function intervalWorkbenchActionMarkup(key, state, label) {
  return state.status === 'loading' ? `<p role="status">Calculating from stored samples…</p><button type="button" class="secondary" data-iw-cancel="${key}">Stop calculation</button>` : `${state.status === 'error' ? `<p class="form-error" role="alert">${safe(state.error)}</p>` : ''}<button type="button" class="primary" data-iw-run="${key === 'detection' ? 'detect' : 'compare'}">${state.status === 'error' ? `Retry ${key === 'detection' ? 'detection' : 'comparison'}` : label}</button>`;
}
function intervalWorkbenchResetAction(element, key) {
  if (!element) return;
  const button = element.querySelector('[data-iw-run]'), label = key === 'detection' ? 'Find threshold intervals' : 'Compare selected intervals';
  if (button) { button.textContent = label; element.querySelectorAll('.form-error,[role="status"]').forEach(node => node.remove()); }
  else element.innerHTML = intervalWorkbenchActionMarkup(key, intervalWorkbenchIdle(), label);
}
function intervalWorkbenchHistoryMarkup(window) {
  return `<summary>${window.origin === 'lap' ? 'Device lap draft' : window.origin === 'detected' ? 'Detected interval draft' : 'Manual selection'} · ${window.revisions.length - 1} edits</summary><p>Original: ${safe(window.original.label)} · ${elapsedLabel(window.original.from_s)}–${elapsedLabel(window.original.to_s)}. Original boundaries are retained.</p><ol>${window.revisions.map(revision => `<li>${revision.revision === 0 ? 'Added' : `Edit ${revision.revision}`}: ${safe(revision.label)} · ${revision.from_s}–${revision.to_s} s <time datetime="${revision.changed_at}">${safe(new Date(revision.changed_at).toLocaleTimeString())}</time></li>`).join('')}</ol>`;
}
function intervalWorkbenchDraftMarkup(session) {
  const laps = intervalWorkbenchLapWindows(), selected = session.windows.filter(row => row.selected).length;
  return `<section id="interval-workbench-drafts" class="iw-section"><div class="iw-section-heading"><div><h3>Intervals to compare</h3><p>${selected} selected · ${session.windows.length} of 20 draft intervals</p></div>${session.undo ? '<button type="button" class="secondary" data-iw-undo>Undo removal</button>' : ''}</div><p class="helper">Drafts and edit history stay in this page session. They are not saved to the athlete’s account and disappear on reload.</p><div class="iw-add"><label>Device lap<select id="iw-lap-choice">${laps.map((lap, index) => `<option value="${index}">${safe(lap.label)} · ${elapsedLabel(lap.from_s)}–${elapsedLabel(lap.to_s)}</option>`).join('')}</select></label><button type="button" class="secondary" data-iw-add-lap>Add device lap</button><button type="button" class="secondary" data-iw-add-selection>Add selected range</button></div>${!laps.length ? '<p class="helper">No device laps are available. Select a range on the timeline or find threshold intervals below.</p>' : ''}<p id="iw-draft-status" role="status">${safe(session.message)}</p><div class="iw-draft-list">${session.windows.map((window, index) => `<article class="iw-draft-row" data-iw-row="${window.id}"><div class="iw-draft-fields"><label class="iw-select"><input type="checkbox" data-iw-select="${window.id}" ${window.selected ? 'checked' : ''}><span>Compare ${index + 1}</span></label><label class="iw-name">Interval name<input type="text" maxlength="80" data-iw-edit="${window.id}" data-iw-field="label" value="${safe(window.pending?.label ?? window.label)}"></label><label>Start (s)<input type="number" min="0" max="${analysis.detail.stream_duration_s}" step="any" data-iw-edit="${window.id}" data-iw-field="from_s" value="${Number.isFinite(window.pending?.from_s ?? window.from_s) ? window.pending?.from_s ?? window.from_s : ''}"></label><label>End (s)<input type="number" min="0" max="${analysis.detail.stream_duration_s}" step="any" data-iw-edit="${window.id}" data-iw-field="to_s" value="${Number.isFinite(window.pending?.to_s ?? window.to_s) ? window.pending?.to_s ?? window.to_s : ''}"></label><button type="button" class="record-link" data-iw-focus="${window.id}">View trace</button><button type="button" class="quiet" data-iw-remove="${window.id}">Remove</button></div><p class="iw-row-error form-error" role="alert" ${window.pending ? '' : 'hidden'}>${window.pending ? safe(intervalWorkbenchWindowError(window.pending)) : ''}</p><details class="iw-history">${intervalWorkbenchHistoryMarkup(window)}</details></article>`).join('')}</div>${!session.windows.length ? '<p class="iw-empty">Add a device lap, a timeline selection, or a detected effort to compare exact recorded intervals.</p>' : ''}<div class="iw-comparison-action">${intervalWorkbenchActionMarkup('comparison', session.comparison, 'Compare selected intervals')}</div></section>`;
}
function intervalWorkbenchDetectionMarkup(session) {
  const result = session.detection.status === 'ready' ? session.detection.value : null;
  return `<section class="iw-section"><h3>Find threshold intervals</h3><p class="helper">These are editable detection choices in absolute watts, not the athlete’s historical FTP or zones. Recording gaps and known pauses cannot join two efforts. Device timer state may be unavailable.</p><form id="iw-detection-form" novalidate><div class="iw-detection-fields">${[['threshold_w','Power threshold (W)',0,2500],['min_duration_s','Minimum high-power time (s)',1,3600],['recovery_gap_s','Allowed low-power gap (s)',0,60],['max_duration_s','Maximum effort span (s)',1,7200]].map(([key, label, min, max]) => `<label>${label}<input type="number" data-iw-option="${key}" value="${Number.isFinite(session.options[key]) ? session.options[key] : ''}" min="${min}" max="${max}" step="any" required aria-describedby="iw-detection-error"></label>`).join('')}</div><p id="iw-detection-error" class="form-error" role="alert" hidden></p><div id="iw-detection-action">${intervalWorkbenchActionMarkup('detection', session.detection, 'Find threshold intervals')}</div></form><div id="iw-detection-output">${result ? `<p class="helper">${result.intervals.length} intervals found${result.detection?.omitted_count ? ` · ${result.detection.omitted_count} candidates omitted by the duration or result limit` : ''}. Add the efforts worth comparing; detection does not establish maximal intent.</p><p class="helper">${result.source?.timer_state === 'unknown' ? 'Device timer state is unknown; unrecorded pauses cannot be identified. ' : ''}${safe((result.warnings || []).join(' '))}</p>${result.intervals.length ? `<div class="iw-detected-list">${result.intervals.map((row, index) => `<div><div><strong>${safe(row.label || `Effort ${index + 1}`)}</strong><span>${elapsedLabel(row.from_s)}–${elapsedLabel(row.to_s)} · ${numberLabel(row.metrics.watts?.average, ' W', 1)} recorded average</span></div><button type="button" class="secondary" data-iw-add-detected="${safe(row.id)}">Add interval</button></div>`).join('')}</div>` : '<p class="iw-empty">No intervals meet these settings. Adjust the power or duration choices and try again.</p>'}` : ''}</div></section>`;
}
function intervalWorkbenchResultsMarkup(session) {
  const result = session.comparison.status === 'ready' ? session.comparison.value : null; if (!result) return '';
  const max = Math.max(1, ...result.intervals.map(row => row.metrics.watts?.average || 0));
  const np = row => row.normalized_power.status === 'available' ? numberLabel(row.normalized_power.value_w, ' W', 1) : '—';
  return `<section class="iw-section iw-results"><div class="iw-section-heading"><div><h3>Measured interval comparison</h3><p>Exact elapsed bounds · Missing values stay blank</p></div><button type="button" class="secondary" data-iw-export>Export exact data (CSV)</button></div>${result.source?.power_source !== 'meter' ? '<p class="explorer-data-warning">The power source is unverified. These recorded values must not be treated as confirmed power-meter measurements.</p>' : ''}<div class="iw-power-comparison">${result.intervals.map(row => `<button type="button" data-iw-focus="${safe(row.id)}"><span>${safe(row.label)}</span><i aria-hidden="true"><b style="width:${row.metrics.watts?.average == null ? 0 : row.metrics.watts.average / max * 100}%"></b></i><strong>${numberLabel(row.metrics.watts?.average, ' W', 1)}</strong></button>`).join('')}</div><p class="helper">Bars compare time-weighted recorded average power on the same watt scale. Normalized power uses only eligible 30-second windows; inspect its coverage below before comparing.</p>${tableMarkup(['Interval','Elapsed','Avg power','Power coverage','Work','Normalized power','Avg HR','Cadence'],result.intervals.map(row => [`<button type="button" class="record-link" data-iw-focus="${safe(row.id)}">${safe(row.label)}</button>`,elapsedLabel(row.duration_s),numberLabel(row.metrics.watts?.average,' W',1),`${numberLabel(row.metrics.watts?.coverage_s,' s',1)} / ${numberLabel(row.duration_s,' s',1)}`,numberLabel(row.work_j == null ? null : row.work_j / 1000,' kJ',2),np(row),numberLabel(row.metrics.heartrate?.average,' bpm',1),numberLabel(row.metrics.cadence?.average,' rpm',1)]))}<details class="iw-measurement-detail"><summary>Coverage, source bounds and calculation details</summary>${result.intervals.map(row => `<section><h4>${safe(row.label)}</h4><p>${row.from_s}–${row.to_s} seconds · ${safe(row.quality)} source quality. ${numberLabel(row.coverage.known_paused_s,' s',1)} known paused, ${numberLabel(row.coverage.gap_s,' s',1)} recording gaps, ${numberLabel(row.coverage.unrecorded_s,' s',1)} unrecorded.</p><p>Normalized power: ${row.normalized_power.status === 'available' ? `${np(row)} from ${numberLabel(row.normalized_power.eligible_windows)} of ${numberLabel(row.normalized_power.candidate_windows)} rolling windows (${numberLabel(row.normalized_power.coverage_pct, '%', 1)} coverage). Descriptive only.` : safe((row.normalized_power.unavailable_reason || 'Unavailable').replaceAll('_',' '))}.</p>${tableMarkup(['Channel','Time-weighted average','Maximum','Covered seconds','Missing seconds','Invalid seconds'],Object.entries(row.metrics).map(([key, metric])=>[safe(TRACE_LABELS[key]?.[0] || key),numberLabel(metric.average,' '+metric.unit,3),numberLabel(metric.maximum,' '+metric.unit,3),numberLabel(metric.coverage_s,'',3),numberLabel(metric.missing_s,'',3),numberLabel(metric.invalid_s,'',3)]))}<p class="helper">${safe([...(row.flags || []), ...(row.normalized_power.flags || [])].map(flag => flag.replaceAll('_',' ')).join('; '))}</p></section>`).join('')}<p class="helper">Time weighting uses the previous recorded value for at most 10 seconds. Known pauses are excluded; moving flags are not timer state. The final sample is not extended. Normalized power uses eligible 30-second windows anchored to each selection and is descriptive, not a measure of training capacity.</p></details></section>`;
}
// deno-lint-ignore no-unused-vars
function intervalWorkbenchMarkup() {
  return `<div class="interval-workbench"><div class="iw-heading"><h3 id="interval-workbench-title" tabindex="-1">Interval workbench</h3><p>Choose exact ranges, compare recorded work, and keep the source boundaries visible.</p></div><div id="interval-workbench-trace"></div><div id="interval-workbench-controls"></div></div>`;
}
function paintIntervalWorkbench() {
  const root = document.getElementById('interval-workbench-controls'), session = intervalWorkbenchSession(); if (!root || !session) return;
  const focused = document.activeElement, run = focused?.dataset.iwRun, cancel = focused?.dataset.iwCancel;
  const lap = root.querySelector('#iw-lap-choice')?.value;
  const edit = focused?.dataset.iwEdit, field = focused?.dataset.iwField, option = focused?.dataset.iwOption, caret = focused?.type === 'text' ? [focused.selectionStart, focused.selectionEnd] : null;
  root.innerHTML = intervalWorkbenchDraftMarkup(session) + intervalWorkbenchResultsMarkup(session) + intervalWorkbenchDetectionMarkup(session);
  if (lap && root.querySelector('#iw-lap-choice')) root.querySelector('#iw-lap-choice').value = lap;
  if (run || cancel) root.querySelector(`[data-iw-cancel="${run === 'detect' || cancel === 'detection' ? 'detection' : 'comparison'}"],[data-iw-run="${run || (cancel === 'detection' ? 'detect' : 'compare')}"]`)?.focus({ preventScroll: true });
  if (edit || option) { const input = root.querySelector(edit ? `[data-iw-edit="${edit}"][data-iw-field="${field}"]` : `[data-iw-option="${option}"]`); input?.focus({preventScroll:true}); if (input && caret) input.setSelectionRange(...caret); }
  paintIntervalTraceMarkers();
}
// deno-lint-ignore no-unused-vars
function intervalWorkbenchTraceControls() {
  return `<div class="iw-timeline-tools"><div class="iw-cursor-actions"><button type="button" class="secondary" data-iw-cursor="from">Set start at cursor</button><button type="button" class="secondary" data-iw-cursor="to">Set end at cursor</button><button type="button" class="secondary" data-iw-add-selection>Add selected range</button><button type="button" class="record-link" data-iw-open>Compare intervals</button></div><p class="helper">Use arrow keys on the cursor, then set the start and end. The seconds fields also accept exact bounds. Dashed markers show device laps; green bands show selected draft intervals.</p><p id="iw-timeline-status" role="status"></p></div>`;
}
function paintIntervalTraceMarkers() {
  const root = document.getElementById('activity-trace'), session = intervalWorkbenchSession(); if (!root || !session) return;
  const bounds = analysis.traceRange || [0, analysis.detail.stream_duration_s], laps = intervalWorkbenchLapWindows().slice(0, 100);
  for (const svg of root.querySelectorAll('svg[data-responsive-chart]')) {
    svg.querySelector('.iw-timeline-markers')?.remove();
    const width = svg.viewBox.baseVal.width, height = svg.viewBox.baseVal.height, left = Number(svg.dataset.chartLeft || 58), right = width - Number(svg.dataset.chartRight || 18);
    const x = time => left + (Math.max(bounds[0], Math.min(bounds[1], time)) - bounds[0]) / (bounds[1] - bounds[0] || 1) * (right - left);
    const ns = 'http://www.w3.org/2000/svg', group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'iw-timeline-markers'); group.setAttribute('pointer-events', 'none'); group.setAttribute('aria-hidden', 'true');
    for (const lap of laps) if (lap.from_s > bounds[0] && lap.from_s < bounds[1]) {
      const line = document.createElementNS(ns, 'line'); line.setAttribute('x1', x(lap.from_s)); line.setAttribute('x2', x(lap.from_s)); line.setAttribute('y1', '22'); line.setAttribute('y2', height - 32); line.setAttribute('class', 'iw-lap-marker'); group.append(line);
    }
    for (const window of session.windows.filter(row => row.selected && !row.pending)) if (window.to_s > bounds[0] && window.from_s < bounds[1]) {
      const band = document.createElementNS(ns, 'rect'); band.setAttribute('x', x(window.from_s)); band.setAttribute('y', '22'); band.setAttribute('width', Math.max(0, x(window.to_s) - x(window.from_s))); band.setAttribute('height', '7'); band.setAttribute('class', 'iw-draft-marker'); group.append(band);
    }
    svg.append(group);
  }
}
function intervalWorkbenchSetCursorBoundary(which) {
  if (!Number.isFinite(analysis.traceCursor)) return;
  const from = document.getElementById('segment-from'), to = document.getElementById('segment-to'); if (!from || !to) return;
  (which === 'from' ? from : to).value = analysis.traceCursor;
  const start = Number(from.value), end = Number(to.value);
  analysis.traceSelection = end > start ? [start, end] : null;
  paintTraceBrush();
  const status = document.getElementById('iw-timeline-status');
  if (status) status.textContent = `${which === 'from' ? 'Start' : 'End'} set to ${elapsedLabel(analysis.traceCursor)}.${end <= start ? ' Set an end after the start before adding the interval.' : ' Add selected range to keep it in the comparison draft.'}`;
}
function intervalWorkbenchExportEvidence() {
  const session = intervalWorkbenchSession(), result = session?.comparison.status === 'ready' ? session.comparison.value : null;
  const metricKeys = ['watts', 'heartrate', 'cadence', 'velocity_ms', 'temperature_c', 'grade_pct'];
  const headers = ['activity_id','interval_id','label','client_draft_origin','original_label','original_from_s','original_to_s','draft_revision','local_revision_history_json','server_origin','from_s','to_s','duration_s','quality','algorithm_version','source_sample_count','source_first_interval_index','source_last_interval_index','eligible_timeline_s','known_paused_s','gap_s','unrecorded_s','timer_unknown_s','work_j','np_status','normalized_power_w','np_candidate_windows','np_eligible_windows','np_coverage_pct','np_unavailable_reason','np_anchor','np_window_s','np_step_s','np_interpretation','np_flags','detection_options_json','interval_convention','max_hold_s','final_sample_unextended','timer_policy','source_power','source_timer_state','flags','response_version',...metricKeys.flatMap(key => ['unit','average','maximum','coverage_s','coverage_pct','missing_s','invalid_s'].map(field => `${key}_${field}`))];
  const rows = (result?.intervals || []).map(row => {
    const draft = session.windows.find(window => window.id === row.id), np = row.normalized_power;
    return [result.activity_id,row.id,row.label,draft?.origin,draft?.original.label,draft?.original.from_s,draft?.original.to_s,draft?.revisions.length - 1,JSON.stringify(draft?.revisions || []),row.origin,row.from_s,row.to_s,row.duration_s,row.quality,row.algorithm_version,row.source?.sample_count,row.source?.first_interval_index,row.source?.last_interval_index,row.coverage.eligible_timeline_s,row.coverage.known_paused_s,row.coverage.gap_s,row.coverage.unrecorded_s,row.coverage.timer_unknown_s,row.work_j,np.status,np.value_w,np.candidate_windows,np.eligible_windows,np.coverage_pct,np.unavailable_reason,np.anchor,np.window_s,np.step_s,np.interpretation,(np.flags || []).join('; '),draft?.detection_options ? JSON.stringify(draft.detection_options) : '',row.policy?.interval_convention,row.policy?.max_hold_s,row.policy?.final_sample_unextended,row.policy?.timer_policy,result.source?.power_source,result.source?.timer_state,(row.flags || []).join('; '),result.version,...metricKeys.flatMap(key => { const metric = row.metrics[key]; return [metric?.unit,metric?.average,metric?.maximum,metric?.coverage_s,metric?.coverage_pct,metric?.missing_s,metric?.invalid_s]; })];
  });
  return { headers, rows };
}
function intervalWorkbenchExport() {
  const evidence = intervalWorkbenchExportEvidence(); if (!evidence.rows.length) return;
  const cell = value => { if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''; const text = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"'; };
  const csv = [evidence.headers, ...evidence.rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'})), link = document.createElement('a');
  link.href = url; link.download = `trainable-intervals-${analysis.detail.activity.id}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-iw-open],[data-iw-cursor],[data-iw-add-selection],[data-iw-add-lap],[data-iw-add-detected],[data-iw-focus],[data-iw-remove],[data-iw-undo],[data-iw-run],[data-iw-cancel],[data-iw-export]'); if (!button) return;
  const session = intervalWorkbenchSession(); if (!session) return;
  if (button.hasAttribute('data-iw-open')) { setActivityPanel('intervals'); document.getElementById('interval-workbench-title')?.focus(); return; }
  if (button.dataset.iwCursor) { intervalWorkbenchSetCursorBoundary(button.dataset.iwCursor); return; }
  if (button.hasAttribute('data-iw-add-selection')) { intervalWorkbenchAddSelection(); return; }
  if (button.dataset.iwFocus) { intervalWorkbenchFocus(button.dataset.iwFocus); return; }
  if (button.dataset.iwRun) { intervalWorkbenchRequest(button.dataset.iwRun); return; }
  if (button.dataset.iwCancel) { intervalWorkbenchCancel(button.dataset.iwCancel); return; }
  if (button.hasAttribute('data-iw-export')) { intervalWorkbenchExport(); return; }
  if (button.hasAttribute('data-iw-add-lap')) {
    const lap = intervalWorkbenchLapWindows()[Number(document.getElementById('iw-lap-choice')?.value)];
    if (lap) intervalWorkbenchAdd([lap]); else session.message = 'No device lap is available. Add a selected timeline range instead.';
  } else if (button.dataset.iwAddDetected) {
    const row = session.detection.value?.intervals.find(item => item.id === button.dataset.iwAddDetected);
    if (row) intervalWorkbenchAdd([{label:row.label || 'Detected effort',from_s:row.from_s,to_s:row.to_s,origin:'detected',origin_key:`detected:${row.id}:${JSON.stringify(session.options)}`,detection_options:session.options}]);
  } else if (button.dataset.iwRemove) {
    const index = session.windows.findIndex(row => row.id === button.dataset.iwRemove); if (index < 0) return;
    session.undo = { row: session.windows[index], index }; session.windows.splice(index, 1); intervalWorkbenchChanged(session); session.message = 'Interval removed from the draft. Undo is available.';
  } else if (button.hasAttribute('data-iw-undo') && session.undo) {
    if (session.windows.length >= INTERVAL_WORKBENCH_LIMIT) { session.message = 'Remove an interval before restoring this one; the draft limit is 20.'; }
    else { session.windows.splice(session.undo.index, 0, session.undo.row); session.undo = null; intervalWorkbenchChanged(session); session.message = 'Draft interval restored.'; }
  }
  paintIntervalWorkbench();
});
document.addEventListener('change', event => {
  const target = event.target, session = intervalWorkbenchSession(); if (!session) return;
  if (target.dataset.iwEdit) {
    const field = target.dataset.iwField, value = field === 'label' ? target.value : target.value === '' ? NaN : Number(target.value);
    const error = intervalWorkbenchUpdate(target.dataset.iwEdit, {[field]:value}), message = target.closest('[data-iw-row]')?.querySelector('.iw-row-error');
    if (message) { message.textContent = error; message.hidden = !error; }
    target.setAttribute('aria-invalid', String(Boolean(error)));
    document.querySelector('.iw-results')?.remove();
    const action = document.querySelector('.iw-comparison-action'); intervalWorkbenchResetAction(action, 'comparison');
    const status = document.getElementById('iw-draft-status'); if (status) status.textContent = error ? 'Correct this interval before comparing.' : session.message;
    if (!error) {
      const row = session.windows.find(window => window.id === target.dataset.iwEdit), history = target.closest('[data-iw-row]')?.querySelector('.iw-history');
      if (history) history.innerHTML = intervalWorkbenchHistoryMarkup(row);
    }
    paintIntervalTraceMarkers();
  } else if (target.dataset.iwSelect) {
    const row = session.windows.find(window => window.id === target.dataset.iwSelect); if (row) { row.selected = target.checked; intervalWorkbenchChanged(session); paintIntervalWorkbench(); document.querySelector(`[data-iw-select="${row.id}"]`)?.focus({preventScroll:true}); }
  } else if (target.dataset.iwOption) {
    session.options[target.dataset.iwOption] = target.value === '' ? NaN : Number(target.value);
    session.detectionRequest++; session.detection = intervalWorkbenchIdle();
    const output = document.getElementById('iw-detection-output'); if (output) output.innerHTML = '';
    const action = document.getElementById('iw-detection-action'); intervalWorkbenchResetAction(action, 'detection');
  }
});
document.addEventListener('submit', event => { if (event.target.id === 'iw-detection-form') { event.preventDefault(); intervalWorkbenchRequest('detect'); } });
document.addEventListener('focusout', event => {
  if (!event.target.matches('[data-iw-option]')) return;
  const error = intervalWorkbenchOptionsError(intervalWorkbenchSession().options), output = document.getElementById('iw-detection-error');
  if (output) { output.textContent = error; output.hidden = !error; }
  if (error) event.target.setAttribute('aria-invalid','true');
});
function intervalWorkbenchClearFieldError(event) {
  if (!event.target.matches('[data-iw-option],[data-iw-edit]')) return;
  event.target.removeAttribute('aria-invalid');
  const message = event.target.matches('[data-iw-option]') ? document.getElementById('iw-detection-error') : event.target.closest('[data-iw-row]')?.querySelector('.iw-row-error');
  if (message) { message.textContent = ''; message.hidden = true; }
}
document.addEventListener('focusin', intervalWorkbenchClearFieldError);
document.addEventListener('input', intervalWorkbenchClearFieldError);

// Capture edits before blur, so a late response cannot replace text being entered.
document.addEventListener('input', event => {
  const target = event.target;
  if (!target.dataset.iwEdit && !target.dataset.iwOption) return;
  const session = intervalWorkbenchSession(); if (!session) return;
  if (target.dataset.iwEdit) {
    const window = session.windows.find(row => row.id === target.dataset.iwEdit); if (!window) return;
    const previous = window.pending || window;
    window.pending = {label:previous.label,from_s:previous.from_s,to_s:previous.to_s,[target.dataset.iwField]:target.dataset.iwField === 'label' ? target.value : target.value === '' ? NaN : Number(target.value)};
    intervalWorkbenchChanged(session);
    document.querySelector('.iw-results')?.remove();
    intervalWorkbenchResetAction(document.querySelector('.iw-comparison-action'), 'comparison');
  } else {
    session.options[target.dataset.iwOption] = target.value === '' ? NaN : Number(target.value);
    session.detectionRequest++; session.detection = intervalWorkbenchIdle();
    const output = document.getElementById('iw-detection-output'); if (output) output.innerHTML = '';
    intervalWorkbenchResetAction(document.getElementById('iw-detection-action'), 'detection');
  }
});
