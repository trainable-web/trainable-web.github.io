/* Coach analysis: stored observations only; imported sources remain separate. */
const analysis = { athlete: null, tab: 'review', history: null, trends: null, historyRequest: 0, trendRequest: 0, detailRequest: 0,
  filters: { search: '', sport: '', from: '', to: '', page: 0 }, range: null, detail: null, activityBack: null, trace: 'watts', traceVisible: [], traceRange: null, traceSmoothing: 15, traceDrag: null, lapSelected: [], aiReport: null, backfillBusy: false, backfillStatus: '', recovery: 'hrv_ms' };
const numberLabel = (value, suffix = '', digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) + suffix;
const elapsedLabel = (value) => value == null ? '—' : Math.floor(value / 3600) + ':' + String(Math.floor(value % 3600 / 60)).padStart(2, '0') + ':' + String(Math.round(value % 60)).padStart(2, '0');
const utcDay = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const shiftUTC = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
const utcLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
function resetAnalysis() {
  analysis.athlete = state.athleteId; analysis.history = null; analysis.trends = null; analysis.detail = null; analysis.activityBack = null;
  analysis.historyRequest++; analysis.trendRequest++; analysis.detailRequest++;
  analysis.filters = { search: '', sport: '', from: '', to: '', page: 0 };
  analysis.backfillStatus = ''; analysis.backfillBusy = false;
  const to = utcDay(new Date()); analysis.range = { from: shiftUTC(to, -89), to }; analysis.tab = 'review';
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function analysisMarkup() {
  if (analysis.athlete !== state.athleteId) resetAnalysis();
  return `<div class="analysis-nav" role="group" aria-label="Analysis view">${[['review','Coach review'],['history','Activity history'],['trends','Training trends'],['recovery','Recovery & health'],['imports','Imported activities']].map(([id,label]) => `<button type="button" class="secondary" data-analysis-tab="${id}" aria-pressed="${analysis.tab === id}">${label}</button>`).join('')}</div><div id="analysis-content"></div>`;
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function paintAnalysis() {
  if (!$('#analysis-content')) return;
  if (analysis.tab === 'history') { paintHistory(); if (!analysis.history) loadHistory(); }
  else { analysis.tab === 'review' ? paintReview() : paintTrends(); if (!analysis.trends) loadTrends(); }
}
function analysisError(message, retry) { return `<div class="data-empty" role="alert"><strong>Could not load these records</strong><p>${safe(message)}</p><button type="button" class="secondary" data-analysis-retry="${retry}">Try again</button></div>`; }
function tableMarkup(headers, rows, empty = 'No records in this date range.') {
  return `<div class="data-table-wrap" tabindex="0" role="region" aria-label="${safe(headers[0])} data table"><table class="data-table"><thead><tr>${headers.map((h) => `<th scope="col">${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((cells) => '<tr>' + cells.map((v) => `<td>${v}</td>`).join('') + '</tr>').join('') : `<tr><td colspan="${headers.length}" class="data-empty">${safe(empty)}</td></tr>`}</tbody></table></div>`;
}
function paintHistory() {
  const f = analysis.filters, h = analysis.history;
  const rows = (h?.activities || []).map((a) => [safe(utcLabel(a.start_date)), `<button class="record-link" type="button" data-activity="${safe(a.id)}">${safe(a.name || title(a.sport_type))}<span>Open analysis →</span></button>`, safe(title(a.strava_sport_type || a.sport_type)), elapsedLabel(a.duration_s), numberLabel(a.distance_m == null ? null : a.distance_m / 1000, ' km', 1), numberLabel(a.avg_power, ' W') + (a.avg_power != null && a.device_watts !== true ? '<small>Estimated</small>' : ''), numberLabel(a.avg_hr, ' bpm'), numberLabel(a.raw_tss), a.feeling == null ? '—' : safe(title(a.feeling)), safe(title(a.source))]);
  $('#analysis-content').innerHTML = `<div class="section-head"><h3>Activity history</h3><div class="history-actions"><button type="button" class="secondary" data-backfill-strava ${analysis.backfillBusy ? 'disabled' : ''}>${analysis.backfillBusy ? 'Importing…' : 'Import older Strava history'}</button><button type="button" class="secondary" data-export="history" ${!h?.activities?.length ? 'disabled' : ''}>Export this page</button></div></div><p class="helper">The historical import checks up to three years and 2,000 accessible Strava activities. It can run once per day.</p><p role="status" class="backfill-status">${safe(analysis.backfillStatus)}</p>
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
  analysis.trends = null; if (analysis.tab === 'review') paintReview(); else if (analysis.tab !== 'history') paintTrends();
  try { const result = await portal('athlete_trends', { athlete_id: athlete, ...analysis.range }); if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = result; }
  catch (error) { if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = { error: error.message }; }
  if (analysis.tab !== 'history' && $('#analysis-content')) analysis.tab === 'review' ? paintReview() : paintTrends();
}
function paintReview() {
  const root = $('#analysis-content'); if (!root) return;
  const t = analysis.trends, d = state.athlete || {}, p = d.profile || {};
  const today = utcDay(new Date()), from = shiftUTC(today, -27), week = shiftUTC(today, -6);
  const activities = (t?.activities || []).filter((a) => { const day = utcDay(a.start_date); return day >= from && day <= today; }).sort((a,b) => String(b.start_date).localeCompare(String(a.start_date)));
  const lastSeven = activities.filter((a) => utcDay(a.start_date) >= week);
  const previous = activities.filter((a) => utcDay(a.start_date) < week);
  const hours = (rows) => rows.reduce((n,a) => n + Math.max(0, Number(a.duration_s) || 0), 0) / 3600;
  const count = (test) => activities.filter(test).length;
  const paired = count((a) => a.sport_type === 'cycling' && a.device_watts === true && Number(a.avg_power) > 0 && Number(a.avg_hr) > 0);
  const lastRide = activities.find((a) => a.sport_type === 'cycling');
  const checkin = d.readiness, checkinAge = checkin?.metric_date ? Math.round((Date.parse(today) - Date.parse(checkin.metric_date)) / 86400000) : null;
  const recentReport = checkinAge != null && checkinAge <= 3 && (checkin.checkin_energy != null || checkin.checkin_sleep_quality != null);
  const recordedTss = count((a) => a.raw_tss != null && Number.isFinite(Number(a.raw_tss)));
  const upcoming = (d.goals || []).filter((g) => g.target_date && g.target_date >= today).sort((a,b) => a.target_date.localeCompare(b.target_date))[0];
  const thisWeek = currentWeek(), followingWeek = nextWeek();
  const planCount = (day) => { const ids = new Set((d.plans || []).filter((plan) => plan.week_start_date === day).map((plan) => plan.id)); return (d.workouts || []).filter((w) => ids.has(w.plan_id)).length; };
  const notes = (d.coach_notes || []).slice(0, 3);
  const questions = [
    ...(upcoming ? [] : ['What event or outcome is the next block built for?']),
    ...(recentReport ? [] : ['How is recovery today? No recent energy or sleep report is available.']),
    ...(!p.day_availability_min || !Object.keys(p.day_availability_min).length ? ['What time can the athlete actually train next week?'] : []),
    ['When was the current FTP set, and how did the key rides feel and go for fueling?'],
  ];
  const signalRows = [
    ['Recorded TSS',recordedTss,'Directly stored session score'],
    ['Power meter',count((a) => a.device_watts === true && Number(a.avg_power) > 0),'Cycling efforts and power-duration review'],
    ['Heart rate',count((a) => Number(a.avg_hr) > 0),'Cardiovascular response'],
    ['Power + HR',paired,'Compare output and response on the same ride'],
  ];
  const context = [
    `<div><dt>Next goal</dt><dd>${upcoming ? `${safe(title(upcoming.event_type) || 'Training goal')} · ${safe(utcLabel(upcoming.target_date))}` : 'No upcoming dated goal recorded'}</dd></div>`,
    `<div><dt>Latest readiness record</dt><dd>${checkinAge == null ? 'None recorded' : `${safe(utcLabel(checkin.metric_date))} · ${checkinAge === 0 ? 'today' : checkinAge + ' days ago'}${checkin.checkin_energy == null ? '' : ' · energy ' + safe(checkin.checkin_energy) + '/5'}${checkin.checkin_sleep_quality == null ? '' : ' · sleep ' + safe(checkin.checkin_sleep_quality) + '/5'}${checkin.checkin_energy == null && checkin.checkin_sleep_quality == null ? '<small>No athlete-reported energy or sleep quality</small>' : ''}`}</dd></div>`,
    `<div><dt>Current threshold</dt><dd>${numberLabel(d.zones?.ftp_watts,' W')} FTP · ${numberLabel(d.zones?.threshold_hr,' bpm')} threshold HR<small>Threshold setting dates are not recorded here. Older load may use different settings.</small></dd></div>`,
    `<div><dt>Availability</dt><dd>${p.day_availability_min && Object.keys(p.day_availability_min).length ? 'Weekly schedule recorded' : 'No weekly schedule recorded'}${p.preferred_rest_days?.length ? ' · preferred rest: ' + safe(p.preferred_rest_days.map((day) => DAYS[day] || day).join(', ')) : ''}</dd></div>`,
    `<div><dt>Injury or environment notes</dt><dd>${p.injury_notes || p.environment_notes ? safe([p.injury_notes,p.environment_notes].filter(Boolean).join(' · ')) : 'None recorded'}</dd></div>`,
    `<div><dt>Plan coverage</dt><dd>${planCount(thisWeek)} entries this week · ${planCount(followingWeek)} next week</dd></div>`,
  ].join('');
  root.innerHTML = `<div class="section-head"><div><h3>Coach review</h3><p class="helper">Evidence for the next training decision · ${safe(utcLabel(from))}–${safe(utcLabel(today))} UTC</p></div><button type="button" class="secondary" data-review-refresh>Refresh</button></div>
    ${t?.error ? analysisError(t.error, 'review') : !t ? '<div class="chart-empty" role="status">Loading training and athlete context…</div>' : `<div class="review-layout"><div class="review-main">
      ${t.coverage_limited ? '<p class="data-warning">More than 10,000 activities are in this range. These totals may be incomplete.</p>' : ''}
      <div class="review-numbers" aria-label="Recent training summary"><div><span>Past 7 days</span><strong>${numberLabel(hours(lastSeven),' h',1)}</strong><small>${lastSeven.length} recorded activities</small></div><div><span>Prior 3-week average</span><strong>${numberLabel(hours(previous)/3,' h',1)}</strong><small>Per 7 days, recorded</small></div><div><span>Latest ride</span><strong>${lastRide ? safe(utcLabel(lastRide.start_date)) : '—'}</strong><small>${lastRide ? safe(lastRide.name || 'Cycling') : 'No ride in this period'}</small></div></div>
      <section class="review-block review-signals"><div class="review-heading"><h4>What the data supports</h4><button type="button" class="record-link" data-analysis-tab="trends">Open trends →</button></div><p class="helper">${activities.length} saved activities in 28 days. Counts below show available signals, not data quality within a recording.</p>${tableMarkup(['Signal','Activities','Useful for'],signalRows.map(([name,n,purpose]) => [safe(name),`${n} / ${activities.length}`,safe(purpose)]))}<p class="review-caution">${activities.length && !recordedTss ? 'None of these activities has recorded TSS. Recent load contributions are estimated. ' : ''}Fitness, fatigue and form use a load model. When recorded TSS is absent, the model can estimate stress from weighted power, summary HR, or duration alone. Treat load trends as context; inspect the rides before changing the plan.</p></section>
      <section class="review-block"><div class="review-heading"><h4>Recent sessions</h4><button type="button" class="record-link" data-analysis-tab="history">Full history →</button></div>${tableMarkup(['Date','Session','Duration','Power','HR'],activities.slice(0,6).map((a) => [safe(utcLabel(a.start_date)),`<button type="button" class="record-link" data-activity="${safe(a.id)}">${safe(a.name || title(a.sport_type))} →</button>`,elapsedLabel(a.duration_s),numberLabel(a.avg_power,' W'),numberLabel(a.avg_hr,' bpm')]),'No saved activities in the past 28 days. Check connected sources before assuming training stopped.')}</section>
    </div><aside class="review-context"><h4>Before prescribing</h4><dl>${context}</dl>${recentReport ? '' : '<p class="review-caution">No recent athlete-reported energy or sleep quality. Confirm recovery and constraints before setting intensity.</p>'}<h4>Still to confirm</h4><ul class="review-questions">${questions.map((q) => `<li>${safe(q)}</li>`).join('')}</ul><div class="review-actions"><button type="button" class="primary" data-athlete-section="calendar">Review calendar</button><button type="button" class="secondary" data-action="build-week">Plan week</button><button type="button" class="secondary" data-action="new-note">Add context note</button><button type="button" class="secondary" data-athlete-section="profile">Full profile</button></div><h4>Latest coach and athlete notes</h4>${notes.length ? `<ul class="review-notes">${notes.map((n) => `<li><small>${safe(title(n.kind || 'Note'))} · ${safe(utcLabel(n.created_at))}</small><p>${safe(n.body)}</p></li>`).join('')}</ul>` : '<p class="helper">No notes recorded. Add training response, constraints or preferences after speaking with the athlete.</p>'}</aside></div>`}`;
}
function rangeForm() {
  return `<form id="trend-filter" class="analysis-filters"><div><label for="trend-from">From (UTC)</label><input required type="date" name="from" id="trend-from" value="${safe(analysis.range.from)}"></div><div><label for="trend-to">To (UTC)</label><input required type="date" name="to" id="trend-to" value="${safe(analysis.range.to)}"></div><button class="primary" type="submit">Update range</button><div class="range-shortcuts" role="group" aria-label="Recent date ranges">${[42,90,180,365].map((n) => `<button class="secondary" type="button" data-analysis-days="${n}">${n} days</button>`).join('')}</div></form><p id="range-error" class="form-error" role="alert"></p>`;
}
// Explicit nulls and breaks in time leave visible gaps; charts never turn missing data into zero.
function dataChart(series, label, unit = '', maxGap = Infinity, xBounds = null, cursorTime = null) {
  const visibleSeries = xBounds ? series.map((s) => ({ ...s, points: s.points.filter((p) => p[0] >= xBounds[0] && p[0] <= xBounds[1]) })) : series;
  const valid = visibleSeries.flatMap((s) => s.points.filter((p) => p[1] != null && Number.isFinite(p[1])));
  if (!valid.length) return `<div class="chart-empty">No ${safe(label.toLowerCase())} recorded in this range.</div>`;
  const xs = valid.map((p) => p[0]), ys = valid.map((p) => p[1]);
  const xmin = xBounds?.[0] ?? xs.reduce((a,b)=>Math.min(a,b),Infinity), xmax = xBounds?.[1] ?? xs.reduce((a,b)=>Math.max(a,b),-Infinity);
  const observedMin = ys.reduce((a,b)=>Math.min(a,b),Infinity), observedMax = ys.reduce((a,b)=>Math.max(a,b),-Infinity);
  const zoomTrace = Boolean(xBounds && label !== 'Power' && label !== 'Distance');
  const padding = Math.max(2,(observedMax-observedMin)*.12);
  const ymin = zoomTrace ? label === 'Elevation' ? Math.floor(observedMin-padding) : Math.max(0,Math.floor(observedMin-padding)) : Math.min(0,observedMin), ymax = zoomTrace ? Math.ceil(observedMax+padding) : Math.max(1,observedMax);
  const available = cursorTime == null ? ($('#drawer').hidden ? $('#analysis-content')?.clientWidth : $('#drawer-body')?.clientWidth) : $('#activity-trace')?.clientWidth;
  const width = Math.max(280,Math.min(cursorTime == null ? 1100 : 2200,available || 800) - 18);
  const right = width - 18;
  const x = (n) => 58 + (n - xmin) / (xmax - xmin || 1) * (right - 58), y = (n) => 202 - (n - ymin) / (ymax - ymin || 1) * 180;
  const paths = visibleSeries.map((s) => { let open = false, previous = null; const d = s.points.map(([t,v]) => { if (v == null || !Number.isFinite(v)) { open = false; previous = t; return ''; } const cmd = !open || (previous != null && t - previous > maxGap) ? 'M' : 'L'; open = true; previous = t; return `${cmd}${x(t).toFixed(2)},${y(v).toFixed(2)}`; }).join(' '); const marked = s.points.filter((p) => p[1] != null); return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>${marked.length < 3 || (Number.isFinite(maxGap) && marked.length < 120) ? marked.map(([t,v]) => `<circle cx="${x(t)}" cy="${y(v)}" r="3" fill="${s.color}"/>`).join('') : ''}`; }).join('');
  return `<div class="chart-frame"><svg class="data-chart" viewBox="0 0 ${width} 234" role="img" aria-label="${safe(label)} in ${safe(unit)}. ${xBounds ? 'Horizontal axis is elapsed time. ' : ''}Use the accompanying controls and data tables to inspect values."><title>${safe(label)} (${safe(unit)})</title>${[0,.5,1].map((n) => `<line x1="58" x2="${right}" y1="${22 + n * 180}" y2="${22 + n * 180}" stroke="#d9ded9"/><text x="50" y="${27 + n * 180}" text-anchor="end">${numberLabel(ymax - n * (ymax-ymin), '', 1)}</text>`).join('')}${paths}${cursorTime == null ? '' : `<line class="trace-cursor" x1="${x(cursorTime)}" x2="${x(cursorTime)}" y1="22" y2="202" stroke="#253d31" stroke-width="1.5"/>`}<text x="58" y="226">${safe(xBounds ? elapsedLabel(xmin) : utcLabel(xmin))}</text><text x="${right}" y="226" text-anchor="end">${safe(xBounds ? elapsedLabel(xmax) : utcLabel(xmax))}</text></svg></div><div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${safe(s.name)}</span>`).join('')}</div>`;
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
        ${powerRecordsMarkup(t.activities)}${powerHrTrendMarkup(t.activities)}<h4>Fitness, fatigue and form</h4><p class="helper">Stored training-load calculations using available TSS. Gaps are missing records; Garmin review imports are not added to these totals.</p>${dataChart([['ctl','Fitness (CTL)','#2c6588'],['atl','Fatigue (ATL)','#a05a20'],['tsb','Form (TSB)','#477343']].map(([key,name,color]) => ({name,color,points:t.load.map((r) => [Date.parse(r.metric_date),r[key]])})), 'Training load', 'load', 86400000 * 1.5)}
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
  const values = [...bests.values()].sort((a,b)=>a.seconds-b.seconds), weight = Number(state.athlete?.profile?.weight_kg);
  const chart = values.length > 1 ? powerDurationChart(values) : '';
  return `<h4>Power-duration records in this period</h4><p class="helper">Best saved average power by duration from ${eligible.length} power-meter activities. Estimated power is excluded. These are records within the selected dates.</p>${chart}${tableMarkup(['Duration','Best power','W/kg at current weight','Recorded on','Activity'],values.map((r)=>[elapsedLabel(r.seconds),numberLabel(r.watts,' W'),weight > 0 ? numberLabel(r.watts/weight,' W/kg',2) : '—',safe(utcLabel(r.activity.start_date)),`<button type="button" class="record-link" data-activity="${safe(r.activity.id)}">${safe(r.activity.name || 'Open activity')} →</button>`]),'No power-meter curves saved in this period.')}${weight > 0 ? '<p class="helper">W/kg uses the athlete’s current saved weight; historical weight may differ.</p>' : ''}`;
}
function powerDurationChart(values) {
  const left = 62, right = 900, top = 18, bottom = 220, minS = values[0].seconds, maxS = values.at(-1).seconds, maxW = Math.ceil(Math.max(...values.map((v)=>v.watts))/100)*100;
  const x = (s) => left + (Math.log(s)-Math.log(minS))/(Math.log(maxS)-Math.log(minS) || 1)*(right-left), y = (w) => bottom - w/maxW*(bottom-top);
  return `<div class="chart-frame power-duration-chart"><svg viewBox="0 0 930 255" role="img" aria-label="Best average power by effort duration on a logarithmic time axis"><title>Power-duration profile</title>${[0,.25,.5,.75,1].map((n)=>`<line x1="${left}" x2="${right}" y1="${top+n*(bottom-top)}" y2="${top+n*(bottom-top)}" stroke="#e0e6e0"/><text x="${left-9}" y="${top+n*(bottom-top)+4}" text-anchor="end">${Math.round(maxW*(1-n))}</text>`).join('')}<polyline points="${values.map((v)=>`${x(v.seconds).toFixed(1)},${y(v.watts).toFixed(1)}`).join(' ')}" fill="none" stroke="#2c6588" stroke-width="3"/>${values.map((v)=>`<circle cx="${x(v.seconds).toFixed(1)}" cy="${y(v.watts).toFixed(1)}" r="4" fill="#2c6588"/><text x="${x(v.seconds).toFixed(1)}" y="${bottom+18}" text-anchor="middle">${v.seconds>=3600 ? Math.round(v.seconds/3600)+'h' : v.seconds>=60 ? Math.round(v.seconds/60)+'m' : v.seconds+'s'}</text>`).join('')}<text x="${(left+right)/2}" y="252" text-anchor="middle">Duration (log scale)</text><text transform="translate(16 120) rotate(-90)" text-anchor="middle">Watts</text></svg></div>`;
}
function powerHrTrendMarkup(activities) {
  const rows = activities.filter((a)=>a.sport_type === 'cycling' && a.device_watts === true && Number(a.avg_power)>0 && Number(a.avg_hr)>0 && Number(a.duration_s)>=1800).map((a)=>({...a,ratio:Number(a.avg_power)/Number(a.avg_hr)}));
  return `<h4>Power-to-heart-rate history</h4><p class="helper">Average watts divided by average bpm for ${rows.length} recorded rides of at least 30 minutes with power-meter data. This is a descriptive ratio, not a fitness score; route, stops, temperature and session intensity may differ.</p>${rows.length ? dataChart([{name:'Average W / average bpm',color:'#477343',points:rows.map((a)=>[Date.parse(a.start_date),a.ratio])}],'Power-to-heart-rate ratio','W/bpm',Infinity) : '<p class="chart-empty">No rides in this range have both power-meter and heart-rate summaries.</p>'}${tableMarkup(['Date','Activity','Duration','Avg power','Avg HR','W / bpm'],rows.slice().reverse().map((a)=>[safe(utcLabel(a.start_date)),`<button type="button" class="record-link" data-activity="${safe(a.id)}">${safe(a.name || 'Open activity')} →</button>`,elapsedLabel(a.duration_s),numberLabel(a.avg_power,' W'),numberLabel(a.avg_hr,' bpm'),numberLabel(a.ratio,'',2)]),'No paired power and HR summaries.')}`;
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
  state.editorDirty = false; analysis.detail = null; analysis.traceRange = null; analysis.traceDrag = null; analysis.lapSelected = []; analysis.aiReport = null;
  openEditor('activity', 'ACTIVITY ANALYSIS', 'Loading activity…', '<div class="chart-empty" role="status">Loading summary, traces and laps…</div>');
  $('#drawer').classList.add('analysis-page'); $('#close-drawer').textContent = 'Back to athlete'; $('#close-drawer').focus();
  history.replaceState(null, '', '#activity/' + athlete + '/' + id);
  try { const detail = await portal('activity_detail', { athlete_id: athlete, activity_id: id }); if (request !== analysis.detailRequest || athlete !== state.athleteId || $('#drawer').hidden) return; analysis.detail = detail; analysis.traceVisible = ['watts','heartrate','cadence'].filter((k) => detail.channels[k]?.some((p) => p[1] != null)); if (!analysis.traceVisible.length) analysis.traceVisible = Object.keys(detail.channels).filter((k) => detail.channels[k]?.some((p) => p[1] != null)).slice(0,2); analysis.trace = analysis.traceVisible[0] || 'watts'; renderActivity(); }
  catch (error) { if (request === analysis.detailRequest && athlete === state.athleteId && !$('#drawer').hidden) { $('#drawer-title').textContent = 'Activity unavailable'; $('#drawer-body').innerHTML = `<p role="alert">${safe(error.message)}</p><button type="button" class="secondary" data-activity="${safe(id)}">Try again</button>`; } }
}
const TRACE_LABELS = {watts:['Power','W'],heartrate:['Heart rate','bpm'],cadence:['Cadence','rpm'],velocity_ms:['Speed','km/h'],altitude_m:['Elevation','m'],distance_m:['Distance','km'],temperature_c:['Temperature','°C'],grade_pct:['Gradient','%']};
const displayTraceValue = (key, value) => value == null ? null : key === 'velocity_ms' ? value * 3.6 : key === 'distance_m' ? value / 1000 : value;
function activityLoadBasis(activity) {
  const zones = state.athlete?.zones || {};
  if (activity.raw_tss != null) return 'Stored TSS for this activity.';
  if (activity.sport_type === 'cycling' && activity.device_watts !== false && Number(activity.strava_weighted_avg_watts) > 0 && Number(zones.ftp_watts) > 0)
    return 'Modeled load uses Strava weighted power and the current saved FTP. Historic threshold changes are not available here.';
  if (Number(activity.avg_hr) > 0 && Number(zones.threshold_hr) > 0) return 'Modeled load uses summary heart rate and the current saved threshold HR.';
  return 'Modeled load falls back to duration only. No recorded TSS is available.';
}
function plannedComparison(d) {
  const p = d.planned, a = d.activity, assessment = d.assessment;
  const candidates = Array.isArray(d.candidate_plans) ? d.candidate_plans : [];
  const measuredTss = a.raw_tss == null ? 'Not recorded' : numberLabel(a.raw_tss,'',1);
  const rows = p ? [['Duration',p.target_duration_min == null ? '—' : numberLabel(p.target_duration_min,' min'),elapsedLabel(a.duration_s)],['TSS',numberLabel(p.target_tss,'',1),measuredTss]] : [];
  const intervals = Array.isArray(assessment?.interval_results) ? assessment.interval_results : [];
  const stepRows = intervals.map((r, i) => [safe('Work interval ' + (i + 1)),numberLabel(r.duration_s,' s'),r.planned_low == null ? '—' : `${numberLabel(r.planned_low)}–${numberLabel(r.planned_high)}`,numberLabel(r.actual_avg),numberLabel(r.actual_hr,' bpm'),safe(title(r.position || 'Unavailable'))]);
  const assessmentMarkup = assessment ? `<div class="execution-review"><h4>Session assessment</h4><p><strong>${safe(assessment.headline || title(assessment.verdict))}</strong>${assessment.assessed_at ? ` <small>· ${safe(utcLabel(assessment.assessed_at))}</small>` : ''}</p>${assessment.detail ? `<p class="helper">${safe(assessment.detail)}</p>` : ''}<dl class="activity-values"><div><dt>Work intervals in target</dt><dd>${assessment.work_steps ? `${numberLabel(assessment.steps_in_band)} / ${numberLabel(assessment.work_steps)}` : '—'}</dd></div><div><dt>Power / HR decoupling</dt><dd>${numberLabel(assessment.decoupling_pct,'%',1)}</dd></div><div><dt>Efficiency factor</dt><dd>${numberLabel(assessment.efficiency_factor,'',2)}</dd></div><div><dt>EF vs baseline</dt><dd>${numberLabel(assessment.ef_vs_baseline_pct,'%',1)}</dd></div></dl>${stepRows.length ? `<h4>Work interval comparison</h4>${tableMarkup(['Interval','Planned time','Target band','Recorded average','Avg HR','Result'],stepRows)}` : '<p class="helper">No graded work intervals. The session may be unstructured or missing the trace needed for comparison.</p>'}<p class="helper">Automated assessment from saved traces and the linked prescription. Inspect the intervals and context before changing training.</p></div>` : '<p class="helper">No session assessment is saved for this activity.</p>';
  const linkChoices = candidates.length ? `<div class="activity-link-choices"><strong>Planned on this date</strong>${candidates.map((w) => `<div><span>${safe(w.headline || title(w.workout_type))} · ${safe(minutesLabel(w.target_duration_min))}</span><button type="button" class="secondary" data-link-activity="${safe(w.id)}">Link to this activity</button></div>`).join('')}<p class="helper">Choose only the session this activity actually fulfilled. Linking refreshes the execution assessment; it does not mark the workout complete.</p><p id="activity-link-status" role="status"></p></div>` : '';
  return `${p ? `<p class="helper">Linked planned workout: ${safe(p.headline || title(p.workout_type) || 'Workout')}.</p>${tableMarkup(['Measure','Planned','Recorded'],rows)}${p.session_rpe == null ? '' : `<p>Session RPE: <strong>${numberLabel(p.session_rpe,' / 10',1)}</strong></p>`}${p.description ? `<p class="preserve-lines">${safe(p.description)}</p>` : ''}` : '<p class="helper">No planned workout is linked to this activity. Same-date sessions are not assumed to match.</p>'}${linkChoices}${assessmentMarkup}<p class="assessment-refresh"><button type="button" class="secondary" data-refresh-assessment>Refresh assessment</button><span id="assessment-refresh-status" role="status"></span></p>`;
}
function comparableMarkup(d) {
  const a = d.activity, rows = d.comparable_activities || [], c = d.comparison_criteria;
  const criteria = c ? `Same saved sport label · ${elapsedLabel(c.min_duration_s)}–${elapsedLabel(c.max_duration_s)} duration (75–125% of this session) · preceding ${c.days} days · latest five matches` : 'This activity has no usable duration or date for comparison.';
  const cells = (r, current = false) => [current ? `<strong>${safe(utcLabel(r.start_date))} · This activity</strong>` : `<button type="button" class="record-link" data-activity="${safe(r.id)}">${safe(utcLabel(r.start_date))} · ${safe(r.name || title(r.sport_type))} →</button>`,elapsedLabel(r.duration_s),numberLabel(r.distance_m == null ? null : r.distance_m/1000,' km',1),numberLabel(r.avg_power,' W') + (r.avg_power != null && r.device_watts !== true ? '<small>Estimated or unconfirmed</small>' : ''),numberLabel(r.avg_hr,' bpm'),numberLabel(r.raw_tss,'',1)];
  return `<section id="activity-comparison"><h3>Compare with previous activities</h3><p class="helper">${safe(criteria)}. Sessions are matched by sport and duration only; intensity, terrain and intent may differ. Missing values are not included in any estimate.</p>${tableMarkup(['Session','Duration','Distance','Avg power','Avg HR','TSS'],[cells(a,true),...rows.map((r) => cells(r))], 'No earlier activity meets these criteria.')}${!rows.length ? '<p class="helper">No earlier matching sessions are saved for this athlete.</p>' : ''}</section>`;
}
function powerHrMarkup(d) {
  const paired = (d.cursor_samples || []).filter((s) => s.watts != null && s.watts >= 0 && s.heartrate > 0);
  if (paired.length < 10) return `<p class="helper">A power–heart-rate plot needs both recorded power and heart-rate samples. ${d.activity.avg_hr != null && !d.channels.heartrate ? 'Strava supplied an average HR but no HR trace; try fetching missing detail above.' : 'One or both channels are unavailable for this activity.'}</p>`;
  const xMax = Math.max(100, ...paired.map((s) => s.watts)), yMin = Math.max(40, Math.floor(Math.min(...paired.map((s) => s.heartrate)) / 10) * 10 - 10), yMax = Math.ceil(Math.max(...paired.map((s) => s.heartrate)) / 10) * 10 + 10;
  const width = 760, height = 300, left = 52, right = 744, top = 18, bottom = 258;
  const x = (w) => left + w / xMax * (right - left), y = (hr) => bottom - (hr - yMin) / (yMax - yMin) * (bottom - top);
  const midpoint = (d.stream_duration_s || paired.at(-1).time_s) / 2;
  const dots = paired.map((s) => `<circle cx="${x(s.watts).toFixed(1)}" cy="${y(s.heartrate).toFixed(1)}" r="2.8" fill="${s.time_s < midpoint ? '#2c6588' : '#b16d32'}" fill-opacity=".52"/>`).join('');
  const halfRows = (d.half_trace_stats || []).map((half, i) => { const w = half.metrics.watts, hr = half.metrics.heartrate; return [i ? 'Second half' : 'First half', numberLabel(w?.average,' W',1), numberLabel(hr?.average,' bpm',1), numberLabel(w?.coverage_s,' s',0) + ' / ' + numberLabel(half.duration_s,' s',0), numberLabel(hr?.coverage_s,' s',0) + ' / ' + numberLabel(half.duration_s,' s',0)]; });
  return `<p class="helper">${paired.length} paired inspection samples, colored by elapsed half. This shows the recorded relationship; changing terrain, intensity and heart-rate lag can change the pattern. ${d.activity.device_watts === true ? 'Power is from a meter.' : 'Power may be estimated.'}</p><div class="power-hr-chart chart-frame"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Scatter plot of recorded power in watts against heart rate in beats per minute"><title>Power versus heart rate</title>${[0,.25,.5,.75,1].map((n)=>`<line x1="${left}" x2="${right}" y1="${top+n*(bottom-top)}" y2="${top+n*(bottom-top)}" stroke="#e1e7e1"/><text x="${left-8}" y="${top+n*(bottom-top)+4}" text-anchor="end">${Math.round(yMax-n*(yMax-yMin))}</text><line x1="${left+n*(right-left)}" x2="${left+n*(right-left)}" y1="${top}" y2="${bottom}" stroke="#e1e7e1"/><text x="${left+n*(right-left)}" y="${bottom+18}" text-anchor="middle">${Math.round(n*xMax)}</text>`).join('')}${dots}<text x="${(left+right)/2}" y="${height-3}" text-anchor="middle">Power (W)</text><text transform="translate(14 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle">Heart rate (bpm)</text></svg></div><div class="chart-legend"><span><i style="background:#2c6588"></i>First half</span><span><i style="background:#b16d32"></i>Second half</span></div>${halfRows.length ? `<h4>Measured halves</h4><p class="helper">Time-weighted averages from the full trace. Halves include warm-up, stops and cool-down; compare like efforts before interpreting a difference.</p>${tableMarkup(['Elapsed range','Avg power','Avg HR','Power coverage','HR coverage'],halfRows)}` : ''}`;
}
function lapMarkup(d) {
  if (!d.laps.length) return '<p class="helper">No lap markers are saved. Use the time-range controls above to inspect an interval.</p>';
  const maxPower = Math.max(1,...d.laps.map((l)=>Number(l.avg_watts)||0));
  const label = (l, i) => l.name && !/^Lap \d+$/i.test(l.name) ? l.name : `Lap ${i + 1}`;
  const compare = d.laps.map((l, i) => { const from = Math.max(0,Number(l.start_s)||0), to = Math.min(d.stream_duration_s || 0,from + Number(l.elapsed_s || 0)), canFocus = d.stream_samples && to > from;
    return `<div class="lap-select-row"><label><input type="checkbox" data-lap-select="${i}" ${analysis.lapSelected.includes(i) ? 'checked' : ''} aria-label="Compare ${safe(label(l,i))}"></label><button type="button" class="lap-compare-row" ${canFocus ? `data-lap-from="${from}" data-lap-to="${to}"` : 'disabled'}><span><strong>${safe(label(l, i))}</strong><small>${safe(elapsedLabel(l.elapsed_s))} · ${safe(numberLabel(l.distance_m == null ? null : l.distance_m/1000,' km',2))}</small></span><span class="lap-power-bar" aria-hidden="true"><i style="width:${Math.max(2,(Number(l.avg_watts)||0)/maxPower*100)}%"></i></span><span class="lap-compare-values">${safe(numberLabel(l.avg_watts,' W'))}<small>${safe(numberLabel(l.avg_hr,' bpm'))}</small></span></button></div>`; }).join('');
  const rows = d.laps.map((l, i) => [safe(label(l, i)),elapsedLabel(l.start_s),elapsedLabel(l.elapsed_s),elapsedLabel(l.moving_s),numberLabel(l.distance_m == null ? null : l.distance_m/1000,' km',2),numberLabel(l.avg_watts,' W'),numberLabel(l.max_watts,' W'),numberLabel(l.avg_hr,' bpm'),numberLabel(l.max_hr,' bpm'),numberLabel(l.avg_cadence,' rpm'),numberLabel(l.avg_speed_ms == null ? null : l.avg_speed_ms*3.6,' km/h',1),numberLabel(l.elevation_gain_m,' m')]);
  const exceedsTrace = d.laps.some((l) => Number(l.start_s || 0) + Number(l.elapsed_s || 0) > Number(d.stream_duration_s || 0) + 5);
  const selected = analysis.lapSelected.map((i) => ({lap:d.laps[i],i})).filter((x) => x.lap);
  const selectedTable = selected.length >= 2 ? `<div class="selected-lap-comparison"><h4>Selected laps</h4>${tableMarkup(['Lap','Elapsed','Distance','Avg power','Max power','Avg HR','Max HR','Cadence','Avg speed'],selected.map(({lap:l,i}) => [safe(label(l,i)),elapsedLabel(l.elapsed_s),numberLabel(l.distance_m == null ? null : l.distance_m/1000,' km',2),numberLabel(l.avg_watts,' W'),numberLabel(l.max_watts,' W'),numberLabel(l.avg_hr,' bpm'),numberLabel(l.max_hr,' bpm'),numberLabel(l.avg_cadence,' rpm'),numberLabel(l.avg_speed_ms == null ? null : l.avg_speed_ms*3.6,' km/h',1)]))}</div>` : '<p class="helper">Check two or more laps to compare their saved measurements side by side.</p>';
  return `<p class="helper">Select a lap to focus the traces and calculate full-sample statistics. Check laps to compare their saved measurements. Bars show average power; missing power has an empty bar.${exceedsTrace ? ' A saved lap extends beyond the recorded trace; its focus range is clipped to available samples.' : ''}</p><div class="lap-comparison" role="group" aria-label="Lap comparison">${compare}</div>${selectedTable}<details class="data-disclosure"><summary>All lap measurements</summary>${tableMarkup(['Lap','Start','Elapsed','Moving','Distance','Avg power','Max power','Avg HR','Max HR','Cadence','Avg speed','Elevation'],rows)}</details>`;
}
function aiReportMarkup() {
  const r = analysis.aiReport;
  if (!r) return '<p class="helper">No analysis generated for this activity.</p>';
  const list = (heading, items) => items?.length ? `<h4>${heading}</h4><ul>${items.map((v)=>`<li>${safe(v)}</li>`).join('')}</ul>` : '';
  return `<p>${safe(r.summary)}</p>${list('Observed',r.observations)}${list('Uncertain or missing',r.uncertainties)}${list('Questions for the coach',r.coach_questions)}<p class="helper">AI interpretation. Check each statement against the recorded charts and lap data.</p>`;
}
function renderActivity() {
  analysis.segmentRequest = (analysis.segmentRequest || 0) + 1;
  const d = analysis.detail, a = d.activity;
  $('#drawer-title').textContent = a.name || title(a.sport_type) + ' activity';
  const cells = [['Elapsed',elapsedLabel(a.duration_s)],['Moving',elapsedLabel(a.moving_s)],['Distance',numberLabel(a.distance_m == null ? null : a.distance_m/1000,' km',2)],['Elevation gain',numberLabel(a.elevation_gain,' m')],['Average power',numberLabel(a.avg_power,' W')],['Weighted power (Strava)',numberLabel(a.strava_weighted_avg_watts,' W')],['Average HR',numberLabel(a.avg_hr,' bpm')],['TSS',numberLabel(a.raw_tss,'',1)]];
  const extraCells = [['Maximum power (Strava)',numberLabel(a.strava_max_watts,' W')],['Maximum HR',numberLabel(a.max_hr,' bpm')],['Average cadence',numberLabel(a.avg_cadence,' rpm')],['Average speed',numberLabel(a.avg_speed_ms == null ? null : a.avg_speed_ms*3.6,' km/h',1)],['Maximum speed',numberLabel(a.max_speed_ms == null ? null : a.max_speed_ms*3.6,' km/h',1)],['Calories (Strava)',numberLabel(a.calories,' kcal')],['Strava relative effort',numberLabel(a.strava_suffer_score)]];
  const curve = Object.entries(a.power_curve || {}).filter(([s,w]) => Number(s)>0 && typeof w === 'number').sort((x,y) => Number(x[0])-Number(y[0]));
  $('#drawer-body').innerHTML = `<nav class="activity-jump" aria-label="Activity sections">${analysis.activityBack ? `<button type="button" data-back-activity="${safe(analysis.activityBack.id)}">← ${safe(analysis.activityBack.name)}</button>` : ''}<button type="button" data-activity-jump="activity-summary">Summary</button><button type="button" data-activity-jump="activity-execution">Execution</button><button type="button" data-activity-jump="activity-traces">Traces & segments</button><button type="button" data-activity-jump="activity-power-hr">Power / HR</button><button type="button" data-activity-jump="activity-laps">Laps</button><button type="button" data-activity-jump="activity-comparison">Past activities</button><button type="button" data-activity-jump="activity-ai">Coach analyzer</button></nav><section id="activity-summary"><p class="activity-meta">${safe(utcLabel(a.start_date))} · ${safe(new Date(a.start_date).toLocaleTimeString(undefined,{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}))} UTC · ${safe(title(a.strava_sport_type || a.sport_type))} · ${safe(title(a.source))}${a.strava_device_name ? ' · ' + safe(a.strava_device_name) : ''}</p><dl class="activity-values">${cells.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="helper">${a.avg_power == null ? 'No average power recorded.' : a.device_watts === true ? 'Power recorded by a power meter.' : 'Power is estimated or its measurement source is unconfirmed.'} ${safe(activityLoadBasis(a))}</p><section id="activity-execution"><h3>Planned versus recorded</h3>${plannedComparison(d)}</section><details class="data-disclosure"><summary>More activity details and athlete feedback</summary><dl class="activity-values">${extraCells.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${a.strava_description ? `<h3>Activity notes</h3><p class="preserve-lines">${safe(a.strava_description)}</p>` : ''}<div class="athlete-feedback"><h3>Athlete feedback</h3><p>Feeling (1–5): ${safe(a.feeling == null ? 'Not recorded' : title(a.feeling))}</p><p class="preserve-lines">${safe(a.athlete_comment || 'No athlete comment recorded.')}</p></div></details></section>
    <section id="activity-traces"><div class="section-head"><h3>Recorded traces</h3>${a.strava_activity_id && (!d.stream_complete || !d.laps.length) ? '<button type="button" class="secondary" data-fetch-traces>Fetch missing Strava detail</button>' : ''}</div><p id="trace-fetch-status" role="status"></p><p class="helper">Select channels, then drag across any chart to choose two elapsed-time points. The selected interval is focused across all tracks and measured from the full stored trace.</p><div class="analysis-nav" role="group" aria-label="Visible trace tracks">${Object.keys(d.channels).filter((k)=>TRACE_LABELS[k]).map((k) => `<button type="button" class="secondary" data-trace="${k}" aria-pressed="${analysis.traceVisible.includes(k)}">${TRACE_LABELS[k][0]}</button>`).join('')}</div><div class="trace-tools"><label for="trace-smoothing">Graph smoothing</label><select id="trace-smoothing"><option value="0" ${analysis.traceSmoothing === 0 ? 'selected' : ''}>Raw</option><option value="5" ${analysis.traceSmoothing === 5 ? 'selected' : ''}>5 seconds</option><option value="15" ${analysis.traceSmoothing === 15 ? 'selected' : ''}>15 seconds</option><option value="30" ${analysis.traceSmoothing === 30 ? 'selected' : ''}>30 seconds</option><option value="60" ${analysis.traceSmoothing === 60 ? 'selected' : ''}>60 seconds</option></select><span class="helper">Visual display only; cursor readings and segment metrics stay raw.</span></div><div id="activity-trace"></div>
    ${d.stream_samples ? `<p class="helper">Raw charts preserve sample peaks from ${numberLabel(d.stream_samples)} stored points. Smoothing averages displayed points without crossing gaps over 10 seconds. Segment and half-ride statistics use the full stored trace.</p><div class="trace-presets" role="group" aria-label="Quick time ranges"><button type="button" class="secondary" data-segment-preset="all">Full activity</button><button type="button" class="secondary" data-segment-preset="first">First half</button><button type="button" class="secondary" data-segment-preset="second">Second half</button></div><form id="segment-form" class="analysis-filters"><div><label for="segment-from">Start (elapsed seconds)</label><input id="segment-from" type="number" min="0" step="any" required value="0"></div><div><label for="segment-to">End (elapsed seconds)</label><input id="segment-to" type="number" min="0" max="${d.stream_duration_s}" step="any" required value="${d.stream_duration_s}"></div><button type="submit" class="primary">Focus and analyze</button></form><div id="segment-result" aria-live="polite"></div>` : '<p class="helper">No stored traces for this activity. Summary values cannot be expanded into detailed samples.</p>'}
    </section><section id="activity-power-hr"><h3>Power and heart rate</h3>${powerHrMarkup(d)}</section><section id="activity-laps"><h3>Laps & intervals</h3>${lapMarkup(d)}</section>${comparableMarkup(d)}<section id="activity-ai"><div class="section-head"><h3>Coach analyzer</h3><button type="button" class="secondary" data-ai-activity>Generate analysis</button></div><p class="helper">Optional AI interpretation of saved activity, trace and lap summaries. The athlete must allow AI data sharing. Review the evidence before acting.</p><div id="activity-ai-result" aria-live="polite">${aiReportMarkup()}</div></section>
    <h3>Power-duration bests for this activity</h3><p class="helper">Saved best average power for each duration in this activity${a.device_watts !== true ? '; power may be estimated' : ''}.</p>${tableMarkup(['Duration','Best average power'],curve.map(([s,w]) => [elapsedLabel(Number(s)),numberLabel(w,' W')]),'No power-duration record saved.')}${a.ai_insight ? `<details class="data-disclosure"><summary>Saved AI interpretation</summary><p class="helper">${safe(a.ai_insight_generated_at ? utcLabel(a.ai_insight_generated_at) : '')} · Interpretation, not a recorded measurement.</p><p class="preserve-lines">${safe(typeof a.ai_insight === 'string' ? a.ai_insight : JSON.stringify(a.ai_insight))}</p></details>` : ''}`;
  paintTrace();
}
// Centered, time-based average of the displayed points. The preview inserts nulls at
// missing values and actual recording gaps; those nulls start a new window.
function smoothTracePoints(points, windowSeconds) {
  if (!windowSeconds) return points;
  const result = points.map(([time,value]) => [time,value]);
  let start = 0;
  while (start < points.length) {
    if (!Number.isFinite(points[start][1])) { start++; continue; }
    let end = start + 1;
    while (end < points.length && Number.isFinite(points[end][1])) end++;
    let left = start, right = start, sum = 0;
    const half = windowSeconds / 2;
    for (let i = start; i < end; i++) {
      while (right < end && points[right][0] <= points[i][0] + half) sum += points[right++][1];
      while (left < right && points[left][0] < points[i][0] - half) sum -= points[left++][1];
      result[i][1] = sum / (right - left);
    }
    start = end;
  }
  return result;
}
function paintTrace() {
  const d = analysis.detail, keys = analysis.traceVisible.filter((key) => d.channels[key]?.length), samples = d.cursor_samples || [];
  const bounds = analysis.traceRange || [0, d.stream_duration_s || Math.max(...keys.map((key) => d.channels[key].at(-1)?.[0] || 0))];
  const colors = {watts:'#2c6588',heartrate:'#ad622a',cadence:'#477343',velocity_ms:'#795c9b',altitude_m:'#777b42',distance_m:'#705d50',temperature_c:'#aa5261',grade_pct:'#955b31'};
  $('#activity-trace').innerHTML = keys.length ? `<div class="trace-range-heading"><strong>${analysis.traceRange ? 'Focused: ' + elapsedLabel(bounds[0]) + '–' + elapsedLabel(bounds[1]) + ' · ' + elapsedLabel(bounds[1]-bounds[0]) : 'Full recorded activity'}</strong>${analysis.traceRange ? '<button type="button" class="secondary" data-reset-trace>Reset chart</button>' : ''}</div><output id="trace-selection-preview" class="trace-selection-preview">Drag across a chart to select a range.</output><div class="trace-stack">${keys.map((key) => { const points = d.channels[key].map(([t,v]) => [t,displayTraceValue(key,v)]); return `<section class="trace-track"><h4>${TRACE_LABELS[key][0]} <small>(${TRACE_LABELS[key][1]})</small></h4>${dataChart([{name:TRACE_LABELS[key][0],color:colors[key],points:key === 'distance_m' ? points : smoothTracePoints(points,analysis.traceSmoothing)}],TRACE_LABELS[key][0],TRACE_LABELS[key][1],Infinity,bounds,samples[0]?.time_s ?? 0)}</section>`; }).join('')}</div>${samples.length ? `<div class="trace-inspector"><label for="trace-position">Inspect the same recorded time across tracks</label><input id="trace-position" type="range" min="0" max="${samples.length-1}" value="0" step="1"><output id="trace-reading" for="trace-position" aria-live="polite"></output><p class="helper">Inspection uses up to 800 aligned stored samples. Segment analysis below uses every stored sample.</p><button type="button" class="secondary" data-export-trace>Export inspected samples (CSV)</button></div>` : ''}` : '<div class="chart-empty">No recorded trace available.</div>';
  if (samples.length) {
    const center = analysis.traceRange ? (bounds[0] + bounds[1]) / 2 : samples[0].time_s;
    let index = 0; for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].time_s-center) < Math.abs(samples[index].time_s-center)) index = i;
    $('#trace-position').value = index; readTrace(index);
  }
}
function readTrace(index) {
  const sample = analysis.detail?.cursor_samples?.[index], output = $('#trace-reading');
  if (!sample || !output) return;
  output.innerHTML = `<strong>${elapsedLabel(sample.time_s)} elapsed</strong>${analysis.traceVisible.map((key) => `<span>${TRACE_LABELS[key][0]} <strong>${numberLabel(displayTraceValue(key,sample[key]),' ' + TRACE_LABELS[key][1],1)}</strong></span>`).join('')}`;
  const time = sample.time_s, bounds = analysis.traceRange || [0,analysis.detail.stream_duration_s || time];
  $('#activity-trace').querySelectorAll('.trace-cursor').forEach((line) => { const svg = line.ownerSVGElement, width = svg.viewBox.baseVal.width, x = 58 + (time-bounds[0]) / (bounds[1]-bounds[0] || 1) * (width - 76); line.style.display = time < bounds[0] || time > bounds[1] ? 'none' : ''; line.setAttribute('x1',x); line.setAttribute('x2',x); });
}
function tracePlotPosition(event, svg) {
  const rect = svg.getBoundingClientRect(), width = svg.viewBox.baseVal.width;
  const x = (event.clientX - rect.left) / rect.width * width;
  const y = (event.clientY - rect.top) / rect.height * svg.viewBox.baseVal.height;
  const fraction = Math.max(0,Math.min(1,(x-58)/(width-76)));
  const bounds = analysis.traceRange || [0,analysis.detail.stream_duration_s];
  return { x, y, time: bounds[0] + fraction * (bounds[1]-bounds[0]), bounds };
}
function paintTraceBrush() {
  const drag = analysis.traceDrag, output = $('#trace-selection-preview');
  $('#activity-trace')?.querySelectorAll('.trace-brush-overlay').forEach((node) => node.remove());
  if (!drag) { if (output) output.textContent = 'Drag across a chart to select a range.'; return; }
  const from = Math.min(drag.start,drag.current), to = Math.max(drag.start,drag.current);
  if (output) output.textContent = `Selecting ${elapsedLabel(Math.floor(from))}–${elapsedLabel(Math.ceil(to))} (${elapsedLabel(Math.ceil(to)-Math.floor(from))})`;
  const ns = 'http://www.w3.org/2000/svg';
  $('#activity-trace').querySelectorAll('svg').forEach((svg) => {
    const width = svg.viewBox.baseVal.width, bounds = drag.bounds;
    const x = (time) => 58 + (time-bounds[0])/(bounds[1]-bounds[0] || 1)*(width-76);
    const group = document.createElementNS(ns,'g'); group.setAttribute('class','trace-brush-overlay'); group.setAttribute('pointer-events','none');
    const rect = document.createElementNS(ns,'rect'); rect.setAttribute('x',x(from)); rect.setAttribute('y','22'); rect.setAttribute('width',Math.max(1,x(to)-x(from))); rect.setAttribute('height','180'); group.append(rect);
    [from,to].forEach((time) => { const line = document.createElementNS(ns,'line'); line.setAttribute('x1',x(time)); line.setAttribute('x2',x(time)); line.setAttribute('y1','22'); line.setAttribute('y2','202'); group.append(line); });
    svg.append(group);
  });
}
async function analyzeSegment() {
  const from = Number($('#segment-from').value), to = Number($('#segment-to').value), d = analysis.detail, request = analysis.detailRequest;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > d.stream_duration_s) { $('#segment-result').innerHTML = '<p class="form-error" role="alert">Choose an end after the start, within the recorded trace.</p>'; return; }
  const segmentRequest = (analysis.segmentRequest || 0) + 1; analysis.segmentRequest = segmentRequest;
  analysis.traceRange = from === 0 && to === d.stream_duration_s ? null : [from,to]; paintTrace();
  $('#segment-result').textContent = 'Calculating from stored samples…';
  try { const result = await portal('activity_segment',{athlete_id:state.athleteId,activity_id:d.activity.id,from_s:from,to_s:to}); if (request !== analysis.detailRequest || segmentRequest !== analysis.segmentRequest || !$('#segment-result')) return;
    $('#segment-result').innerHTML = `<h4>${elapsedLabel(from)} – ${elapsedLabel(to)}</h4>${tableMarkup(['Metric','Time-weighted average','Maximum','Recorded coverage'],Object.entries(result.segment.metrics).map(([key,m]) => [TRACE_LABELS[key][0],numberLabel(displayTraceValue(key,m.average),' ' + TRACE_LABELS[key][1],1),numberLabel(displayTraceValue(key,m.maximum),' ' + TRACE_LABELS[key][1],1),numberLabel(m.coverage_s,' s',1) + ' / ' + numberLabel(to-from,' s',1)]))}`;
  } catch (error) { if (request === analysis.detailRequest && segmentRequest === analysis.segmentRequest && $('#segment-result')) $('#segment-result').innerHTML = `<p class="form-error" role="alert">${safe(error.message)}</p>`; }
}
function exportAnalysis(kind) {
  const t = analysis.trends; let rows = [];
  if (kind === 'history') rows = analysis.history?.activities || [];
  if (kind === 'trends') rows = [...(t?.load || []).map((r) => ({record_type:'daily_load',...r})),...(t?.activities || []).map((r) => ({record_type:'activity',...r}))];
  if (kind === 'imports') rows = t?.imported || [];
  if (kind === 'recovery') rows = [...(t?.readiness || []).map((r) => ({source:'Trainable readiness',...r})),...(t?.wellness || []).map((r) => ({...r,source:'Intervals.icu wellness'}))];
  if (kind === 'trace') rows = (analysis.detail?.cursor_samples || []).map((r) => ({activity_id:analysis.detail.activity.id,...r}));
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
  if (el.dataset.activity) { analysis.activityBack = el.closest('#activity-comparison') && analysis.detail ? {id:analysis.detail.activity.id,name:analysis.detail.activity.name || 'Previous activity'} : null; el.focus(); openActivity(el.dataset.activity); }
  if (el.dataset.backActivity) { const id = el.dataset.backActivity; analysis.activityBack = null; openActivity(id); }
  if (el.dataset.activityJump) { const section = document.getElementById(el.dataset.activityJump); section?.scrollIntoView({block:'start',behavior:'smooth'}); section?.setAttribute('tabindex','-1'); section?.focus({preventScroll:true}); }
  if (el.dataset.analysisRetry === 'history') loadHistory();
  if (el.dataset.analysisRetry === 'trends') loadTrends();
  if (el.dataset.analysisRetry === 'review' || el.hasAttribute('data-review-refresh')) loadTrends();
  if (el.hasAttribute('data-history-page')) { analysis.filters.page = Math.max(0,analysis.filters.page+Number(el.dataset.historyPage)); loadHistory(); }
  if (el.hasAttribute('data-clear-history')) { analysis.filters = {search:'',sport:'',from:'',to:'',page:0}; loadHistory(); }
  if (el.dataset.analysisDays) { const to = utcDay(new Date()); analysis.range = {to,from:shiftUTC(to,1-Number(el.dataset.analysisDays))}; loadTrends(); }
  if (el.dataset.drillWeek) { analysis.filters = {search:'',sport:'',from:el.dataset.drillWeek < analysis.range.from ? analysis.range.from : el.dataset.drillWeek,to:shiftUTC(el.dataset.drillWeek,6) > analysis.range.to ? analysis.range.to : shiftUTC(el.dataset.drillWeek,6),page:0}; analysis.tab = 'history'; analysis.history = null; renderAthlete(); $('#history-from').focus(); }
  if (el.dataset.recovery) { analysis.recovery = el.dataset.recovery; paintTrends(); $(`[data-recovery="${analysis.recovery}"]`).focus(); }
  if (el.dataset.trace) { const key = el.dataset.trace, visible = analysis.traceVisible; if (visible.includes(key) && visible.length > 1) analysis.traceVisible = visible.filter((k) => k !== key); else if (!visible.includes(key)) analysis.traceVisible = [...visible,key]; document.querySelectorAll('[data-trace]').forEach((b) => b.setAttribute('aria-pressed',analysis.traceVisible.includes(b.dataset.trace))); paintTrace(); }
  if (el.hasAttribute('data-lap-from')) { $('#segment-from').value = el.dataset.lapFrom; $('#segment-to').value = el.dataset.lapTo; analyzeSegment(); $('#activity-traces').scrollIntoView({block:'start'}); $('#segment-from').focus({preventScroll:true}); }
  if (el.hasAttribute('data-link-activity')) linkActivity(el.dataset.linkActivity, el);
  if (el.hasAttribute('data-refresh-assessment')) refreshActivityAssessment(el);
  if (el.dataset.segmentPreset && analysis.detail?.stream_duration_s) { const max = analysis.detail.stream_duration_s, half = max/2; $('#segment-from').value = el.dataset.segmentPreset === 'second' ? half : 0; $('#segment-to').value = el.dataset.segmentPreset === 'first' ? half : max; analyzeSegment(); }
  if (el.hasAttribute('data-reset-trace')) { analysis.traceRange = null; analysis.segmentRequest++; $('#segment-from').value = 0; $('#segment-to').value = analysis.detail.stream_duration_s; $('#segment-result').textContent = ''; paintTrace(); }
  if (el.hasAttribute('data-ai-activity')) analyzeActivityAI(el);
  if (el.dataset.export) exportAnalysis(el.dataset.export);
  if (el.hasAttribute('data-export-trace')) exportAnalysis('trace');
  if (el.hasAttribute('data-backfill-strava')) backfillStravaHistory();
  if (el.hasAttribute('data-fetch-traces')) fetchActivityDetail(el);
});
async function refreshActivityAssessment(button) {
  const activityId = analysis.detail?.activity?.id, athleteId = state.athleteId, status = $('#assessment-refresh-status');
  if (!activityId || !status) return;
  button.disabled = true; status.textContent = 'Calculating from saved traces…';
  try {
    await portal('refresh_activity_assessment',{athlete_id:athleteId,activity_id:activityId});
    if (analysis.detail?.activity?.id !== activityId || state.athleteId !== athleteId) return;
    analysis.detail = await portal('activity_detail',{athlete_id:athleteId,activity_id:activityId});
    renderActivity();
    $('#assessment-refresh-status').textContent = 'Updated from the saved activity and linked plan.';
  } catch (error) { if (status.isConnected) { status.textContent = error.message; button.disabled = false; } }
}
async function linkActivity(workoutId, button) {
  const activityId = analysis.detail?.activity?.id, athleteId = state.athleteId, status = $('#activity-link-status');
  if (!activityId || !status) return;
  button.disabled = true; status.textContent = 'Linking and refreshing the session assessment…';
  try {
    const result = await portal('link_activity',{athlete_id:athleteId,activity_id:activityId,workout_id:workoutId});
    if (analysis.detail?.activity?.id !== activityId || state.athleteId !== athleteId) return;
    analysis.detail = await portal('activity_detail',{athlete_id:athleteId,activity_id:activityId});
    renderActivity();
    state.calendarRecords = {}; portal('read_athlete',{athlete_id:athleteId}).then((updated) => { if (state.athleteId === athleteId) state.athlete = updated; }).catch(() => {});
    if (result.assessment_warning) { const node = $('#activity-execution'); if (node) node.insertAdjacentHTML('afterbegin',`<p class="data-warning">${safe(result.assessment_warning)}</p>`); }
  } catch (error) { if (status.isConnected) { status.textContent = error.message; button.disabled = false; } }
}
document.addEventListener('input', (event) => { if (event.target.id === 'trace-position') readTrace(Number(event.target.value)); if (event.target.closest('#segment-form, #activity-trace')) state.editorDirty = false; if (event.target.closest('#trend-filter')) $('#range-error').textContent = ''; });
document.addEventListener('change', (event) => {
  if (event.target.id === 'trace-smoothing') { analysis.traceSmoothing = Number(event.target.value); paintTrace(); return; }
  const box = event.target.closest('[data-lap-select]');
  if (!box || !analysis.detail) return;
  const index = Number(box.dataset.lapSelect);
  analysis.lapSelected = box.checked ? [...new Set([...analysis.lapSelected,index])].sort((a,b)=>a-b) : analysis.lapSelected.filter((i)=>i!==index);
  $('#activity-laps').innerHTML = `<h3>Laps & intervals</h3>${lapMarkup(analysis.detail)}`;
  $(`[data-lap-select="${index}"]`)?.focus();
});

