/* Coach analysis: stored observations only; imported sources remain separate. */
const analysis = { athlete: null, tab: 'review', history: null, trends: null, historyRequest: 0, trendRequest: 0, detailRequest: 0,
  filters: { search: '', sport: '', from: '', to: '', page: 0 }, range: null, detail: null, activityBack: null, trace: 'watts', traceVisible: [], traceRange: null, traceSmoothing: 15, traceUltraSmooth: false, traceSmoothingBeforeUltra: 15, traceCursor: null, chartSmooth: false, route: null, routeRequest: 0, traceLayout: 'overlay', activityPanel: 'analyze', traceDrag: null, traceSelection: null, lapSelected: [], aiReport: null, detectedIntervals: null, intervalDetectionBusy: false, backfillBusy: false, backfillStatus: '', recovery: 'hrv_ms', loadVisible: { ctl: true, atl: true, tsb: true }, showProjection: true };
const numberLabel = (value, suffix = '', digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) + suffix;
const elapsedLabel = (value) => { if (value == null || !Number.isFinite(Number(value))) return '—'; const seconds = Math.round(Number(value)); return Math.floor(seconds / 3600) + ':' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); };
const utcDay = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const shiftUTC = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10);
const utcLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
function resetAnalysis() {
  analysis.athlete = state.athleteId; analysis.history = null; analysis.trends = null; analysis.detail = null; analysis.activityBack = null;
  analysis.historyRequest++; analysis.trendRequest++; analysis.detailRequest++; analysis.routeRequest++; analysis.route = null; analysis.traceCursor = null;
  analysis.filters = { search: '', sport: '', from: '', to: '', page: 0 };
  analysis.backfillStatus = ''; analysis.backfillBusy = false;
  const to = utcDay(new Date()); analysis.range = { from: shiftUTC(to, -89), to }; analysis.tab = 'review';
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function analysisMarkup() {
  if (analysis.athlete !== state.athleteId) resetAnalysis();
  return `<div class="analysis-nav" role="group" aria-label="Analysis view">${[['review','Dashboard'],['charts','Charts'],['history','Activity history'],['trends','Training trends'],['recovery','Recovery & health'],['imports','Imported activities']].map(([id,label]) => `<button type="button" class="secondary" data-analysis-tab="${id}" aria-pressed="${analysis.tab === id}">${label}</button>`).join('')}</div><div id="analysis-content"></div>`;
}
// Used by the workspace renderer in app.js.
// deno-lint-ignore no-unused-vars
function paintAnalysis() {
  if (!$('#analysis-content')) return;
  if (analysis.tab === 'history') { paintHistory(); if (!analysis.history) loadHistory(); }
  else { paintTrendView(); if (!analysis.trends) loadTrends(); }
}
function paintTrendView() {
  if (analysis.tab === 'charts') paintChartBoard();
  else if (analysis.tab === 'review') paintReview();
  else paintTrends();
}
function analysisError(message, retry) { return `<div class="data-empty" role="alert"><strong>Could not load these records</strong><p>${safe(message)}</p><button type="button" class="secondary" data-analysis-retry="${retry}">Try again</button></div>`; }
function tableMarkup(headers, rows, empty = 'No records in this date range.', emptyAction = '') {
  return `<div class="data-table-wrap" tabindex="0" role="region" aria-label="${safe(headers[0])} data table"><table class="data-table"><thead><tr>${headers.map((h) => `<th scope="col">${safe(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((cells) => '<tr>' + cells.map((v) => `<td>${v}</td>`).join('') + '</tr>').join('') : `<tr><td colspan="${headers.length}" class="data-empty">${safe(empty)}${emptyAction}</td></tr>`}</tbody></table></div>`;
}
function paintHistory() {
  const f = analysis.filters, h = analysis.history;
  const filtered = Boolean(f.search || f.sport || f.from || f.to);
  const emptyAction = h && !h.error ? `<div class="history-empty-action">${filtered ? '<button type="button" class="secondary" data-clear-history>Clear all filters</button>' : '<button type="button" class="secondary" data-backfill-strava>Import Strava history</button>'}</div>` : '';
  const first = h?.activities?.length ? f.page * 50 + 1 : 0, last = h?.activities?.length ? first + h.activities.length - 1 : 0;
  const rows = (h?.activities || []).map((a) => [safe(utcLabel(a.start_date)), `<button class="record-link" type="button" data-activity="${safe(a.id)}">${safe(a.name || title(a.sport_type))}<span>Open analysis →</span></button>`, safe(title(a.strava_sport_type || a.sport_type)), elapsedLabel(a.duration_s), numberLabel(a.distance_m == null ? null : a.distance_m / 1000, ' km', 1), numberLabel(a.avg_power, ' W') + (a.avg_power != null && a.device_watts !== true ? '<small>Estimated</small>' : ''), numberLabel(a.avg_hr, ' bpm'), numberLabel(a.raw_tss), a.feeling == null ? '—' : safe(title(a.feeling)), safe(title(a.source))]);
  $('#analysis-content').innerHTML = `<div class="section-head"><h3>Activity history</h3><div class="history-actions"><button type="button" class="secondary" data-backfill-strava ${analysis.backfillBusy ? 'disabled' : ''}>${analysis.backfillBusy ? 'Importing…' : 'Import older Strava history'}</button><button type="button" class="secondary" data-export="history" ${!h?.activities?.length ? 'disabled' : ''}>Export this page</button></div></div><p class="helper">The historical import checks up to three years and 2,000 accessible Strava activities. It can run once per day.</p><p role="status" class="backfill-status">${safe(analysis.backfillStatus)}</p>
    <form id="history-filter" class="analysis-filters" novalidate><div><label for="history-from">From (UTC, optional)</label><input id="history-from" aria-describedby="history-range-error" type="date" name="from" value="${safe(f.from)}"></div><div><label for="history-to">To (UTC, optional)</label><input id="history-to" aria-describedby="history-range-error" type="date" name="to" value="${safe(f.to)}"></div><div class="search-field"><label for="history-search">Search activities</label><input type="search" id="history-search" name="search" value="${safe(f.search)}" placeholder="Activity name"></div><div><label for="history-sport">Sport</label><select id="history-sport" name="sport">${optionMarkup([['','All sports'],['cycling','Cycling'],['running','Running'],['swimming','Swimming'],['strength','Strength']], f.sport)}</select></div><button class="primary" type="submit">Apply filters</button><button class="quiet" type="button" data-clear-history>Clear filters</button></form><p id="history-range-error" class="form-error" role="alert"></p>
    <p class="helper">${h?.total != null ? `${first}–${last} of ${numberLabel(h.total)} activities · ` : ''}Newest first · Dates in UTC · Blank dates search all saved history. Missing values appear as —.</p>
    ${h?.error ? analysisError(h.error, 'history') : tableMarkup(['Date (UTC)','Activity','Sport','Duration','Distance','Avg power','Avg HR','TSS','Feeling / 5','Source'], rows, h ? (filtered ? 'No activities match these filters. Clear them to explore the athlete’s saved history.' : 'No activities saved yet. Import the athlete’s connected Strava history to begin reviewing training.') : 'Loading activity history…', emptyAction)}
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
  analysis.trends = null; if (analysis.tab !== 'history') paintTrendView();
  try { const result = await portal('athlete_trends', { athlete_id: athlete, ...analysis.range }); if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = result; }
  catch (error) { if (request !== analysis.trendRequest || athlete !== state.athleteId) return; analysis.trends = { error: error.message }; }
  if (analysis.tab !== 'history' && $('#analysis-content')) paintTrendView();
}
// Each analytics tool owns its catalog metadata and renderer. New tools use the shared range,
// athlete context and panel controls; missing records remain explicit. No synthetic series.
const ANALYSIS_PANELS = [
  {id:'load',label:'Fitness, fatigue & form',group:'Training load',render:({t})=>analysisPanel('load','Fitness, fatigue & form','Move across the chart to inspect a day. Toggle metrics or show planned training.',loadChartMarkup(t.load||[]),true)},
  {id:'volume',label:'Training volume',group:'Training load',render:({weeks,totalHours})=>analysisPanel('volume','Training volume','Recorded time by week · Monday–Sunday',`<div class="panel-number">${numberLabel(totalHours,'',1)}<span>hours in this period</span></div>${dataChart([{name:'Recorded hours',color:'#2869a4',points:weeks.map(w=>[Date.parse(w.day),w.duration/3600])}],'Weekly training hours','hours',Infinity,null,null,!readCoachPrefs().analysisPanelWidths?.volume)}<details class="data-disclosure"><summary>View weekly totals</summary>${tableMarkup(['Week','Time','Sessions'],weeks.map(w=>[safe(dateLabel(w.day)),numberLabel(w.duration/3600,' h',1),numberLabel(w.count)]))}</details>`)},
  {id:'power',label:'Power-duration curve',group:'Performance',render:({bests,powers})=>analysisPanel('power','Power-duration curve','Best saved efforts · Power-meter recordings only',`${powers.length>1?powerDurationChart(powers,!readCoachPrefs().analysisPanelWidths?.power):'<div class="chart-empty">No power-duration curve in this period. Recorded power-meter rides with saved curves will appear here.</div>'}${powers.length?`<div class="power-record-strip">${[60,300,1200].map(seconds=>{const found=bests.get(String(seconds));return `<div><span>${seconds/60} min</span><strong>${found?numberLabel(found.watts,' W'):'—'}</strong></div>`;}).join('')}</div>`:''}`)},
  {id:'recovery',label:'Recovery & sleep',group:'Recovery',render:({t})=>analysisPanel('recovery','Recovery & sleep','Daily sleep duration · Sources shown separately',`${dataChart([{name:'Trainable sleep',color:'#8253aa',points:(t.readiness||[]).map(r=>[Date.parse(r.metric_date),r.sleep_hours])},{name:'Intervals.icu sleep',color:'#2d806a',points:(t.wellness||[]).map(r=>[Date.parse(r.day),r.sleep_s==null?null:r.sleep_s/3600])}],'Sleep duration','hours',129600000,null,null,!readCoachPrefs().analysisPanelWidths?.recovery)}<button type="button" class="record-link" data-analysis-tab="recovery">Explore HRV, sleep and athlete check-ins →</button>`)},
  {id:'context',label:'Athlete context',group:'Context',render:({d,goal})=>analysisPanel('context','Athlete context','Use athlete feedback alongside modeled training load.',`<dl class="context-facts"><div><dt>Current FTP</dt><dd>${numberLabel(d.zones?.ftp_watts,' W')}</dd></div><div><dt>Latest energy report</dt><dd>${numberLabel(d.readiness?.checkin_energy,' / 5')}<small>${d.readiness?.metric_date?safe(dateLabel(d.readiness.metric_date)):'No check-in recorded'}</small></dd></div><div><dt>Next goal</dt><dd>${goal?safe(title(goal.event_type)):'Not set'}<small>${goal?safe(dateLabel(goal.target_date)):''}</small></dd></div></dl><button type="button" class="secondary" data-action="review-week">Ask AI to review the week</button><p class="helper">Review suggestions before changing the athlete’s plan.</p>`)},
  {id:'sessions',label:'Recent sessions',group:'Sessions',render:({activities})=>analysisPanel('sessions','Recent sessions','Open a session for its trace, laps and analysis.',tableMarkup(['Date','Session','Time','Avg power'],activities.slice(0,6).map(a=>[safe(dateLabel(a.start_date)),`<button type="button" class="record-link" data-activity="${safe(a.id)}">${safe(a.name||title(a.sport_type))} →</button>`,elapsedLabel(a.duration_s),numberLabel(a.avg_power,' W')]),'No recorded sessions in this period.'),true)},
];
function analysisPanels() {
  const saved = readCoachPrefs().analysisPanels;
  return Array.isArray(saved) ? saved.filter((id)=>ANALYSIS_PANELS.some((panel)=>id===panel.id)) : ANALYSIS_PANELS.map((panel)=>panel.id);
}
function analysisPanel(id,titleText,subtitle,body,wide=false) {
  wide=readCoachPrefs().analysisPanelWidths?.[id] ?? wide;
  return `<section class="insight-panel ${wide?'insight-wide':''}" data-insight-panel="${id}"><div class="insight-panel-head"><div><h4>${titleText}</h4><p>${subtitle}</p></div><div class="insight-panel-actions"><button type="button" class="panel-width" data-panel-width="${id}" data-wide="${wide}" aria-pressed="${wide}" aria-label="${wide?'Reduce':'Expand'} ${safe(titleText)}">${wide?'Fit':'Expand'}</button><button type="button" class="panel-hide" data-hide-panel="${id}" aria-label="Hide ${safe(titleText)}" title="Hide chart">×</button></div></div>${body}</section>`;
}
function paintReview() {
  const root = $('#analysis-content'); if (!root) return;
  const t=analysis.trends,d=state.athlete||{},today=utcDay(new Date()),from=analysis.range.from;
  const panels=analysisPanels();
  const controls=`<div class="analysis-workspace-head"><div><h3>Performance overview</h3><p class="helper">${safe(utcLabel(from))} – ${safe(utcLabel(analysis.range.to))} · Recorded training and planned load</p></div><button type="button" class="secondary" data-analysis-focus aria-pressed="${Boolean(readCoachPrefs().analysisFocus)}">${readCoachPrefs().analysisFocus ? 'Standard spacing' : 'Expand charts'}</button><details class="chart-customizer"><summary>Customize charts</summary><div class="chart-menu"><strong>Your analysis workspace</strong><p>Choose the view that fits your review.</p><div class="chart-presets"><button type="button" data-chart-preset="load,volume,sessions">Training load</button><button type="button" data-chart-preset="power,sessions,context">Performance</button><button type="button" data-chart-preset="recovery,load,context">Recovery</button></div>${[...panels,...ANALYSIS_PANELS.map(panel=>panel.id).filter(id=>!panels.includes(id))].map(id=>{const panel=ANALYSIS_PANELS.find(p=>p.id===id),index=panels.indexOf(id);return `<div class="chart-picker-row"><label><input type="checkbox" data-analysis-panel-choice="${id}" ${index>=0?'checked':''}><span>${panel.label}<small>${panel.group}</small></span></label>${index>=0?`<div class="chart-order"><button type="button" data-panel-move="${id}" data-direction="-1" aria-label="Move ${safe(panel.label)} up" ${index===0?'disabled':''}>↑</button><button type="button" data-panel-move="${id}" data-direction="1" aria-label="Move ${safe(panel.label)} down" ${index===panels.length-1?'disabled':''}>↓</button></div>`:''}</div>`;}).join('')}<button type="button" class="quiet" data-reset-panels>Restore all panels</button><small>Saved in this browser</small></div></details></div>`;
  if(!t || t.error) { root.innerHTML=controls+(t?.error?analysisError(t.error,'review'):'<div class="chart-empty" role="status">Loading recorded training…</div>');return; }
  const activities=(t.activities||[]).slice().sort((a,b)=>String(b.start_date).localeCompare(String(a.start_date)));
  const weeks=weeklyRecords(activities);
  const lastLoad=(t.load||[]).at(-1);
  const totalHours=activities.reduce((n,a)=>n+(Number(a.duration_s)||0),0)/3600;
  const bests=new Map();
  for(const a of activities.filter(a=>a.device_watts===true && a.power_curve)) for(const [seconds,watts] of Object.entries(a.power_curve)) if(Number(seconds)>0 && typeof watts==='number' && Number.isFinite(watts) && watts>=0 && (!bests.has(seconds)||watts>bests.get(seconds).watts)) bests.set(seconds,{seconds:Number(seconds),watts});
  const powers=[...bests.values()].sort((a,b)=>a.seconds-b.seconds);
  const goal=(d.goals||[]).filter(g=>g.target_date>=today).sort((a,b)=>a.target_date.localeCompare(b.target_date))[0];
  root.innerHTML=controls+`<div class="analysis-summary studio-analysis-summary"><span><strong>${numberLabel(totalHours,' h',1)}</strong>in this period</span><span><strong>${activities.length}</strong>recorded sessions</span><span><strong>${numberLabel(lastLoad?.daily_tss)}</strong>latest daily TSS</span><span><strong>${numberLabel(d.zones?.ftp_watts,' W')}</strong>current FTP</span></div>`+rangeForm()+(t.coverage_limited?'<p class="data-warning">This period contains more than 10,000 activities. Shorten the range for complete totals.</p>':'')+`<div class="insight-grid">${panels.map(id=>ANALYSIS_PANELS.find(panel=>panel.id===id)?.render({t,d,activities,weeks,totalHours,bests,powers,goal})||'').join('')}</div>`+(!panels.length?'<div class="chart-empty"><strong>Your workspace is clear</strong><p>Use Customize charts to add the panels you want.</p><button type="button" class="secondary" data-reset-panels>Restore all panels</button></div>':'');
}
document.addEventListener('change',(event)=>{
  const choice=event.target.closest('[data-analysis-panel-choice]'); if(!choice)return;
  const selected=analysisPanels().filter(id=>id!==choice.dataset.analysisPanelChoice);
  if(choice.checked) selected.push(choice.dataset.analysisPanelChoice);
  saveCoachPrefs({analysisPanels:selected});
  paintReview(); const menu=document.querySelector('.chart-customizer'); if(menu){menu.open=true;menu.querySelector(`[data-analysis-panel-choice="${choice.dataset.analysisPanelChoice}"]`)?.focus();}
});
document.addEventListener('click',(event)=>{
  const move=event.target.closest('[data-panel-move]');
  if(move){const order=analysisPanels(),index=order.indexOf(move.dataset.panelMove),target=index+Number(move.dataset.direction);if(index>=0&&target>=0&&target<order.length){[order[index],order[target]]=[order[target],order[index]];saveCoachPrefs({analysisPanels:order});paintReview();const menu=document.querySelector('.chart-customizer');menu.open=true;menu.querySelector(`[data-analysis-panel-choice="${move.dataset.panelMove}"]`)?.focus();}return;}
  const widthButton=event.target.closest('[data-panel-width]');
  if(widthButton){const id=widthButton.dataset.panelWidth;saveCoachPrefs({analysisPanelWidths:{...readCoachPrefs().analysisPanelWidths,[id]:widthButton.dataset.wide!=='true'}});paintReview();document.querySelector(`[data-panel-width="${id}"]`)?.focus();return;}
  const preset=event.target.closest('[data-chart-preset]'); if(preset) { saveCoachPrefs({analysisPanels:preset.dataset.chartPreset.split(',')}); paintReview(); document.querySelector('.chart-customizer summary')?.focus(); return; }
  if(event.target.closest('[data-analysis-focus]')) { saveCoachPrefs({analysisFocus:!readCoachPrefs().analysisFocus}); paintReview(); document.querySelector('[data-analysis-focus]')?.focus(); return; }
  const hide=event.target.closest('[data-hide-panel]'),reset=event.target.closest('[data-reset-panels]');
  if(!hide && !reset)return;
  saveCoachPrefs({...(reset?{analysisPanelWidths:{}}:{}),analysisPanels:reset?ANALYSIS_PANELS.map((panel)=>panel.id):analysisPanels().filter(id=>id!==hide.dataset.hidePanel)});paintReview();document.querySelector('.chart-customizer summary')?.focus();
});
function rangeForm() {
  const today = utcDay(new Date());
  return `<form id="trend-filter" class="analysis-filters" novalidate><div><label for="trend-from">From (UTC)</label><input required type="date" name="from" id="trend-from" aria-describedby="range-error" value="${safe(analysis.range.from)}"></div><div><label for="trend-to">To (UTC)</label><input required type="date" name="to" id="trend-to" aria-describedby="range-error" value="${safe(analysis.range.to)}"></div><button class="primary" type="submit">Update range</button><div class="range-shortcuts" role="group" aria-label="Recent date ranges">${[42,90,180,365].map((n) => `<button class="secondary" type="button" data-analysis-days="${n}" aria-pressed="${analysis.range.to === today && analysis.range.from === shiftUTC(today, 1-n)}">${n} days</button>`).join('')}</div></form><p id="range-error" class="form-error" role="alert"></p>`;
}
// Explicit nulls and breaks in time leave visible gaps; charts never turn missing data into zero.
function chartLinePath(points, x, y, smooth = false, maxGap = Infinity) {
  const segments = []; let segment = [];
  for (const [time,value] of points) {
    if (!Number.isFinite(time) || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment); segment = []; continue;
    }
    if (segment.length && (time <= segment.at(-1)[0] || time-segment.at(-1)[0] > maxGap)) {
      segments.push(segment); segment = [];
    }
    segment.push([time,value]);
  }
  if (segment.length) segments.push(segment);
  const pair = (a,b) => `${a.toFixed(2)},${b.toFixed(2)}`;
  return segments.map((part) => {
    const plot = part.map(([t,v]) => [x(t),y(v)]);
    let path = 'M'+pair(...plot[0]);
    if (!smooth || plot.length < 3) return path+plot.slice(1).map((point) => 'L'+pair(...point)).join(' ');
    const widths = plot.slice(1).map((point,i) => point[0]-plot[i][0]);
    const slopes = widths.map((width,i) => (plot[i+1][1]-plot[i][1])/width);
    const tangents = plot.map((_,i) => {
      if (i === 0) return slopes[0];
      if (i === plot.length-1) return slopes.at(-1);
      const a = slopes[i-1], b = slopes[i];
      if (a*b <= 0) return 0;
      const w1 = 2*widths[i]+widths[i-1], w2 = widths[i]+2*widths[i-1];
      return (w1+w2)/(w1/a+w2/b);
    });
    for (let i=0;i<plot.length-1;i++) {
      const [px,py] = plot[i], [nx,ny] = plot[i+1], third = widths[i]/3;
      path += ` C${pair(px+third,py+third*tangents[i])} ${pair(nx-third,ny-third*tangents[i+1])} ${pair(nx,ny)}`;
    }
    return path;
  }).join(' ');
}
const smoothIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c4 0 3-10 8-10s4 10 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function dataChart(series, label, unit = '', maxGap = Infinity, xBounds = null, cursorTime = null, compact = false, smooth = analysis.chartSmooth, measuredWidth = null) {
  const ordered = series.map((s) => ({ ...s, points: s.points.filter((p) => Number.isFinite(p[0])).slice().sort((a,b) => a[0]-b[0]) }));
  const visibleSeries = xBounds ? ordered.map((s) => ({ ...s, points: s.points.filter((p) => p[0] >= xBounds[0] && p[0] <= xBounds[1]) })) : ordered;
  const valid = visibleSeries.flatMap((s) => s.points.filter((p) => p[1] != null && Number.isFinite(p[1])));
  if (!valid.length) return `<div class="chart-empty">No ${safe(label.toLowerCase())} recorded in this range.</div>`;
  const xs = valid.map((p) => p[0]), ys = valid.map((p) => p[1]);
  const xmin = xBounds?.[0] ?? xs.reduce((a,b)=>Math.min(a,b),Infinity), xmax = xBounds?.[1] ?? xs.reduce((a,b)=>Math.max(a,b),-Infinity);
  const observedMin = ys.reduce((a,b)=>Math.min(a,b),Infinity), observedMax = ys.reduce((a,b)=>Math.max(a,b),-Infinity);
  const zoomTrace = Boolean(xBounds && label !== 'Power' && label !== 'Distance');
  const padding = Math.max(2,(observedMax-observedMin)*.12);
  let ymin = zoomTrace ? label === 'Elevation' ? Math.floor(observedMin-padding) : Math.max(0,Math.floor(observedMin-padding)) : Math.min(0,observedMin), ymax = zoomTrace ? Math.ceil(observedMax+padding) : Math.max(1,observedMax);
  const rawStep = (ymax-ymin)/4, magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep/magnitude, step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10)*magnitude;
  ymin = Math.floor(ymin/step)*step; ymax = Math.ceil(ymax/step)*step;
  const available = cursorTime == null ? ($('#drawer').hidden ? $('#analysis-content')?.clientWidth : $('#drawer-body')?.clientWidth) : $('#activity-trace')?.clientWidth;
  const panelWidth = compact && innerWidth >= 900 && !readCoachPrefs().analysisFocus ? (available - 76) / 2 : (available || 800) - 50;
  const width = Math.max(240, measuredWidth ?? Math.min(cursorTime == null ? 1400 : 2200, compact ? panelWidth : (available || 800) - 50));
  const right = width - 18;
  const x = (n) => 58 + (n - xmin) / (xmax - xmin || 1) * (right - 58), y = (n) => 222 - (n - ymin) / (ymax - ymin || 1) * 190;
  const paths = visibleSeries.map((s) => {
    const d = chartLinePath(s.points,x,y,smooth,maxGap);
    const marked = s.points.filter((p) => Number.isFinite(p[1]));
    return `<path class="chart-series-line" d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${s.dash ? '6 5' : 'none'}" vector-effect="non-scaling-stroke"/>${cursorTime == null && marked.length <= 500 ? marked.map(([t,v]) => `<circle class="chart-data-point ${marked.length === 1 ? 'is-isolated' : ''}" cx="${x(t).toFixed(2)}" cy="${y(v).toFixed(2)}" r="3" fill="${s.color}" data-time="${t}" data-series="${safe(s.name)}" data-value="${Number(v)}"/>`).join('') : cursorTime != null && marked.length < 120 ? marked.map(([t,v]) => `<circle cx="${x(t)}" cy="${y(v)}" r="3" fill="${s.color}"/>`).join('') : ''}`;
  }).join('');
  // Each chart reflows to its own column, so SVG text stays at its authored size.
  const model = cursorTime == null ? safe(JSON.stringify({series,label,unit,maxGap:Number.isFinite(maxGap) ? maxGap : null,xBounds,smooth,compact})) : '';
  const tickCount = width < 480 ? 2 : 4;
  const dateTick = (time) => new Date(time).toLocaleDateString(undefined,{timeZone:'UTC',month:'short',day:'numeric'});
  return `${cursorTime == null ? `<div class="chart-display-controls"><button type="button" class="chart-smooth-button" data-chart-smooth aria-pressed="${smooth}" aria-label="Ultra smooth: ${safe(label)}">${smoothIcon}<span>Ultra smooth</span></button><span class="chart-curve-note">${smooth ? 'Smooth curve · recorded values unchanged' : 'Recorded points · straight lines'}</span></div>` : ''}<div class="chart-frame chart-inspect" ${model ? `data-chart-model="${model}"` : ''} ${cursorTime == null ? `tabindex="0" role="group" aria-label="${safe(label)} in ${safe(unit)}. Tap a point, or use Left and Right arrow keys to inspect. Home and End jump to the first and last point."` : ''}><svg class="data-chart" data-responsive-chart data-chart-left="58" data-chart-right="18" viewBox="0 0 ${width} 270" role="img" aria-label="${safe(label)} in ${safe(unit)}. ${xBounds ? 'Horizontal axis is elapsed time. ' : ''}Exact values are available in the accompanying data."><title>${safe(label)} (${safe(unit)})</title><text class="chart-axis-unit" x="58" y="17">${safe(unit)}</text>${Array.from({length:Math.round((ymax-ymin)/step)+1},(_,i) => { const value = ymax-i*step; return `<line class="chart-gridline" x1="58" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="50" y="${y(value)+4}" text-anchor="end">${numberLabel(value,'',1)}</text>`; }).join('')}${ymin < 0 && ymax > 0 ? `<line class="chart-zero-line" x1="58" x2="${right}" y1="${y(0)}" y2="${y(0)}"/>` : ''}${paths}${cursorTime == null ? '<line class="chart-inspect-line" x1="58" x2="58" y1="32" y2="222" style="display:none"/>' : `<line class="trace-cursor" x1="${x(cursorTime)}" x2="${x(cursorTime)}" y1="32" y2="222" stroke="#236db7" stroke-width="1.5"/>`}${Array.from({length:xmax === xmin ? 1 : tickCount+1},(_,i) => { const t = xmin+(xmax-xmin)*i/tickCount; return `<text data-chart-tick x="${x(t)}" y="250" text-anchor="${i === 0 ? 'start' : i === tickCount ? 'end' : 'middle'}">${safe(xBounds ? elapsedLabel(t) : dateTick(t))}</text>`; }).join('')}</svg>${cursorTime == null ? '<div class="chart-hover-popover" hidden></div><span class="chart-announcement" role="status" aria-live="polite" aria-atomic="true"></span>' : ''}</div><div class="chart-legend">${series.map((s) => `<span><i class="${s.dash ? 'is-projected' : ''}" style="--series-color:${s.color};background:${s.color}"></i>${safe(s.name)}</span>`).join('')}</div>`;
}
function inspectChart(frame, targetIndex, announce = false) {
  const points = [...frame.querySelectorAll('.chart-data-point')];
  const times = [...new Set(points.map((point) => Number(point.dataset.time)))].sort((a,b) => a-b);
  if (!times.length) return;
  const index = Math.min(times.length-1, Math.max(0,targetIndex));
  frame.dataset.inspectedIndex = String(index);
  const selected = points.filter((point) => Number(point.dataset.time) === times[index]);
  const x = Number(selected[0].getAttribute('cx'));
  const announcement = frame.querySelector('.chart-announcement');
  if (announce && announcement) announcement.textContent = `${frame.dataset.axis === 'duration' ? elapsedLabel(times[index]) + ' effort' : utcLabel(times[index])}. ${selected.map(point => `${point.dataset.series}: ${numberLabel(point.dataset.value,'',1)}`).join('. ')}`;
  const line = frame.querySelector('.chart-inspect-line');
  if (line) { line.style.display = ''; line.setAttribute('x1',String(x)); line.setAttribute('x2',String(x)); }
  const popover = frame.querySelector('.chart-hover-popover');
  if (popover) { popover.hidden = false; popover.style.left = `${Math.max(8,Math.min(frame.clientWidth - 230,x / frame.querySelector('svg').viewBox.baseVal.width * frame.clientWidth))}px`; popover.innerHTML = `<strong>${safe(frame.dataset.axis === 'duration' ? elapsedLabel(times[index]) + ' effort' : utcLabel(times[index]))}</strong>${selected.map((point) => `<span><i style="background:${safe(point.getAttribute('fill'))}"></i>${safe(point.dataset.series)} <b>${numberLabel(point.dataset.value,'',1)}</b></span>`).join('')}`; }
}
document.addEventListener('pointermove', (event) => {
  const frame = event.target.closest?.('.chart-inspect');
  if (!frame || !frame.querySelector('.chart-data-point')) return;
  const svg = frame.querySelector('svg'), rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width;
  const points = [...frame.querySelectorAll('.chart-data-point')];
  let nearest = points[0]; for (const point of points) if (Math.abs(Number(point.getAttribute('cx')) - x) < Math.abs(Number(nearest.getAttribute('cx')) - x)) nearest = point;
  const times = [...new Set(points.map((point) => Number(point.dataset.time)))].sort((a,b) => a-b);
  inspectChart(frame,times.indexOf(Number(nearest.dataset.time)));
});
document.addEventListener('pointerout', (event) => { const frame = event.target.closest?.('.chart-inspect'); if (!frame || frame.contains(event.relatedTarget)) return; const popover = frame.querySelector('.chart-hover-popover'); if (popover) popover.hidden = true; const line = frame.querySelector('.chart-inspect-line'); if (line) line.style.display = 'none'; });
document.addEventListener('keydown', (event) => {
  const frame = event.target.closest?.('.chart-inspect');
  if (!frame || !['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)) return;
  if (event.key === 'Escape') {
    const popover = frame.querySelector('.chart-hover-popover');
    if (!popover || popover.hidden) return;
    event.preventDefault(); event.stopImmediatePropagation(); popover.hidden = true;
    const line = frame.querySelector('.chart-inspect-line'); if (line) line.style.display = 'none'; return;
  }
  event.preventDefault();
  const current = frame.dataset.inspectedIndex == null ? null : Number(frame.dataset.inspectedIndex);
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? Infinity : current == null ? (event.key === 'ArrowRight' ? 0 : Infinity) : current + (event.key === 'ArrowRight' ? 1 : -1);
  inspectChart(frame, target, true);
});
function weeklyRecords(activities) {
  const weeks = new Map();
  for (let day = analysis.range.from; day <= analysis.range.to; day = shiftUTC(day, 1)) { const monday = shiftUTC(day, -(new Date(day).getUTCDay() + 6) % 7); if (!weeks.has(monday)) weeks.set(monday, { day: monday, count: 0, duration: 0, distance: 0, tss: 0, tssCount: 0 }); }
  for (const a of activities) { const day = utcDay(a.start_date), monday = shiftUTC(day, -(new Date(day).getUTCDay() + 6) % 7), w = weeks.get(monday); if (!w) continue; w.count++; w.duration += Number(a.duration_s || 0); w.distance += Number(a.distance_m || 0); if (a.raw_tss != null) { w.tss += Number(a.raw_tss); w.tssCount++; } }
  return [...weeks.values()];
}
function plannedLoadProjection(load) {
  const today = utcDay(new Date());
  const latest = load?.at(-1);
  if (!latest || latest.metric_date !== today || ![latest.ctl, latest.atl].every((n) => n != null && Number.isFinite(Number(n)))) return { rows: [], note: 'Projection starts when today’s fitness and fatigue values are saved.' };
  const plans = (state.athlete?.plans || []).filter((p) => p.status === 'active');
  const planByWeek = new Map(plans.map((p) => [p.week_start_date, p]));
  const workouts = state.athlete?.workouts || [];
  let ctl = Number(latest.ctl), atl = Number(latest.atl);
  const rows = [], maximum = shiftUTC(today, 21);
  for (let day = shiftUTC(today, 1); day <= maximum; day = shiftUTC(day, 1)) {
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
    const week = shiftUTC(day, -((weekday + 6) % 7));
    const plan = planByWeek.get(week);
    if (!plan) break;
    const sessions = workouts.filter((w) => w.plan_id === plan.id && w.day_of_week === weekday && w.workout_type !== 'rest');
    if (sessions.some((w) => w.target_tss == null && w.computed_tss == null)) return { rows: [], note: `Projection needs a TSS target for every planned workout. Check ${utcLabel(day)}.` };
    const tss = sessions.reduce((sum,w) => sum + Number(w.target_tss ?? w.computed_tss), 0);
    if (!Number.isFinite(tss) || tss < 0) return { rows: [], note: 'A planned workout has an invalid TSS target. Review the plan before projecting load.' };
    const tsb = ctl - atl;
    ctl += (tss - ctl) / 42;
    atl += (tss - atl) / 7;
    rows.push({ metric_date: day, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +tsb.toFixed(1), daily_tss: tss });
  }
  return { rows, note: rows.length ? `Projected through ${utcLabel(rows.at(-1).metric_date)} from saved, active weeks. Unscheduled days inside those weeks count as rest. Extend the plan to see more than ${rows.length} ${rows.length === 1 ? 'day' : 'days'}.` : 'Save this week’s plan to see a training-load projection.' };
}
function loadChartMarkup(load = []) {
  const projection = plannedLoadProjection(load);
  const definitions = [['ctl','Fitness (CTL)','#2869a4'],['atl','Fatigue (ATL)','#8253aa'],['tsb','Form (TSB)','#2d806a']];
  const visible = definitions.filter(([key]) => analysis.loadVisible[key]);
  const series = visible.flatMap(([key,name,color]) => [{ name, color, points: load.map((r) => [Date.parse(r.metric_date), r[key]]) }, ...(analysis.showProjection && projection.rows.length ? [{ name: `${name} · planned`, color, dash: true, points: [[Date.parse(load.at(-1).metric_date), Number(load.at(-1)[key])], ...projection.rows.map((r) => [Date.parse(r.metric_date), r[key]])] }] : [])]);
  return `<div class="load-chart-controls" role="group" aria-label="Training-load overlays">${definitions.map(([key,name,color]) => `<button type="button" data-load-series="${key}" aria-pressed="${analysis.loadVisible[key]}"><i style="background:${color}" aria-hidden="true"></i>${name}</button>`).join('')}<button type="button" data-load-projection aria-pressed="${analysis.showProjection}">Planned projection</button></div>${series.length ? dataChart(series, 'Training load', 'load', 86400000 * 1.5) : '<div class="chart-empty">Choose a metric above to view training load.</div>'}<p class="helper">${safe(projection.note)} Dashed lines are projections from saved TSS targets, not recorded training. Fitness and fatigue follow 42-day and 7-day load models; form is the difference at the start of each day.</p>${projection.rows.length ? `<details class="data-disclosure"><summary>View projected daily values</summary>${tableMarkup(['Date','Fitness','Fatigue','Form','Planned TSS'],projection.rows.map((r) => [safe(utcLabel(r.metric_date)),numberLabel(r.ctl,'',1),numberLabel(r.atl,'',1),numberLabel(r.tsb,'',1),numberLabel(r.daily_tss,'',1)]))}</details>` : ''}`;
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
        ${powerRecordsMarkup(t.activities)}${powerHrTrendMarkup(t.activities)}<h4>Fitness, fatigue and form</h4><p class="helper">Stored training-load calculations using available TSS. Gaps are missing records; Garmin review imports are not added to these totals.</p>${loadChartMarkup(t.load)}
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
function powerDurationChart(values, compact = false) {
  const available = compact ? ($('#analysis-content')?.clientWidth || 800) : ($('.activity-main')?.clientWidth || $('#analysis-content')?.clientWidth || 800);
  const width = Math.max(280,compact && innerWidth >= 900 && !readCoachPrefs().analysisFocus ? (available - 112)/2 : available-48);
  const left = 52, right = width-18, top = 18, bottom = 220, minS = values[0].seconds, maxS = values.at(-1).seconds, maxW = Math.max(100,Math.ceil(Math.max(...values.map((v)=>v.watts))/100)*100);
  const x = (s) => left + (Math.log(s)-Math.log(minS))/(Math.log(maxS)-Math.log(minS) || 1)*(right-left), y = (w) => bottom - w/maxW*(bottom-top);
  return `<div class="chart-frame chart-inspect power-duration-chart" data-axis="duration" tabindex="0" aria-label="Power curve. Use left and right arrows to inspect efforts."><svg data-responsive-chart data-chart-left="52" data-chart-right="18" viewBox="0 0 ${width} 255" role="img" aria-label="Best average power by effort duration on a logarithmic time axis"><title>Power-duration profile</title><line class="chart-inspect-line" x1="62" x2="62" y1="18" y2="220" style="display:none"/>${[0,.25,.5,.75,1].map((n)=>`<line x1="${left}" x2="${right}" y1="${top+n*(bottom-top)}" y2="${top+n*(bottom-top)}" stroke="#e0e6e0"/><text x="${left-9}" y="${top+n*(bottom-top)+4}" text-anchor="end">${Math.round(maxW*(1-n))}</text>`).join('')}<polyline points="${values.map((v)=>`${x(v.seconds).toFixed(1)},${y(v.watts).toFixed(1)}`).join(' ')}" fill="none" stroke="#2869a4" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${values.map((v,index)=>`<circle class="chart-data-point" data-time="${v.seconds}" data-series="Best power (W)" data-value="${v.watts}" cx="${x(v.seconds).toFixed(1)}" cy="${y(v.watts).toFixed(1)}" r="4" fill="#2869a4"/><text data-chart-tick x="${x(v.seconds).toFixed(1)}" y="${bottom+18}" text-anchor="middle">${(index % Math.max(1,Math.ceil(values.length/6)) === 0 || index === values.length-1) ? (v.seconds>=3600 ? Math.round(v.seconds/3600)+'h' : v.seconds>=60 ? Math.round(v.seconds/60)+'m' : v.seconds+'s') : ''}</text>`).join('')}<text x="${(left+right)/2}" y="252" text-anchor="middle">Duration (log scale)</text><text transform="translate(16 120) rotate(-90)" text-anchor="middle">Watts</text></svg><div class="chart-hover-popover" hidden></div><span class="chart-announcement" role="status" aria-live="polite" aria-atomic="true"></span></div>`;
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
  const d = state.athlete, p = d.profile || {}, z = d.zones || {}, c = d.training_context || {};
  const history = d.profile_changes || [];
  const changedWhen = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
  const latestChange = history[0];
  const historyRows = history.map((entry) => `<div class="meeting-row"><strong>${safe(changedWhen(entry.changed_at))} · ${safe(entry.actor_name)}</strong><p>${(entry.changes || []).map((change) => safe(change)).join(' · ')}</p></div>`).join('');
  const field = (name, label, value, type = 'text', attrs = '') => `<label class="profile-edit-field">${label}<input name="${name}" type="${type}" value="${safe(value ?? '')}" ${attrs}></label>`;
  const choose = (name, label, value, options) => `<label class="profile-edit-field">${label}<select name="${name}">${options.map(([v, t]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const estimate = Number(z.estimated_ftp_watts);
  const ftp = Number(z.ftp_watts);
  const defaults = [['recovery','Z1 · Recovery',30,55],['endurance','Z2 · Endurance',56,75],['tempo','Z3 · Tempo',76,87],['sweet_spot','Sweet Spot',88,94],['threshold','Z4 · Threshold',95,105],['vo2max','Z5 · VO₂max',106,120],['anaerobic','Z6 · Anaerobic',121,150],['neuromuscular','Z7 · Neuromuscular',151,250]];
  const overrides = Array.isArray(z.power_zone_percentages) ? z.power_zone_percentages : [];
  const powerZones = defaults.map(([key,label,defaultLow,defaultHigh]) => {
    const saved = overrides.find((band) => band.key === key);
    const lo = Number(saved?.low_pct ?? defaultLow), hi = Number(saved?.high_pct ?? defaultHigh);
    return `<div class="power-zone-edit-row"><span>${label}</span><label>From <input name="power_zone_${key}_low" type="number" min="10" max="500" step="0.1" required value="${safe(lo)}">%</label><label>To <input name="power_zone_${key}_high" type="number" min="10" max="500" step="0.1" required value="${safe(hi)}">%</label><strong data-zone-watts="${key}">${ftp > 0 ? `${Math.round(ftp*lo/100)}–${Math.round(ftp*hi/100)} W` : 'Set FTP'}</strong></div>`;
  }).join('');
  return `<div class="section-head"><h3>Athlete profile & zones</h3><button type="button" class="secondary" data-action="new-note">Add athlete note</button></div>
    <p class="helper">You can edit the athlete’s training settings. Saved thresholds change future targets; past workout records stay as recorded. AI suggestions still require your review.</p>
    ${latestChange ? `<p class="helper"><strong>Last changed ${safe(changedWhen(latestChange.changed_at))} by ${safe(latestChange.actor_name)}.</strong> ${safe((latestChange.changes || []).slice(0, 2).join(' · '))}</p>` : ''}
    <form id="athlete-settings-form" class="athlete-settings-form" novalidate>
      <section class="settings-panel"><div class="section-head"><h4>Profile</h4></div><div class="profile-edit-grid">
        ${field('display_name','Name',p.display_name,'text','required maxlength="80"')}
        ${choose('primary_sport','Primary sport',p.primary_sport,[['cycling','Cycling'],['running','Running'],['swimming','Swimming'],['strength','Strength']])}
        ${choose('experience_level','Experience',p.experience_level,[['','Not set'],['new','New'],['returning','Returning'],['intermediate','Intermediate'],['advanced','Advanced']])}
        ${field('birth_year','Birth year',p.birth_year,'number','min="1901" max="2099"')}
        ${choose('sex','Sex',p.sex,[['','Not set'],['female','Female'],['male','Male'],['other','Other'],['prefer_not_to_say','Prefer not to say']])}
        ${field('weight_kg','Weight (kg)',p.weight_kg,'number','min="25.1" max="249.9" step="0.1"')}
        ${field('height_cm','Height (cm)',p.height_cm,'number','min="100" max="250" step="0.1"')}
        ${choose('training_aggressiveness','Training preference',p.training_aggressiveness || 'balanced',[['conservative','Conservative'],['balanced','Balanced'],['aggressive','Aggressive']])}
        ${field('available_equipment','Equipment, comma separated',(p.available_equipment || []).join(', '),'text')}
        <label class="settings-check"><input name="gym_access" type="checkbox" ${p.gym_access ? 'checked' : ''}>Gym access</label>
      </div><div class="profile-edit-grid profile-notes-grid"><label>Injury notes<textarea name="injury_notes" rows="3" maxlength="1000">${safe(p.injury_notes || '')}</textarea></label><label>Environment notes<textarea name="environment_notes" rows="3" maxlength="1000">${safe(p.environment_notes || '')}</textarea></label></div></section>
      <section class="settings-panel"><div class="section-head"><h4>Power & heart-rate zones</h4></div><div class="profile-edit-grid">
        ${field('ftp_watts','FTP (W)',z.ftp_watts,'number','min="50" max="1200" step="1"')}
        ${field('threshold_hr','Threshold HR (bpm)',z.threshold_hr,'number','min="80" max="230" step="1"')}
        ${field('max_hr','Maximum HR (bpm)',z.max_hr,'number','min="80" max="240" step="1"')}
        ${field('resting_hr','Resting HR (bpm)',z.resting_hr,'number','min="25" max="120" step="1"')}
        ${field('threshold_pace_sec_per_km','Threshold run pace (seconds/km)',z.threshold_pace_sec_per_km,'number','min="120" max="1200" step="1"')}
        <label class="settings-check"><input name="ftp_locked" type="checkbox" ${z.ftp_locked !== false ? 'checked' : ''}>Keep FTP set by coach</label>
      </div><div class="ftp-estimate"><div><strong>Detected FTP estimate: ${estimate > 0 ? `${Math.round(estimate)} W` : 'Not available yet'}</strong><p class="helper">Based on repeated execution and recorded power. An estimate is a review prompt, not an automatic FTP change.</p></div>${estimate > 0 ? `<button type="button" class="secondary" data-action="use-estimated-ftp" data-estimate="${Math.round(estimate)}">Use estimate in form</button>` : ''}</div><div class="power-zone-preview"><strong>Power zone boundaries</strong><p class="helper">Edit each range as a percentage of FTP. The watt targets update with FTP; saved changes apply to future workouts.</p><div>${powerZones}</div></div></section>
      <section class="settings-panel"><div class="section-head"><h4>Training block & recovery</h4></div><p class="helper">A low readiness score, fatigue, or negative form can be part of a planned loading block. Set the coach’s intent here; AI should report evidence and leave plan changes to you.</p><div class="profile-edit-grid">
        ${field('block_start_date','Block starts',c.block_start_date,'date')}
        ${field('block_end_date','Block ends',c.block_end_date,'date')}
        ${field('block_length_weeks','Block length (weeks)',c.block_length_weeks,'number','min="1" max="52" step="1"')}
        ${field('recovery_week_start_date','Recovery week starts (Monday)',c.recovery_week_start_date,'date')}
        ${field('min_weekly_hours','Minimum hours per week',c.min_weekly_hours,'number','min="0" max="40" step="0.25"')}
        ${field('max_weekly_hours','Maximum hours per week',c.max_weekly_hours ?? c.target_weekly_hours,'number','min="0" max="40" step="0.25"')}
        ${field('training_days_per_week','Training days per week',c.training_days_per_week,'number','min="1" max="7" step="1"')}
        ${field('training_cycle_days','Training rhythm (days)',c.training_cycle_days || 7,'number','min="3" max="14" step="1"')}
        <label class="settings-check"><input name="repeat_workouts_ok" type="checkbox" ${c.repeat_workouts_ok !== false ? 'checked' : ''}>Repeating useful workouts is OK</label>
      </div><p class="helper">The AI plans the whole week within these hours, including workouts already on the calendar. If the days available cannot fit the minimum, it will tell you before publishing.</p><label class="settings-wide-label">Block focus and coach instructions<textarea name="block_focus" rows="3" maxlength="600" placeholder="For example: three-week VO₂max build; keep Tuesday intervals hard unless execution or athlete feedback changes.">${safe(c.block_focus || '')}</textarea></label></section>
      <section class="settings-panel"><div class="section-head"><h4>Weekly availability</h4></div><p class="helper">Minutes available each day. Leave blank when unknown; enter 0 for unavailable.</p><div class="availability-edit">${ORDER.map((day) => `<div><label>${DAYS[day]}<input name="availability_${day}" type="number" min="0" max="1440" step="1" value="${safe(p.day_availability_min?.[day] ?? '')}"></label><label class="settings-check"><input name="rest_${day}" type="checkbox" ${(p.preferred_rest_days || []).includes(day) ? 'checked' : ''}>Preferred rest</label></div>`).join('')}</div></section>
      <div class="profile-save-bar"><p id="athlete-settings-status" class="status" role="status"></p><button type="button" class="primary" data-action="save-athlete-settings">Save athlete settings</button></div>
    </form>${typeof settingsHistoryMarkup === 'function' ? settingsHistoryMarkup() : ''}<section class="settings-panel"><h4>Recent coach setting changes</h4>${historyRows || '<p class="helper">No coach changes recorded yet.</p>'}</section><section class="settings-panel"><h4>Goals</h4>${tableMarkup(['Target date','Event / goal','Target FTP','Weekly hours','Recent longest session','Notes'],(d.goals || []).map((g) => [safe(utcLabel(g.target_date)),safe(title(g.event_type) || 'Training goal'),numberLabel(g.target_ftp_watts,' W'),numberLabel(g.weekly_hours_available,' h',1),numberLabel(g.recent_longest_session_min,' min'),safe(g.notes || '—')]))}</section>`;
}
async function openActivity(id) {
  const request = ++analysis.detailRequest, athlete = state.athleteId;
  state.editorDirty = false; analysis.detail = null; analysis.traceRange = null; analysis.traceCursor = null; analysis.route = null; analysis.routeRequest++; analysis.traceDrag = null; analysis.traceSelection = null; analysis.lapSelected = []; analysis.aiReport = null; analysis.detectedIntervals = null; analysis.activityPanel = 'analyze';
  openEditor('activity', 'ACTIVITY ANALYSIS', 'Loading activity…', '<div class="chart-empty" role="status">Loading summary, traces and laps…</div>');
  $('#drawer').classList.add('analysis-page'); $('#close-drawer').textContent = 'Back to athlete'; $('#close-drawer').focus();
  history.replaceState(null, '', '#activity/' + athlete + '/' + id);
  try { const detail = await portal('activity_detail', { athlete_id: athlete, activity_id: id }); if (request !== analysis.detailRequest || athlete !== state.athleteId || $('#drawer').hidden) return; analysis.detail = detail; analysis.traceVisible = ['watts','heartrate','cadence'].filter((k) => detail.channels[k]?.some((p) => p[1] != null)); if (!analysis.traceVisible.length) analysis.traceVisible = Object.keys(detail.channels).filter((k) => detail.channels[k]?.some((p) => p[1] != null)).slice(0,2); analysis.trace = analysis.traceVisible[0] || 'watts'; renderActivity(); }
  catch (error) { if (request === analysis.detailRequest && athlete === state.athleteId && !$('#drawer').hidden) { $('#drawer-title').textContent = 'Activity unavailable'; $('#drawer-body').innerHTML = `<p role="alert">${safe(error.message)}</p><button type="button" class="secondary" data-activity="${safe(id)}">Try again</button>`; } }
}
const TRACE_COLORS = {watts:'#7c4caa',heartrate:'#bc4459',cadence:'#927022',velocity_ms:'#26894e',altitude_m:'#637085',distance_m:'#3478db',temperature_c:'#b3487b',grade_pct:'#98621d'};
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
  const containerWidth = document.querySelector?.('#activity-power-hr')?.clientWidth || document.querySelector?.('.activity-main')?.clientWidth || (typeof innerWidth === 'number' ? innerWidth - 48 : 778);
  const width = Math.max(250, Math.min(760, containerWidth - 18)), height = 300, left = 52, right = width - 16, top = 18, bottom = 258;
  const x = (w) => left + w / xMax * (right - left), y = (hr) => bottom - (hr - yMin) / (yMax - yMin) * (bottom - top);
  const midpoint = (d.stream_duration_s || paired.at(-1).time_s) / 2;
  const dots = paired.map((s) => `<circle cx="${x(s.watts).toFixed(1)}" cy="${y(s.heartrate).toFixed(1)}" r="2.8" fill="${s.time_s < midpoint ? '#2c6588' : '#965629'}" fill-opacity=".85"/>`).join('');
  const halfRows = (d.half_trace_stats || []).map((half, i) => { const w = half.metrics.watts, hr = half.metrics.heartrate; return [i ? 'Second half' : 'First half', numberLabel(w?.average,' W',1), numberLabel(hr?.average,' bpm',1), numberLabel(w?.coverage_s,' s',0) + ' / ' + numberLabel(half.duration_s,' s',0), numberLabel(hr?.coverage_s,' s',0) + ' / ' + numberLabel(half.duration_s,' s',0)]; });
  return `<p class="helper">${paired.length} paired inspection samples, colored by elapsed half. This shows the recorded relationship; changing terrain, intensity and heart-rate lag can change the pattern. ${d.activity.device_watts === true ? 'Power is from a meter.' : 'Power may be estimated.'}</p><div class="power-hr-chart chart-frame"><svg data-responsive-chart data-chart-left="${left}" data-chart-right="${width-right}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Scatter plot of recorded power in watts against heart rate in beats per minute"><title>Power versus heart rate</title>${[0,.25,.5,.75,1].map((n)=>`<line x1="${left}" x2="${right}" y1="${top+n*(bottom-top)}" y2="${top+n*(bottom-top)}" stroke="#e1e7e1"/><text x="${left-8}" y="${top+n*(bottom-top)+4}" text-anchor="end">${Math.round(yMax-n*(yMax-yMin))}</text><line x1="${left+n*(right-left)}" x2="${left+n*(right-left)}" y1="${top}" y2="${bottom}" stroke="#e1e7e1"/><text x="${left+n*(right-left)}" y="${bottom+18}" text-anchor="middle">${Math.round(n*xMax)}</text>`).join('')}${dots}<text x="${(left+right)/2}" y="${height-3}" text-anchor="middle">Power (W)</text><text transform="translate(14 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle">Heart rate (bpm)</text></svg></div><div class="chart-legend"><span><i style="background:#2c6588"></i>First half</span><span><i style="background:#965629"></i>Second half</span></div>${halfRows.length ? `<h4>Measured halves</h4><p class="helper">Time-weighted averages from the full trace. Halves include warm-up, stops and cool-down; compare like efforts before interpreting a difference.</p>${tableMarkup(['Elapsed range','Avg power','Avg HR','Power coverage','HR coverage'],halfRows)}` : ''}`;
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
function aiReviewChart(points, label, unit, color, duration, baseline = false) {
  const measured = (points || []).filter(([time, value]) => Number.isFinite(time) && Number.isFinite(value));
  if (!measured.length) return `<div class="ai-review-chart-empty">No recorded ${safe(label.toLowerCase())} trace.</div>`;
  const containerWidth = document.querySelector?.('.activity-main')?.clientWidth || (typeof innerWidth === 'number' ? innerWidth - 48 : 1480);
  const columns = typeof innerWidth === 'number' && innerWidth < 1280 ? 1 : 2;
  const width = Math.max(250, Math.min(720, (containerWidth - (columns - 1) * 14) / columns - 26)), height = 190, left = 48, right = width - 10, top = 14, bottom = 152;
  const values = measured.map((point) => point[1]);
  const low = baseline ? 0 : Math.max(0, Math.floor((Math.min(...values) - 10) / 10) * 10);
  const high = Math.max(low + 1, baseline ? Math.ceil(Math.max(...values) * 1.08 / 50) * 50
    : Math.ceil((Math.max(...values) + 8) / 10) * 10);
  const end = Math.max(1, duration || measured.at(-1)[0]);
  const x = (time) => left + Math.max(0, Math.min(1, time / end)) * (right - left);
  const y = (value) => bottom - Math.max(0, Math.min(1, (value - low) / (high - low))) * (bottom - top);
  let penUp = true;
  const path = smoothTracePoints(points || [], 60).map(([time, value]) => {
    if (!Number.isFinite(time) || !Number.isFinite(value)) { penUp = true; return ''; }
    // Stream previews already insert nulls at actual recording gaps. Their normal
    // bucket spacing can exceed ten seconds on a long ride, so time alone cannot
    // decide whether a line should break.
    const command = penUp ? 'M' : 'L';
    penUp = false;
    return `${command}${x(time).toFixed(1)},${y(value).toFixed(1)}`;
  }).join(' ');
  return `<svg data-responsive-chart data-chart-left="${left}" data-chart-right="${width-right}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safe(label)} over the recorded activity, in ${safe(unit)}. Exact averages appear in the measurements below.">
    <title>${safe(label)} during the ride</title>
    ${[0,.5,1].map((fraction) => { const gridY = top + fraction * (bottom-top); return `<line x1="${left}" x2="${right}" y1="${gridY}" y2="${gridY}" stroke="#e3e8f0"/><text x="${left-8}" y="${gridY+4}" text-anchor="end">${numberLabel(high - fraction * (high-low))}</text>`; }).join('')}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    ${[0,.5,1].map((fraction) => `<text x="${x(end*fraction)}" y="${height-8}" text-anchor="${fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}">${elapsedLabel(end*fraction)}</text>`).join('')}
  </svg>`;
}
function aiReviewMeasurements(d) {
  const a = d.activity || {}, full = d.full_trace_stats, half = d.half_trace_stats;
  const metric = (stats, key) => stats?.metrics?.[key]?.average;
  const power = metric(full, 'watts') ?? a.avg_power;
  const heart = metric(full, 'heartrate') ?? a.avg_hr;
  const primary = [
    ['Moving time',elapsedLabel(a.moving_s ?? a.duration_s),'Time in motion'],
    ['Distance',numberLabel(a.distance_m == null ? null : a.distance_m / 1000,' km',1),'Recorded ride'],
    ['Average power',numberLabel(power,' W'),'Ride output'],
    ['Average heart rate',numberLabel(heart,' bpm'),'Heart response'],
  ];
  const secondary = [
    ['Effort-adjusted power',numberLabel(full?.normalized_power_w ?? a.strava_weighted_avg_watts,' W'),'Accounts for power surges'],
    ['Highest power',numberLabel(full?.metrics?.watts?.maximum ?? a.strava_max_watts,' W'),'Recorded peak'],
    ['Average cadence',numberLabel(metric(full,'cadence') ?? a.avg_cadence,' rpm'),'Pedal revolutions per minute'],
    ['Average speed',numberLabel((metric(full,'velocity_ms') ?? a.avg_speed_ms) == null ? null : (metric(full,'velocity_ms') ?? a.avg_speed_ms) * 3.6,' km/h',1),'Distance per hour'],
    ['Climbing',numberLabel(a.elevation_gain,' m'),'Elevation gained'],
    ['Training stress',numberLabel(a.raw_tss,' TSS'),'Only when recorded'],
  ];
  const rows = half?.length === 2 ? [
    ['First half',half[0]],['Second half',half[1]],
  ] : [];
  return `<div class="ai-review-metrics" aria-label="Recorded ride measurements">${primary.map(([label,value,detail]) => `<div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join('')}</div>
    <div class="ai-review-chart-grid"><section><div class="ai-review-chart-title"><h4>Power through the ride</h4><span>watts</span></div>${aiReviewChart(d.channels?.watts,'Power','watts','#a627d6',d.stream_duration_s,true)}</section>
    <section><div class="ai-review-chart-title"><h4>Heart rate through the ride</h4><span>beats per minute</span></div>${aiReviewChart(d.channels?.heartrate,'Heart rate','beats per minute','#e64e56',d.stream_duration_s)}</section></div>
    <p class="ai-review-method">The charts use a 60-second display smoothing. Numbers below use the full saved recording where available; gaps remain blank.</p>
    <div class="ai-review-detail-grid"><section><h4>More measurements</h4><dl>${secondary.map(([label,value,detail]) => `<div><dt>${label}<small>${detail}</small></dt><dd>${value}</dd></div>`).join('')}</dl></section>
    <section><h4>How the ride changed</h4>${rows.length ? `<table><thead><tr><th scope="col">Half</th><th scope="col">Power</th><th scope="col">Heart rate</th><th scope="col">Cadence</th></tr></thead><tbody>${rows.map(([name,stats]) => `<tr><th scope="row">${name}</th><td>${numberLabel(metric(stats,'watts'),' W')}</td><td>${numberLabel(metric(stats,'heartrate'),' bpm')}</td><td>${numberLabel(metric(stats,'cadence'),' rpm')}</td></tr>`).join('')}</tbody></table><p class="helper">Two equal parts of the recorded time. Changes alone do not explain their cause.</p>` : '<p class="helper">Half-ride comparison needs at least 20 minutes of saved trace data.</p>'}</section></div>`;
}
function aiReportMarkup() {
  const r = analysis.aiReport;
  if (!r) return '<div class="ai-review-prompt"><strong>Measurements first. Interpretation when you need it.</strong><p>Generate a brief coach note to connect the numbers above with the saved laps and comparable rides. It will flag missing context without changing the plan.</p></div>';
  const list = (heading, items, className) => items?.length ? `<section class="${className}"><h4>${heading}</h4><ul>${items.map((v)=>`<li>${safe(v)}</li>`).join('')}</ul></section>` : '';
  return `<div class="ai-review-report"><div class="ai-review-takeaway"><span>COACH TAKEAWAY</span><strong>${safe(r.summary)}</strong></div><div class="ai-review-notes">${list('What stands out',r.observations,'ai-review-observed')}${list('Check before changing the plan',r.uncertainties,'ai-review-cautions')}${list('Ask the athlete',r.coach_questions,'ai-review-questions')}</div><p class="ai-review-method">AI interpretation for the coach. Confirm each finding against the charts and laps; you decide whether the plan changes.</p></div>`;
}
function detectedIntervalsMarkup() {
  const result = analysis.detectedIntervals;
  if (!result) return '<p class="helper">No intervals detected yet.</p>';
  if (!result.intervals?.length) return `<p class="helper">${safe(result.reason || 'No sustained efforts were detected.')}</p>`;
  return `${result.overview ? `<p class="helper">${safe(result.overview)}</p>` : ''}<div class="detected-interval-list">${result.intervals.map((row, i) => `<button type="button" data-detected-from="${Number(row.from_s)}" data-detected-to="${Number(row.to_s)}"><strong>${safe(row.label || `Effort ${i + 1}`)}</strong><span>${elapsedLabel(row.from_s)}–${elapsedLabel(row.to_s)} · ${elapsedLabel(row.duration_s)}</span><small>${numberLabel(row.metrics?.watts?.average, ' W', 0)} avg · ${numberLabel(row.normalized_power_w, ' W', 0)} NP</small>${row.observation ? `<small>${safe(row.observation)}</small>` : ''}</button>`).join('')}</div><p class="helper">Boundaries come from the power trace; AI labels are interpretations. Select an effort to inspect its full-sample metrics.</p>`;
}
function setActivityPanel(panel) {
  analysis.activityPanel = panel;
  document.querySelectorAll('[data-activity-panel]').forEach((button) => {
    const selected = button.dataset.activityPanel === panel;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('[data-analysis-panel]').forEach((section) => { section.hidden = section.dataset.analysisPanel !== panel; });
  const traces = document.getElementById('activity-traces');
  const destination = document.getElementById(panel === 'intervals' ? 'interval-workbench-trace' : 'panel-analyze');
  if ((panel === 'analyze' || panel === 'intervals') && traces && destination && traces.parentElement !== destination) destination.append(traces);
  if (panel === 'intervals' && typeof paintIntervalWorkbench === 'function') paintIntervalWorkbench();
  if (panel === 'analyze' || panel === 'intervals') paintTrace();
}
function activityPowerMarkup(d) {
  const empirical = d.empirical_power_v1;
  const legacy = Object.entries(d.activity.power_curve || {}).filter(([seconds, watts]) => Number(seconds) > 0 && typeof watts === 'number' && Number.isFinite(watts) && watts >= 0).sort((a,b) => Number(a[0]) - Number(b[0]));
  const legacyMarkup = `<p class="helper">Saved curve values use an older calculation. Their handling of gaps and pauses, and the winning source intervals, have not been verified.${d.activity.device_watts !== true ? ' Power is estimated or its measurement source is unconfirmed.' : ''}</p>${legacy.length > 1 ? powerDurationChart(legacy.map(([seconds,watts]) => ({seconds:Number(seconds),watts}))) : ''}${tableMarkup(['Duration','Saved power'],legacy.map(([seconds,watts]) => [elapsedLabel(Number(seconds)),numberLabel(watts,' W')]),'No saved power curve.')}`;
  if (!empirical) {
    const reasons = {not_cycling:'This calculation currently supports cycling recordings.',power_source_unverified:'A confirmed power-meter recording is required.',recorded_power_unavailable:'Recorded power samples are unavailable.',stream_exceeds_calculation_limit:'This recording exceeds the current calculation limit.'};
    return `<h3>Saved power-duration curve</h3><p class="helper">${safe(reasons[d.empirical_power_unavailable_reason] || 'Source-linked power analysis has not been returned for this activity.')}</p>${legacyMarkup}`;
  }
  const points = (empirical.points || []).filter(point => Number.isFinite(point.average_w) && point.average_w >= 0 && point.duration_s > 0);
  const rows = points.map(point => [elapsedLabel(point.duration_s),numberLabel(point.average_w,' W',1),`${elapsedLabel(point.from_s)}–${elapsedLabel(point.to_s)}`,numberLabel(point.candidate_count),`<button type="button" class="record-link" data-power-from="${Number(point.from_s)}" data-power-to="${Number(point.to_s)}" data-power-watts="${Number(point.average_w)}">View source window →</button>`]);
  return `<div class="section-head"><h3>Recorded power-duration curve</h3><span>This activity</span></div><p class="helper">Best average power from consecutive one-second samples. Missing samples and known pauses break an effort; no power is filled in.</p>${points.length > 1 ? powerDurationChart(points.map(point => ({seconds:point.duration_s,watts:point.average_w}))) : points.length ? '<p class="helper">One eligible duration is available in the source table below.</p>' : '<div class="chart-empty"><strong>No continuous effort is available</strong><p>This recording needs consecutive one-second power samples. Sparse recordings and missing data cannot supply a continuous effort with this method.</p></div>'}${tableMarkup(['Duration','Average power','Source window','Eligible windows','Source trace'],rows,'No eligible source windows.')}<details class="data-disclosure"><summary>Calculation and source quality</summary><p class="helper">${numberLabel(empirical.eligible_duration_s,' s')} of accepted recorded power · ${numberLabel(empirical.excluded_sample_count)} excluded samples. Source windows use elapsed time and exclude the final boundary.</p><p class="helper">${empirical.quality === 'valid' ? 'Source metadata is available for this calculation.' : 'Source quality is limited. The source file hash or timer state may be unavailable; this view does not establish device or scientific validation.'}</p><p class="helper">Method: ${safe(empirical.algorithm_id)}. ${safe((empirical.flags || []).map(flag => flag.replaceAll('_',' ')).join('; '))}</p></details>${legacy.length ? `<details class="data-disclosure"><summary>Compare with the older saved curve</summary>${legacyMarkup}</details>` : ''}`;
}

function renderActivity() {
  analysis.segmentRequest = (analysis.segmentRequest || 0) + 1;
  const d = analysis.detail, a = d.activity;
  $('#drawer-title').textContent = a.name || title(a.sport_type) + ' activity';
  $('#drawer-kicker').textContent = `${state.athlete?.profile?.display_name || 'Athlete'} / ${title(a.strava_sport_type || a.sport_type)} / ${utcLabel(a.start_date)}`;
  const cells = [['Duration',elapsedLabel(a.duration_s)],['Distance',numberLabel(a.distance_m == null ? null : a.distance_m/1000,' km',2)],['TSS',numberLabel(a.raw_tss,'',1)],['Moving time',elapsedLabel(a.moving_s)],['Avg power',numberLabel(a.avg_power,' W')],['Weighted power¹',numberLabel(a.strava_weighted_avg_watts,' W')],['Avg heart rate',numberLabel(a.avg_hr,' bpm')],['Elevation gain',numberLabel(a.elevation_gain,' m')]];
  const extraCells = [['Max power',numberLabel(a.strava_max_watts,' W')],['Max heart rate',numberLabel(a.max_hr,' bpm')],['Avg cadence',numberLabel(a.avg_cadence,' rpm')],['Avg speed',numberLabel(a.avg_speed_ms == null ? null : a.avg_speed_ms*3.6,' km/h',1)],['Max speed',numberLabel(a.max_speed_ms == null ? null : a.max_speed_ms*3.6,' km/h',1)],['Calories',numberLabel(a.calories,' kcal')]];
  const tabs = [['analyze','Analyze'],['intervals','Intervals'],['power','Power'],['laps','Laps'],['execution','Execution'],['notes','Notes & history'],['ai','AI review']];
  const from = analysis.traceRange?.[0] ?? 0, to = analysis.traceRange?.[1] ?? d.stream_duration_s;
  $('#drawer-body').innerHTML = `<div class="activity-workspace"><aside class="activity-sidebar" aria-label="Workout summary"><section id="activity-summary"><h3>Workout summary</h3><p class="activity-meta">${safe(title(a.source))}${a.strava_device_name ? ' · ' + safe(a.strava_device_name) : ''} · ${safe(new Date(a.start_date).toLocaleTimeString(undefined,{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}))} UTC</p><dl class="activity-values summary-primary">${cells.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><section class="sidebar-selection" aria-label="Graph readings"><h4>Graph selection</h4><output id="trace-reading" aria-live="polite"><span>Move the cursor over the graph to see recorded values here.</span></output><div id="segment-result" aria-live="polite"><p class="helper">Drag over the graph to measure a range.</p></div></section><h4>Additional metrics</h4><dl class="activity-values summary-secondary">${extraCells.map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><details class="data-disclosure"><summary>Measurement sources</summary><p class="helper">${a.avg_power == null ? 'No average power recorded.' : a.device_watts === true ? 'Power recorded by a power meter.' : 'Power is estimated or its measurement source is unconfirmed.'} ¹ Weighted power is supplied by Strava. ${safe(activityLoadBasis(a))}</p></details></section><section class="sidebar-laps"><div class="section-head"><h3>Device laps</h3><span>${d.laps.length}</span></div>${d.laps.length ? `<div class="quick-laps">${d.laps.map((l,i) => `<button type="button" data-lap-from="${Number(l.start_s || 0)}" data-lap-to="${Math.min(d.stream_duration_s,Number(l.start_s || 0)+Number(l.elapsed_s || 0))}" ${!d.stream_samples ? 'disabled' : ''}><span>Lap ${i+1}</span><strong>${elapsedLabel(l.elapsed_s)}</strong><small>${numberLabel(l.avg_watts,' W')}</small></button>`).join('')}</div>` : '<p class="helper">No saved laps.</p>'}</section></aside><div class="activity-main"><div class="activity-chart-link"><button type="button" class="record-link" data-explore-athlete-charts>Explore athlete trends →</button></div><nav class="activity-jump" role="tablist" aria-label="Activity analysis">${tabs.map(([id,label])=>`<button type="button" role="tab" id="tab-${id}" data-activity-panel="${id}" aria-controls="panel-${id}" aria-selected="${analysis.activityPanel === id}">${label}</button>`).join('')}${analysis.activityBack ? `<button type="button" class="activity-back" data-back-activity="${safe(analysis.activityBack.id)}">← Previous activity</button>` : ''}</nav>
    <section id="panel-analyze" role="tabpanel" aria-labelledby="tab-analyze" data-analysis-panel="analyze"><div id="activity-traces"><div class="trace-toolbar"><div class="analysis-nav channel-toggles" role="group" aria-label="Visible trace tracks">${Object.keys(d.channels).filter((k)=>TRACE_LABELS[k]).map((k) => `<button type="button" data-trace="${k}" style="--channel:${TRACE_COLORS[k]}" aria-pressed="${analysis.traceVisible.includes(k)}">${TRACE_LABELS[k][0]}</button>`).join('')}</div><div class="trace-tools"><div class="trace-smoothing-controls"><div class="trace-display-presets" role="group" aria-label="Graph display"><button type="button" class="chart-smooth-button" data-trace-raw aria-pressed="${!analysis.traceSmoothing && !analysis.traceUltraSmooth}">Recorded</button><button type="button" class="chart-smooth-button" data-trace-smooth aria-pressed="${analysis.traceUltraSmooth}">${smoothIcon}<span>Ultra smooth</span></button></div><div class="trace-smoothing-slider"><label for="trace-smoothing">Display smoothing</label><input id="trace-smoothing" type="range" min="0" max="60" step="1" value="${analysis.traceSmoothing}" aria-describedby="trace-display-status" aria-valuetext="${analysis.traceSmoothing ? analysis.traceSmoothing + ' seconds' : 'Recorded values'}"><output id="trace-smoothing-value" for="trace-smoothing">${analysis.traceSmoothing ? analysis.traceSmoothing + ' s' : 'Off'}</output></div></div><div class="segmented-control" aria-label="Chart layout" role="group"><button type="button" data-trace-layout="overlay" aria-pressed="${analysis.traceLayout === 'overlay'}">Overlay</button><button type="button" data-trace-layout="stacked" aria-pressed="${analysis.traceLayout === 'stacked'}">Stacked</button></div>${a.strava_activity_id && (!d.stream_complete || !d.laps.length) ? '<button type="button" class="quiet" data-fetch-traces>Fetch missing detail</button>' : ''}</div><p id="trace-display-status" class="trace-display-status" role="status">${traceDisplayLabel()}</p></div><p id="trace-fetch-status" role="status"></p><div class="trace-workbench"><div class="trace-canvas"><div id="activity-trace"></div><section id="activity-route" class="activity-route" aria-label="Activity route">${activityRouteMarkup()}</section><details class="trace-method"><summary>About this chart</summary><p class="helper">Overlay channels use independent scales shown in the legend. Ultra smooth uses a 60-second centered display average with a curve that cannot overshoot its displayed points. Cursor readings, exports and segment statistics stay raw. Elevation sits below the main channels. Missing data stays blank. Inspection uses up to 800 aligned samples; segment calculations use the full stored trace.</p></details></div><aside class="segment-panel" aria-label="Selected interval"><h3>Interval selection</h3><p class="helper">Drag between two points on the chart, or enter elapsed seconds.</p>${d.stream_samples ? `<form id="segment-form"><div class="segment-inputs"><div><label for="segment-from">Start (seconds)</label><input id="segment-from" type="number" min="0" step="any" required value="${from}"></div><div><label for="segment-to">End (seconds)</label><input id="segment-to" type="number" min="0" max="${d.stream_duration_s}" step="any" required value="${to}"></div></div><button type="submit" class="primary full">Analyze interval</button></form><div class="trace-presets" role="group" aria-label="Quick time ranges"><button type="button" class="quiet" data-segment-preset="all">Full</button><button type="button" class="quiet" data-segment-preset="first">First half</button><button type="button" class="quiet" data-segment-preset="second">Second half</button></div><div class="detected-intervals"><div class="section-head"><h4>AI interval detection</h4></div><p class="helper">Find sustained power efforts and label them from recorded data.</p><button type="button" class="secondary full" data-detect-intervals ${!d.channels.watts?.length ? 'disabled' : ''}>Detect intervals</button><div id="detected-intervals-result" aria-live="polite">${detectedIntervalsMarkup()}</div></div>` : '<p class="helper">No stored traces for this activity.</p>'}</aside></div></div></section>
    <section id="panel-intervals" role="tabpanel" aria-labelledby="tab-intervals" data-analysis-panel="intervals" hidden>${typeof intervalWorkbenchMarkup === 'function' ? intervalWorkbenchMarkup() : ''}</section>
    <section id="panel-power" role="tabpanel" aria-labelledby="tab-power" data-analysis-panel="power" hidden><div class="power-review-grid"><section>${activityPowerMarkup(d)}</section><section id="activity-power-hr"><h3>Power and heart rate</h3>${powerHrMarkup(d)}</section></div></section>
    <section id="panel-laps" role="tabpanel" aria-labelledby="tab-laps" data-analysis-panel="laps" hidden><div id="activity-laps"><h3>Laps & intervals</h3>${lapMarkup(d)}</div></section>
    <section id="panel-execution" role="tabpanel" aria-labelledby="tab-execution" data-analysis-panel="execution" hidden><section id="activity-execution"><h3>Planned versus recorded</h3>${plannedComparison(d)}</section></section>
    <section id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" data-analysis-panel="notes" hidden><div class="activity-notes-grid"><section><h3>Athlete feedback</h3><p>Feeling (1–5): ${safe(a.feeling == null ? 'Not recorded' : title(a.feeling))}</p><p class="preserve-lines">${safe(a.athlete_comment || 'No athlete comment recorded.')}</p>${a.strava_description ? `<h3>Activity notes</h3><p class="preserve-lines">${safe(a.strava_description)}</p>` : ''}${a.ai_insight ? `<details class="data-disclosure"><summary>Saved AI interpretation</summary><p class="preserve-lines">${safe(typeof a.ai_insight === 'string' ? a.ai_insight : JSON.stringify(a.ai_insight))}</p></details>` : ''}</section>${comparableMarkup(d)}</div></section><section id="panel-ai" role="tabpanel" aria-labelledby="tab-ai" data-analysis-panel="ai" hidden><section id="activity-ai"><div class="ai-review-heading"><div><p class="eyebrow">RECORDED WORKOUT / COACH REVIEW</p><h3>Ride at a glance</h3><p>Clear measurements first, with a short AI interpretation when you ask for it.</p></div><button type="button" class="primary" data-ai-activity>${analysis.aiReport ? 'Refresh AI notes' : 'Generate AI notes'}</button></div>${aiReviewMeasurements(d)}<div class="ai-review-notes-head"><h3>Coach notes</h3><span>Generated on demand · Athlete sharing permission required</span></div><div id="activity-ai-result" aria-live="polite">${aiReportMarkup()}</div></section></section></div></div>`;
  const workspace = document.querySelector('.activity-workspace');
  const summary = document.querySelector('#activity-summary');
  const band = document.createElement('section');
  band.className = 'activity-metric-band';
  band.setAttribute('aria-label', 'Recorded workout measures');
  band.append(summary.querySelector('.activity-meta'), summary.querySelector('.summary-primary'));
  workspace.before(band);
  const inspector = document.querySelector('.segment-panel');
  inspector.prepend(document.querySelector('.sidebar-selection'));
  const detail = document.createElement('details');
  detail.className = 'activity-record-details';
  detail.innerHTML = '<summary>More measurements & device laps</summary>';
  detail.append(document.querySelector('.activity-sidebar'));
  workspace.after(detail);
  setActivityPanel(analysis.activityPanel);
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
function traceDisplayLabel() {
  return analysis.traceUltraSmooth ? 'Ultra smooth · 60-second display average. Readings and interval statistics stay recorded.' : analysis.traceSmoothing ? `${analysis.traceSmoothing}-second display average. Readings and interval statistics stay recorded.` : 'Recorded trace · no display smoothing.';
}
function setTraceDisplay(seconds, ultra) {
  analysis.traceSmoothing = seconds; analysis.traceUltraSmooth = ultra;
  const slider = $('#trace-smoothing');
  if (slider) { slider.value = seconds; slider.setAttribute('aria-valuetext',seconds ? `${seconds} seconds` : 'Recorded values'); }
  $('#trace-smoothing-value').textContent = seconds ? `${seconds} s` : 'Off';
  $('[data-trace-smooth]').setAttribute('aria-pressed',String(ultra));
  $('[data-trace-raw]').setAttribute('aria-pressed',String(!seconds && !ultra));
  $('#trace-display-status').textContent = traceDisplayLabel();
  paintTrace();
}
function toggleChartSmoothing() {
  analysis.chartSmooth = !analysis.chartSmooth;
  document.querySelectorAll('[data-chart-smooth]').forEach((button) => {
    button.setAttribute('aria-pressed',String(analysis.chartSmooth));
    button.nextElementSibling.textContent = analysis.chartSmooth ? 'Smooth curve · recorded values unchanged' : 'Recorded points · straight lines';
    const frame = button.parentElement.nextElementSibling, model = JSON.parse(frame.dataset.chartModel);
    model.smooth = analysis.chartSmooth; frame.dataset.chartModel = JSON.stringify(model);
    const template = document.createElement('template');
    template.innerHTML = dataChart(model.series,model.label,model.unit,model.maxGap ?? Infinity,model.xBounds,null,model.compact,model.smooth,frame.querySelector('svg').viewBox.baseVal.width);
    frame.querySelector('svg').replaceWith(template.content.querySelector('[data-chart-model] > svg'));
    if (frame.dataset.inspectedIndex != null) inspectChart(frame,Number(frame.dataset.inspectedIndex));
  });
}
function elevationChartMarkup(points,bounds) {
  const width = Math.max(240,($('#activity-trace')?.clientWidth || 800)-2), height = 146, left = 58, right = width-18, bottom = 112;
  const visible = points.filter(([t]) => t>=bounds[0] && t<=bounds[1]), values = visible.filter((p)=>Number.isFinite(p[1])).map((p)=>p[1]);
  if (!values.length) return '<section class="elevation-track"><h4>Elevation <small>m</small></h4><p class="helper">No elevation recorded in this interval.</p></section>';
  const low = Math.floor(Math.min(...values)/10)*10, high = Math.max(low+10,Math.ceil(Math.max(...values)/10)*10);
  const x = (time)=>left+(time-bounds[0])/(bounds[1]-bounds[0] || 1)*(right-left), y = (value)=>bottom-(value-low)/(high-low)*82;
  const path = chartLinePath(visible,x,y,analysis.traceUltraSmooth);
  return `<section class="elevation-track"><h4>Elevation <small>m · separate scale</small></h4><svg class="data-chart" data-responsive-chart data-chart-left="58" data-chart-right="18" viewBox="0 0 ${width} ${height}" role="img" aria-label="Elevation below the data graph, ${low} to ${high} meters. Uses the same elapsed-time selection."><title>Elevation profile</title>${[low,high].map((v)=>`<text x="50" y="${y(v)+4}" text-anchor="end">${numberLabel(v)}</text><line class="chart-gridline" x1="58" x2="${right}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}<path d="${path}" fill="none" stroke="#718579" stroke-width="1.6" vector-effect="non-scaling-stroke"/><line class="trace-cursor" x1="58" x2="58" y1="26" y2="112" stroke="#53637c" stroke-dasharray="3 3"/>${[0,.5,1].map((f)=>`<text data-chart-tick x="${left+f*(right-left)}" y="140" text-anchor="${f===0?'start':f===1?'end':'middle'}">${elapsedLabel(bounds[0]+f*(bounds[1]-bounds[0]))}</text>`).join('')}</svg></section>`;
}
function routeGeometry(width,height) {
  const route = analysis.route, range = route.focus ? analysis.traceRange : null;
  const key = `${width}:${height}:${range?.join(':') || 'full'}`;
  if (route.geometry?.key !== key) {
    const model = routeMapModel(route.points,width,height,range);
    const spans = []; let span = null;
    for (const p of model?.points || []) { if (!p) { span=null; continue; } if (!span) {span=[p[0],p[0]];spans.push(span);} else span[1]=p[0]; }
    route.geometry = {key,model,valid:model?.points.filter(Boolean) || [],spans};
  }
  return route.geometry;
}
function activityRouteMarkup() {
  const route = analysis.route;
  if (!route) return `<div class="route-heading"><div><h4>Activity route</h4><p>See where a graph selection happened on the ride.</p></div><button type="button" class="secondary" data-load-route>Show route</button></div><p class="helper">GPS activities from a connected Strava account. The route is drawn privately in this workspace.</p>`;
  if (route.loading) return '<p role="status" class="helper">Loading the GPS route…</p>';
  if (route.error) return `<div class="route-heading"><div><h4>Activity route</h4><p role="status">${safe(route.error)}</p></div><button type="button" class="secondary" data-load-route>Try again</button></div>`;
  if (!route.points?.filter(Boolean).length) return `<div class="route-heading"><div><h4>Activity route</h4><p>${safe(route.message || 'No GPS route is available for this activity. Indoor rides and privacy-hidden routes may have no coordinates.')}</p></div></div>`;
  const width = Math.max(160,($('#activity-route')?.clientWidth || 760)-(innerWidth >= 1280 || innerWidth < 768 ? 26 : 34)), height = innerWidth >= 1280 ? 210 : innerWidth < 768 ? 240 : 280;
  const range = analysis.traceRange, model = routeGeometry(width,height).model;
  if (!model) return '<p class="helper">No GPS points in this interval.</p><button type="button" class="secondary" data-route-focus>Show full route</button>';
  const valid = model.points.filter(Boolean), start = valid[0], end = valid.at(-1);
  const selection = range ? routePath(routeSelectionPoints(model.points,...range)) : '';
  const marker = (p,label,kind) => `<g class="route-endpoint ${kind}"><circle cx="${p[1]}" cy="${p[2]}" r="8"/><text x="${p[1]}" y="${p[2]+3.5}" text-anchor="middle">${label}</text></g>`;
  return `<div class="route-heading"><div><h4>Activity route</h4><p id="route-selection-label">${range ? `Selected ${elapsedLabel(range[0])}–${elapsedLabel(range[1])}` : 'Full route · select an interval on the graph'}</p></div><button type="button" class="secondary" data-route-focus aria-pressed="${Boolean(route.focus && range)}" ${range ? '' : 'disabled'}>${route.focus && range ? 'Show full route' : 'Fit selection'}</button></div><div class="route-map-canvas"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="GPS route. Start is S, finish is F. The selected graph interval is highlighted in orange. The blue dot follows the graph cursor."><title>Activity GPS route and selected interval</title>${Array.from({length:Math.ceil(width/60)},(_,i)=>`<line class="route-map-grid" x1="${i*60}" x2="${i*60}" y1="0" y2="${height}"/>`).join('')}${[60,120,180,240].map((v)=>`<line class="route-map-grid" x1="0" x2="${width}" y1="${v}" y2="${v}"/>`).join('')}<path class="route-outline" d="${routePath(model.points)}"/><path class="route-line" d="${routePath(model.points)}"/><path class="route-selection-line" d="${selection}"/>${marker(start,'S','is-start')}${marker(end,'F','is-finish')}<circle class="route-cursor-halo" r="9" hidden/><circle class="route-cursor" r="4" hidden/><text class="route-north" x="${width-24}" y="24" text-anchor="end">N ↑</text><g class="route-scale" transform="translate(18,${height-22})"><path d="M0,-4V0H${model.scalePixels.toFixed(1)}V-4"/><text x="0" y="-9">${model.meters >= 1000 ? numberLabel(model.meters/1000,' km',1) : numberLabel(model.meters,' m')}</text></g></svg></div><div class="route-key"><span><i class="route-key-full"></i>Full route</span><span><i class="route-key-selection"></i>Selected interval</span><span><i class="route-key-cursor"></i>Graph cursor</span></div><p class="route-method">GPS route outline, north up. Gaps stay blank. No street-map service receives your location.</p>`;
}
function paintActivityRoute() {
  const root = $('#activity-route'); if (!root) return;
  const focused = root.contains(document.activeElement) && document.activeElement.hasAttribute('data-route-focus');
  delete root.dataset.routeSelection;
  root.innerHTML = activityRouteMarkup(); paintRouteSelection();
  if (focused) root.querySelector('[data-route-focus]')?.focus({preventScroll:true});
}
function paintRouteSelection() {
  const root = $('#activity-route'), route = analysis.route;
  if (!root || !route?.points?.length || !root.querySelector('svg')) return;
  const svg = root.querySelector('svg'), {width,height} = svg.viewBox.baseVal;
  const range = analysis.traceDrag ? [Math.min(analysis.traceDrag.start,analysis.traceDrag.current),Math.max(analysis.traceDrag.start,analysis.traceDrag.current)] : analysis.traceSelection || analysis.traceRange;
  const geometry = routeGeometry(width,height), model = geometry.model;
  if (!model) return;
  const selectionKey = range?.join(':') || 'full';
  if (root.dataset.routeSelection !== selectionKey) {
    root.dataset.routeSelection = selectionKey;
    root.querySelector('.route-selection-line').setAttribute('d',range ? routePath(routeSelectionPoints(model.points,...range)) : '');
    root.querySelector('#route-selection-label').textContent = range ? `Selected ${elapsedLabel(range[0])}–${elapsedLabel(range[1])}` : 'Full route · select an interval on the graph';
  }
  const time = analysis.traceCursor, points = geometry.valid;
  let left=0,right=points.length-1;
  while (left<right) { const middle=Math.floor((left+right)/2); if (points[middle][0]<time) left=middle+1; else right=middle; }
  const point = time == null ? null : left && Math.abs(points[left-1][0]-time)<Math.abs(points[left][0]-time) ? points[left-1] : points[left];
  for (const dot of root.querySelectorAll('.route-cursor,.route-cursor-halo')) {
    const visible = point && Math.abs(point[0]-time)<=30 && geometry.spans.some(([from,to])=>time>=from && time<=to);
    dot.toggleAttribute('hidden',!visible);
    if (visible) { dot.setAttribute('cx',point[1]); dot.setAttribute('cy',point[2]); }
  }
}
async function loadActivityRoute() {
  if (!analysis.detail) return;
  const request = ++analysis.routeRequest, activity = analysis.detail.activity.id;
  analysis.route = {loading:true}; paintActivityRoute();
  try {
    const route = await portal('activity_route',{athlete_id:state.athleteId,activity_id:activity});
    if (request !== analysis.routeRequest || activity !== analysis.detail?.activity.id || !$('#activity-route')) return;
    analysis.route = route;
  } catch (error) {
    if (request !== analysis.routeRequest || activity !== analysis.detail?.activity.id || !$('#activity-route')) return;
    analysis.route = {error:error.message};
  }
  paintActivityRoute();
  const root = $('#activity-route');
  if (root) { root.tabIndex = -1; root.focus({preventScroll:true}); }
}

function overlayTraceChart(keys, bounds) {
  const width = Math.max(250,($('#activity-trace')?.clientWidth || 900)-2), height = 420, right = width-18, bottom = height-32;
  const x = (t) => 58+(t-bounds[0])/(bounds[1]-bounds[0] || 1)*(right-58);
  const channels = keys.map((key) => {
    const raw = analysis.detail.channels[key].map(([t,v])=>[t,displayTraceValue(key,v)]);
    const points = (key === 'distance_m' ? raw : smoothTracePoints(raw,analysis.traceSmoothing)).filter(([t])=>t>=bounds[0] && t<=bounds[1]);
    const values = points.map((p)=>p[1]).filter((v)=>v != null && Number.isFinite(v));
    const min = Math.min(0,...values), max = Math.max(1,...values);
    return {key,points,min,max};
  });
  const paths = channels.map(({key,points,min,max})=>{
    const path=chartLinePath(points,x,(v)=>bottom-(v-min)/(max-min)*(bottom-22),analysis.traceUltraSmooth);
    return `<path d="${path}" fill="none" stroke="${TRACE_COLORS[key]}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  return `<div class="overlay-scales">${channels.map(({key,min,max})=>`<span style="--channel:${TRACE_COLORS[key]}"><i></i>${TRACE_LABELS[key][0]} <strong>${numberLabel(min)}–${numberLabel(max)} ${TRACE_LABELS[key][1]}</strong></span>`).join('')}</div><div class="overlay-scale-note">Each channel uses its own range · vertical axis shows percent of that range</div><div class="chart-frame"><svg class="data-chart overlay-chart" data-responsive-chart data-chart-left="58" data-chart-right="18" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorded channels over elapsed time, independently scaled from zero to one hundred percent of each channel's range. Drag from a start point to an end point to analyze an interval."><title>Recorded workout channels</title>${[0,.25,.5,.75,1].map((n)=>`<line x1="58" x2="${right}" y1="${22+n*(bottom-22)}" y2="${22+n*(bottom-22)}" stroke="#e1e6ed"/><text x="50" y="${27+n*(bottom-22)}" text-anchor="end">${Math.round((1-n)*100)}%</text>`).join('')}${paths}<line class="trace-cursor" x1="58" x2="58" y1="22" y2="${bottom}" stroke="#53637c" stroke-dasharray="3 3"/>${(width > 500 ? [0,.25,.5,.75,1] : [0,1]).map((n)=>`<text data-chart-tick x="${58+n*(right-58)}" y="${height-8}" text-anchor="${n===0?'start':n===1?'end':'middle'}">${elapsedLabel(bounds[0]+n*(bounds[1]-bounds[0]))}</text>`).join('')}</svg></div>`;
}
function paintTrace() {
  const d = analysis.detail, keys = analysis.traceVisible.filter((key) => key !== 'altitude_m' && d.channels[key]?.length), samples = d.cursor_samples || [];
  const bounds = analysis.traceRange || [0, d.stream_duration_s || Math.max(...keys.map((key) => d.channels[key].at(-1)?.[0] || 0))];
  const colors = TRACE_COLORS;
  $('#activity-trace').innerHTML = keys.length || analysis.traceVisible.includes('altitude_m') && d.channels.altitude_m?.length ? `<div class="trace-range-heading"><strong>${analysis.traceRange ? 'Focused: ' + elapsedLabel(bounds[0]) + '–' + elapsedLabel(bounds[1]) + ' · ' + elapsedLabel(bounds[1]-bounds[0]) : 'Full recorded activity'}</strong>${analysis.traceRange ? '<button type="button" class="secondary" data-reset-trace>Reset chart</button>' : ''}</div><output id="trace-selection-preview" class="trace-selection-preview">Drag across a chart to select a range.</output><div class="trace-stack ${analysis.traceLayout === 'overlay' ? 'is-overlay' : ''}">${!keys.length ? '' : analysis.traceLayout === 'overlay' ? overlayTraceChart(keys,bounds) : keys.map((key) => { const points = d.channels[key].map(([t,v]) => [t,displayTraceValue(key,v)]); return `<section class="trace-track"><h4>${TRACE_LABELS[key][0]} <small>(${TRACE_LABELS[key][1]})</small></h4>${dataChart([{name:TRACE_LABELS[key][0],color:colors[key],points:key === 'distance_m' ? points : smoothTracePoints(points,analysis.traceSmoothing)}],TRACE_LABELS[key][0],TRACE_LABELS[key][1],Infinity,bounds,samples[0]?.time_s ?? 0,false,analysis.traceUltraSmooth)}</section>`; }).join('')}</div>${analysis.traceVisible.includes('altitude_m') && d.channels.altitude_m?.length ? elevationChartMarkup(d.channels.altitude_m,bounds) : ''}${samples.length ? `<div class="trace-inspector"><label for="trace-position">Cursor · elapsed time <output id="trace-position-time" for="trace-position"></output></label><input id="trace-position" type="range" min="0" max="${samples.length-1}" value="0" step="1"><button type="button" class="secondary" data-export-trace>Export samples (CSV)</button></div>${typeof intervalWorkbenchTraceControls === 'function' ? intervalWorkbenchTraceControls() : ''}` : ''}` : '<div class="chart-empty">No recorded trace available.</div>';
  if (samples.length) {
    const center = analysis.traceCursor != null && analysis.traceCursor >= bounds[0] && analysis.traceCursor <= bounds[1] ? analysis.traceCursor : analysis.traceRange ? (bounds[0] + bounds[1]) / 2 : samples[0].time_s;
    let index = 0; for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].time_s-center) < Math.abs(samples[index].time_s-center)) index = i;
    $('#trace-position').value = index; readTrace(index);
  }
  paintActivityRoute();
  if (typeof paintIntervalTraceMarkers === 'function') paintIntervalTraceMarkers();
  paintTraceBrush();
}
function readTrace(index) {
  const sample = analysis.detail?.cursor_samples?.[index], output = $('#trace-reading');
  if (!sample || !output) return;
  analysis.traceCursor = sample.time_s; paintRouteSelection();
  $('#trace-position')?.setAttribute('aria-valuetext',elapsedLabel(sample.time_s) + ' elapsed');
  if ($('#trace-position-time')) $('#trace-position-time').textContent = elapsedLabel(sample.time_s);
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
  paintRouteSelection();
  const drag = analysis.traceDrag || (analysis.traceSelection ? {start:analysis.traceSelection[0],current:analysis.traceSelection[1],bounds:analysis.traceRange || [0,analysis.detail.stream_duration_s]} : null), output = $('#trace-selection-preview');
  $('#activity-trace')?.querySelectorAll('.trace-brush-overlay').forEach((node) => node.remove());
  if (!drag) { if (output) output.textContent = 'Drag across a chart to select a range.'; return; }
  const from = Math.min(drag.start,drag.current), to = Math.max(drag.start,drag.current);
  if (output) output.textContent = `Selecting ${elapsedLabel(Math.floor(from))}–${elapsedLabel(Math.ceil(to))} (${elapsedLabel(Math.ceil(to)-Math.floor(from))})`;
  const ns = 'http://www.w3.org/2000/svg';
  $('#activity-trace').querySelectorAll('svg').forEach((svg) => {
    const width = svg.viewBox.baseVal.width, bounds = drag.bounds;
    const x = (time) => 58 + (Math.max(bounds[0],Math.min(bounds[1],time))-bounds[0])/(bounds[1]-bounds[0] || 1)*(width-76);
    const group = document.createElementNS(ns,'g'); group.setAttribute('class','trace-brush-overlay'); group.setAttribute('pointer-events','none');
    const rect = document.createElementNS(ns,'rect'); rect.setAttribute('x',x(from)); rect.setAttribute('y','22'); rect.setAttribute('width',Math.max(1,x(to)-x(from))); rect.setAttribute('height',String(svg.viewBox.baseVal.height-54)); group.append(rect);
    [from,to].forEach((time) => { const line = document.createElementNS(ns,'line'); line.setAttribute('x1',x(time)); line.setAttribute('x2',x(time)); line.setAttribute('y1','22'); line.setAttribute('y2',String(svg.viewBox.baseVal.height-32)); group.append(line); });
    svg.append(group);
  });
}
function focusRecordedPowerWindow(from, to, watts) {
  const duration = analysis.detail?.stream_duration_s;
  const end = Number.isFinite(duration) ? Math.min(to, duration) : to;
  if (![from, to, watts, end].every(Number.isFinite) || from < 0 || end <= from) return false;
  analysis.segmentRequest = (analysis.segmentRequest || 0) + 1;
  analysis.traceSelection = null; analysis.traceRange = [from, end];
  setActivityPanel('analyze');
  if ($('#segment-from')) $('#segment-from').value = from;
  if ($('#segment-to')) $('#segment-to').value = end;
  if ($('#segment-result')) $('#segment-result').innerHTML = `<p>Recorded source effort: <strong>${numberLabel(watts, ' W', 1)}</strong> over ${elapsedLabel(from)}–${elapsedLabel(to)} (end exclusive). This recorded-sample average comes from the power curve. The interval controls are set to this focused span and run a separate elapsed-time calculation.${to > end ? ` The effort includes the final recorded second; the editable trace ends at ${elapsedLabel(end)}, so a recalculated average can differ.` : ''}</p>`;
  $('#tab-analyze')?.focus();
  return true;
}
async function analyzeSegment() {
  const from = Number($('#segment-from').value), to = Number($('#segment-to').value), d = analysis.detail, request = analysis.detailRequest;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > d.stream_duration_s) { $('#segment-result').innerHTML = '<p class="form-error" role="alert">Choose an end after the start, within the recorded trace.</p>'; return; }
  const segmentRequest = (analysis.segmentRequest || 0) + 1; analysis.segmentRequest = segmentRequest;
  analysis.traceSelection = null; analysis.traceRange = from === 0 && to === d.stream_duration_s ? null : [from,to]; paintTrace();
  $('#segment-result').textContent = 'Calculating from stored samples…';
  try { const result = await portal('activity_segment',{athlete_id:state.athleteId,activity_id:d.activity.id,from_s:from,to_s:to}); if (request !== analysis.detailRequest || segmentRequest !== analysis.segmentRequest || !$('#segment-result')) return;
    $('#segment-result').innerHTML = `<h4>${elapsedLabel(from)} – ${elapsedLabel(to)}</h4><p class="helper">Time-weighted average / maximum</p><dl class="segment-metrics">${result.segment.metrics.watts ? `<div><dt>Normalized power</dt><dd><strong>${numberLabel(result.segment.normalized_power_w,' W',1)}</strong><small>30-second rolling power</small></dd></div>` : ''}${Object.entries(result.segment.metrics).filter(([key])=>TRACE_LABELS[key]).map(([key,m])=>`<div><dt>${TRACE_LABELS[key][0]}</dt><dd><strong>${numberLabel(displayTraceValue(key,m.average),' '+TRACE_LABELS[key][1],1)}</strong><span>max ${numberLabel(displayTraceValue(key,m.maximum),' '+TRACE_LABELS[key][1],1)}</span><small>${numberLabel(m.coverage_s,' s',1)} recorded / ${numberLabel(to-from,' s',1)}</small></dd></div>`).join('')}</dl>`;
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
// Validate before changing the applied range or fetching data, so invalid edits keep the current results.
function analysisDateError(range, required = false) {
  for (const key of ['from', 'to']) {
    const value = range[key];
    if (!value) { if (required) return { field: key, message: `Choose a ${key === 'from' ? 'start' : 'end'} date.` }; continue; }
    const parsed = Date.parse(value + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10) !== value) return { field: key, message: 'Enter a valid calendar date.' };
  }
  if (range.from && range.to) {
    const days = (Date.parse(range.to)-Date.parse(range.from))/86400000+1;
    if (days < 1) return { field: 'to', message: 'Choose an end date on or after the start date.' };
    if (required && days > 366) return { field: 'to', message: 'Choose a range of up to 366 days to compare training.' };
  }
  return null;
}
function validateAnalysisDates(form, focus = false, blurredField = null) {
  const required = form.id === 'trend-filter';
  const range = { from: form.elements.from.value, to: form.elements.to.value };
  const invalidDate = (blurredField ? [blurredField] : ['from','to']).find(key => form.elements[key].validity.badInput);
  const missingBlurred = required && blurredField && !range[blurredField];
  const error = invalidDate ? { field: invalidDate, message: 'Enter a complete calendar date.' } : missingBlurred ? { field: blurredField, message: `Choose a ${blurredField === 'from' ? 'start' : 'end'} date.` } : analysisDateError(range, required && (!blurredField || Boolean(range.from && range.to)));
  const errorNode = form.nextElementSibling;
  for (const key of ['from','to']) form.elements[key].removeAttribute('aria-invalid');
  if (error) { const field = form.elements[error.field]; if (focus) field.focus(); field.setAttribute('aria-invalid','true'); }
  if (errorNode) errorNode.textContent = error?.message || '';
  return !error;
}
function analysisDateForm(target) { return target.matches?.('input[type="date"]') ? target.closest('#history-filter, #trend-filter') : null; }
document.addEventListener('focusout', event => { const form = analysisDateForm(event.target); if (form) validateAnalysisDates(form, false, event.target.name); });
for (const eventName of ['focusin', 'input']) document.addEventListener(eventName, event => {
  const form = analysisDateForm(event.target); if (!form) return;
  for (const key of ['from','to']) form.elements[key].removeAttribute('aria-invalid');
  if (form.nextElementSibling) form.nextElementSibling.textContent = '';
});
document.addEventListener('submit', (event) => {
  if (event.target.id === 'history-filter') { event.preventDefault(); if (!validateAnalysisDates(event.target, true)) return; analysis.filters = {...Object.fromEntries(new FormData(event.target)),page:0}; analysis.filters.search = analysis.filters.search.trim(); loadHistory(); }
  if (event.target.id === 'trend-filter') { event.preventDefault(); if (!validateAnalysisDates(event.target, true)) return; analysis.range = Object.fromEntries(new FormData(event.target)); loadTrends(); }
  if (event.target.id === 'segment-form') { event.preventDefault(); analyzeSegment(); }
});
document.addEventListener('click', (event) => {
  const el = event.target.closest('button'); if (!el) return;
  if (el.hasAttribute('data-chart-smooth')) { toggleChartSmoothing(); return; }
  if (el.hasAttribute('data-trace-smooth')) { if (!analysis.traceUltraSmooth) analysis.traceSmoothingBeforeUltra = analysis.traceSmoothing; setTraceDisplay(analysis.traceUltraSmooth ? analysis.traceSmoothingBeforeUltra : 60,!analysis.traceUltraSmooth); return; }
  if (el.hasAttribute('data-trace-raw')) { setTraceDisplay(0,false); return; }
  if (el.hasAttribute('data-load-route')) { loadActivityRoute(); return; }
  if (el.hasAttribute('data-route-focus')) { analysis.route.focus = !analysis.route.focus; paintActivityRoute(); return; }
  if (el.dataset.loadSeries) { analysis.loadVisible[el.dataset.loadSeries] = !analysis.loadVisible[el.dataset.loadSeries]; analysis.tab === 'review' ? paintReview() : paintTrends(); $(`[data-load-series="${el.dataset.loadSeries}"]`)?.focus(); return; }
  if (el.hasAttribute('data-load-projection')) { analysis.showProjection = !analysis.showProjection; analysis.tab === 'review' ? paintReview() : paintTrends(); $('[data-load-projection]')?.focus(); return; }
  if (el.dataset.analysisTab) { analysis.tab = el.dataset.analysisTab; renderAthlete(); $(`[data-analysis-tab="${analysis.tab}"]`).focus(); }
  if (el.dataset.activity) { analysis.activityBack = el.closest('#activity-comparison') && analysis.detail ? {id:analysis.detail.activity.id,name:analysis.detail.activity.name || 'Previous activity'} : null; el.focus(); openActivity(el.dataset.activity); }
  if (el.dataset.backActivity) { const id = el.dataset.backActivity; analysis.activityBack = null; openActivity(id); }
  if (el.hasAttribute('data-explore-athlete-charts')) { closeDrawer(); state.athleteSection = 'analysis'; analysis.tab = 'charts'; renderAthlete(); $('[data-analysis-tab="charts"]')?.focus(); }
  if (el.hasAttribute('data-power-from')) {
    focusRecordedPowerWindow(Number(el.dataset.powerFrom), Number(el.dataset.powerTo), Number(el.dataset.powerWatts));
  }
  if (el.dataset.activityPanel) setActivityPanel(el.dataset.activityPanel);
  if (el.dataset.traceLayout) { analysis.traceLayout = el.dataset.traceLayout; document.querySelectorAll('[data-trace-layout]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.traceLayout === analysis.traceLayout))); paintTrace(); }
  if (el.dataset.analysisRetry === 'history') loadHistory();
  if (el.dataset.analysisRetry === 'trends' || el.dataset.analysisRetry === 'charts') loadTrends();
  if (el.dataset.analysisRetry === 'review' || el.hasAttribute('data-review-refresh')) loadTrends();
  if (el.hasAttribute('data-history-page')) { analysis.filters.page = Math.max(0,analysis.filters.page+Number(el.dataset.historyPage)); loadHistory(); }
  if (el.hasAttribute('data-clear-history')) { analysis.filters = {search:'',sport:'',from:'',to:'',page:0}; loadHistory().then(() => $('#history-search')?.focus()); }
  if (el.dataset.analysisDays) { const to = utcDay(new Date()); analysis.range = {to,from:shiftUTC(to,1-Number(el.dataset.analysisDays))}; loadTrends(); }
  if (el.dataset.drillWeek) { analysis.filters = {search:'',sport:'',from:el.dataset.drillWeek < analysis.range.from ? analysis.range.from : el.dataset.drillWeek,to:shiftUTC(el.dataset.drillWeek,6) > analysis.range.to ? analysis.range.to : shiftUTC(el.dataset.drillWeek,6),page:0}; analysis.tab = 'history'; analysis.history = null; renderAthlete(); $('#history-from').focus(); }
  if (el.dataset.recovery) { analysis.recovery = el.dataset.recovery; paintTrends(); $(`[data-recovery="${analysis.recovery}"]`).focus(); }
  if (el.dataset.trace) { const key = el.dataset.trace, visible = analysis.traceVisible; if (visible.includes(key) && visible.length > 1) analysis.traceVisible = visible.filter((k) => k !== key); else if (!visible.includes(key)) analysis.traceVisible = [...visible,key]; document.querySelectorAll('[data-trace]').forEach((b) => b.setAttribute('aria-pressed',analysis.traceVisible.includes(b.dataset.trace))); paintTrace(); }
  if (el.hasAttribute('data-lap-from')) { $('#segment-from').value = el.dataset.lapFrom; $('#segment-to').value = el.dataset.lapTo; setActivityPanel('analyze'); analyzeSegment(); $('#segment-from').focus({preventScroll:true}); }
  if (el.hasAttribute('data-link-activity')) linkActivity(el.dataset.linkActivity, el);
  if (el.hasAttribute('data-refresh-assessment')) refreshActivityAssessment(el);
  if (el.dataset.segmentPreset && analysis.detail?.stream_duration_s) { const max = analysis.detail.stream_duration_s, half = max/2; $('#segment-from').value = el.dataset.segmentPreset === 'second' ? half : 0; $('#segment-to').value = el.dataset.segmentPreset === 'first' ? half : max; analyzeSegment(); }
  if (el.hasAttribute('data-reset-trace')) { analysis.traceSelection = null; analysis.traceRange = null; analysis.segmentRequest++; $('#segment-from').value = 0; $('#segment-to').value = analysis.detail.stream_duration_s; $('#segment-result').textContent = ''; paintTrace(); }
  if (el.hasAttribute('data-ai-activity')) analyzeActivityAI(el);
  if (el.hasAttribute('data-detect-intervals')) detectActivityIntervals(el);
  if (el.hasAttribute('data-detected-from')) { $('#segment-from').value = el.dataset.detectedFrom; $('#segment-to').value = el.dataset.detectedTo; setActivityPanel('analyze'); analyzeSegment(); }
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
document.addEventListener('input', (event) => { if (event.target.id === 'trace-position') readTrace(Number(event.target.value)); if (event.target.id === 'trace-smoothing') setTraceDisplay(Number(event.target.value),false); if (event.target.closest('#segment-form, #activity-trace')) state.editorDirty = false; if (event.target.closest('#trend-filter')) $('#range-error').textContent = ''; });
document.addEventListener('change', (event) => {
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
  if (position.x < 58 || position.x > svg.viewBox.baseVal.width-18 || position.y < 22 || position.y > svg.viewBox.baseVal.height-32) return;
  analysis.traceSelection = null;
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
async function detectActivityIntervals(button) {
  const activity = analysis.detail?.activity.id, request = analysis.detailRequest, output = $('#detected-intervals-result');
  if (!activity || !output || analysis.intervalDetectionBusy) return;
  analysis.intervalDetectionBusy = true; button.disabled = true;
  output.innerHTML = '<p role="status">Checking sustained efforts in the recorded power trace…</p>';
  try {
    const result = await portal('detect_intervals_ai', { athlete_id: state.athleteId, activity_id: activity });
    if (request !== analysis.detailRequest || analysis.detail?.activity.id !== activity || !$('#detected-intervals-result')) return;
    analysis.detectedIntervals = result; $('#detected-intervals-result').innerHTML = detectedIntervalsMarkup();
  } catch (error) {
    if (request === analysis.detailRequest && $('#detected-intervals-result')) $('#detected-intervals-result').innerHTML = `<p class="form-error" role="alert">${safe(error.message)}</p>`;
  } finally { analysis.intervalDetectionBusy = false; if (request === analysis.detailRequest && button.isConnected) button.disabled = false; }
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
  const input=event.target; if (!input.matches('#history-filter input:not([type="date"]), #segment-form input')) return;
  if (!input.checkValidity()) {
    input.setAttribute('aria-invalid','true');
    const id=input.id+'-validation'; let message=document.getElementById(id);
    if (!message) { message=document.createElement('p'); message.id=id; message.className='field-error'; message.setAttribute('role','alert'); input.after(message); }
    input.setAttribute('aria-describedby',id); message.textContent=input.validationMessage;
  }
});
document.addEventListener('focusin',(event)=>{
  if (event.target.matches('#history-filter input:not([type="date"]), #segment-form input')) { event.target.removeAttribute('aria-invalid'); const message=document.getElementById(event.target.id+'-validation'); if (message) message.textContent=''; }
});

document.addEventListener('keydown',(event)=>{ const current=event.target.closest('[data-activity-panel]'); if(!current || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; const tabs=[...document.querySelectorAll('[data-activity-panel]')]; let i=tabs.indexOf(current); i=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length; event.preventDefault(); setActivityPanel(tabs[i].dataset.activityPanel); tabs[i].focus(); });


// Resize only the existing SVG geometry. Forms, focus, data and the selected range stay intact.
const responsiveChartGeometry = new WeakMap();
function resizeAnalysisChart(svg) {
  const width = Math.round(svg.getBoundingClientRect().width);
  if (width < 120 || Math.abs(svg.viewBox.baseVal.width - width) < 1) return;
  let geometry = responsiveChartGeometry.get(svg);
  if (!geometry) {
    geometry = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height, nodes: [...svg.children].map(node => ({
      node, tag: node.tagName.toLowerCase(), x: node.getAttribute('x'), cx: node.getAttribute('cx'), x1: node.getAttribute('x1'), x2: node.getAttribute('x2'),
    })) };
    responsiveChartGeometry.set(svg, geometry);
  }
  const left = Number(svg.dataset.chartLeft), inset = Number(svg.dataset.chartRight);
  const scale = (width-left-inset)/(geometry.width-left-inset), shift = left * (1-scale);
  const mapX = value => Number(value) < left ? Number(value) : left + (Number(value)-left)*scale;
  const previousWidth = svg.viewBox.baseVal.width;
  for (const item of geometry.nodes) {
    const {node,tag} = item;
    if (tag === 'path' || tag === 'polyline') node.setAttribute('transform', `matrix(${scale} 0 0 1 ${shift} 0)`);
    if (tag === 'circle' && item.cx != null) node.setAttribute('cx', String(mapX(item.cx)));
    if (tag === 'text' && item.x != null) {
      node.setAttribute('x', String(mapX(item.x)));
      if (node.hasAttribute('data-chart-tick')) node.style.display = width < 500 && Number(item.x) > left + 1 && Number(item.x) < geometry.width - inset - 1 ? 'none' : '';
    }
    if (tag === 'line') {
      const cursor = node.classList.contains('trace-cursor') || node.classList.contains('chart-inspect-line');
      for (const attribute of ['x1','x2']) if (item[attribute] != null) {
        const value = cursor ? left + (Number(node.getAttribute(attribute))-left)/(previousWidth-left-inset)*(width-left-inset) : mapX(item[attribute]);
        node.setAttribute(attribute,String(value));
      }
    }
  }
  svg.setAttribute('viewBox', `0 0 ${width} ${geometry.height}`);
  const popover = svg.parentElement?.querySelector('.chart-hover-popover');
  if (popover) popover.hidden = true;
}
if (typeof ResizeObserver !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const registeredCharts = new Set(), registeredRoutes = new Set();
  const routeWidths = new WeakMap();
  const routeResizeObserver = new ResizeObserver(entries => {
    for (const {target,contentRect} of entries) {
      const width = Math.round(contentRect.width);
      if (width < 120 || routeWidths.get(target) === width) continue;
      routeWidths.set(target,width); paintActivityRoute();
    }
  });
  const chartResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) resizeAnalysisChart(entry.target);
    if (analysis.traceDrag || analysis.traceSelection) paintTraceBrush();
    if (typeof paintIntervalTraceMarkers === 'function') paintIntervalTraceMarkers();
  });
  const registerCharts = () => {
    for (const route of registeredRoutes) if (!route.isConnected) { routeResizeObserver.unobserve(route); registeredRoutes.delete(route); }
    document.querySelectorAll('#activity-route').forEach(route => { if (!registeredRoutes.has(route)) { registeredRoutes.add(route); routeResizeObserver.observe(route); } });
    for (const svg of registeredCharts) if (!svg.isConnected) { chartResizeObserver.unobserve(svg); registeredCharts.delete(svg); }
    document.querySelectorAll('svg[data-responsive-chart]').forEach(svg => {
      if (registeredCharts.has(svg)) return;
      registeredCharts.add(svg); chartResizeObserver.observe(svg);
    });
  };
  const chartMutationObserver = new MutationObserver(registerCharts);
  chartMutationObserver.observe(document.body, { childList: true, subtree: true });
  registerCharts();
}
