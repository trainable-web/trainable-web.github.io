/* Analytics / Reporting: independent, reusable chart instances on a saved workspace. */
const CHART_BOARD_CATALOG = [
  { type: 'power', title: 'Power-duration curve', group: 'Performance', description: 'Measured best efforts across the period, with the exact source ride and interval.', size: 2 },
  { type: 'recordedPowerProfile', title: 'Power profile comparison', group: 'Performance', description: 'Compare recorded bests across two periods, with exact source efforts and recording opportunities.', size: 2 },
  { type: 'recordedEfforts', title: 'Recorded effort progression', group: 'Performance', description: 'Daily best measured efforts, with exact source windows and records within the selected period.', size: 1 },
  { type: 'periodDistribution', title: 'Period power distribution', group: 'Training', description: 'How recorded time and mechanical work are distributed across power outputs.', size: 1 },
  { type: 'intensity', title: 'Training intensity', group: 'Training', description: 'Time and work in dated FTP reference bands, for the period or by week.', size: 1 },
  { type: 'load', title: 'Training load', group: 'Training', description: 'Recorded fitness, fatigue and form on one time axis.', size: 1 },
  { type: 'distribution', title: 'Power distribution', group: 'Activity', description: 'Time spent at each power output, weighted by recorded time.', size: 1, ride: true },
  { type: 'zones', title: 'Time in power zones', group: 'Activity', description: 'Reference bands using the FTP that applied on the ride date.', size: 1, ride: true },
  { type: 'ridePower', title: 'Activity power curve', group: 'Activity', description: 'Continuous recorded efforts from one ride, with source windows.', size: 1, ride: true },
  { type: 'laps', title: 'Lap comparison', group: 'Activity', description: 'Compare recorded lap power, heart rate and duration.', size: 1, ride: true },
  { type: 'efforts', title: 'Saved effort progression', group: 'Performance', description: 'Legacy daily best saved efforts. Source intervals have not been revalidated.', size: 1 },
  { type: 'ramp', title: 'Ramp rate', group: 'Training', description: 'Seven-day change in the recorded CTL model.', size: 1 },
  { type: 'volume', title: 'Weekly training time', group: 'Training', description: 'Recorded hours by week, with the contributing sessions.', size: 1 },
  { type: 'comparison', title: 'Period comparison', group: 'Training', description: 'Compare time, distance and load with the previous equal period.', size: 2 },
  { type: 'sleep', title: 'Sleep history', group: 'Recovery', description: 'Daily sleep observations, kept separate by source.', size: 1 },
  { type: 'savedPower', title: 'Saved power profile', group: 'Performance', description: 'Legacy saved curves. Original intervals have not been revalidated.', size: 1 },
];
let chartBoardSession = null;
let chartBoardExpanded = null;
let chartBoardUndo = null;
let chartBoardDrag = null;
let chartBoardObserver = null;
let chartBoardGridObserver = null;
let chartBoardActiveAthlete = null;
let chartBoardActiveScope = null;
const chartBoardDetails = new Map();
const chartBoardInFlight = new Map();
const chartBoardId = () => 'cb-' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const chartBoardScope = () => JSON.stringify([state.athleteId, analysis.trendRequest]);