document.addEventListener('pointerdown',(event)=>{
  const svg = event.target.closest('#activity-trace svg'); if (!svg || !analysis.detail || event.button !== 0) return;
  const position = tracePlotPosition(event,svg);
  if (position.x < 58 || position.x > svg.viewBox.baseVal.width-18 || position.y < 22 || position.y > 202) return;
  analysis.traceDrag = { pointerId:event.pointerId, svg, start:position.time, current:position.time, bounds:position.bounds, startX:position.x };
  svg.setPointerCapture(event.pointerId); event.preventDefault(); paintTraceBrush();
});
document.addEventListener('pointermove',(event)=>{
  const svg = event.target.closest('#activity-trace svg'); if (!svg || !analysis.detail) return;
  const points = analysis.detail.cursor_samples || []; if (!points.length) return;
  const position = tracePlotPosition(event,svg), time = position.time;
  let index=0; for(let i=1;i<points.length;i++) if(Math.abs(points[i].time_s-time)<Math.abs(points[index].time_s-time)) index=i;
  $('#trace-position').value=index; readTrace(index);
  if (analysis.traceDrag?.pointerId === event.pointerId) { analysis.traceDrag.current = time; paintTraceBrush(); }
});
document.addEventListener('pointerup',(event)=>{
  const drag = analysis.traceDrag; if (!drag || drag.pointerId !== event.pointerId) return;
  const position = tracePlotPosition(event,drag.svg), from = Math.floor(Math.min(drag.start,position.time)), to = Math.ceil(Math.max(drag.start,position.time));
  analysis.traceDrag = null; paintTraceBrush();
  if (Math.abs(position.x-drag.startX) < 4 || to <= from) return;
  $('#segment-from').value = Math.max(0,from); $('#segment-to').value = Math.min(analysis.detail.stream_duration_s,to);
  analyzeSegment();
});
document.addEventListener('pointercancel',(event)=>{ if (analysis.traceDrag?.pointerId === event.pointerId) { analysis.traceDrag = null; paintTraceBrush(); } });

