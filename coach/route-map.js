/* GPS-only route geometry: no external map requests or location sharing. */
function routeSelectionPoints(points, from, to) {
  const selected = []; let previous = null;
  for (const point of points) {
    if (!point || !Number.isFinite(point[1]) || !Number.isFinite(point[2])) { selected.push(null); previous = null; continue; }
    if (previous && point[0] > previous[0]) {
      const start = Math.max(from,previous[0]), end = Math.min(to,point[0]);
      if (start <= end) {
        const interpolate = (time) => { const f = (time-previous[0])/(point[0]-previous[0]); return [time,previous[1]+f*(point[1]-previous[1]),previous[2]+f*(point[2]-previous[2])]; };
        if (!selected.at(-1) || selected.at(-1)[0] !== start) selected.push(interpolate(start));
        if (end > start) selected.push(interpolate(end));
      }
    } else if (point[0] >= from && point[0] <= to) selected.push(point);
    previous = point;
  }
  return selected;
}
// Used by analytics.js.
// deno-lint-ignore no-unused-vars
function routeMapModel(points, width = 640, height = 260, focusRange = null) {
  let priorLongitude = null;
  const world = points.map((point) => {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2]) || Math.abs(point[1]) > 90 || Math.abs(point[2]) > 180) return null;
    let longitude = point[2]/360;
    if (priorLongitude != null) { while (longitude-priorLongitude > .5) longitude--; while (longitude-priorLongitude < -.5) longitude++; }
    priorLongitude = longitude;
    const latitude = Math.max(-85.0511,Math.min(85.0511,point[1]))*Math.PI/180;
    return [point[0],longitude,-Math.log(Math.tan(Math.PI/4+latitude/2))/(2*Math.PI)];
  });
  const fit = (focusRange ? routeSelectionPoints(world,...focusRange) : world).filter(Boolean);
  if (!fit.length) return null;
  const xs = fit.map((p)=>p[1]), ys = fit.map((p)=>p[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX-minX,maxY-minY,1e-6);
  const scale = Math.min((width-80)/Math.max(maxX-minX,span*.08),(height-72)/Math.max(maxY-minY,span*.08));
  const centerX = (minX+maxX)/2, centerY = (minY+maxY)/2;
  const projected = world.map((p)=>p ? [p[0],width/2+(p[1]-centerX)*scale,height/2+(p[2]-centerY)*scale] : null);
  const valid = points.filter((p)=>p && Number.isFinite(p[1]) && Number.isFinite(p[2]));
  const centerLatitude = valid.reduce((sum,p)=>sum+p[1],0)/valid.length*Math.PI/180;
  const metersPerPixel = 40075016.686*Math.cos(centerLatitude)/scale;
  const targetMeters = metersPerPixel*80, magnitude = 10**Math.floor(Math.log10(targetMeters));
  const scaleMeters = Math.max(1,[1,2,5,10].map((n)=>n*magnitude).filter((n)=>n<=targetMeters).at(-1) || magnitude);
  return {points:projected,meters:scaleMeters,scalePixels:scaleMeters/metersPerPixel};
}
// Used by analytics.js.
// deno-lint-ignore no-unused-vars
function routePath(points) {
  let open = false;
  return points.map((p)=>{ if (!p) {open=false;return '';} const command = open ? 'L' : 'M'; open=true; return `${command}${p[1].toFixed(2)},${p[2].toFixed(2)}`; }).join(' ');
}