function chartBoardPreferences() {
  const saved = chartBoardSession ?? readCoachPrefs().chartBoardV1;
  const defaults = ['power', 'load', 'recordedEfforts', 'ramp', 'distribution', 'comparison'].map(type => ({ id: chartBoardId(), type, size: CHART_BOARD_CATALOG.find(chart => chart.type === type).size, duration: 300 }));
  const seen = new Set();
  const result = (Array.isArray(saved) ? saved : defaults).filter(item => item && CHART_BOARD_CATALOG.some(chart => chart.type === item.type)).map(item => {
    const id = typeof item.id === 'string' && /^cb-[a-zA-Z0-9-]{1,80}$/.test(item.id) && !seen.has(item.id) ? item.id : chartBoardId();
    seen.add(id);
    const durations = [...new Set((Array.isArray(item.profileDurations) ? item.profileDurations : []).filter(value => POWER_PROFILE_DURATIONS.includes(value)))].sort((a, b) => a - b);
    return { id, type: item.type, size: item.size === 2 ? 2 : 1, duration: CHART_EXPLORER_DURATIONS.some(([seconds]) => seconds === item.duration) ? item.duration : 300, activityId: typeof item.activityId === 'string' ? item.activityId.slice(0, 200) : '', metric: ['ctl', 'atl', 'tsb'].includes(item.metric) ? item.metric : 'all', basis: item.basis === 'work' ? 'work' : 'time', grouping: item.grouping === 'weekly' ? 'weekly' : 'period', comparisonMode: ['year', 'custom'].includes(item.comparisonMode) ? item.comparisonMode : 'previous', referenceFrom: typeof item.referenceFrom === 'string' ? item.referenceFrom.slice(0, 10) : '', referenceTo: typeof item.referenceTo === 'string' ? item.referenceTo.slice(0, 10) : '', profileDurations: durations.length ? durations : [...POWER_PROFILE_DEFAULTS] };
  });
  chartBoardSession = result;
  return result;
}
function chartBoardSave(items) { chartBoardSession = items; saveCoachPrefs({ chartBoardV1: items }); }
function chartBoardActivities() {
  return (analysis.trends?.activities || []).filter(activity => activity.sport_type === 'cycling').slice().sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
}
function chartBoardActivity(item) {
  const activities = chartBoardActivities();
  return activities.find(activity => activity.id === item.activityId) || activities.find(activity => activity.device_watts === true) || activities[0] || null;
}
function chartBoardDetail(item) {
  const activity = chartBoardActivity(item);
  return activity ? chartBoardDetails.get(`${chartBoardScope()}:${activity.id}`) : null;
}
function chartBoardNotice(titleText, text, action = '') {
  return `<div class="cb-notice"><strong>${safe(titleText)}</strong><p>${safe(text)}</p>${action}</div>`;
}
function chartBoardSource(point, label) { return explorerActivity(point, label); }
function chartBoardReadout(value, unit, label, note = '') {
  return `<div class="cb-reading"><div><strong>${safe(value)}<span>${safe(unit)}</span></strong><span>${safe(label)}</span></div>${note ? `<p>${safe(note)}</p>` : ''}</div>`;
}
function chartBoardSourceWindow(point) {
  return `<button type="button" class="record-link" data-board-window="${safe(point.activity_id || '')}" data-window-from="${Number(point.from_s)}" data-window-to="${Number(point.to_s)}" data-window-watts="${Number(point.average_w)}">${safe(elapsedLabel(point.from_s))}–${safe(elapsedLabel(point.to_s))} ↗</button>`;
}
function chartBoardProfileLabel(seconds) { return seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${seconds / 60} min` : `${seconds / 3600} h`; }
function chartBoardProfileStatus(snapshot) {
  return snapshot.status === 'loading' ? `${snapshot.phase || 'Preparing comparison'}${snapshot.total ? `: ${snapshot.processed} of ${snapshot.total} rides checked.` : '…'}` : snapshot.status === 'ready' ? 'Comparison ready. Recorded bests are shown below.' : '';
}
function chartBoardPowerProfile(item) {
  const snapshot = powerProfileSnapshot(item), evidence = snapshot.status === 'ready' ? snapshot.evidence : null;
  let reference;
  try { reference = powerProfileReferenceRange(item); } catch { reference = null; }
  const dateRange = range => range ? `${range.from} – ${range.to}` : 'Choose valid reference dates';
  const controls = `<div class="cb-profile-controls"><label>Compare against<select data-profile-mode="${item.id}"><option value="previous" ${item.comparisonMode === 'previous' ? 'selected' : ''}>Previous equal period</option><option value="year" ${item.comparisonMode === 'year' ? 'selected' : ''}>Same dates last year</option><option value="custom" ${item.comparisonMode === 'custom' ? 'selected' : ''}>Custom dates</option></select></label>${item.comparisonMode === 'custom' ? `<label>Reference start<input type="date" data-profile-from="${item.id}" value="${safe(item.referenceFrom)}" aria-describedby="${item.id}-profile-error"></label><label>Reference end<input type="date" data-profile-to="${item.id}" value="${safe(item.referenceTo)}" aria-describedby="${item.id}-profile-error"></label>` : ''}<details class="cb-profile-duration-picker"><summary>Durations (${item.profileDurations.length})</summary><fieldset><legend>Recorded effort durations</legend>${POWER_PROFILE_DURATIONS.map(seconds => `<label><input type="checkbox" data-profile-duration="${item.id}" value="${seconds}" ${item.profileDurations.includes(seconds) ? 'checked' : ''}>${chartBoardProfileLabel(seconds)}</label>`).join('')}</fieldset></details></div><p id="${item.id}-profile-error" class="form-error" role="alert" hidden></p><div class="cb-profile-periods"><p><strong><i class="cb-profile-key cb-profile-current" aria-hidden="true"></i>Selected period</strong><span>${safe(dateRange(analysis.range))}</span></p><p><strong><i class="cb-profile-key cb-profile-reference" aria-hidden="true"></i>Reference period</strong><span>${safe(dateRange(reference))}</span></p></div><p class="cb-profile-live" data-profile-live="${item.id}" role="status" aria-live="polite">${safe(chartBoardProfileStatus(snapshot))}</p>`;
  const action = snapshot.status === 'loading' ? `<button type="button" class="secondary" data-profile-cancel="${item.id}">Stop comparison</button>` : `<button type="button" class="${evidence ? 'secondary' : 'primary'}" data-profile-calculate="${item.id}">${snapshot.status === 'error' ? 'Retry comparison' : evidence ? 'Recalculate comparison' : 'Calculate comparison'}</button>`;
  let output = action, rows = [], notes = ['Select a reference period, then calculate the observed best efforts from recorded cycling power.'];
  if (snapshot.status === 'error') output = `<p class="form-error" role="alert">${safe(snapshot.error)}</p>${action}`;
  else if (snapshot.status === 'loading') output = `<p class="cb-caption">Both periods must finish before a comparison is shown.</p>${action}`;
  else if (!evidence) output = `<p class="cb-caption">Compare measured bests from both periods. Every result keeps its source ride and exact time window.</p>${action}`;
  else {
    const visible = evidence.rows.filter(row => item.profileDurations.includes(row.duration_s));
    const max = Math.max(1, ...visible.flatMap(row => [row.current?.average_w || 0, row.reference?.average_w || 0]));
    const delta = row => row.change_w === null ? '—' : `${row.change_w > 0 ? '+' : ''}${numberLabel(row.change_w, ' W', 1)}`;
    const bars = visible.map(row => `<div class="cb-profile-row"><strong>${chartBoardProfileLabel(row.duration_s)}</strong><div class="cb-profile-pair">${['current', 'reference'].map(key => { const point = row[key]; return `<div aria-label="${key === 'current' ? 'Selected' : 'Reference'} period: ${point ? numberLabel(point.average_w, ' watts', 1) : 'no recorded effort'}"><span class="cb-profile-track"><i class="cb-profile-${key}" style="width:${point ? point.average_w / max * 100 : 0}%"></i></span><span>${point ? numberLabel(point.average_w, ' W', 1) : '—'}</span></div>`; }).join('')}</div><div class="cb-profile-change"><strong>${delta(row)}</strong><span>${row.change_pct === null ? row.change_pct_unavailable_reason === 'zero_reference' ? '% unavailable' : 'Not paired' : `${row.change_pct > 0 ? '+' : ''}${numberLabel(row.change_pct, '%', 1)}`}</span></div></div>`).join('');
    const coverage = ['current', 'reference'].map(key => { const c = evidence.periods[key].coverage; return `<span><strong>${key === 'current' ? 'Selected' : 'Reference'}:</strong> ${numberLabel(c.effort_activities)} of ${numberLabel(c.expected_activities)} eligible rides have recorded efforts${c.coverage_limited ? ' · Incomplete coverage' : ''}.</span>`; }).join('');
    const warnings = evidence.warnings.filter(warning => warning.code !== 'missing_durations' || visible.some(row => row.status !== 'paired')).filter(warning => warning.code !== 'unequal_opportunities' || visible.some(row => row.unequal_opportunities));
    output = `<div class="cb-profile-plot"><div class="cb-profile-columns"><span>Duration</span><span>Recorded best power</span><span>Change</span></div>${bars}</div><p class="cb-caption">Bar lengths share one watt scale. Change is selected minus reference. Missing efforts are —.</p><p class="cb-profile-coverage">${coverage}</p>${warnings.length ? `<details class="cb-profile-context"><summary>Comparison context (${warnings.length})</summary><ul>${warnings.map(warning => `<li>${safe(warning.message.replace('The current period', 'The selected period'))}</li>`).join('')}</ul></details>` : ''}<p class="cb-caption">Different riding or testing opportunities can change recorded bests. This does not measure a change in physiological capacity.</p>${action}`;
    rows = visible.flatMap(row => ['current', 'reference'].map(key => { const point = row[key], opportunities = row[`${key}_opportunities`]; return [chartBoardProfileLabel(row.duration_s), key === 'current' ? 'Selected' : 'Reference', point ? numberLabel(point.average_w, ' W', 1) : '—', point ? chartBoardSource(point) : 'No eligible effort', point ? chartBoardSourceWindow(point) : '—', numberLabel(opportunities.eligible_activities), numberLabel(opportunities.eligible_days), numberLabel(opportunities.candidate_windows), point ? `${numberLabel(point.age_days_at_comparison_end)} days` : '—']; }));
    notes = [...warnings.map(warning => warning.message.replace('The current period', 'The selected period')), ...evidence.caveats];
  }
  return { html: controls + `<div class="cb-profile-output">${output}</div>`, output, headers: ['Duration', 'Period', 'Recorded best', 'Source ride', 'Exact source window', 'Eligible rides', 'Eligible days', 'Candidate windows', 'Age at comparison end'], rows, notes };
}
const CHART_BOARD_PERIOD_TYPES = ['power', 'recordedEfforts', 'periodDistribution', 'intensity'];
function chartBoardPeriodState(titleText, description) {
  const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : { status: 'idle' };
  const action = '<button type="button" class="primary" data-period-power-calculate>Calculate period charts</button>';
  if (snapshot.status === 'loading') return { html: chartBoardNotice('Calculating period charts', `${numberLabel(snapshot.processed)} of ${numberLabel(snapshot.total)} eligible ride records checked. This calculation supplies every period power chart.`, '<button type="button" class="secondary" data-period-power-cancel>Stop calculation</button>'), loading: true };
  if (snapshot.status === 'error') return { html: chartBoardNotice('The calculation did not finish', snapshot.error || 'Try again to request the recorded rides.', action) };
  if (snapshot.status !== 'ready') return { html: chartBoardNotice(titleText, description, action) };
  if (!snapshot.evidence) return { html: chartBoardNotice('Updated chart evidence is needed', 'Calculate again to request the recorded power and dated FTP evidence together.', action) };
  return null;
}
function chartBoardPeriodCoverage(evidence, kind) {
  const coverage = evidence.coverage;
  const available = kind === 'intensity' ? coverage.zone_activities : kind === 'efforts' ? coverage.effort_activities : coverage.distribution_activities;
  const description = kind === 'intensity' ? 'rides have dated FTP and usable power' : kind === 'efforts' ? 'rides have eligible continuous efforts' : 'rides have usable recorded power';
  const limited = evidence[kind]?.coverage_limited ?? coverage.coverage_limited;
  return `<p class="cb-evidence-coverage"><strong>${numberLabel(available)} of ${numberLabel(coverage.received_activities)} checked ${description}.</strong> ${coverage.received_activities > available ? `${numberLabel(coverage.received_activities - available)} unavailable for this chart.` : ''}${limited ? ' This chart has incomplete coverage.' : ''}${coverage.received_activities < coverage.expected_activities ? ` ${numberLabel(coverage.received_activities)} of ${numberLabel(coverage.expected_activities)} candidate ride records were checked.` : ''}</p>`;
}
function chartBoardBasisControl(item) {
  return `<label class="cb-inline-field">Measure<select data-board-basis="${item.id}"><option value="time" ${item.basis !== 'work' ? 'selected' : ''}>Recorded time</option><option value="work" ${item.basis === 'work' ? 'selected' : ''}>Mechanical work</option></select></label>`;
}
function chartBoardPeriodActionMarkup() {
  const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : { status: 'idle' };
  return snapshot.status === 'loading' ? '<button type="button" class="secondary" data-period-power-cancel>Stop calculation</button>' : `<button type="button" class="secondary" data-period-power-calculate>${snapshot.status === 'ready' ? 'Refresh period charts' : 'Calculate period charts'}</button>`;
}
function chartBoardPeriodStatusText() {
  const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : { status: 'idle' };
  if (snapshot.status === 'loading') return `${numberLabel(snapshot.processed)} of ${numberLabel(snapshot.total)} ride records checked. One calculation updates every period power chart.`;
  if (snapshot.status === 'ready') return `Period charts calculated from ${numberLabel(snapshot.processed)} ride records. Each chart shows its usable coverage.`;
  if (snapshot.status === 'error') return 'The calculation did not finish. Try again to calculate the period charts.';
  return 'Calculate once for the power curve, recorded progression, distribution and intensity.';
}
function chartBoardPeriodSources(sources, showFtp = false) {
  return `<section class="cb-period-sources"><h4>Contributing rides</h4>${tableMarkup(['Ride date (UTC)', 'Source ride', 'Covered time', 'Recorded span', 'Mechanical work', ...(showFtp ? ['Dated FTP', 'Setting revision'] : [])], sources.map(source => [safe(utcLabel(source.start_date)), chartBoardSource(source), numberLabel(source.covered_s / 60, ' min', 1), numberLabel(source.recorded_span_s / 60, ' min', 1), numberLabel(source.work_j / 1000, ' kJ', 1), ...(showFtp ? [numberLabel(source.ftp_watts, ' W'), numberLabel(source.setting_revision)] : [])]), 'No eligible source rides.')}</section>`;
}
function chartBoardRecordedEfforts(item) {
  const pending = chartBoardPeriodState('Follow measured efforts over time', 'Compare daily best efforts from consecutive recorded power samples, and inspect the exact winning interval.');
  if (pending) return pending;
  const evidence = periodPowerSnapshot().evidence;
  const points = evidence.efforts.points.filter(point => point.duration_s === item.duration);
  const best = evidence.efforts.bests.find(point => point.duration_s === item.duration);
  const label = CHART_EXPLORER_DURATIONS.find(([seconds]) => seconds === item.duration)[1];
  const controls = `<label class="cb-inline-field">Effort duration<select data-board-duration="${item.id}">${CHART_EXPLORER_DURATIONS.map(([seconds, name]) => `<option value="${seconds}" ${item.duration === seconds ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  const chart = points.length ? dataChart([{ name: `${label} recorded daily best`, color: '#3467a0', points: points.map(point => [Date.parse(point.day), point.average_w]) }], `${label} recorded effort progression`, 'watts', Infinity, null, null, item.size === 1) : chartBoardNotice(`No recorded ${label} efforts`, 'Choose another duration or date range. This calculation requires consecutive recorded samples; gaps are not filled in.');
  return { html: controls + (best ? chartBoardReadout(numberLabel(best.average_w, '', 1), 'W', `Best recorded ${label} in selected period`, `${best.age_days_at_range_end} days before the period’s end`) : '') + chart + chartBoardPeriodCoverage(evidence, 'efforts'), headers: ['Date (UTC)', 'Recorded power (W)', 'Source ride', 'Source window', 'Eligible windows', 'Period record', 'Age at period end', 'Recording quality'], rows: points.map(point => [safe(utcLabel(point.day)), numberLabel(point.average_w, '', 1), chartBoardSource(point), chartBoardSourceWindow(point), numberLabel(point.candidate_count), point.record_in_selected_period ? 'New best within selected period' : '—', numberLabel(point.age_days_at_range_end, ' days'), safe(point.quality)]), notes: ['Each point is the best observed effort on that UTC day. The line joins recorded days; it does not estimate missing efforts.', 'A period record means a new best within the selected dates. It is not an all-time personal best.', ...evidence.caveats] };
}
function chartBoardPeriodDistribution(item) {
  const pending = chartBoardPeriodState('See where the period’s power went', 'Combine recorded power across the selected rides. Compare time at each output with the mechanical work it produced.');
  if (pending) return pending;
  const evidence = periodPowerSnapshot().evidence, distribution = evidence.distribution;
  const work = item.basis === 'work', totals = distribution.totals;
  const chart = distribution.status === 'available' ? chartBoardHistogram(distribution.bins, item.basis) : chartBoardNotice('No usable power distributions', 'Try a period with recorded power-meter rides. Missing ride data is not counted as zero power.');
  return { html: chartBoardBasisControl(item) + chart + `<p class="cb-caption">${numberLabel(totals.covered_s / 3600, ' h', 2)} recorded time · ${numberLabel(totals.work_j / 1000, ' kJ', 1)} mechanical work. ${numberLabel(totals.coverage_pct, '%', 1)} of the returned usable recordings’ span is covered.${work && totals.work_j === 0 ? ' Work shares are unavailable because total work is zero.' : ''}</p>` + chartBoardPeriodCoverage(evidence, 'distribution'), headers: ['From power (W)', 'To power, exclusive (W)', 'Covered time', 'Time share', 'Mechanical work', 'Work share'], rows: distribution.bins.map(bin => [numberLabel(bin.lower_w), numberLabel(bin.upper_w), numberLabel(bin.duration_s / 60, ' min', 2), numberLabel(bin.share_pct, '%', 2), numberLabel(bin.work_j / 1000, ' kJ', 2), numberLabel(bin.work_share_pct, '%', 2)]), extra: chartBoardPeriodSources(distribution.sources), notes: ['Time shares use total covered seconds. Work shares use total covered mechanical joules. The two answer different questions.', 'This is recorded cycling power, not exercise energy expenditure or fuel consumption.', ...evidence.caveats] };
}
function chartBoardIntensity(item) {
  const pending = chartBoardPeriodState('Compare the intensity of recorded training', 'Use each ride’s dated FTP to compare reference-band time and mechanical work, across the period or by week.');
  if (pending) return pending;
  const evidence = periodPowerSnapshot().evidence, intensity = evidence.intensity, coverage = intensity.coverage, work = item.basis === 'work';
  const value = band => work ? band.work_j / 1000 : band.duration_s / 60;
  const share = band => work ? band.work_share_pct : band.share_pct;
  const unit = work ? ' kJ' : ' min';
  const controls = `<div class="cb-intensity-controls">${chartBoardBasisControl(item)}<label class="cb-inline-field">View<select data-board-grouping="${item.id}"><option value="period" ${item.grouping !== 'weekly' ? 'selected' : ''}>Selected period</option><option value="weekly" ${item.grouping === 'weekly' ? 'selected' : ''}>Week by week</option></select></label></div>`;
  const totalBands = `<div class="cb-zones cb-period-intensity-bands">${intensity.bands.map((band, index) => `<div><span>${safe(band.label)}</span><i class="cb-zone-${index}" style="--bar-width:${Math.max(0, Math.min(100, share(band) || 0))}%" aria-hidden="true"></i><strong>${numberLabel(share(band), '%', 1)}${chartBoardExpanded === item.id ? `<small>${numberLabel(value(band), unit, 1)}</small>` : ''}</strong></div>`).join('')}</div>`;
  const visibleWeeks = chartBoardExpanded === item.id ? intensity.weeks : intensity.weeks.slice(-8);
  const weeks = `<div class="cb-intensity-weeks">${visibleWeeks.map(week => `<div><span>${safe(utcLabel(week.week_start))}</span><div class="cb-stacked-band" role="img" aria-label="${safe(week.bands.map(band => `${band.label}: ${numberLabel(value(band), unit, 1)}, ${numberLabel(share(band), '%', 1)}`).join('. '))}">${week.bands.map((band, index) => `<i class="cb-zone-${index}" style="width:${Math.max(0, Math.min(100, share(band) || 0))}%" title="${safe(band.label)}: ${numberLabel(value(band), unit, 1)} (${numberLabel(share(band), '%', 1)})"></i>`).join('')}</div><strong>${numberLabel(work ? week.work_j / 1000 : week.covered_s / 60, unit, 1)}</strong></div>`).join('')}</div><div class="cb-band-legend">${intensity.bands.map((band, index) => `<span><i class="cb-zone-${index}" aria-hidden="true"></i>${safe(band.label)}</span>`).join('')}</div>${intensity.weeks.length > visibleWeeks.length ? `<p class="cb-caption">Latest ${visibleWeeks.length} of ${intensity.weeks.length} recorded weeks. Inspect data to see all weeks.</p>` : ''}`;
  const chart = intensity.status === 'available' ? item.grouping === 'weekly' ? weeks : totalBands : chartBoardNotice('Dated FTP is needed for intensity', 'These bands need a verified FTP for each ride’s date. Add Period power distribution to inspect recorded watts when dated FTP is unavailable.', '<button type="button" class="record-link" data-board-add="periodDistribution">Add period power distribution</button>');
  const rows = item.grouping === 'weekly' ? intensity.weeks.flatMap(week => week.bands.map(band => [safe(utcLabel(week.week_start)), safe(band.label), numberLabel(band.duration_s / 60, ' min', 2), numberLabel(band.share_pct, '%', 2), numberLabel(band.work_j / 1000, ' kJ', 2), numberLabel(band.work_share_pct, '%', 2)])) : intensity.bands.map(band => [safe(band.label), numberLabel(band.duration_s / 60, ' min', 2), numberLabel(band.share_pct, '%', 2), numberLabel(band.work_j / 1000, ' kJ', 2), numberLabel(band.work_share_pct, '%', 2)]);
  return { html: controls + chart + `<p class="cb-caption"><strong>${numberLabel(coverage.zoned_s / 3600, ' h', 2)} has dated FTP.</strong> ${coverage.missing_ftp_s > 0 ? `${numberLabel(coverage.missing_ftp_s / 3600, ' h', 2)} and ${numberLabel(coverage.missing_ftp_work_j / 1000, ' kJ', 1)} are excluded because dated FTP is unavailable.` : 'All covered power time has dated FTP.'}${work && coverage.work_j === 0 ? ' Work shares are unavailable because covered work is zero.' : ''}</p>` + chartBoardPeriodCoverage(evidence, 'intensity'), headers: [...(item.grouping === 'weekly' ? ['Week starts (UTC)'] : []), 'Reference band', 'Covered time', 'Time share', 'Mechanical work', 'Work share'], rows: intensity.status === 'available' ? rows : [], extra: chartBoardPeriodSources(intensity.sources, true), notes: ['Fixed reference FTP bands use the FTP valid on each ride date. Current FTP is never substituted; custom historical zone definitions are not represented.', 'Time shares use zoned recorded seconds. Work shares use zoned mechanical joules. This is not session-based intensity classification.', ...evidence.caveats] };
}
function chartBoardPower(item) {
  const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : { status: 'idle' };
  const coverageLimited = snapshot.evidence?.efforts?.coverage_limited ?? snapshot.coverage_limited;
  const action = `<button type="button" class="primary" data-period-power-calculate>${snapshot.status === 'ready' ? 'Refresh period charts' : 'Calculate period charts'}</button>`;
  const points = snapshot.status === 'ready' ? snapshot.points || [] : [];
  let html;
  if (snapshot.status === 'loading') html = chartBoardNotice('Calculating period charts', `${numberLabel(snapshot.processed)} of ${numberLabel(snapshot.total)} eligible activity records checked.`, '<button type="button" class="secondary" data-period-power-cancel>Stop calculation</button>');
  else if (snapshot.status === 'error') html = chartBoardNotice('The calculation did not finish', snapshot.error || 'Try again to request the recorded activity streams.', action);
  else if (snapshot.status !== 'ready') html = chartBoardNotice('Find the best recorded efforts', 'Calculate this period from the recorded power samples. Each result links to its winning ride and time window.', action);
  else html = `${points.length ? powerDurationChart(points.map(point => ({ seconds: point.duration_s, watts: point.average_w })), item.size === 1) : chartBoardNotice('No continuous recorded efforts', 'The returned rides need confirmed power-meter data and consecutive samples. Try a different date range.', action)}<p class="cb-caption">${numberLabel(snapshot.processed - snapshot.unavailable_activities)} rides with eligible efforts · ${numberLabel(snapshot.unavailable_activities)} unavailable${coverageLimited ? ' · Incomplete period coverage' : ''}</p>${points.length ? chartBoardExpanded === item.id ? action : '<button type="button" class="record-link" data-period-power-calculate>Refresh period charts</button>' : ''}`;
  return { html, headers: ['Effort duration', 'Recorded power (W)', 'Source ride', 'Source window (elapsed)', 'Eligible windows'], rows: points.map(point => [elapsedLabel(point.duration_s), numberLabel(point.average_w, '', 1), chartBoardSource(point), chartBoardSourceWindow(point), numberLabel(point.candidate_count)]), notes: snapshot.caveats || ['The curve shows observed efforts from eligible recorded samples. It is not a prediction or physiological model.', 'Missing samples and known pauses break an effort. The last source-window boundary is exclusive.'] };
}
function chartBoardSavedPower(item) {
  const bests = new Map();
  for (const activity of chartBoardActivities().filter(a => a.device_watts === true)) {
    for (const [duration, watts] of Object.entries(activity.power_curve || {})) {
      if (!(Number(duration) > 0) || explorerNumber(watts) == null || watts < 0) continue;
      if (!bests.has(duration) || bests.get(duration).watts < watts) bests.set(duration, { seconds: Number(duration), watts, activity_id: activity.id, activity_name: activity.name, day: activity.start_date });
    }
  }
  const points = [...bests.values()].sort((a, b) => a.seconds - b.seconds);
  return { html: points.length ? `${powerDurationChart(points, item.size === 1)}<p class="cb-caption">Saved curves · Source intervals not revalidated</p>` : chartBoardNotice('No saved curves in this period', 'Choose a period with cycling power-meter recordings.', '<button type="button" class="record-link" data-analysis-tab="history">Review activity history →</button>'), headers: ['Duration', 'Saved power (W)', 'Date (UTC)', 'Source ride'], rows: points.map(point => [elapsedLabel(point.seconds), numberLabel(point.watts), safe(utcLabel(point.day)), chartBoardSource(point)]), notes: ['These legacy saved curves have not been revalidated for pauses, missing samples or source intervals. Use Power-duration curve for source-window calculations.', analysis.trends?.coverage_limited ? 'Activity coverage is incomplete.' : 'Only returned cycling activities with confirmed power-meter data are included.'] };
}
function chartBoardLoad(item) {
  const rows = analysis.trends?.load || [];
  const definitions = [['ctl', 'Fitness (CTL)', '#2869a4'], ['atl', 'Fatigue (ATL)', '#8253aa'], ['tsb', 'Form (TSB)', '#2d806a']];
  const selected = definitions.filter(([key]) => item.metric === 'all' || key === item.metric);
  const controls = `<label class="cb-inline-field">Show<select data-board-metric="${item.id}"><option value="all" ${item.metric === 'all' ? 'selected' : ''}>Fitness, fatigue and form</option>${definitions.map(([key, name]) => `<option value="${key}" ${item.metric === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  return { html: controls + dataChart(selected.map(([key, name, color]) => ({ name, color, points: rows.map(row => [Date.parse(row.metric_date), explorerNumber(row[key])]) })), 'Recorded training load', 'load', 129600000, null, null, item.size === 1), headers: ['Date (UTC)', 'Fitness (CTL)', 'Fatigue (ATL)', 'Form (TSB)', 'Daily TSS'], rows: rows.map(row => [safe(utcLabel(row.metric_date)), numberLabel(row.ctl, '', 1), numberLabel(row.atl, '', 1), numberLabel(row.tsb, '', 1), numberLabel(row.daily_tss, '', 1)]), notes: ['These are saved training-load model observations, not direct measurements of fitness or recovery.', 'CTL and ATL use 42-day and 7-day load models. Form is their difference at the start of the day. Missing days remain gaps.'] };
}
function chartBoardRamp(item) {
  const ramp = chartExplorerEvidence()?.ramp;
  if (!ramp) return { html: chartBoardNotice('Ramp-rate evidence is unavailable', 'Refresh the selected date range to request the required dated values.', '<button type="button" class="secondary" data-analysis-retry="charts">Refresh data</button>') };
  const points = ramp.points || [], last = points.at(-1);
  return { html: chartBoardReadout(explorerSigned(last?.value), 'CTL / week', 'Latest seven-day change') + dataChart([{ name: 'Seven-day CTL change', color: '#345c42', points: points.map(point => [Date.parse(point.day), explorerNumber(point.value)]) }], 'Seven-day CTL change', 'CTL/week', 129600000, null, null, item.size === 1), headers: ['Date (UTC)', 'CTL change', 'Baseline date', 'Baseline CTL', 'Current CTL'], rows: points.map(point => [safe(explorerDate(point.day)), explorerSigned(point.value), safe(explorerDate(point.from_day)), numberLabel(point.from_ctl, '', 1), numberLabel(point.to_ctl, '', 1)]), notes: ramp.caveats || ['Difference between two stored CTL observations exactly seven days apart. Missing endpoints are not interpolated.', 'Rising load does not by itself indicate whether a change is suitable for this athlete.'] };
}
function chartBoardEfforts(item) {
  const evidence = chartExplorerEvidence()?.efforts;
  const points = (evidence?.points || []).filter(point => point.duration_s === item.duration && explorerNumber(point.watts) != null).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const label = CHART_EXPLORER_DURATIONS.find(([seconds]) => seconds === item.duration)[1];
  const controls = `<label class="cb-inline-field">Effort duration<select data-board-duration="${item.id}">${CHART_EXPLORER_DURATIONS.map(([seconds, name]) => `<option value="${seconds}" ${item.duration === seconds ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  return { html: controls + dataChart([{ name: `${label} daily best`, color: '#3467a0', points: points.map(point => [Date.parse(point.day), point.watts]) }], `${label} best saved effort`, 'watts', Infinity, null, null, item.size === 1) + `<p class="cb-caption">Saved curve records · ${points.length} recorded days${evidence?.coverage_limited ? ' · Incomplete coverage' : ''}</p>`, headers: ['Date (UTC)', 'Saved power (W)', 'Source ride', 'Provider'], rows: points.map(point => [safe(explorerDate(point.day)), numberLabel(point.watts, '', 1), chartBoardSource(point), safe(point.source || 'Not recorded')]), notes: evidence?.caveats || ['Daily bests from legacy saved power curves; their source intervals have not been revalidated.', 'The line joins recorded days. It does not estimate efforts on missing days.'] };
}
function chartBoardVolume(item) {
  const activities = analysis.trends?.activities || [], weeks = weeklyRecords(activities);
  return { html: dataChart([{ name: 'Recorded hours', color: '#2869a4', points: weeks.map(week => [Date.parse(week.day), week.duration / 3600]) }], 'Weekly recorded time', 'hours', Infinity, null, null, item.size === 1) + `<p class="cb-caption">Monday–Sunday · Only sessions inside the selected dates${analysis.trends?.coverage_limited ? ' · Incomplete activity coverage' : ''}</p>`, headers: ['Week starts (UTC)', 'Recorded hours', 'Session count'], rows: weeks.map(week => [safe(utcLabel(week.day)), numberLabel(week.duration / 3600, '', 2), numberLabel(week.count)]), notes: ['Edge weeks can contain fewer than seven selected days. Weeks without returned activities are not inferred to be rest.', 'These are recorded subtotals. Missing activity duration is not a zero-duration session.'] };
}
function chartBoardComparison(item) {
  const evidence = chartExplorerEvidence(), comparison = evidence?.comparison;
  if (!comparison?.current || !comparison?.previous) return { html: chartBoardNotice('Comparison evidence is unavailable', 'Refresh the range to request both equal periods together.', '<button type="button" class="secondary" data-analysis-retry="charts">Refresh data</button>') };
  const { current, previous } = comparison;
  const html = `<p class="cb-caption">Selected period vs previous ${numberLabel(evidence.range?.days)} days</p><div class="cb-comparison">${CHART_COMPARISON_METRICS.filter(metric => chartBoardExpanded === item.id || metric.key !== 'distance_m').map(metric => {
    const selected = explorerNumber(current.metrics?.[metric.key]), prior = explorerNumber(previous.metrics?.[metric.key]), maximum = Math.max(selected || 0, prior || 0, 1);
    return `<div class="cb-comparison-row"><div><strong>${safe(metric.name)}</strong><span>${safe(explorerComparisonDelta(metric.key, comparison.delta?.[metric.key]))}</span></div>${[[selected, 'Selected'], [prior, 'Previous']].map(([value, label]) => `<div class="cb-comparison-bar"><span>${label}</span><i aria-hidden="true" style="--bar-width:${value == null ? 0 : value / maximum * 100}%"></i><b>${explorerComparisonValue(metric.key, value)}</b></div>`).join('')}</div>`;
  }).join('')}</div>`;
  return { html, headers: ['Measure', 'Selected period', 'Previous period', 'Change', 'Selected coverage', 'Previous coverage'], rows: CHART_COMPARISON_METRICS.map(metric => [safe(metric.name), explorerComparisonValue(metric.key, current.metrics?.[metric.key]), explorerComparisonValue(metric.key, previous.metrics?.[metric.key]), explorerComparisonDelta(metric.key, comparison.delta?.[metric.key]), safe(explorerCoverage(current, metric)), safe(explorerCoverage(previous, metric))]), notes: [`Selected: ${explorerPeriod(current)}. Previous: ${explorerPeriod(previous)}.`, ...(comparison.caveats || ['Missing measurements or incomplete activity coverage make the affected total and change unavailable.'])] };
}
function chartBoardSleep(item) {
  const t = analysis.trends || {}, readiness = t.readiness || [], wellness = t.wellness || [];
  return { html: dataChart([{ name: 'Trainable sleep', color: '#8253aa', points: readiness.map(row => [Date.parse(row.metric_date), explorerNumber(row.sleep_hours)]) }, { name: 'Intervals.icu sleep', color: '#2d806a', points: wellness.map(row => [Date.parse(row.day), explorerNumber(row.sleep_s) == null ? null : row.sleep_s / 3600]) }], 'Sleep duration', 'hours', 129600000, null, null, item.size === 1), headers: ['Date (UTC)', 'Source', 'Sleep (hours)'], rows: [...readiness.map(row => [safe(utcLabel(row.metric_date)), 'Trainable', numberLabel(row.sleep_hours, '', 1)]), ...wellness.map(row => [safe(utcLabel(row.day)), 'Intervals.icu', numberLabel(explorerNumber(row.sleep_s) == null ? null : row.sleep_s / 3600, '', 1)])], notes: ['Measurement methods can differ by source and device. Missing observations remain gaps.'] };
}
function chartBoardHistogram(bins, basis = 'time') {
  const work = basis === 'work', value = bin => work ? bin.work_j / 1000 : bin.duration_s / 60, unit = work ? ' kJ' : ' min';
  const width = Math.max(280, document.getElementById('analysis-content')?.clientWidth || 800), left = 48, right = width - 16, top = 20, bottom = 190;
  const maximum = Math.max(1, ...bins.map(value)), maxWatts = Math.max(25, ...bins.map(bin => bin.upper_w));
  const x = watts => left + watts / maxWatts * (right - left), y = minutes => bottom - minutes / maximum * (bottom - top);
  return `<div class="cb-histogram chart-frame"><svg class="data-chart" data-responsive-chart data-chart-left="48" data-chart-right="16" viewBox="0 0 ${width} 234" role="img" aria-label="Recorded ${work ? 'mechanical work' : 'time'} in 25-watt bins. Focus or point at a bar to read its value."><title>${work ? 'Mechanical work' : 'Time'} by recorded power output</title>${[0, .5, 1].map(fraction => `<line x1="${left}" x2="${right}" y1="${y(maximum * fraction)}" y2="${y(maximum * fraction)}"/><text x="${left - 8}" y="${y(maximum * fraction) + 4}" text-anchor="end">${numberLabel(maximum * fraction, '', 1)}</text>`).join('')}${bins.filter(bin => bin.duration_s > 0).map(bin => { const label = `${bin.lower_w}–${bin.upper_w} W: ${numberLabel(value(bin), unit, 1)} (${numberLabel(work ? bin.work_share_pct : bin.share_pct, '%', 1)} of covered ${work ? 'work' : 'time'})`; return `<path class="cb-bin" tabindex="0" role="img" aria-label="${safe(label)}" data-board-bin="${safe(label)}" d="M${x(bin.lower_w) + 1},${bottom} L${x(bin.lower_w) + 1},${y(value(bin))} L${Math.max(x(bin.lower_w) + 2, x(bin.upper_w) - 1)},${y(value(bin))} L${Math.max(x(bin.lower_w) + 2, x(bin.upper_w) - 1)},${bottom} Z"><title>${safe(label)}</title></path>`; }).join('')}${[0, .5, 1].map(fraction => `<text data-chart-tick x="${x(maxWatts * fraction)}" y="211" text-anchor="${fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}">${numberLabel(maxWatts * fraction)} W</text>`).join('')}<text x="${left}" y="14">${work ? 'Kilojoules' : 'Minutes'}</text></svg><p class="cb-bin-reading" role="status">Point at a bar or use Tab to inspect each power range.</p></div>`;
}
function chartBoardRide(item) {
  const activity = chartBoardActivity(item), entry = chartBoardDetail(item);
  if (!activity) return { html: chartBoardNotice('Choose a period with recorded rides', 'Cycling activities from the selected period will appear here.', '<button type="button" class="record-link" data-analysis-tab="history">Review activity history →</button>') };
  const controls = `<label class="cb-ride-field">Source ride<select data-board-activity="${item.id}">${chartBoardActivities().map(ride => `<option value="${safe(ride.id)}" ${ride.id === activity.id ? 'selected' : ''}>${safe(utcLabel(ride.start_date))} · ${safe(ride.name || 'Cycling activity')}</option>`).join('')}</select></label>`;
  if (!entry || entry.status === 'loading') return { html: controls + chartBoardNotice('Loading recorded ride data…', 'The selected ride supplies this chart’s measurements.'), loading: true };
  if (entry.status === 'error') return { html: controls + chartBoardNotice('Could not load this ride', entry.error, `<button type="button" class="secondary" data-board-retry="${item.id}">Try again</button>`) };
  const detail = entry.detail, data = detail.power_distribution_v1;
  const source = `<p class="cb-caption"><button type="button" class="record-link" data-activity="${safe(activity.id)}">Open full ride analysis ↗</button></p>`;
  let result;
  if (item.type === 'ridePower') {
    const empirical = detail.empirical_power_v1, points = empirical?.points || [];
    result = { html: points.length ? powerDurationChart(points.map(point => ({ seconds: point.duration_s, watts: point.average_w })), item.size === 1) : chartBoardNotice('No eligible continuous efforts', 'This chart requires confirmed power-meter data with consecutive recorded samples. Open the ride to review recording quality.'), headers: ['Duration', 'Average power (W)', 'Source window', 'Eligible windows'], rows: points.map(point => [elapsedLabel(point.duration_s), numberLabel(point.average_w, '', 1), chartBoardSourceWindow({ ...point, activity_id: activity.id }), numberLabel(point.candidate_count)]), notes: empirical?.caveats || ['Only consecutive recorded samples contribute. Missing samples and known pauses break an effort.', 'Each source window is an observed interval, not a modeled prediction. Its last boundary is exclusive.'] };
  } else if (item.type === 'laps') {
    const laps = detail.laps || [], maximum = Math.max(1, ...laps.map(lap => explorerNumber(lap.avg_watts) || 0));
    result = { html: laps.length ? `<div class="cb-laps">${laps.slice(0, chartBoardExpanded === item.id ? laps.length : 5).map((lap, index) => `<div><span>${safe(lap.name || `Lap ${index + 1}`)}<small>${elapsedLabel(lap.elapsed_s)}</small></span><i aria-hidden="true" style="--bar-width:${(explorerNumber(lap.avg_watts) || 0) / maximum * 100}%"></i><strong>${numberLabel(lap.avg_watts, ' W')}<small>${numberLabel(lap.avg_hr, ' bpm')}</small></strong></div>`).join('')}</div>${laps.length > 5 && chartBoardExpanded !== item.id ? `<p class="cb-caption">First 5 of ${laps.length} laps · Open details to see every lap</p>` : ''}` : chartBoardNotice('No recorded lap markers', 'Open the full ride to select and analyze a time interval.'), headers: ['Lap', 'Start', 'Duration', 'Average power (W)', 'Average HR (bpm)', 'Cadence (rpm)'], rows: laps.map((lap, index) => [safe(lap.name || `Lap ${index + 1}`), elapsedLabel(lap.start_s), elapsedLabel(lap.elapsed_s), numberLabel(lap.avg_watts), numberLabel(lap.avg_hr), numberLabel(lap.avg_cadence)]), notes: ['Lap values are the summaries saved by the recording provider. Missing measurements are not zero.'] };
  } else if (!data || data.status !== 'available') result = { html: chartBoardNotice('Recorded power distribution is unavailable', 'This ride needs confirmed power-meter samples with valid timestamps. Try another ride or open its recording details.'), notes: [data?.unavailable_reason ? `Data availability: ${String(data.unavailable_reason).replaceAll('_', ' ')}.` : 'The connected service did not return power-distribution evidence.'] };
  else if (item.type === 'zones') {
    const zones = data.zones, bands = zones?.bands || [];
    result = { html: zones?.status === 'available' ? `<p class="cb-caption">Dated FTP ${numberLabel(zones.ftp_watts, ' W')} · Reference bands</p><div class="cb-zones">${bands.map((band, index) => `<div><span>${safe(band.label)}</span><i class="cb-zone-${index}" style="--bar-width:${Math.max(0, Math.min(100, band.share_pct))}%" aria-hidden="true"></i><strong>${numberLabel(band.duration_s / 60, ' min', 1)}<small>${numberLabel(band.share_pct, '%', 1)}</small></strong></div>`).join('')}</div>` : chartBoardNotice('Historical FTP is needed', 'This ride has recorded power, but no verified FTP for its date. Its power distribution is still available. Current FTP is not substituted.', `<button type="button" class="record-link" data-board-add="distribution">Add power distribution →</button>`), headers: ['Reference band', 'Lower power (W)', 'Upper power (W)', 'Covered time (s)', 'Share of covered time (%)'], rows: bands.map(band => [safe(band.label), numberLabel(band.lower_w, '', 1), band.upper_w == null ? 'No upper limit' : numberLabel(band.upper_w, '', 1), numberLabel(band.duration_s, '', 1), numberLabel(band.share_pct, '', 2)]), notes: ['Fixed Trainable reference FTP bands, using the FTP that applied on the ride date. These are not custom historical zone definitions.', 'The upper boundary belongs to the band; the next band starts above that boundary. Percentages describe covered recorded time only.', `Historical setting: ${zones?.setting_id || 'unavailable'}; revision ${zones?.setting_revision ?? 'unavailable'}.`] };
  } else {
    result = { html: chartBoardHistogram(data.bins || []) + `<p class="cb-caption">${numberLabel(data.totals?.covered_s / 60, ' min', 1)} covered · ${numberLabel(data.totals?.coverage_pct, '%', 1)} of recorded span</p>`, headers: ['From power (W)', 'To power, exclusive (W)', 'Covered time (s)', 'Share of covered time (%)', 'Mechanical work (kJ)'], rows: (data.bins || []).map(bin => [numberLabel(bin.lower_w), numberLabel(bin.upper_w), numberLabel(bin.duration_s, '', 1), numberLabel(bin.share_pct, '', 2), numberLabel(bin.work_j / 1000, '', 2)]), notes: [`Time weighted from recorded timestamps; a sample can cover at most ${data.policy?.max_hold_s || 10} seconds. The final sample is not extended.`, `${numberLabel(data.exclusions?.gap_s, ' s', 1)} excluded as gaps; ${numberLabel(data.exclusions?.missing_power_s, ' s', 1)} missing power; ${numberLabel(data.exclusions?.invalid_power_s, ' s', 1)} invalid power.`, 'Zero-watt readings count as recorded coasting. Unknown time is not zero power. Percentages describe covered time only.', `Calculation: ${data.algorithm_version || 'unavailable'}.`] };
  }
  return { ...result, html: controls + result.html + source };
}
function chartBoardResult(item) {
  if (!analysis.trends) return { html: chartBoardNotice('Loading the selected period…', 'Each chart will appear as its source data arrives.'), loading: true };
  if (analysis.trends.error) return { html: chartBoardNotice('Could not load this period', analysis.trends.error, '<button type="button" class="secondary" data-analysis-retry="charts">Try again</button>') };
  if (CHART_BOARD_CATALOG.find(chart => chart.type === item.type)?.ride) return chartBoardRide(item);
  const render = { power: chartBoardPower, recordedPowerProfile: chartBoardPowerProfile, recordedEfforts: chartBoardRecordedEfforts, periodDistribution: chartBoardPeriodDistribution, intensity: chartBoardIntensity, savedPower: chartBoardSavedPower, load: chartBoardLoad, ramp: chartBoardRamp, efforts: chartBoardEfforts, volume: chartBoardVolume, comparison: chartBoardComparison, sleep: chartBoardSleep }[item.type];
  return render ? render(item) : { html: '' };
}
function chartBoardBody(item) {
  const result = chartBoardResult(item), expanded = chartBoardExpanded === item.id;
  return `<div class="cb-chart-content" ${result.loading ? 'aria-busy="true"' : ''}>${result.html}</div>${expanded ? `<section class="cb-source-data">${chartBoardSourceMarkup(item, result)}</section>` : ''}`;
}
function chartBoardSourceMarkup(item, result) {
  return `<div class="cb-source-heading"><div><h4>Source data</h4><p>Missing values appear as — · Dates in UTC</p></div><button type="button" class="secondary" data-board-export="${item.id}">Export data (CSV)</button></div>${tableMarkup(result.headers || ['Availability'], result.rows || [], 'No source rows are available for this chart.')}${result.extra || ''}<div class="cb-method"><h4>How to read this chart</h4><ul>${(result.notes || ['Open the source activity to inspect the recorded measurements.']).map(note => `<li>${safe(note)}</li>`).join('')}</ul></div>`;
}
// deno-lint-ignore no-unused-vars
function chartBoardRefreshProfile() {
  if (analysis.tab !== 'charts' || !document.querySelector('.chart-board')) return;
  const active = document.activeElement, focusCard = active?.closest('[data-board-card]')?.dataset.boardCard;
  const restoreAction = active?.matches('[data-profile-calculate],[data-profile-cancel]');
  for (const item of chartBoardPreferences().filter(card => card.type === 'recordedPowerProfile')) {
    const body = document.querySelector(`[data-board-card="${item.id}"] .cb-card-body`), output = body?.querySelector('.cb-profile-output');
    if (!output) continue;
    const result = chartBoardPowerProfile(item); output.innerHTML = result.output;
    const status = body.querySelector('[data-profile-live]'); if (status) status.textContent = chartBoardProfileStatus(powerProfileSnapshot(item));
    const source = body.querySelector('.cb-source-data'); if (source) source.innerHTML = chartBoardSourceMarkup(item, result);
  }
  if (restoreAction) document.querySelector(`[data-board-card="${focusCard}"] [data-profile-cancel], [data-board-card="${focusCard}"] [data-profile-calculate]`)?.focus({ preventScroll: true });
}
// Period calculations update their own cards without disturbing other charts or controls.
// deno-lint-ignore no-unused-vars
function chartBoardRefreshPower() {
  if (analysis.tab !== 'charts' || !document.querySelector('.chart-board')) return;
  const focused = document.activeElement;
  const focusCard = focused?.closest('[data-board-card]')?.dataset.boardCard;
  const focusWasAction = Boolean(focused?.matches('[data-period-power-calculate],[data-period-power-cancel]'));
  const focusWasToolbar = Boolean(focused?.closest('.cb-period-run'));
  for (const item of chartBoardPreferences().filter(card => CHART_BOARD_PERIOD_TYPES.includes(card.type))) {
    const body = document.querySelector(`[data-board-card="${item.id}"] .cb-card-body`);
    if (body) body.innerHTML = chartBoardBody(item);
  }
  const actions = document.querySelector('.cb-period-actions');
  if (actions) actions.innerHTML = chartBoardPeriodActionMarkup();
  const status = document.getElementById('period-chart-status');
  if (status) status.textContent = chartBoardPeriodStatusText();
  if (focusWasAction && focusCard) document.querySelector(`[data-board-card="${focusCard}"] [data-period-power-cancel], [data-board-card="${focusCard}"] [data-period-power-calculate]`)?.focus({ preventScroll: true });
  else if (focusWasToolbar) actions?.querySelector('button')?.focus({ preventScroll: true });
}
function chartBoardExportEvidence(item) {
  const evidence = chartExplorerEvidence(), detail = chartBoardDetail(item)?.detail, activity = chartBoardActivity(item), t = analysis.trends || {};
  let headers = [], rows = [];
  if (item.type === 'recordedPowerProfile') {
    const snapshot = powerProfileSnapshot(item), profile = snapshot.status === 'ready' ? snapshot.evidence : null;
    headers = ['duration_s', 'period', 'period_from_utc', 'period_to_utc', 'average_w', 'activity_id', 'activity_name', 'activity_start_utc', 'source_from_s', 'source_to_s_exclusive', 'source_candidate_count', 'quality', 'flags', 'age_days_at_period_end', 'age_days_at_comparison_end', 'eligible_activities', 'eligible_days', 'candidate_windows', 'change_w', 'change_pct', 'change_pct_unavailable_reason', 'pair_status', 'expected_activities', 'received_activities', 'effort_activities', 'unavailable_effort_activities', 'coverage_limited', 'overlap_days', 'unequal_period_lengths', 'unequal_opportunities', 'algorithm_version', 'comparison_version'];
    if (profile) rows = profile.rows.filter(row => item.profileDurations.includes(row.duration_s)).flatMap(row => ['current', 'reference'].map(key => {
      const point = row[key], period = profile.periods[key], opportunities = row[`${key}_opportunities`], coverage = period.coverage;
      return [row.duration_s, key === 'current' ? 'selected' : 'reference', period.range.from, period.range.to, point?.average_w, point?.activity_id, point?.activity_name, point?.start_date, point?.from_s, point?.to_s, point?.candidate_count, point?.quality, point?.flags?.join('; '), point?.age_days_at_range_end, point?.age_days_at_comparison_end, opportunities.eligible_activities, opportunities.eligible_days, opportunities.candidate_windows, row.change_w, row.change_pct, row.change_pct_unavailable_reason, row.status, coverage.expected_activities, coverage.received_activities, coverage.effort_activities, coverage.unavailable_effort_activities, coverage.coverage_limited, profile.overlap?.days || 0, profile.unequal_period_lengths, row.unequal_opportunities, point?.algorithm_version, profile.version];
    }));
  } else if (item.type === 'power') {
    const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : {};
    headers = ['duration_s', 'average_w', 'activity_id', 'activity_name', 'source_from_s', 'source_to_s_exclusive', 'candidate_count', 'algorithm_version', 'processed_activities', 'unavailable_activities', 'coverage_limited'];
    if (snapshot.status === 'ready') rows = (snapshot.points || []).map(point => [point.duration_s, point.average_w, point.activity_id, point.activity_name, point.from_s, point.to_s, point.candidate_count, point.algorithm_version, snapshot.processed, snapshot.unavailable_activities, snapshot.evidence?.efforts?.coverage_limited ?? snapshot.coverage_limited]);
  } else if (CHART_BOARD_PERIOD_TYPES.includes(item.type)) {
    const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : {};
    const period = snapshot.status === 'ready' ? snapshot.evidence : null;
    if (period && item.type === 'recordedEfforts') {
      headers = ['date_utc', 'duration_s', 'average_w', 'activity_id', 'activity_name', 'source_from_s', 'source_to_s_exclusive', 'candidate_count', 'quality', 'flags', 'record_in_selected_period', 'age_days_at_range_end', 'algorithm_version', 'effort_activities', 'unavailable_effort_activities', 'coverage_limited', 'evidence_version'];
      rows = period.efforts.points.filter(point => point.duration_s === item.duration).map(point => [point.day, point.duration_s, point.average_w, point.activity_id, point.activity_name, point.from_s, point.to_s, point.candidate_count, point.quality, point.flags.join('; '), point.record_in_selected_period, point.age_days_at_range_end, point.algorithm_version, period.coverage.effort_activities, period.coverage.unavailable_effort_activities, period.efforts.coverage_limited, period.version]);
    } else if (period && item.type === 'periodDistribution') {
      const distribution = period.distribution, totals = distribution.totals;
      headers = ['row_kind', 'lower_w_inclusive', 'upper_w_exclusive', 'duration_s', 'time_share_pct', 'work_j', 'work_share_pct', 'interval_count', 'activity_id', 'activity_name', 'activity_start_utc', 'recorded_span_s', 'total_covered_s', 'total_work_j', 'total_recorded_span_s', 'recorded_span_coverage_pct', 'usable_activity_count', 'unavailable_activity_count', 'coverage_limited', 'algorithm_version', 'evidence_version'];
      const metadata = [totals.covered_s, totals.work_j, totals.recorded_span_s, totals.coverage_pct, period.coverage.distribution_activities, period.coverage.unavailable_distribution_activities, distribution.coverage_limited, distribution.algorithm_version, period.version];
      rows = [...distribution.bins.map(bin => ['power_bin', bin.lower_w, bin.upper_w, bin.duration_s, bin.share_pct, bin.work_j, bin.work_share_pct, bin.interval_count, null, null, null, null, ...metadata]), ...distribution.sources.map(source => ['source_ride', null, null, source.covered_s, null, source.work_j, null, null, source.activity_id, source.activity_name, source.start_date, source.recorded_span_s, ...metadata])];
    } else if (period && item.type === 'intensity') {
      const intensity = period.intensity;
      headers = ['row_kind', 'week_from_utc', 'week_to_utc', 'reference_band_key', 'reference_band', 'duration_s', 'time_share_pct', 'work_j', 'work_share_pct', 'activity_id', 'activity_name', 'activity_start_utc', 'dated_ftp_w', 'setting_id', 'setting_revision', 'dated_ftp_available', 'zoned_s', 'missing_ftp_s', 'zoned_work_j', 'missing_ftp_work_j', 'coverage_limited', 'scheme_id', 'evidence_version'];
      const metadata = [intensity.coverage.zoned_s, intensity.coverage.missing_ftp_s, intensity.coverage.work_j, intensity.coverage.missing_ftp_work_j, intensity.coverage_limited, intensity.scheme_id, period.version];
      const bandRow = (band, week = null) => [week ? 'weekly_reference_band' : 'period_reference_band', week?.from, week?.to, band.key, band.label, band.duration_s, band.share_pct, band.work_j, band.work_share_pct, null, null, null, null, null, null, null, ...metadata];
      rows = [...(item.grouping === 'weekly' ? intensity.weeks.flatMap(week => week.bands.map(band => bandRow(band, week))) : intensity.status === 'available' ? intensity.bands.map(band => bandRow(band)) : []), ...period.distribution.sources.map(source => ['source_ride', null, null, null, null, source.covered_s, null, source.work_j, null, source.activity_id, source.activity_name, source.start_date, source.ftp_watts, source.setting_id, source.setting_revision, source.zones_available, ...metadata])];
    }
  } else if (item.type === 'ramp') {
    headers = ['date_utc', 'ctl_change_per_7_days', 'baseline_date_utc', 'baseline_ctl', 'current_ctl', 'evidence_version'];
    rows = (evidence?.ramp?.points || []).map(point => [point.day, point.value, point.from_day, point.from_ctl, point.to_ctl, evidence.version]);
  } else if (item.type === 'efforts') {
    headers = ['date_utc', 'duration_s', 'saved_power_w', 'activity_id', 'activity_name', 'provider', 'source_interval_verified', 'coverage_limited', 'evidence_version'];
    rows = (evidence?.efforts?.points || []).filter(point => point.duration_s === item.duration).map(point => [point.day, point.duration_s, point.watts, point.activity_id, point.activity_name, point.source, false, evidence.efforts.coverage_limited, evidence.version]);
  } else if (item.type === 'comparison') {
    const comparison = evidence?.comparison;
    headers = ['measure', 'unit', 'selected_total', 'previous_total', 'absolute_change', 'change_pct', 'selected_observed_subtotal', 'previous_observed_subtotal', 'selected_records', 'previous_records', 'selected_measure_records', 'previous_measure_records', 'selected_coverage_limited', 'previous_coverage_limited', 'previous_period_from_utc', 'previous_period_to_utc', 'evidence_version'];
    if (comparison?.current && comparison?.previous) rows = CHART_COMPARISON_METRICS.map(metric => [metric.key, { activity_count: 'count', duration_s: 'seconds', distance_m: 'metres', tss: 'TSS' }[metric.key], comparison.current.metrics?.[metric.key], comparison.previous.metrics?.[metric.key], comparison.delta?.[metric.key], comparison.delta_pct?.[metric.key], comparison.current.observed_totals?.[metric.key], comparison.previous.observed_totals?.[metric.key], comparison.current.coverage?.returned_activities, comparison.previous.coverage?.returned_activities, metric.coverage ? comparison.current.coverage?.[metric.coverage] : comparison.current.coverage?.returned_activities, metric.coverage ? comparison.previous.coverage?.[metric.coverage] : comparison.previous.coverage?.returned_activities, comparison.current.coverage?.limited, comparison.previous.coverage?.limited, comparison.previous.from, comparison.previous.to, evidence.version]);
  } else if (item.type === 'distribution' || item.type === 'zones') {
    const distribution = detail?.power_distribution_v1;
    const commonHeaders = ['activity_id', 'covered_s', 'recorded_span_s', 'coverage_pct', 'gap_s', 'missing_power_s', 'invalid_power_s', 'algorithm_version'];
    const common = [activity?.id, distribution?.totals?.covered_s, distribution?.totals?.recorded_span_s, distribution?.totals?.coverage_pct, distribution?.exclusions?.gap_s, distribution?.exclusions?.missing_power_s, distribution?.exclusions?.invalid_power_s, distribution?.algorithm_version];
    if (item.type === 'distribution') {
      headers = ['lower_w_inclusive', 'upper_w_exclusive', 'duration_s', 'share_pct', 'work_j', 'interval_count', ...commonHeaders];
      rows = (distribution?.bins || []).map(bin => [bin.lower_w, bin.upper_w, bin.duration_s, bin.share_pct, bin.work_j, bin.interval_count, ...common]);
    } else {
      const zones = distribution?.zones;
      headers = ['reference_band', 'lower_w', 'upper_w_inclusive', 'duration_s', 'share_pct', 'work_j', 'historical_ftp_w', 'setting_id', 'setting_revision', 'scheme_id', 'boundary_convention', ...commonHeaders];
      rows = (zones?.bands || []).map(band => [band.label, band.lower_w, band.upper_w, band.duration_s, band.share_pct, band.work_j, zones.ftp_watts, zones.setting_id, zones.setting_revision, zones.scheme_id, zones.boundary_convention, ...common]);
    }
  } else if (item.type === 'ridePower') {
    headers = ['duration_s', 'average_w', 'source_from_s', 'source_to_s_exclusive', 'candidate_count', 'activity_id', 'algorithm_id'];
    rows = (detail?.empirical_power_v1?.points || []).map(point => [point.duration_s, point.average_w, point.from_s, point.to_s, point.candidate_count, activity?.id, detail.empirical_power_v1.algorithm_id]);
  } else if (item.type === 'load') {
    headers = ['date_utc', 'ctl', 'atl', 'tsb', 'daily_tss']; rows = (t.load || []).map(row => [row.metric_date, row.ctl, row.atl, row.tsb, row.daily_tss]);
  } else if (item.type === 'volume') {
    headers = ['week_start_utc', 'recorded_duration_s', 'activity_count', 'coverage_limited']; rows = weeklyRecords(t.activities || []).map(week => [week.day, week.duration, week.count, Boolean(t.coverage_limited)]);
  } else if (item.type === 'laps') {
    headers = ['activity_id', 'lap_name', 'start_s', 'elapsed_s', 'avg_watts', 'avg_hr_bpm', 'avg_cadence_rpm']; rows = (detail?.laps || []).map((lap, index) => [activity?.id, lap.name || `Lap ${index + 1}`, lap.start_s, lap.elapsed_s, lap.avg_watts, lap.avg_hr, lap.avg_cadence]);
  } else if (item.type === 'sleep') {
    headers = ['date_utc', 'source', 'sleep_hours']; rows = [...(t.readiness || []).map(row => [row.metric_date, 'Trainable', row.sleep_hours]), ...(t.wellness || []).map(row => [row.day, 'Intervals.icu', explorerNumber(row.sleep_s) == null ? null : row.sleep_s / 3600])];
  } else if (item.type === 'savedPower') {
    headers = ['duration_s', 'saved_power_w', 'activity_id', 'activity_name', 'date_utc', 'source_interval_verified'];
    const bests = new Map();
    for (const ride of chartBoardActivities().filter(record => record.device_watts === true)) for (const [seconds, watts] of Object.entries(ride.power_curve || {})) {
      if (!(Number(seconds) > 0) || explorerNumber(watts) == null || watts < 0) continue;
      if (!bests.has(seconds) || bests.get(seconds)[1] < watts) bests.set(seconds, [Number(seconds), watts, ride.id, ride.name, ride.start_date, false]);
    }
    rows = [...bests.values()].sort((a, b) => a[0] - b[0]);
  }
  return { headers: [...headers, 'selected_period_from_utc', 'selected_period_to_utc', 'chart_type'], rows: rows.map(row => [...row, analysis.range.from, analysis.range.to, item.type]) };
}
function chartBoardCard(item, index, count) {
  const definition = CHART_BOARD_CATALOG.find(chart => chart.type === item.type), expanded = chartBoardExpanded === item.id;
  return `<article class="cb-card ${item.size === 2 ? 'cb-wide' : ''} ${expanded ? 'cb-expanded' : ''}" data-board-card="${item.id}" data-board-type="${item.type}" aria-labelledby="${item.id}-title"><header class="cb-card-head"><button type="button" draggable="true" class="cb-drag" data-board-drag="${item.id}" aria-label="Move ${safe(definition.title)}. Use Alt and arrow keys, or the chart menu." title="Drag to rearrange; Alt + arrow keys also move"><span aria-hidden="true">⠿</span></button><div><p>${safe(definition.group)}</p><h4 id="${item.id}-title">${safe(definition.title)}</h4></div><details class="cb-card-menu"><summary aria-label="Options for ${safe(definition.title)}"><span aria-hidden="true">•••</span></summary><div class="cb-menu-content"><button type="button" data-board-size="${item.id}">${item.size === 1 ? 'Make rectangle · 2 spaces' : 'Make square · 1 space'}</button><button type="button" data-board-duplicate="${item.id}">Duplicate chart</button><button type="button" data-board-move="${item.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Move earlier</button><button type="button" data-board-move="${item.id}" data-direction="1" ${index === count - 1 ? 'disabled' : ''}>Move later</button><button type="button" data-board-remove="${item.id}">Remove from page</button></div></details></header><div class="cb-card-body">${chartBoardBody(item)}</div><footer class="cb-card-footer"><span>${item.size === 1 ? 'Square · 1 space' : 'Rectangle · 2 spaces'}</span><button type="button" class="record-link" data-board-expand="${item.id}" aria-expanded="${expanded}">${expanded ? 'Close details ↑' : 'Inspect data ↗'}</button></footer></article>`;
}
function chartBoardCatalogMarkup() {
  return `<details class="cb-catalog"><summary class="primary">Add chart <span aria-hidden="true">＋</span></summary><div class="cb-catalog-body"><div class="cb-catalog-heading"><div><h4>Build your analysis page</h4><p>Add a chart more than once to compare durations or rides.</p></div><label>Find a chart<input type="search" data-board-search placeholder="Power, load, laps…"></label></div><div class="cb-catalog-grid">${CHART_BOARD_CATALOG.map(chart => `<button type="button" data-board-add="${chart.type}" data-board-search-text="${safe(`${chart.title} ${chart.group} ${chart.description}`.toLowerCase())}"><span>${safe(chart.group)}</span><strong>${safe(chart.title)}</strong><p>${safe(chart.description)}</p><b>Add chart ＋</b></button>`).join('')}</div><p class="cb-search-empty" hidden>No charts match. <button type="button" class="record-link" data-board-clear-search>Clear search</button></p></div></details>`;
}
// Called by analytics.js and the period-power calculation when evidence changes.
function paintChartBoard() {
  const container = document.getElementById('analysis-content');
  if (!container) return;
  if (chartBoardActiveAthlete !== state.athleteId) { chartBoardActiveAthlete = state.athleteId; chartBoardExpanded = null; chartBoardUndo = null; }
  if (chartBoardActiveScope !== chartBoardScope()) { chartBoardActiveScope = chartBoardScope(); chartBoardDetails.clear(); }
  const items = chartBoardPreferences();
  invalidatePowerProfile();
  if (!items.some(item => item.id === chartBoardExpanded)) chartBoardExpanded = null;
  const catalogOpen = container.querySelector('.cb-catalog')?.open || false;
  const search = container.querySelector('[data-board-search]')?.value || '';
  const active = document.activeElement?.closest('[data-board-card]');
  const focusCard = active?.dataset.boardCard;
  container.innerHTML = `<section class="chart-board" aria-labelledby="chart-board-title"><header class="cb-heading"><div><p class="eyebrow">YOUR ANALYSIS WORKSPACE</p><h3 id="chart-board-title">Chart board</h3><p>Put the important questions side by side.</p></div><div class="cb-workspace-note"><strong>${items.length} ${items.length === 1 ? 'chart' : 'charts'}</strong><span>Layout saved in this browser</span></div></header>${rangeForm()}<div class="cb-toolbar">${chartBoardCatalogMarkup()}<p>Drag the grip to arrange. Use each chart’s menu to resize or move.</p></div>${items.some(item => CHART_BOARD_PERIOD_TYPES.includes(item.type)) ? `<div class="cb-period-run"><div class="cb-period-actions">${chartBoardPeriodActionMarkup()}</div><p id="period-chart-status" role="status" aria-live="polite"></p></div>` : ''}<div id="chart-board-status" class="cb-status" role="status" aria-live="polite">${chartBoardUndo ? 'Chart removed. <button type="button" class="record-link" data-board-undo>Undo removal</button>' : ''}</div>${analysis.trends?.coverage_limited ? '<p class="explorer-data-warning">The returned activity list is incomplete. Narrow the selected period for complete coverage.</p>' : ''}<div class="cb-grid">${items.map((item, index) => chartBoardCard(item, index, items.length)).join('')}</div>${!items.length ? '<div class="cb-empty"><h4>Your chart board is ready</h4><p>Add the charts you want to review together. You can start with one and grow from there.</p><button type="button" class="primary" data-board-open-catalog>Add your first chart</button></div>' : ''}</section>`;
  const catalog = container.querySelector('.cb-catalog');
  catalog.open = catalogOpen;
  const input = container.querySelector('[data-board-search]');
  input.value = search;
  chartBoardFilterCatalog(search);
  const periodStatus = container.querySelector('#period-chart-status');
  if (periodStatus) periodStatus.textContent = chartBoardPeriodStatusText();
  chartBoardObserve(container);
  if (focusCard) container.querySelector(`[data-board-drag="${focusCard}"]`)?.focus({ preventScroll: true });
}
function chartBoardFilterCatalog(query) {
  const normalized = query.toLowerCase().trim();
  const buttons = [...document.querySelectorAll('[data-board-search-text]')];
  buttons.forEach(button => { button.hidden = !button.dataset.boardSearchText.includes(normalized); });
  const empty = document.querySelector('.cb-search-empty');
  if (empty) empty.hidden = buttons.some(button => !button.hidden);
}
function chartBoardObserve(container) {
  chartBoardObserver?.disconnect(); chartBoardGridObserver?.disconnect();
  const grid = container.querySelector('.cb-grid');
  const sizeGrid = () => {
    const width = grid.clientWidth, columns = Math.min(4, Math.max(1, Math.floor((width + 16) / 406)));
    grid.style.setProperty('--cb-columns', columns);
    grid.style.setProperty('--cb-unit', `${Math.max(0, (width - (columns - 1) * 16) / columns)}px`);
    grid.classList.toggle('cb-one-column', columns === 1);
  };
  sizeGrid();
  if (typeof ResizeObserver !== 'undefined') { chartBoardGridObserver = new ResizeObserver(sizeGrid); chartBoardGridObserver.observe(grid); }
  const rideCards = [...container.querySelectorAll('[data-board-card]')].filter(card => CHART_BOARD_CATALOG.find(chart => chart.type === card.dataset.boardType)?.ride);
  if (typeof IntersectionObserver === 'undefined') { rideCards.forEach(card => chartBoardEnsureDetail(card.dataset.boardCard)); return; }
  chartBoardObserver = new IntersectionObserver(entries => entries.filter(entry => entry.isIntersecting).forEach(entry => { chartBoardObserver.unobserve(entry.target); chartBoardEnsureDetail(entry.target.dataset.boardCard); }), { rootMargin: '240px' });
  rideCards.forEach(card => chartBoardObserver.observe(card));
}
async function chartBoardEnsureDetail(id, force = false) {
  const item = chartBoardPreferences().find(card => card.id === id), athlete = state.athleteId, scope = chartBoardScope();
  if (!item || !analysis.trends || analysis.trends.error) return;
  const activity = chartBoardActivity(item);
  if (!activity) return;
  const key = `${scope}:${activity.id}`;
  if (chartBoardInFlight.has(key) || (!force && chartBoardDetails.has(key))) return;
  chartBoardDetails.set(key, { status: 'loading' });
  const request = portal('activity_detail', { athlete_id: athlete, activity_id: activity.id });
  chartBoardInFlight.set(key, request);
  try {
    const detail = await request;
    if (scope !== chartBoardScope()) return;
    chartBoardDetails.set(key, { status: 'ready', detail });
    while (chartBoardDetails.size > 12) { const oldest = chartBoardDetails.keys().next().value; if (oldest === key) break; chartBoardDetails.delete(oldest); }
  } catch (error) { if (scope === chartBoardScope()) chartBoardDetails.set(key, { status: 'error', error: error.message || 'Try loading this ride again.' }); }
  finally {
    chartBoardInFlight.delete(key);
    if (scope === chartBoardScope() && analysis.tab === 'charts') {
      for (const card of chartBoardPreferences()) {
        if (chartBoardActivity(card)?.id !== activity.id || !CHART_BOARD_CATALOG.find(chart => chart.type === card.type)?.ride) continue;
        const body = document.querySelector(`[data-board-card="${card.id}"] .cb-card-body`);
        if (body) {
          const focused = body.contains(document.activeElement), wasSelect = document.activeElement?.matches('[data-board-activity]');
          body.innerHTML = chartBoardBody(card);
          if (focused) (wasSelect ? body.querySelector('[data-board-activity]') : body.querySelector('button,select'))?.focus({ preventScroll: true });
        }
      }
    }
  }
}
function chartBoardAnnounce(message) { const status = document.getElementById('chart-board-status'); if (status) status.textContent = message; }
function chartBoardFocus(id) { document.querySelector(`[data-board-drag="${id}"]`)?.focus({ preventScroll: true }); }
function chartBoardMove(id, direction) {
  const items = chartBoardPreferences(), index = items.findIndex(item => item.id === id), next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
  chartBoardSave(items); paintChartBoard(); chartBoardFocus(id); chartBoardAnnounce(`Chart moved to position ${next + 1} of ${items.length}.`);
}
document.addEventListener('input', event => { if (event.target.matches('[data-board-search]')) chartBoardFilterCatalog(event.target.value); });
function chartBoardProfileError(id, message) {
  const error = document.getElementById(`${id}-profile-error`);
  if (error) { error.textContent = message || ''; error.hidden = !message; }
  document.querySelectorAll(`[data-profile-from="${id}"],[data-profile-to="${id}"]`).forEach(input => { if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); });
}
document.addEventListener('focusin', event => {
  const id = event.target.dataset.profileFrom || event.target.dataset.profileTo;
  if (id) chartBoardProfileError(id, '');
});
document.addEventListener('input', event => {
  const id = event.target.dataset.profileFrom || event.target.dataset.profileTo;
  if (id) chartBoardProfileError(id, '');
});
document.addEventListener('focusout', event => {
  const id = event.target.dataset.profileFrom || event.target.dataset.profileTo;
  if (!id) return;
  const item = chartBoardPreferences().find(card => card.id === id);
  if (item) chartBoardProfileError(id, powerProfileSnapshot(item).validation || '');
});
document.addEventListener('change', event => {
  const target = event.target.closest('[data-profile-mode],[data-profile-from],[data-profile-to],[data-profile-duration]');
  if (!target) return;
  const attribute = ['data-profile-mode', 'data-profile-from', 'data-profile-to', 'data-profile-duration'].find(name => target.hasAttribute(name)), id = target.getAttribute(attribute);
  const items = chartBoardPreferences(), item = items.find(card => card.id === id); if (!item) return;
  if (attribute === 'data-profile-mode') {
    if (target.value === 'custom' && (!item.referenceFrom || !item.referenceTo)) { const previous = powerProfileReferenceRange({ comparisonMode: 'previous' }); item.referenceFrom = previous.from; item.referenceTo = previous.to; }
    item.comparisonMode = target.value;
  } else if (attribute === 'data-profile-from') item.referenceFrom = target.value;
  else if (attribute === 'data-profile-to') item.referenceTo = target.value;
  else {
    const seconds = Number(target.value);
    if (!target.checked && item.profileDurations.length === 1) { target.checked = true; chartBoardAnnounce('Keep at least one duration selected.'); return; }
    item.profileDurations = target.checked ? [...item.profileDurations, seconds].sort((a, b) => a - b) : item.profileDurations.filter(value => value !== seconds);
  }
  const value = target.value;
  chartBoardSave(items); paintChartBoard();
  const next = document.querySelector(`[${attribute}="${id}"]${attribute === 'data-profile-duration' ? `[value="${value}"]` : ''}`);
  if (attribute === 'data-profile-duration') next?.closest('details')?.setAttribute('open', '');
  next?.focus({ preventScroll: true });
});
document.addEventListener('click', event => {
  const control = event.target.closest('[data-profile-calculate],[data-profile-cancel]'); if (!control) return;
  const id = control.dataset.profileCalculate || control.dataset.profileCancel, item = chartBoardPreferences().find(card => card.id === id); if (!item) return;
  if (control.dataset.profileCancel) { cancelPowerProfile(item); return; }
  const snapshot = powerProfileSnapshot(item);
  if (snapshot.validation) { chartBoardProfileError(id, snapshot.validation); document.querySelector(`[data-profile-from="${id}"]`)?.focus(); chartBoardProfileError(id, snapshot.validation); return; }
  calculatePowerProfile(item, snapshot.status === 'ready');
});
document.addEventListener('change', event => {
  const target = event.target.closest('[data-board-duration],[data-board-metric],[data-board-activity],[data-board-basis],[data-board-grouping]');
  if (!target) return;
  const id = target.dataset.boardDuration || target.dataset.boardMetric || target.dataset.boardActivity || target.dataset.boardBasis || target.dataset.boardGrouping;
  const items = chartBoardPreferences(), item = items.find(card => card.id === id);
  if (!item) return;
  const attribute = ['data-board-duration', 'data-board-metric', 'data-board-activity', 'data-board-basis', 'data-board-grouping'].find(name => target.hasAttribute(name));
  if (target.hasAttribute('data-board-duration')) item.duration = Number(target.value);
  else if (target.hasAttribute('data-board-metric')) item.metric = target.value;
  else if (target.hasAttribute('data-board-basis')) item.basis = target.value;
  else if (target.hasAttribute('data-board-grouping')) item.grouping = target.value;
  else item.activityId = target.value;
  chartBoardSave(items); paintChartBoard(); document.querySelector(`[${attribute}="${id}"]`)?.focus({ preventScroll: true });
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-board-add],[data-board-size],[data-board-remove],[data-board-undo],[data-board-move],[data-board-duplicate],[data-board-expand],[data-board-open-catalog],[data-board-clear-search],[data-board-retry],[data-board-export],[data-board-window]');
  if (!button) return;
  const items = chartBoardPreferences();
  if (button.hasAttribute('data-board-open-catalog')) { const catalog = document.querySelector('.cb-catalog'); catalog.open = true; catalog.querySelector('input').focus(); return; }
  if (button.hasAttribute('data-board-clear-search')) { const search = document.querySelector('[data-board-search]'); search.value = ''; chartBoardFilterCatalog(''); search.focus(); return; }
  if (button.dataset.boardMove) { chartBoardMove(button.dataset.boardMove, Number(button.dataset.direction)); return; }
  if (button.dataset.boardRetry) { await chartBoardEnsureDetail(button.dataset.boardRetry, true); return; }
  if (button.dataset.boardWindow) {
    const athlete = state.athleteId, from = Number(button.dataset.windowFrom), to = Number(button.dataset.windowTo), watts = Number(button.dataset.windowWatts);
    await openActivity(button.dataset.boardWindow);
    if (athlete !== state.athleteId || analysis.detail?.activity?.id !== button.dataset.boardWindow) return;
    focusRecordedPowerWindow(from, to, watts); return;
  }
  if (button.dataset.boardExport) {
    const item = items.find(card => card.id === button.dataset.boardExport); if (!item) return;
    const result = chartBoardExportEvidence(item);
    if (!result.rows?.length) { chartBoardAnnounce('This chart has no source rows to export yet.'); return; }
    const text = cell => { if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : ''; const value = String(cell ?? ''); return '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"'; };
    const csv = [result.headers, ...result.rows].map(row => row.map(text).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `trainable-${item.type}-${analysis.range.from}-${analysis.range.to}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); chartBoardAnnounce('Chart source data exported.'); return;
  }
  let focusId;
  if (button.dataset.boardAdd) {
    const definition = CHART_BOARD_CATALOG.find(chart => chart.type === button.dataset.boardAdd); if (!definition) return;
    const item = { id: chartBoardId(), type: definition.type, size: definition.size, duration: 300, metric: 'all', activityId: '' };
    items.push(item); focusId = item.id;
  } else if (button.dataset.boardSize) {
    const item = items.find(card => card.id === button.dataset.boardSize); if (!item) return;
    item.size = item.size === 1 ? 2 : 1; focusId = item.id;
  } else if (button.dataset.boardRemove) {
    const index = items.findIndex(card => card.id === button.dataset.boardRemove); if (index < 0) return;
    chartBoardUndo = { item: items[index], index }; items.splice(index, 1); focusId = items[index]?.id || items.at(-1)?.id;
  } else if (button.hasAttribute('data-board-undo')) {
    if (!chartBoardUndo) return;
    items.splice(chartBoardUndo.index, 0, chartBoardUndo.item); focusId = chartBoardUndo.item.id; chartBoardUndo = null;
  } else if (button.dataset.boardDuplicate) {
    const index = items.findIndex(card => card.id === button.dataset.boardDuplicate); if (index < 0) return;
    const item = { ...items[index], id: chartBoardId() }; items.splice(index + 1, 0, item); focusId = item.id;
  } else if (button.dataset.boardExpand) {
    chartBoardExpanded = chartBoardExpanded === button.dataset.boardExpand ? null : button.dataset.boardExpand; focusId = button.dataset.boardExpand;
  }
  chartBoardSave(items); paintChartBoard();
  if (focusId) {
    const control = button.dataset.boardExpand ? document.querySelector(`[data-board-expand="${focusId}"]`) : document.querySelector(`[data-board-drag="${focusId}"]`);
    control?.focus({ preventScroll: true });
    if (button.dataset.boardAdd || button.dataset.boardDuplicate || button.dataset.boardExpand) document.querySelector(`[data-board-card="${focusId}"]`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  } else document.querySelector('.cb-catalog summary')?.focus({ preventScroll: true });
});
document.addEventListener('keydown', event => {
  const grip = event.target.closest('[data-board-drag]');
  if (!grip || !event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); chartBoardMove(grip.dataset.boardDrag, ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1);
});
document.addEventListener('dragstart', event => {
  const grip = event.target.closest('[data-board-drag]'); if (!grip) return;
  chartBoardDrag = grip.dataset.boardDrag; event.dataTransfer.setData('text/plain', chartBoardDrag); event.dataTransfer.effectAllowed = 'move';
  grip.closest('.cb-card').classList.add('cb-dragging');
});
document.addEventListener('dragover', event => {
  const card = event.target.closest('[data-board-card]'); if (!chartBoardDrag || !card) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.cb-drop-target').forEach(node => node.classList.remove('cb-drop-target')); if (card.dataset.boardCard !== chartBoardDrag) card.classList.add('cb-drop-target');
});
document.addEventListener('drop', event => {
  const target = event.target.closest('[data-board-card]'); if (!chartBoardDrag || !target) return;
  event.preventDefault(); const items = chartBoardPreferences(), from = items.findIndex(item => item.id === chartBoardDrag), to = items.findIndex(item => item.id === target.dataset.boardCard), id = chartBoardDrag;
  chartBoardDrag = null; if (from < 0 || to < 0 || from === to) return;
  items.splice(to, 0, items.splice(from, 1)[0]); chartBoardSave(items); paintChartBoard(); chartBoardFocus(id); chartBoardAnnounce(`Chart moved to position ${to + 1} of ${items.length}.`);
});
document.addEventListener('dragend', () => { chartBoardDrag = null; document.querySelectorAll('.cb-dragging,.cb-drop-target').forEach(node => node.classList.remove('cb-dragging', 'cb-drop-target')); });
for (const type of ['pointerover', 'focusin']) document.addEventListener(type, event => {
  const bin = event.target.closest('[data-board-bin]');
  if (bin) { const readout = bin.closest('.cb-histogram')?.querySelector('.cb-bin-reading'); if (readout) readout.textContent = bin.dataset.boardBin; }
});
