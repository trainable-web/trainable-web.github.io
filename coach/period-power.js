/* On-demand, bounded source calculations. Results live only in the current page session. */
const PERIOD_POWER_LIMIT = 500;
let periodPowerRun = null;
let periodPowerGeneration = 0;
function periodPowerScope() { return JSON.stringify([state.athleteId, analysis.range?.from, analysis.range?.to, analysis.trendRequest]); }
function periodPowerIdle() { return { status: 'idle', processed: 0, total: 0, points: [], eligible_activities: 0, unavailable_activities: 0, coverage_limited: false, error: '', caveats: [] }; }
// Read by the configurable chart board.
// deno-lint-ignore no-unused-vars
function periodPowerSnapshot() { return periodPowerRun?.scope === periodPowerScope() ? periodPowerRun.value : periodPowerIdle(); }
function periodPowerNotify() {
  if (analysis.tab === 'charts' && typeof chartBoardRefreshPower === 'function') chartBoardRefreshPower();
}
function mergePeriodPowerPoints(existing, rows) {
  const points = new Map(existing.map(point => [point.duration_s, point]));
  for (const row of rows) {
    for (const point of row.result?.points || []) {
      if (![point.duration_s, point.average_w, point.from_s, point.to_s].every(Number.isFinite) || point.duration_s <= 0 || point.average_w < 0 || point.to_s - point.from_s !== point.duration_s) continue;
      const candidate = { ...point, activity_id: row.activity_id, activity_name: row.activity_name, start_date: row.start_date, quality: row.result.quality, algorithm_version: row.result.algorithm_id };
      const previous = points.get(point.duration_s);
      if (!previous || candidate.average_w > previous.average_w || (candidate.average_w === previous.average_w && `${candidate.activity_id}:${String(candidate.from_s).padStart(10, '0')}` < `${previous.activity_id}:${String(previous.from_s).padStart(10, '0')}`)) points.set(point.duration_s, candidate);
    }
  }
  return [...points.values()].sort((a, b) => a.duration_s - b.duration_s);
}
async function calculatePeriodPower() {
  if (!analysis.trends || analysis.trends.error) return;
  const generation = ++periodPowerGeneration, scope = periodPowerScope();
  const athlete = state.athleteId, range = { ...analysis.range };
  const seen = new Set();
  const candidates = (analysis.trends.activities || []).filter(row => {
    const day = String(row.start_date || '').slice(0, 10);
    if (!row.id || seen.has(row.id) || row.sport_type !== 'cycling' || row.device_watts !== true || day < range.from || day > range.to) return false;
    seen.add(row.id); return true;
  }).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)) || String(a.id).localeCompare(String(b.id)));
  const selected = candidates.slice(0, PERIOD_POWER_LIMIT);
  const value = { ...periodPowerIdle(), status: 'loading', total: selected.length, eligible_activities: candidates.length,
    coverage_limited: Boolean(analysis.trends.coverage_limited) || candidates.length > selected.length };
  periodPowerRun = { scope, value };
  const current = () => generation === periodPowerGeneration && scope === periodPowerScope();
  periodPowerNotify();
  try {
    for (let offset = 0; offset < selected.length; offset += 4) {
      if (!current()) return;
      const ids = selected.slice(offset, offset + 4).map(row => row.id);
      const result = await portal('activity_power_batch', { athlete_id: athlete, ...range, activity_ids: ids });
      if (!current()) return;
      if (result?.version !== 'period-power-batch-v1' || !Array.isArray(result.rows)) throw new Error('Source power calculations are not available on this connection yet.');
      if (result.rows.length !== ids.length || new Set(result.rows.map(row => row.activity_id)).size !== ids.length || result.rows.some(row => !ids.includes(row.activity_id))) throw new Error('The source calculation returned incomplete activity records. Recalculate to try again.');
      value.points = mergePeriodPowerPoints(value.points, result.rows);
      value.unavailable_activities += result.rows.filter(row => !row.result?.points?.length).length;
      value.processed += ids.length;
      value.caveats = Array.isArray(result.caveats) ? result.caveats : [];
      periodPowerNotify();
    }
    if (!current()) return;
    value.status = 'ready';
  } catch (error) {
    if (!current()) return;
    value.status = 'error'; value.error = error.message || 'Could not calculate source power. Try again.';
    value.coverage_limited = true;
  }
  periodPowerNotify();
}
function cancelPeriodPower() {
  periodPowerGeneration++;
  if (periodPowerRun?.scope === periodPowerScope()) {
    periodPowerRun.value.status = 'idle';
    periodPowerRun.value.points = [];
    periodPowerRun.value.processed = 0;
  }
  periodPowerNotify();
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-period-power-calculate]')) calculatePeriodPower();
  if (event.target.closest('[data-period-power-cancel]')) cancelPeriodPower();
});