async function fetchActivityDetail(button) {
  const request = analysis.detailRequest, activity = analysis.detail.activity.id;
  button.disabled = true; $('#trace-fetch-status').textContent = 'Fetching missing traces and laps from Strava…';
  try {
    const detail = await portal('sync_activity_detail',{athlete_id:state.athleteId,activity_id:activity});
    if (request !== analysis.detailRequest || $('#drawer').hidden) return;
    analysis.detail = detail; analysis.traceVisible = ['watts','heartrate','cadence'].filter((key)=>detail.channels[key]?.length); if (!analysis.traceVisible.length) analysis.traceVisible = Object.keys(detail.channels).filter((key)=>detail.channels[key]?.length).slice(0,2); analysis.trace = analysis.traceVisible[0] || 'watts'; renderActivity();
    $('#trace-fetch-status').textContent = detail.stream_samples ? 'Saved detail refreshed.' : 'Strava did not return a recorded trace for this activity.';
  } catch(error) { if (request === analysis.detailRequest && $('#trace-fetch-status')) { $('#trace-fetch-status').textContent = error.message; button.disabled = false; } }
}
async function analyzeActivityAI(button) {
  const activity = analysis.detail?.activity.id, request = analysis.detailRequest;
  if (!activity) return;
  button.disabled = true;
  $('#activity-ai-result').innerHTML = '<p role="status">Reviewing saved measurements and laps…</p>';
  try {
    const report = await portal('analyze_activity_ai', { athlete_id: state.athleteId, activity_id: activity });
    if (request !== analysis.detailRequest || analysis.detail?.activity.id !== activity || !$('#activity-ai-result')) return;
    analysis.aiReport = report; $('#activity-ai-result').innerHTML = aiReportMarkup();
  } catch (error) {
    if (request !== analysis.detailRequest || !$('#activity-ai-result')) return;
    $('#activity-ai-result').innerHTML = `<p class="form-error" role="alert">${safe(error.message)}</p>`;
  } finally { if (request === analysis.detailRequest && button.isConnected) button.disabled = false; }
}
async function backfillStravaHistory() {
  if (analysis.backfillBusy || !state.athleteId) return;
  const athlete = state.athleteId;
  analysis.backfillBusy = true; analysis.backfillStatus = 'Importing older Strava activities…'; paintHistory();
  try {
    const result = await portal('backfill_strava_history', { athlete_id: athlete });
    if (athlete !== state.athleteId) return;
    analysis.backfillStatus = `${result.synced_count} accessible Strava activities checked and saved.${result.history_limited ? ' Strava returned more than the 2,000-activity request cap; some older sessions may remain.' : ''}`;
    analysis.trends = null; state.calendarRecords = {}; await loadHistory();
  } catch (error) { if (athlete === state.athleteId) analysis.backfillStatus = error.message; }
  finally { analysis.backfillBusy = false; if (athlete === state.athleteId && analysis.tab === 'history' && $('#analysis-content')) paintHistory(); }
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
