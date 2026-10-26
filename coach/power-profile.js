/* Recorded power comparisons: bounded summaries, shared requests, session-only results. */
const POWER_PROFILE_ACTIVITY_LIMIT = 500;
const POWER_PROFILE_CACHE_LIMIT = 4;
const POWER_PROFILE_DURATIONS = [5, 10, 15, 30, 60, 300, 1200, 3600];
// deno-lint-ignore no-unused-vars
const POWER_PROFILE_DEFAULTS = [5, 60, 300, 1200, 3600];
const powerProfileRuns = new Map();
const powerProfilePeriods = new Map();
const powerProfilePending = new Map();
function powerProfileScope() { return JSON.stringify([state.athleteId, analysis.trendRequest, analysis.range?.from, analysis.range?.to]); }
function powerProfileIdle() { return { status: 'idle', phase: '', processed: 0, total: 0, error: '', evidence: null }; }
function powerProfileDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function powerProfileValidateRange(range) {
  const from = powerProfileDate(range?.from), to = powerProfileDate(range?.to);
  if (!from || !to) throw new Error('Enter valid start and end dates.');
  if (to < from) throw new Error('Choose an end date on or after the start date.');
  if ((to - from) / 86400000 + 1 > 366) throw new Error('Choose a period of 366 days or fewer.');
  return { from: range.from, to: range.to };
}
function powerProfileReferenceRange(item) {
  const range = powerProfileValidateRange(analysis.range);
  if (item.comparisonMode === 'custom') return powerProfileValidateRange({ from: item.referenceFrom, to: item.referenceTo });
  if (item.comparisonMode === 'year') {
    const previousYear = value => {
      const date = powerProfileDate(value), month = date.getUTCMonth();
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      if (date.getUTCMonth() !== month) date.setUTCDate(0);
      return date.toISOString().slice(0, 10);
    };
    return powerProfileValidateRange({ from: previousYear(range.from), to: previousYear(range.to) });
  }
  const from = powerProfileDate(range.from), days = (powerProfileDate(range.to) - from) / 86400000 + 1;
  return { from: new Date(from.getTime() - days * 86400000).toISOString().slice(0, 10), to: new Date(from.getTime() - 86400000).toISOString().slice(0, 10) };
}
function powerProfileQuery(item) {
  const current = powerProfileValidateRange(analysis.range), reference = powerProfileReferenceRange(item), scope = powerProfileScope();
  return { current, reference, scope, key: JSON.stringify([scope, current.from, current.to, reference.from, reference.to]) };
}
function powerProfileHasCard(run) {
  if (run.scope !== powerProfileScope()) return false;
  if (typeof chartBoardPreferences !== 'function') return true;
  return chartBoardPreferences().some(item => {
    if (item.type !== 'recordedPowerProfile') return false;
    try { return powerProfileQuery(item).key === run.key; } catch { return false; }
  });
}
function powerProfileIsUsed(run) { return run.value.status === 'loading' && powerProfileRuns.get(run.key) === run && powerProfileHasCard(run); }
// deno-lint-ignore no-unused-vars
function powerProfileSnapshot(item) {
  try { return powerProfileRuns.get(powerProfileQuery(item).key)?.value || powerProfileIdle(); }
  catch (error) { return { ...powerProfileIdle(), validation: error.message }; }
}
function powerProfileNotify() {
  if (typeof chartBoardRefreshProfile === 'function') chartBoardRefreshProfile();
}
function powerProfileTrim(map) {
  while (map.size > POWER_PROFILE_CACHE_LIMIT) map.delete(map.keys().next().value);
}
function powerProfileTrimRuns() {
  let unused = 0;
  for (const [key, run] of [...powerProfileRuns].reverse()) if (!powerProfileHasCard(run) && ++unused > POWER_PROFILE_CACHE_LIMIT) powerProfileRuns.delete(key);
}
function invalidatePowerProfile() {
  for (const [key, run] of powerProfileRuns) if (run.scope !== powerProfileScope() || (run.value.status === 'loading' && !powerProfileIsUsed(run))) { run.value = powerProfileIdle(); powerProfileRuns.delete(key); }
  for (const key of powerProfilePeriods.keys()) if (!key.startsWith(powerProfileScope() + '|')) powerProfilePeriods.delete(key);
  powerProfileTrimRuns();
}
function powerProfileCandidates(trends, range) {
  const seen = new Set();
  return (trends.activities || []).filter(row => {
    const day = String(row.start_date || '').slice(0, 10);
    if (!row.id || seen.has(row.id) || row.sport_type !== 'cycling' || row.device_watts !== true || day < range.from || day > range.to) return false;
    seen.add(row.id); return true;
  }).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)) || String(a.id).localeCompare(String(b.id)));
}
async function powerProfileFetchPeriod(range, run, phase, suppliedTrends) {
  const key = `${run.scope}|${range.from}|${range.to}`;
  if (powerProfilePeriods.has(key)) return powerProfilePeriods.get(key);
  let pending = powerProfilePending.get(key);
  const subscriber = { run, phase };
  if (pending) { pending.subscribers.add(subscriber); return await pending.promise; }
  pending = { subscribers: new Set([subscriber]), promise: null };
  powerProfilePending.set(key, pending);
  const current = () => [...pending.subscribers].some(({ run: consumer }) => powerProfileIsUsed(consumer));
  const progress = (processed, total, fetching = false) => {
    for (const { run: consumer, phase: label } of pending.subscribers) if (powerProfileIsUsed(consumer)) Object.assign(consumer.value, { phase: fetching ? label === 'Selected period' ? 'Finding selected rides' : 'Finding reference rides' : label, processed, total });
    powerProfileNotify();
  };
  pending.promise = (async () => {
    const athlete = state.athleteId;
    progress(0, 0, !suppliedTrends);
    const trends = suppliedTrends || await portal('athlete_trends', { athlete_id: athlete, ...range });
    if (!current()) throw new Error('Comparison stopped.');
    if (!trends || trends.error || !Array.isArray(trends.activities)) throw new Error('Could not load the reference rides. Try calculating the comparison again.');
    const candidates = powerProfileCandidates(trends, range), selected = candidates.slice(0, POWER_PROFILE_ACTIVITY_LIMIT), rows = [];
    progress(0, selected.length);
    for (let offset = 0; offset < selected.length; offset += 4) {
      if (!current()) throw new Error('Comparison stopped.');
      const ids = selected.slice(offset, offset + 4).map(row => row.id);
      const result = await portal('activity_power_batch', { athlete_id: athlete, ...range, activity_ids: ids });
      if (!current()) throw new Error('Comparison stopped.');
      if (result?.version !== 'period-power-batch-v1' || !Array.isArray(result.rows)) throw new Error('Recorded power calculations are unavailable on this connection. Try again after reloading.');
      if (result.rows.length !== ids.length || new Set(result.rows.map(row => row.activity_id)).size !== ids.length || result.rows.some(row => !ids.includes(row.activity_id))) throw new Error('Some requested rides were not returned. Calculate again to retry.');
      rows.push(...result.rows); progress(rows.length, selected.length);
    }
    const value = { range, rows, expected_activities: candidates.length, coverage_limited: Boolean(trends.coverage_limited) || candidates.length > selected.length };
    powerProfilePeriods.set(key, value); powerProfileTrim(powerProfilePeriods); return value;
  })();
  try { return await pending.promise; } finally { if (powerProfilePending.get(key) === pending) powerProfilePending.delete(key); }
}
// deno-lint-ignore no-unused-vars
async function calculatePowerProfile(item, force = false) {
  invalidatePowerProfile();
  let query;
  try { query = powerProfileQuery(item); } catch { powerProfileNotify(); return; }
  const existing = powerProfileRuns.get(query.key);
  if (existing?.value.status === 'loading' || (!force && existing?.value.status === 'ready')) return existing?.promise;
  const run = { ...query, value: { ...powerProfileIdle(), status: 'loading' }, promise: null };
  powerProfileRuns.set(query.key, run); powerProfileTrimRuns();
  if (force) for (const range of [query.current, query.reference]) powerProfilePeriods.delete(`${query.scope}|${range.from}|${range.to}`);
  run.promise = (async () => {
    try {
      if (typeof buildPowerProfileComparison !== 'function') throw new Error('Reload this page to load the power profile comparison.');
      if (!analysis.trends || analysis.trends.error) throw new Error('Load the selected period before calculating a comparison.');
      const snapshot = typeof periodPowerSnapshot === 'function' ? periodPowerSnapshot() : null;
      const current = !force && snapshot?.status === 'ready' && Array.isArray(snapshot.rows) ? { range: query.current, rows: snapshot.rows, expected_activities: snapshot.eligible_activities, coverage_limited: snapshot.coverage_limited } : await powerProfileFetchPeriod(query.current, run, 'Selected period', force ? undefined : analysis.trends);
      if (!powerProfileIsUsed(run)) return;
      const reference = query.current.from === query.reference.from && query.current.to === query.reference.to ? current : await powerProfileFetchPeriod(query.reference, run, 'Reference period');
      if (!powerProfileIsUsed(run)) return;
      run.value.evidence = buildPowerProfileComparison({ current, reference, durations_s: POWER_PROFILE_DURATIONS });
      run.value.status = 'ready'; run.value.phase = 'Comparison ready';
    } catch (error) {
      if (!powerProfileIsUsed(run)) return;
      run.value.status = 'error'; run.value.error = error.message || 'Could not calculate this comparison. Try again.'; run.value.evidence = null;
    }
    powerProfileNotify();
  })();
  powerProfileNotify(); return await run.promise;
}
// deno-lint-ignore no-unused-vars
function cancelPowerProfile(item) {
  try { const run = powerProfileRuns.get(powerProfileQuery(item).key); if (run) run.value = powerProfileIdle(); } catch { /* No running request exists for invalid dates. */ }
  powerProfileNotify();
}
