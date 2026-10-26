/* Chart explorer: display versioned server evidence; never calculate replacement training metrics. */
const CHART_EXPLORER_CATALOG = [
  { id: 'ramp', label: 'Ramp rate', question: 'How quickly is training load changing?', description: 'A seven-day change in modeled fitness (CTL).', number: '01' },
  { id: 'efforts', label: 'Best-effort progression', question: 'How is recorded power progressing?', description: 'Daily best saved efforts, with the source ride.', number: '02' },
  { id: 'comparison', label: 'Period comparison', question: 'How does this period compare?', description: 'The selected dates beside the previous equal period.', number: '03' },
];
const CHART_EXPLORER_DURATIONS = [[5, '5 sec'], [60, '1 min'], [300, '5 min'], [1200, '20 min'], [3600, '60 min']];
let chartExplorerSession = null;

function chartExplorerPreferences() {
  const saved = chartExplorerSession || readCoachPrefs().chartExplorer || {};
  return {
    chart: CHART_EXPLORER_CATALOG.some((item) => item.id === saved.chart) ? saved.chart : 'ramp',
    duration: CHART_EXPLORER_DURATIONS.some(([seconds]) => seconds === saved.duration) ? saved.duration : 300,
    view: saved.view === 'table' ? 'table' : 'chart',
  };
}
function chartExplorerEvidence() {
  const evidence = analysis.trends?.chart_evidence_v1;
  return evidence?.version === 'chart-evidence-v1' ? evidence : null;
}
function explorerNumber(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function explorerSigned(value, unit = '', digits = 1) {
  const number = explorerNumber(value);
  return number == null ? '—' : `${number > 0 ? '+' : ''}${numberLabel(number, unit, digits)}`;
}
function explorerDate(value) { return value && Number.isFinite(Date.parse(value)) ? utcLabel(value) : '—'; }
function explorerPeriod(period) { return `${explorerDate(period?.from)} – ${explorerDate(period?.to)}`; }
function explorerCaveats(items, fallback) {
  const notes = Array.isArray(items) && items.length ? items.filter((item) => typeof item === 'string') : fallback;
  return notes.length ? `<details class="explorer-method"><summary>Understand the data and its limits</summary><ul>${notes.map((note) => `<li>${safe(note)}</li>`).join('')}</ul></details>` : '';
}
function explorerActivity(point, label) {
  return point?.activity_id ? `<button type="button" class="record-link" data-activity="${safe(point.activity_id)}">${safe(label || point.activity_name || 'Open source ride')} <span aria-hidden="true">↗</span></button>` : 'Source ride unavailable';
}
function explorerEmpty(titleText, description, stateName = 'empty') {
  return `<div class="explorer-empty" data-chart-state="${stateName}"><h4>${safe(titleText)}</h4><p>${safe(description)}</p><button type="button" class="secondary" data-analysis-tab="history">Review activity history</button></div>`;
}
function explorerDataTable(headers, rows, empty) {
  return `<section id="explorer-data" class="explorer-data" aria-labelledby="explorer-data-heading"><div class="explorer-data-heading"><h4 id="explorer-data-heading">Source data</h4><p>Dates in UTC · Missing values appear as —</p></div>${tableMarkup(headers, rows, empty)}</section>`;
}

function explorerRamp(evidence, view) {
  const ramp = evidence.ramp;
  const points = Array.isArray(ramp?.points) ? ramp.points : [];
  const observed = points.filter((point) => explorerNumber(point.value) != null);
  const latest = points[points.length - 1];
  const latestValue = explorerNumber(latest?.value);
  const headline = `<div class="explorer-reading"><div><p>Latest seven-day change</p><strong>${explorerSigned(latestValue)}<span> CTL / week</span></strong><small>${latest ? safe(explorerDate(latest.day)) : 'No daily values returned'}</small></div><p>${latestValue == null ? 'This day needs a stored CTL value and another from exactly seven days earlier.' : `Modeled fitness moved from ${numberLabel(latest.from_ctl, '', 1)} to ${numberLabel(latest.to_ctl, '', 1)} CTL between ${safe(explorerDate(latest.from_day))} and ${safe(explorerDate(latest.day))}.`}<span>A positive change means load is rising; it does not judge whether that change suits the athlete.</span></p></div>`;
  const chart = observed.length ? dataChart([{ name: 'Seven-day CTL change', color: '#345c42', points: points.map((point) => [Date.parse(point.day), explorerNumber(point.value)]) }], 'Seven-day CTL change', 'CTL/week', 129600000) : explorerEmpty('Ramp rate needs two dated observations', 'Choose dates with stored fitness values seven days apart. Missing days remain gaps in the chart.');
  const rows = points.map((point) => [safe(explorerDate(point.day)), explorerSigned(point.value), safe(explorerDate(point.from_day)), numberLabel(point.from_ctl, '', 1), numberLabel(point.to_ctl, '', 1), explorerNumber(point.value) == null ? 'Missing an endpoint' : 'Both endpoints recorded']);
  return `${headline}${view === 'chart' ? `<div class="explorer-plot">${chart}</div><p class="explorer-chart-note">${numberLabel(observed.length)} of ${numberLabel(points.length)} days have both required observations. Gaps are not zero change.</p>` : ''}${explorerCaveats(ramp?.caveats, ['Ramp rate is the difference between two saved CTL observations exactly seven days apart.', 'CTL is a modeled training-load estimate. Missing endpoints are not interpolated.'])}${view === 'table' ? explorerDataTable(['Date (UTC)', 'CTL change / week', 'Baseline date', 'Baseline CTL', 'Current CTL', 'Coverage'], rows, 'No daily fitness observations returned for this range.') : `<details class="explorer-source-disclosure"><summary>Inspect the daily source values <span>${numberLabel(points.length)} days</span></summary>${explorerDataTable(['Date (UTC)', 'CTL change / week', 'Baseline date', 'Baseline CTL', 'Current CTL', 'Coverage'], rows, 'No daily fitness observations returned for this range.')}</details>`}`;
}
function explorerEfforts(evidence, duration, view) {
  const efforts = evidence.efforts;
  const points = (Array.isArray(efforts?.points) ? efforts.points : []).filter((point) => point.duration_s === duration && explorerNumber(point.watts) != null).slice().sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const best = points.reduce((record, point) => !record || point.watts > record.watts ? point : record, null);
  const durationLabel = CHART_EXPLORER_DURATIONS.find(([seconds]) => seconds === duration)[1];
  const durationControls = `<div class="explorer-duration"><span>Effort duration</span><div role="group" aria-label="Best-effort duration">${CHART_EXPLORER_DURATIONS.map(([seconds, label]) => `<button type="button" data-explorer-duration="${seconds}" aria-pressed="${duration === seconds}">${label}</button>`).join('')}</div></div>`;
  const headline = `<div class="explorer-reading"><div><p>Best saved ${safe(durationLabel)}${efforts?.coverage_limited ? " among returned rides" : " in this period"}</p><strong>${numberLabel(best?.watts)}<span> W</span></strong><small>${best ? safe(explorerDate(best.day)) : 'No saved effort for this duration'}</small></div><p>${best ? `${explorerActivity(best, 'Open the best effort’s ride')}<span>${numberLabel(points.length)} recorded ${points.length === 1 ? 'day' : 'days'} with a saved effort at this duration.</span>` : 'Recorded power-meter rides need a saved power curve for this duration.'}<span>Saved curve records · Source intervals have not been verified by this view.</span></p></div>`;
  const chart = points.length ? dataChart([{ name: `${durationLabel} daily best`, color: '#3467a0', points: points.map((point) => [Date.parse(point.day), point.watts]) }], `${durationLabel} best-effort progression`, 'watts', Infinity) : explorerEmpty(`No ${durationLabel} efforts in this range`, 'Try another duration or date range. Review activity history to find rides recorded with a power meter.');
  const rows = points.slice().reverse().map((point) => [safe(explorerDate(point.day)), numberLabel(point.watts, ' W'), safe(durationLabel), explorerActivity(point), safe(point.source || 'Not recorded')]);
  const caveats = [...(efforts?.caveats || [])];
  if (efforts?.coverage_limited && !caveats.some((text) => /limit|complete|cap/i.test(text))) caveats.unshift('Only a limited set of activity records was returned. These results may not include every effort in the period.');
  return `${durationControls}${efforts?.coverage_limited ? '<p class="explorer-data-warning" role="status">Activity coverage is incomplete. Other eligible rides may change these daily bests.</p>' : ""}${headline}${view === 'chart' ? `<div class="explorer-plot explorer-effort-plot">${chart}</div><p class="explorer-chart-note">Each point is that day’s best saved effort. A line connects recorded days; it does not fill in unrecorded efforts.</p>` : ''}${explorerCaveats(caveats, ['Only confirmed cycling power-meter recordings with a saved curve are included.', 'These are legacy saved curves. Their original source intervals and recording quality have not been revalidated.', 'A missing effort is not zero power, and this is not a physiological model.'])}${view === 'table' ? explorerDataTable(['Date (UTC)', 'Recorded power', 'Duration', 'Source ride', 'Provider'], rows, 'No saved efforts for this duration in the selected period.') : `<details class="explorer-source-disclosure"><summary>Open the source rides <span>${numberLabel(points.length)} recorded days</span></summary>${explorerDataTable(['Date (UTC)', 'Recorded power', 'Duration', 'Source ride', 'Provider'], rows, 'No saved efforts for this duration in the selected period.')}</details>`}`;
}
const CHART_COMPARISON_METRICS = [
  { key: 'activity_count', name: 'Activities', unit: '', coverage: null },
  { key: 'duration_s', name: 'Recorded time', unit: 'hours', coverage: 'duration_count' },
  { key: 'distance_m', name: 'Distance', unit: 'km', coverage: 'distance_count' },
  { key: 'tss', name: 'Training stress', unit: 'TSS', coverage: 'tss_count' },
];
function explorerComparisonValue(key, value) {
  const number = explorerNumber(value);
  if (number == null) return '—';
  if (key === 'duration_s') return numberLabel(number / 3600, ' h', 1);
  if (key === 'distance_m') return numberLabel(number / 1000, ' km', 1);
  return numberLabel(number, key === 'tss' ? ' TSS' : '', key === 'activity_count' ? 0 : 1);
}
function explorerComparisonDelta(key, value) {
  const number = explorerNumber(value);
  return number == null ? 'Not comparable' : `${number > 0 ? '+' : ''}${explorerComparisonValue(key, number)}`;
}
function explorerCoverage(period, metric) {
  const coverage = period?.coverage || {};
  if (!metric.coverage) return coverage.limited ? `${numberLabel(coverage.returned_activities)} returned · incomplete period` : `${numberLabel(coverage.returned_activities)} activity records`;
  return `${numberLabel(coverage[metric.coverage])} of ${numberLabel(coverage.returned_activities)} records have this value${coverage.limited ? ' · incomplete period' : ''}`;
}
function explorerComparison(evidence, view) {
  const comparison = evidence.comparison;
  if (!comparison?.current || !comparison?.previous) return explorerEmpty('Period comparison is unavailable', 'Update the range to request both periods together.', 'unavailable');
  const current = comparison.current, previous = comparison.previous;
  const periodLabels = `<div class="explorer-periods"><div><span class="explorer-period-key is-current"></span><div><strong>Selected period</strong><span>${safe(explorerPeriod(current))}</span></div></div><div><span class="explorer-period-key is-previous"></span><div><strong>Previous period</strong><span>${safe(explorerPeriod(previous))}</span></div></div></div>`;
  const bars = CHART_COMPARISON_METRICS.map((metric) => {
    const currentValue = explorerNumber(current.metrics?.[metric.key]), previousValue = explorerNumber(previous.metrics?.[metric.key]);
    const maximum = Math.max(currentValue ?? 0, previousValue ?? 0, 1);
    const row = (period, value, previousRow) => `<div class="explorer-bar-row ${previousRow ? 'is-previous' : 'is-current'}"><span>${previousRow ? 'Previous' : 'Selected'}</span><div class="explorer-bar-track" aria-hidden="true">${value == null ? '<span class="explorer-bar-missing">Incomplete data</span>' : `<i style="width:${Math.max(0, value) / maximum * 100}%"></i>`}</div><strong>${explorerComparisonValue(metric.key, value)}</strong></div><p class="explorer-coverage">${safe(explorerCoverage(period, metric))}${value == null && explorerNumber(period.observed_totals?.[metric.key]) != null ? ` · Recorded subtotal: ${explorerComparisonValue(metric.key, period.observed_totals[metric.key])} (partial)` : ''}</p>`;
    const delta = explorerComparisonDelta(metric.key, comparison.delta?.[metric.key]);
    return `<article class="explorer-comparison-metric"><div><h4>${metric.name}</h4><span>${safe(delta)}${explorerNumber(comparison.delta_pct?.[metric.key]) != null ? ` <small>(${explorerSigned(comparison.delta_pct[metric.key], '%')})</small>` : ''}</span></div>${row(current, currentValue, false)}${row(previous, previousValue, true)}</article>`;
  }).join('');
  const rows = CHART_COMPARISON_METRICS.map((metric) => [safe(metric.name), explorerComparisonValue(metric.key, current.metrics?.[metric.key]), explorerComparisonValue(metric.key, previous.metrics?.[metric.key]), explorerComparisonDelta(metric.key, comparison.delta?.[metric.key]), explorerSigned(comparison.delta_pct?.[metric.key], '%'), safe(explorerCoverage(current, metric)), safe(explorerCoverage(previous, metric))]);
  return `${periodLabels}<p class="explorer-chart-note">Both periods cover ${numberLabel(evidence.range?.days)} days. Totals and changes are shown only when the returned records cover each measure.</p>${view === 'chart' ? `<div class="explorer-comparison-bars">${bars}</div>` : explorerDataTable(['Measure', 'Selected period', 'Previous period', 'Change', 'Change (%)', 'Selected coverage', 'Previous coverage'], rows, 'No period summaries returned.')}${explorerCaveats(comparison.caveats, ['The previous period has the same number of days and ends the day before the selected period.', 'Missing measurements or a capped activity result make the affected total and change unavailable.', 'Observed subtotals are partial data, not comparable totals. A percentage is unavailable when the previous total is zero.'])}`;
}

// Called by the analysis workspace renderer in analytics.js.
function paintChartExplorer() {
  const container = document.getElementById('analysis-content');
  if (!container) return;
  const preference = chartExplorerPreferences();
  const selected = CHART_EXPLORER_CATALOG.find((item) => item.id === preference.chart);
  const evidence = chartExplorerEvidence();
  let result;
  if (!analysis.trends) result = '<div class="explorer-loading" data-chart-state="loading" role="status"><strong>Loading chart evidence…</strong><p>Fetching the selected dates and their source records.</p><div class="explorer-loading-plot" aria-hidden="true"></div></div>';
  else if (analysis.trends.error) result = `<div class="explorer-empty" data-chart-state="error" role="alert"><h4>Could not load the chart evidence</h4><p>${safe(analysis.trends.error)}</p><button type="button" class="secondary" data-analysis-retry="trends">Try again</button></div>`;
  else if (!evidence) result = '<div class="explorer-empty" data-chart-state="unavailable"><h4>These charts need the updated analysis service</h4><p>This connection has not returned the source evidence required for these charts. Existing activity history and training trends are still available.</p><div><button type="button" class="secondary" data-analysis-retry="trends">Check again</button><button type="button" class="record-link" data-analysis-tab="trends">Open training trends →</button></div></div>';
  else if (preference.chart === 'ramp') result = explorerRamp(evidence, preference.view);
  else if (preference.chart === 'efforts') result = explorerEfforts(evidence, preference.duration, preference.view);
  else result = explorerComparison(evidence, preference.view);
  const rows = explorerExportRows(evidence, preference);
  container.innerHTML = `<section id="chart-explorer" class="chart-explorer" aria-labelledby="explorer-heading"><div class="explorer-heading"><div><p class="eyebrow">TRAINING QUESTIONS, WITH THE EVIDENCE</p><h3 id="explorer-heading">Chart explorer</h3><p>Choose a question. Inspect the trend. Follow it back to the data.</p></div><button type="button" class="secondary" data-chart-export ${!rows.length ? 'disabled aria-describedby="explorer-export-status"' : ''}>Export data (CSV)</button></div>${rangeForm()}<div class="explorer-catalog" role="group" aria-label="Choose an analysis chart">${CHART_EXPLORER_CATALOG.map((item) => `<button type="button" data-explorer-chart="${item.id}" aria-pressed="${preference.chart === item.id}" aria-controls="explorer-result"><span>${item.number} / ${item.label}</span><strong>${item.question}</strong><span class="explorer-catalog-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><section id="explorer-result" class="explorer-result" aria-labelledby="explorer-chart-title" ${!analysis.trends ? 'aria-busy="true"' : ''}><div class="explorer-result-heading"><div><h4 id="explorer-chart-title">${selected.label}</h4><p>${selected.description}</p></div><div class="explorer-view-switch" role="group" aria-label="Chart presentation"><button type="button" data-explorer-view="chart" aria-pressed="${preference.view === 'chart'}">Chart</button><button type="button" data-explorer-view="table" aria-pressed="${preference.view === 'table'}">Data table</button></div></div>${result}</section><p id="explorer-export-status" class="explorer-export-status" role="status">${rows.length ? 'CSV includes the source values and applied date range.' : 'Export becomes available when source records are returned.'}</p></section>`;
}

function explorerExportRows(evidence, preference) {
  if (!evidence) return [];
  const selected = evidence[preference.chart];
  const context = { evidence_version: evidence.version, metric_id: selected?.metric_id, algorithm_version: selected?.algorithm_version, evidence_kind: selected?.evidence_kind, evidence_quality: selected?.quality, missing_lineage: selected?.missing_lineage, range_from: evidence.range?.from, range_to: evidence.range?.to };
  if (preference.chart === 'ramp') return (evidence.ramp?.points || []).map((point) => ({ ...context, record_type: 'seven_day_ctl_change', source_refs: point.source_refs, day: point.day, ctl_change: point.value, baseline_day: point.from_day, baseline_ctl: point.from_ctl, current_ctl: point.to_ctl, unit: evidence.ramp.unit, source: evidence.ramp.source }));
  if (preference.chart === 'efforts') return (evidence.efforts?.points || []).filter((point) => point.duration_s === preference.duration).map((point) => ({ ...context, record_type: 'daily_best_saved_effort', ...point, evidence_quality: evidence.efforts.quality, coverage_limited: evidence.efforts.coverage_limited }));
  const comparison = evidence.comparison;
  if (!comparison?.current || !comparison.previous) return [];
  return CHART_COMPARISON_METRICS.map((metric) => ({ ...context, record_type: 'equal_period_comparison', measure: metric.key, current_from: comparison.current.from, current_to: comparison.current.to, previous_from: comparison.previous.from, previous_to: comparison.previous.to, current_value: comparison.current.metrics?.[metric.key], previous_value: comparison.previous.metrics?.[metric.key], change: comparison.delta?.[metric.key], change_pct: comparison.delta_pct?.[metric.key], current_observed_subtotal: comparison.current.observed_totals?.[metric.key], previous_observed_subtotal: comparison.previous.observed_totals?.[metric.key], current_coverage: explorerCoverage(comparison.current, metric), previous_coverage: explorerCoverage(comparison.previous, metric), current_limited: comparison.current.coverage?.limited, previous_limited: comparison.previous.coverage?.limited, current_source_refs: comparison.current.source_refs, previous_source_refs: comparison.previous.source_refs }));
}
function exportChartExplorer() {
  const preference = chartExplorerPreferences(), rows = explorerExportRows(chartExplorerEvidence(), preference);
  if (!rows.length) return;
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? "'" : ''}${text.replace(/"/g, '""')}"`;
  };
  const csv = [fields, ...rows.map((row) => fields.map((field) => row[field]))].map((row) => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `trainable-${preference.chart}${preference.chart === 'efforts' ? `-${preference.duration}s` : ''}-${analysis.range.from}-${analysis.range.to}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const status = document.getElementById('explorer-export-status');
  if (status) status.textContent = `Exported ${numberLabel(rows.length)} ${rows.length === 1 ? 'row' : 'rows'} for the selected chart.`;
}
document.addEventListener('click', (event) => {
  const control = event.target.closest?.('[data-explorer-chart], [data-explorer-duration], [data-explorer-view], [data-chart-export]');
  if (!control || !control.closest('#chart-explorer')) return;
  if (control.hasAttribute('data-chart-export')) { exportChartExplorer(); return; }
  const preference = chartExplorerPreferences();
  let selector;
  if (control.dataset.explorerChart) {
    preference.chart = control.dataset.explorerChart;
    selector = `[data-explorer-chart="${preference.chart}"]`;
  } else if (control.dataset.explorerDuration) {
    preference.duration = Number(control.dataset.explorerDuration);
    selector = `[data-explorer-duration="${preference.duration}"]`;
  } else {
    preference.view = control.dataset.explorerView;
    selector = `[data-explorer-view="${preference.view}"]`;
  }
  chartExplorerSession = preference;
  saveCoachPrefs({ chartExplorer: preference });
  paintChartExplorer();
  document.querySelector(selector)?.focus({ preventScroll: true });
});
