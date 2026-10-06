/* Coach analysis: stored observations only; imported sources remain separate. */
const analysis = { athlete: null, tab: 'history', history: null, trends: null, historyRequest: 0, trendRequest: 0, detailRequest: 0,
  filters: { search: '', sport: '', from: '', to: '', page: 0 }, range: null, detail: null, trace: 'watts', recovery: 'hrv_ms' };
const numberLabel = (value, suffix = '', digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) + suffix;
const elapsedLabel = (value) => value == null ? '—' : Math.floor(value / 3600) + ':' + String(Math.floor(value % 3600 / 60)).padStart(2, '0') + ':' + String(Math.round(value % 60)).padStart(2, '0');
const utcDay = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const shiftUTC = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
const utcLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
function resetAnalysis() {
  analysis.athlete = state.athleteId; analysis.history = null; analysis.trends = null; analysis.detail = null;
  analysis.historyRequest++; analysis.trendRequest++; analysis.detailRequest++;
  analysis.filters = { search: '', sport: '', from: '', to: '', page: 0 };
  const to = utcDay(new Date()); analysis.range = { from: shiftUTC(to, -89), to }; analysis.tab = 'history';
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function analysisMarkup() {
  if (analysis.athlete !== state.athleteId) resetAnalysis();
  return `<div class="analysis-nav" role="group" aria-label="Analysis view">${[['history','Activity history'],['trends','Training trends'],['recovery','Recovery & health'],['imports','Imported activities']].map(([id,label]) => `<button type="button" class="secondary" data-analysis-tab="${id}" aria-pressed="${analysis.tab === id}">${label}</button>`).join('')}</div><div id="analysis-content"></div>`;
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function paintAnalysis() {
  if (!$('#analysis-content')) return;
  if (analysis.tab === 'history') { paintHistory(); if (!analysis.history) loadHistory(); }
  else { paintTrends(); if (!analysis.trends) loadTrends(); }
}
function analysisError(message, retry) { return `<div class="data-empty" role="alert"><strong>Could not load these records</strong><p>${safe(message)}</p><button type="button" class="secondary" data-analysis-retry="${retry}">Try again</button></div>`; }
function tableMarkup(headers, rows, empty = 'No records in this date range.') {
  return `<div class="data-table-wrap" tabindex="0" role="region" aria-label="${safe(headers[0])} data table"><table class="data-table"><thead><tr>${headers.map((h) => `<th scope="col">${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((cells) => '<tr>' + cells.map((v) => `<td>${v}</td>`).join('') + '</tr>').join('') : `<tr><td colspan="${headers.length}" class="data-empty">${safe(empty)}</td></tr>`}</tbody></table></div>`;
}
function paintHistory() {
  const f = analysis.filters, h = analysis.history;
  const rows = (h?.activities || []).map((a) => [safe(utcLabel(a.start_date)), `<button class="record-link" type="button" data-activity="${safe(a.id)}">${safe(a.name || title(a.sport_type))}<span>Open analysis →</span></button>`, safe(title(a.sport_type)), elapsedLabel(a.duration_s), numberLabel(a.distance_m == null ? null : a.distance_m / 1000, ' km', 1), numberLabel(a.avg_power, ' W') + (a.avg_power != null && a.device_watts !== true ? '<small>Estimated</small>' : ''), numberLabel(a.avg_hr, ' bpm'), numberLabel(a.raw_tss), a.feeling == null ? '—' : safe(title(a.feeling)), safe(title(a.source))]);
  $('#analysis-content').innerHTML = `<div class="section-head"><h3>Activity history</h3><button type="button" class="secondary" data-export="history" ${!h?.activities?.length ? 'disabled' : ''}>Export this page</button></div>
    <form id="history-filter" class="analysis-filters"><div><label for="history-from">From (UTC, optional)</label><input id="history-from" type="date" name="from" value="${safe(f.from)}"></div><div><label for="history-to">To (UTC, optional)</label><input id="history-to" type="date" name="to" value="${safe(f.to)}"></div><div class="search-field"><label for="history-search">Search activities</label><input type="search" id="history-search" name="search" value="${safe(f.search)}" placeholder="Activity name"></div><div><label for="history-sport">Sport</label><select id="history-sport" name="sport">${optionMarkup([['','All sports'],['cycling','Cycling'],['running','Running'],['swimming','Swimming'],['strength','Strength']], f.sport)}</select></div><button class="primary" type="submit">Apply filters</button><button class="quiet" type="button" data-clear-history>Clear</button></form>
    <p class="helper">${h?.total != null ? numberLabel(h.total) + ' activities · ' : ''}Newest first · Dates in UTC · Blank dates search all saved history. Missing values appear as —.</p>
    ${h?.error ? analysisError(h.error, 'history') : tableMarkup(['Date (UTC)','Activity','Sport','Duration','Distance','Avg power','Avg HR','TSS','Feeling / 5','Source'], rows, h ? 'No matching activities. Change the filters or check the athlete’s connected sources.' : 'Loading activity history…')}
    <div class="data-pagination"><button type="button" class="secondary" data-history-page="-1" ${!h || f.page === 0 ? 'disabled' : ''}>Previous page</button><span role="status">Page ${f.page + 1}${h?.total != null ? ' of ' + Math.max(1, Math.ceil(h.total / 50)) : ''}</span><button type="button" class="secondary" data-history-page="1" ${!h || !h.total || (f.page + 1) * 50 >= h.total ? 'disabled' : ''}>Next page</button></div>`;
}
async function loadHistory() {
  const request = ++analysis.historyRequest, athlete = state.athleteId;
  analysis.history = null; if (analysis.tab === 'history') paintHistory();
  try { const result = await portal('activity_history', { athlete_id: athlete, ...analysis.filters }); if (request !== analysis.historyRequest || athlete !== state.athleteId) return; analysis.history = result; }
  catch (error) { if (request !== analysis.historyRequest || athlete !== state.athleteId) return; analysis.history = { error: error.message }; }
  if (analysis.tab === 'history' && $('#analysis-content')) paintHistory();
}
async function loadTrends() {
  const request = ++analysis.trendRequest, athlete = state.athleteId;
  analysis.trends = null; if (analysis.tab !== 'history') paintTrends();
  try { const result = await portal('athlete_trends', { athlete_id: athlete, ...analysis.range }); if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = result; }
  catch (error) { if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = { error: error.message }; }
  if (analysis.tab !== 'history' && $('#analysis-content')) paintTrends();
}
function rangeForm() {
  return `<form id="trend-filter" class="analysis-filters"><div><label for="trend-from">From (UTC)</label><input required type="date" name="from" id="trend-from" value="${safe(analysis.range.from)}"></div><div><label for="trend-to">To (UTC)</label><input required type="date" name="to" id="trend-to" value="${safe(analysis.range.to)}"></div><button class="primary" type="submit">Update range</button><div class="range-shortcuts" role="group" aria-label="Recent date ranges">${[42,90,180,365].map((n) => `<button class="secondary" type="button" data-analysis-days="${n}">${n} days</button>`).join('')}</div></form><p id="range-error" class="form-error" role="alert"></p>`;
}
// Explicit nulls and breaks in time leave visible gaps; charts never turn missing data into zero.
function dataChart(series, label, unit = '', maxGap = Infinity) {
  const valid = series.flatMap((s) => s.points.filter((p) => p[1] != null && Number.isFinite(p[1])));
  if (!valid.length) return `<div class="chart-empty">No ${safe(label.toLowerCase())} recorded in this range.</div>`;
  const xs = valid.map((p) => p[0]), ys = valid.map((p) => p[1]);
  const xmin = xs.reduce((a,b)=>Math.min(a,b),Infinity), xmax = xs.reduce((a,b)=>Math.max(a,b),-Infinity), ymin = ys.reduce((a,b)=>Math.min(a,b),0), ymax = ys.reduce((a,b)=>Math.max(a,b),1);
  const width = Math.max(280,Math.min(1100,($('#drawer').hidden ? $('#analysis-content')?.clientWidth : $('#drawer-body')?.clientWidth) || 800) - 18);
  const right = width - 18;
  const x = (n) => 58 + (n - xmin) / (xmax - xmin || 1) * (right - 58), y = (n) => 202 - (n - ymin) / (ymax - ymin || 1) * 180;
  const paths = series.map((s) => { let open = false, previous = null; const d = s.points.map(([t,v]) => { if (v == null || !Number.isFinite(v)) { open = false; previous = t; return ''; } const cmd = !open || (previous != null && t - previous > maxGap) ? 'M' : 'L'; open = true; previous = t; return `${cmd}${x(t).toFixed(2)},${y(v).toFixed(2)}`; }).join(' '); return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>${(s.points.filter((p) => p[1] != null).length < 3 || Number.isFinite(maxGap)) ? s.points.filter((p) => p[1] != null).map(([t,v]) => `<circle cx="${x(t)}" cy="${y(v)}" r="3" fill="${s.color}"/>`).join('') : ''}`; }).join('');
  return `<div class="chart-frame"><svg class="data-chart" viewBox="0 0 ${width} 234" role="img" aria-label="${safe(label)}. ${safe(unit)}. Use the accompanying controls and data tables to inspect values."><title>${safe(label)} (${safe(unit)})</title>${[0,.5,1].map((n) => `<line x1="58" x2="${right}" y1="${22 + n * 180}" y2="${22 + n * 180}" stroke="#d9ded9"/><text x="50" y="${27 + n * 180}" text-anchor="end">${numberLabel(ymax - n * (ymax-ymin), '', 1)}</text>`).join('')}${paths}<text x="58" y="226">${safe(unit === 'seconds' ? elapsedLabel(xmin) : utcLabel(xmin))}</text><text x="${right}" y="226" text-anchor="end">${safe(unit === 'seconds' ? elapsedLabel(xmax) : utcLabel(xmax))}</text></svg></div><div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${safe(s.name)}</span>`).join('')}</div>`;
}
function weeklyRecords(activities) {
  const weeks = new Map();
  for (let day = analysis.range.from; day <= analysis.range.to; day = shiftUTC(day, 1)) { const monday = shiftUTC(day, -(new Date(day).getUTCDay() + 6) % 7); if (!weeks.has(monday)) weeks.set(monday, { day: monday, count: 0, duration: 0, distance: 0, tss: 0, tssCount: 0 }); }
  for (const a of activities) { const day = utcDay(a.start_date), monday = shiftUTC(day, -(new Date(day).getUTCDay() + 6) % 7), w = weeks.get(monday); if (!w) continue; w.count++; w.duration += Number(a.duration_s || 0); w.distance += Number(a.distance_m || 0); if (a.raw_tss != null) { w.tss += Number(a.raw_tss); w.tssCount++; } }
  return [...weeks.values()];
}
function paintTrends() {
  if (!$('#analysis-content')) return;
  const t = analysis.trends, tab = analysis.tab;
  const heading = { trends: 'Training trends', recovery: 'Recovery & health', imports: 'Imported activities' }[tab];
  let body = t?.error ? analysisError(t.error, 'trends') : '<div class="chart-empty" role="status">Loading recorded data…</div>';
  if (t && !t.error) {
    if (tab === 'trends') {
      const weeks = weeklyRecords(t.activities), totalSeconds = t.activities.reduce((n,a) => n + Number(a.duration_s || 0),0), scored = t.activities.filter((a) => a.raw_tss != null);
      body = `<div class="analysis-summary"><span><strong>${numberLabel(t.activities.length)}</strong> activities</span><span><strong>${numberLabel(totalSeconds/3600,' h',1)}</strong> recorded time</span><span><strong>${numberLabel(scored.reduce((n,a) => n + Number(a.raw_tss),0))}</strong> TSS across ${scored.length} scored activities</span></div>${t.coverage_limited ? '<p class="data-warning">This range exceeds 10,000 activities. Totals and charts are partial; select a shorter range.</p>' : ''}
        <h4>Weekly training time</h4><p class="helper">Monday–Sunday, within the selected UTC dates. First and last weeks may be partial. Select a week to review its activities.</p>${dataChart([{ name: 'Recorded hours', color: '#2c6588', points: weeks.map((w) => [Date.parse(w.day),w.duration/3600]) }], 'Weekly training hours', 'hours')}
        ${tableMarkup(['Week of (UTC)','Activities','Time','Distance','Recorded TSS'], weeks.map((w) => [`<button type="button" class="record-link" data-drill-week="${w.day}">${safe(utcLabel(w.day))} →</button>`,numberLabel(w.count),elapsedLabel(w.duration),numberLabel(w.distance/1000,' km',1),w.tssCount ? numberLabel(w.tss) + `<small>${w.tssCount} / ${w.count} scored</small>` : '—']))}
        ${powerRecordsMarkup(t.activities)}<h4>Fitness, fatigue and form</h4><p class="helper">Stored training-load calculations. Gaps are missing records; Garmin review imports are not added to these totals.</p>${dataChart([['ctl','Fitness (CTL)','#2c6588'],['atl','Fatigue (ATL)','#a05a20'],['tsb','Form (TSB)','#477343']].map(([key,name,color]) => ({name,color,points:t.load.map((r) => [Date.parse(r.metric_date),r[key]])})), 'Training load', 'load', 86400000 * 1.5)}
        <details class="data-disclosure"><summary>View daily training-load values</summary>${tableMarkup(['Date','CTL','ATL','TSB','Daily TSS'],t.load.slice().reverse().map((r) => [safe(utcLabel(r.metric_date)),numberLabel(r.ctl,'',1),numberLabel(r.atl,'',1),numberLabel(r.tsb,'',1),numberLabel(r.daily_tss,'',1)]))}</details>`;
    } else if (tab === 'recovery') body = recoveryMarkup(t);
    else body = `<p class="helper">These provider records are available for review. They stay separate from activity history and training-load totals because the same workout may exist in more than one source. Traces are not available for these imports.</p>${t.imports_limited ? '<p class="data-warning">Showing the latest 500 records per provider in this range. Shorten the range to see the remaining records.</p>' : ''}${tableMarkup(['Date (UTC)','Activity','Sport','Duration','Distance','Avg HR','Avg power','Device','Source','Imported'], t.imported.map((a) => [safe(utcLabel(a.started_at)),safe(a.name || 'Untitled activity'),safe(title(a.sport)),elapsedLabel(a.duration_s),numberLabel(a.distance_m == null ? null : a.distance_m/1000,' km',1),numberLabel(a.avg_hr,' bpm'),numberLabel(a.avg_power,' W'),safe(a.device || '—'),safe(a.source_label),safe(utcLabel(a.imported_at))]))}`;
  }
  $('#analysis-content').innerHTML = `<div class="section-head"><h3>${heading}</h3><button type="button" class="secondary" data-export="${tab}" ${!t || t.error ? 'disabled' : ''}>Export data</button></div>${rangeForm()}${body}`;
}
function powerRecordsMarkup(activities) {
  const eligible = activities.filter((a) => a.device_watts === true && a.power_curve);
  const bests = new Map();
  for (const a of eligible) for (const [seconds,watts] of Object.entries(a.power_curve)) {
    if (!(Number(seconds)>0) || typeof watts !== 'number' || !Number.isFinite(watts) || watts<0) continue;
    if (!bests.has(seconds) || bests.get(seconds).watts < watts) bests.set(seconds,{seconds:Number(seconds),watts,activity:a});
  }
  return `<h4>Power-duration records in this period</h4><p class="helper">Best saved average power by duration, using ${eligible.length} activities with power-meter data and a saved power curve. Estimated power is excluded. These are period records, not all-time records.</p>${tableMarkup(['Duration','Best average power','Recorded on','Activity'],[...bests.values()].sort((a,b)=>a.seconds-b.seconds).map((r)=>[elapsedLabel(r.seconds),numberLabel(r.watts,' W'),safe(utcLabel(r.activity.start_date)),`<button type="button" class="record-link" data-activity="${safe(r.activity.id)}">${safe(r.activity.name || 'Open activity')} →</button>`]),'No power-meter curves saved in this period.')}`;
}
function recoveryMarkup(t) {
  const keys = [['hrv_ms','HRV','ms'],['resting_hr','Resting heart rate','bpm'],['sleep_hours','Sleep','hours']];
  const [key,label,unit] = keys.find((k) => k[0] === analysis.recovery) || keys[0];
  return `<p class="helper">Measurements retain their original source. Different devices and measurement methods may produce different values. Missing readings are never treated as zero.</p><div class="analysis-nav" role="group" aria-label="Recovery chart metric">${keys.map(([id,name]) => `<button type="button" class="secondary" data-recovery="${id}" aria-pressed="${id === key}">${name}</button>`).join('')}</div>${dataChart([{name:'Trainable daily readiness',color:'#2c6588',points:t.readiness.map((r) => [Date.parse(r.metric_date),r[key]])},{name:'Intervals.icu wellness',color:'#965629',points:t.wellness.map((r) => [Date.parse(r.day),key === 'sleep_hours' ? r.sleep_s == null ? null : r.sleep_s/3600 : r[key]])}],label,unit,86400000*1.5)}
    <h4>Daily readiness & athlete check-ins</h4>${tableMarkup(['Date','HRV (ms)','Resting HR','Sleep (h)','Sleep quality / 5','Energy / 5'],t.readiness.slice().reverse().map((r) => [safe(utcLabel(r.metric_date)),numberLabel(r.hrv_ms,'',1),numberLabel(r.resting_hr),numberLabel(r.sleep_hours,'',1),numberLabel(r.checkin_sleep_quality),numberLabel(r.checkin_energy)]))}
    <h4>Intervals.icu wellness</h4>${tableMarkup(['Date','HRV (ms)','Resting HR','Sleep (h)','Sleep score','Steps','SpO₂ (%)','Weight (kg)','VO₂max','Body battery min','Body battery max'],t.wellness.slice().reverse().map((r) => [safe(utcLabel(r.day)),numberLabel(r.hrv_ms,'',1),numberLabel(r.resting_hr),numberLabel(r.sleep_s == null ? null : r.sleep_s/3600,'',1),numberLabel(r.sleep_score),numberLabel(r.steps),numberLabel(r.spo2_pct,'',1),numberLabel(r.weight_kg,'',1),numberLabel(r.vo2max,'',1),numberLabel(r.body_battery_min),numberLabel(r.body_battery_max)]))}`;
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function profileMarkup() {
  const d = state.athlete, p = d.profile || {}, z = d.zones || {};
  const fields = [['Primary sport',title(p.primary_sport)],['Experience',title(p.experience_level)],['Birth year',p.birth_year],['Sex',title(p.sex)],['Weight',numberLabel(p.weight_kg,' kg',1)],['FTP',numberLabel(z.ftp_watts,' W')],['FTP setting',z.ftp_locked == null ? '—' : z.ftp_locked ? 'Locked by athlete' : 'Automatic'],['Estimated FTP',numberLabel(z.estimated_ftp_watts,' W')],['Threshold HR',numberLabel(z.threshold_hr,' bpm')],['Maximum HR',numberLabel(z.max_hr,' bpm')],['Resting HR',numberLabel(z.resting_hr,' bpm')],['Threshold run pace',z.threshold_pace_sec_per_km == null ? '—' : elapsedLabel(z.threshold_pace_sec_per_km).slice(2) + ' /km'],['Estimated threshold HR',numberLabel(z.estimated_threshold_hr,' bpm')],['Estimated run pace',z.estimated_threshold_pace_sec_per_km == null ? '—' : elapsedLabel(z.estimated_threshold_pace_sec_per_km).slice(2) + ' /km'],['Gym access',p.gym_access == null ? '—' : p.gym_access ? 'Yes' : 'No'],['Equipment',p.available_equipment == null ? 'Not recorded' : p.available_equipment.length ? p.available_equipment.map(title).join(', ') : 'Bodyweight only'],['Training preference',title(p.training_aggressiveness)]];
  return `<div class="section-head"><h3>Athlete profile & availability</h3><button type="button" class="secondary" data-action="new-note">Add athlete note</button></div><p class="helper">Current athlete settings. Thresholds may have changed since an older activity. The athlete updates these settings in Trainable.</p><dl class="profile-fields">${fields.map(([key,value]) => `<div><dt>${safe(key)}</dt><dd>${safe(value || 'Not recorded')}</dd></div>`).join('')}</dl><h4>Weekly availability</h4>${tableMarkup(['Day','Available time','Rest preference'],ORDER.map((day) => { const n = p.day_availability_min?.[day]; return [DAYS[day],n == null ? 'Not recorded' : n === 0 ? 'Unavailable' : n < 0 || n >= 1440 ? 'Flexible' : minutesLabel(n),(p.preferred_rest_days || []).includes(day) ? 'Preferred rest day' : '—']; }))}<h4>Injury & environment notes</h4><p class="preserve-lines">${safe(p.injury_notes || 'No injury notes recorded.')}</p><p class="preserve-lines">${safe(p.environment_notes || 'No environment notes recorded.')}</p><h4>Goals</h4>${tableMarkup(['Target date','Event / goal','Target FTP','Weekly hours','Recent longest session','Notes'],(d.goals || []).map((g) => [safe(utcLabel(g.target_date)),safe(title(g.event_type) || 'Training goal'),numberLabel(g.target_ftp_watts,' W'),numberLabel(g.weekly_hours_available,' h',1),numberLabel(g.recent_longest_session_min,' min'),safe(g.notes || '—')]))}`;
}
async function openActivity(id) {
  const request = ++analysis.detailRequest, athlete = state.athleteId;
  state.editorDirty = false; analysis.detail = null;
  openEditor('activity', 'ACTIVITY ANALYSIS', 'Loading activity…', '<div class="chart-empty" role="status">Loading summary, traces and laps…</div>');
  $('#drawer').classList.add('analysis-page'); $('#close-drawer').textContent = 'Back to athlete'; $('#close-drawer').focus();
  history.replaceState(null, '', '#activity/' + athlete + '/' + id);
  try { const detail = await portal('activity_detail', { athlete_id: athlete, activity_id: id }); if (request !== analysis.detailRequest || athlete !== state.athleteId || $('#drawer').hidden) return; analysis.detail = detail; analysis.trace = Object.keys(detail.channels).find((k) => detail.channels[k]?.some((p) => p[1] != null)) || 'watts'; renderActivity(); }
  catch (error) { if (request === analysis.detailRequest && athlete === state.athleteId && !$('#drawer').hidden) { $('#drawer-title').textContent = 'Activity unavailable'; $('#drawer-body').innerHTML = `<p role="alert">${safe(error.message)}</p><button type="button" class="secondary" data-activity="${safe(id)}">Try again</button>`; } }
}
const TRACE_LABELS = {watts:['Power','W'],heartrate:['Heart rate','bpm'],cadence:['Cadence','rpm'],velocity_ms:['Speed','m/s'],altitude_m:['Elevation','m'],distance_m:['Distance','m']};
function renderActivity() {
  analysis.segmentRequest = (analysis.segmentRequest || 0) + 1;
  const d = analysis.detail, a = d.activity;
  $('#drawer-title').textContent = a.name || title(a.sport_type) + ' activity';
  const cells = [['Duration',elapsedLabel(a.duration_s)],['Distance',numberLabel(a.distance_m == null ? null : a.distance_m/1000,' km',2)],['Average power',numberLabel(a.avg_power,' W')],['Average HR',numberLabel(a.avg_hr,' bpm')],['TSS',numberLabel(a.raw_tss,'',1)],['Elevation gain',numberLabel(a.elevation_gain,' m')],['Weighted power (Strava)',numberLabel(a.strava_weighted_avg_watts,' W')],['Maximum power (Strava)',numberLabel(a.strava_max_watts,' W')]];
  const curve = Object.entries(a.power_curve || {}).filter(([s,w]) => Number(s)>0 && typeof w === 'number').sort((x,y) => Number(x[0])-Number(y[0]));
  $('#drawer-body').innerHTML = `<p class="activity-meta">${safe(utcLabel(a.start_date))} · ${safe(new Date(a.start_date).toLocaleTimeString(undefined,{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}))} UTC · ${safe(title(a.sport_type))} · ${safe(title(a.source))}</p><p class="helper">${a.avg_power == null ? 'No average power recorded.' : a.device_watts === true ? 'Power recorded by a power meter.' : 'Power is estimated or its measurement source is unconfirmed.'}</p><dl class="activity-values">${cells.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="athlete-feedback"><h3>Athlete feedback</h3><p>Feeling (1–5): ${safe(a.feeling == null ? 'Not recorded' : title(a.feeling))}</p><p class="preserve-lines">${safe(a.athlete_comment || 'No athlete comment recorded.')}</p></div>
    <div class="section-head"><h3>Recorded traces</h3>${a.strava_activity_id && (!d.stream_samples || !d.laps.length) ? '<button type="button" class="secondary" data-fetch-traces>Fetch missing Strava detail</button>' : ''}</div><p id="trace-fetch-status" role="status"></p><div class="analysis-nav" role="group" aria-label="Trace metric">${Object.keys(d.channels).map((k) => `<button type="button" class="secondary" data-trace="${k}" aria-pressed="${analysis.trace === k}">${TRACE_LABELS[k][0]}</button>`).join('')}</div><div id="activity-trace"></div>
    ${d.stream_samples ? `<p class="helper">Chart preserves sample peaks from ${numberLabel(d.stream_samples)} stored points; it is reduced for display. Segment statistics use the full stored trace. Gaps longer than 10 seconds are excluded from segment averages.</p><form id="segment-form" class="analysis-filters"><div><label for="segment-from">Start (elapsed seconds)</label><input id="segment-from" type="number" min="0" step="any" required value="0"></div><div><label for="segment-to">End (elapsed seconds)</label><input id="segment-to" type="number" min="0" max="${d.stream_duration_s}" step="any" required value="${d.stream_duration_s}"></div><button type="submit" class="primary">Analyze segment</button></form><div id="segment-result" aria-live="polite"></div>` : '<p class="helper">No stored traces for this activity. Summary values are shown above; detailed samples cannot be inferred from averages.</p>'}
    <h3>Laps & intervals</h3>${tableMarkup(['Lap','Start','Elapsed','Moving','Distance','Avg power','Max power','Avg HR','Max HR','Avg speed','Max speed','Elevation'],d.laps.map((l) => [d.stream_samples && l.start_s != null && l.elapsed_s > 0 && l.start_s + l.elapsed_s <= d.stream_duration_s ? `<button type="button" class="record-link" data-lap-from="${l.start_s}" data-lap-to="${l.start_s+l.elapsed_s}">${safe(l.name || 'Lap ' + l.lap_index)} →</button>` : safe(l.name || 'Lap ' + l.lap_index),elapsedLabel(l.start_s),elapsedLabel(l.elapsed_s),elapsedLabel(l.moving_s),numberLabel(l.distance_m == null ? null : l.distance_m/1000,' km',2),numberLabel(l.avg_watts,' W'),numberLabel(l.max_watts,' W'),numberLabel(l.avg_hr,' bpm'),numberLabel(l.max_hr,' bpm'),numberLabel(l.avg_speed_ms == null ? null : l.avg_speed_ms*3.6,' km/h',1),numberLabel(l.max_speed_ms == null ? null : l.max_speed_ms*3.6,' km/h',1),numberLabel(l.elevation_gain_m,' m')]),'No laps saved for this activity.')}
    <h3>Power-duration bests for this activity</h3><p class="helper">Saved best average power for each duration in this activity${a.device_watts !== true ? '; power may be estimated' : ''}.</p>${tableMarkup(['Duration','Best average power'],curve.map(([s,w]) => [elapsedLabel(Number(s)),numberLabel(w,' W')]),'No power-duration record saved.')}${a.ai_insight ? `<details class="data-disclosure"><summary>Saved AI interpretation</summary><p class="helper">${safe(a.ai_insight_generated_at ? utcLabel(a.ai_insight_generated_at) : '')} · Interpretation, not a recorded measurement.</p><p class="preserve-lines">${safe(typeof a.ai_insight === 'string' ? a.ai_insight : JSON.stringify(a.ai_insight))}</p></details>` : ''}`;
  paintTrace();
}
function paintTrace() {
  const points = analysis.detail.channels[analysis.trace] || [], [name,unit] = TRACE_LABELS[analysis.trace];
  $('#activity-trace').innerHTML = points.length ? dataChart([{name:name + ' (' + unit + ')',color:'#2c6588',points}],name,'seconds') + `<label for="trace-position">Inspect a recorded point</label><input id="trace-position" type="range" min="0" max="${points.length-1}" value="0" step="1"><output id="trace-reading" for="trace-position" aria-live="polite"></output>` : '<div class="chart-empty">No recorded trace available.</div>';
  readTrace(0);
}
function readTrace(index) { const point = analysis.detail?.channels[analysis.trace]?.[index]; if (point && $('#trace-reading')) $('#trace-reading').textContent = elapsedLabel(point[0]) + ' elapsed · ' + numberLabel(point[1],' ' + TRACE_LABELS[analysis.trace][1],1); }
async function analyzeSegment() {
  const from = Number($('#segment-from').value), to = Number($('#segment-to').value), d = analysis.detail, request = analysis.detailRequest;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > d.stream_duration_s) { $('#segment-result').innerHTML = '<p class="form-error" role="alert">Choose an end after the start, within the recorded trace.</p>'; return; }
  const segmentRequest = (analysis.segmentRequest || 0) + 1; analysis.segmentRequest = segmentRequest;
  $('#segment-result').textContent = 'Calculating from stored samples…';
  try { const result = await portal('activity_segment',{athlete_id:state.athleteId,activity_id:d.activity.id,from_s:from,to_s:to}); if (request !== analysis.detailRequest || segmentRequest !== analysis.segmentRequest || !$('#segment-result')) return;
    $('#segment-result').innerHTML = `<h4>${elapsedLabel(from)} – ${elapsedLabel(to)}</h4>${tableMarkup(['Metric','Time-weighted average','Maximum','Recorded coverage'],Object.entries(result.segment.metrics).map(([key,m]) => [TRACE_LABELS[key][0],numberLabel(m.average,' ' + TRACE_LABELS[key][1],1),numberLabel(m.maximum,' ' + TRACE_LABELS[key][1],1),numberLabel(m.coverage_s,' s',1) + ' / ' + numberLabel(to-from,' s',1)]))}`;
  } catch (error) { if (request === analysis.detailRequest && segmentRequest === analysis.segmentRequest && $('#segment-result')) $('#segment-result').innerHTML = `<p class="form-error" role="alert">${safe(error.message)}</p>`; }
}
function exportAnalysis(kind) {
  const t = analysis.trends; let rows = [];
  if (kind === 'history') rows = analysis.history?.activities || [];
  if (kind === 'trends') rows = [...(t?.load || []).map((r) => ({record_type:'daily_load',...r})),...(t?.activities || []).map((r) => ({record_type:'activity',...r}))];
  if (kind === 'imports') rows = t?.imported || [];
  if (kind === 'recovery') rows = [...(t?.readiness || []).map((r) => ({source:'Trainable readiness',...r})),...(t?.wellness || []).map((r) => ({...r,source:'Intervals.icu wellness'}))];
  if (!rows.length) { setStatus('No records to export for this view.'); return; }
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escapeCell = (value) => { const s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" : '') + s.replace(/"/g,'""') + '"'; };
  const csv = [fields,...rows.map((r) => fields.map((k) => r[k]))].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})), link = document.createElement('a'); link.href = url; link.download = 'trainable-' + kind + '-' + utcDay(new Date()) + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
document.addEventListener('submit', (event) => {
  if (event.target.id === 'history-filter') { event.preventDefault(); analysis.filters = {...Object.fromEntries(new FormData(event.target)),page:0}; loadHistory(); }
  if (event.target.id === 'trend-filter') { event.preventDefault(); const range = Object.fromEntries(new FormData(event.target)); const days = (Date.parse(range.to)-Date.parse(range.from))/86400000+1; if (!(days>=1 && days<=366)) { $('#range-error').textContent = 'Choose a start before the end, within one year.'; return; } analysis.range = range; loadTrends(); }
  if (event.target.id === 'segment-form') { event.preventDefault(); analyzeSegment(); }
});
document.addEventListener('click', (event) => {
  const el = event.target.closest('button'); if (!el) return;
  if (el.dataset.analysisTab) { analysis.tab = el.dataset.analysisTab; renderAthlete(); $(`[data-analysis-tab="${analysis.tab}"]`).focus(); }
  if (el.dataset.activity) { el.focus(); openActivity(el.dataset.activity); }
  if (el.dataset.analysisRetry === 'history') loadHistory();
  if (el.dataset.analysisRetry === 'trends') loadTrends();
  if (el.hasAttribute('data-history-page')) { analysis.filters.page = Math.max(0,analysis.filters.page+Number(el.dataset.historyPage)); loadHistory(); }
  if (el.hasAttribute('data-clear-history')) { analysis.filters = {search:'',sport:'',from:'',to:'',page:0}; loadHistory(); }
  if (el.dataset.analysisDays) { const to = utcDay(new Date()); analysis.range = {to,from:shiftUTC(to,1-Number(el.dataset.analysisDays))}; loadTrends(); }
  if (el.dataset.drillWeek) { analysis.filters = {search:'',sport:'',from:el.dataset.drillWeek < analysis.range.from ? analysis.range.from : el.dataset.drillWeek,to:shiftUTC(el.dataset.drillWeek,6) > analysis.range.to ? analysis.range.to : shiftUTC(el.dataset.drillWeek,6),page:0}; analysis.tab = 'history'; analysis.history = null; renderAthlete(); $('#history-from').focus(); }
  if (el.dataset.recovery) { analysis.recovery = el.dataset.recovery; paintTrends(); $(`[data-recovery="${analysis.recovery}"]`).focus(); }
  if (el.dataset.trace) { analysis.trace = el.dataset.trace; document.querySelectorAll('[data-trace]').forEach((b) => b.setAttribute('aria-pressed',b.dataset.trace === analysis.trace)); paintTrace(); }
  if (el.hasAttribute('data-lap-from')) { $('#segment-from').value = el.dataset.lapFrom; $('#segment-to').value = el.dataset.lapTo; analyzeSegment(); $('#segment-form').scrollIntoView({block:'center'}); $('#segment-from').focus(); }
  if (el.dataset.export) exportAnalysis(el.dataset.export);
  if (el.hasAttribute('data-fetch-traces')) fetchActivityDetail(el);
});
document.addEventListener('input', (event) => { if (event.target.id === 'trace-position') readTrace(Number(event.target.value)); if (event.target.closest('#segment-form, #activity-trace')) state.editorDirty = false; if (event.target.closest('#trend-filter')) $('#range-error').textContent = ''; });

document.addEventListener('pointermove',(event)=>{
  const svg = event.target.closest('#activity-trace svg'); if (!svg || !analysis.detail) return;
  const points = analysis.detail.channels[analysis.trace] || []; if (!points.length) return;
  const rect=svg.getBoundingClientRect(), width=svg.viewBox.baseVal.width;
  const fraction=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*width-58)/(width-76)));
  const time=points[0][0]+fraction*(points.at(-1)[0]-points[0][0]);
  let index=0; for(let i=1;i<points.length;i++) if(Math.abs(points[i][0]-time)<Math.abs(points[index][0]-time)) index=i;
  $('#trace-position').value=index; readTrace(index);
});

async function fetchActivityDetail(button) {
  const request = analysis.detailRequest, activity = analysis.detail.activity.id;
  button.disabled = true; $('#trace-fetch-status').textContent = 'Fetching missing traces and laps from Strava…';
  try {
    const detail = await portal('sync_activity_detail',{athlete_id:state.athleteId,activity_id:activity});
    if (request !== analysis.detailRequest || $('#drawer').hidden) return;
    analysis.detail = detail; analysis.trace = Object.keys(detail.channels).find((key)=>detail.channels[key]?.length) || 'watts'; renderActivity();
    $('#trace-fetch-status').textContent = detail.stream_samples ? 'Saved detail refreshed.' : 'Strava did not return a recorded trace for this activity.';
  } catch(error) { if (request === analysis.detailRequest && $('#trace-fetch-status')) { $('#trace-fetch-status').textContent = error.message; button.disabled = false; } }
}

document.addEventListener('focusout',(event)=>{
  const input=event.target; if (!input.matches('#history-filter input, #trend-filter input, #segment-form input')) return;
  if (!input.checkValidity()) {
    input.setAttribute('aria-invalid','true');
    const id=input.id+'-validation'; let message=document.getElementById(id);
    if (!message) { message=document.createElement('p'); message.id=id; message.className='field-error'; message.setAttribute('role','alert'); input.after(message); }
    input.setAttribute('aria-describedby',id); message.textContent=input.validationMessage;
  }
});
document.addEventListener('focusin',(event)=>{
  if (event.target.matches('#history-filter input, #trend-filter input, #segment-form input')) { event.target.removeAttribute('aria-invalid'); const message=document.getElementById(event.target.id+'-validation'); if (message) message.textContent=''; }
});
