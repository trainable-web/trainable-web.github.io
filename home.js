(() => {
  'use strict';
  const menu = document.getElementById('mobile-menu');
  if (menu) {
    const summary = menu.querySelector('summary');
    menu.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (!link) return;
      menu.open = false;
      if (link.hash && link.pathname === location.pathname) {
        const destination = document.querySelector(link.hash);
        if (destination) {
          destination.setAttribute('tabindex', '-1');
          destination.focus({ preventScroll: true });
        }
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); }
    });
    document.addEventListener('click', (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  }

  const chart = document.getElementById('preview-chart');
  if (!chart) return;
  const examples = {
    power: { name: 'power', unit: 'W', label: 'Power · watts', max: 300, values: [110,145,175,185,180,190,205,195,185,190,205,200,195,190,185,180,160,135], insight: 'Power through the ride, with the build-up and cool-down in view.' },
    heart: { name: 'heart rate', unit: 'bpm', label: 'Heart rate · bpm', max: 180, values: [90,104,115,122,126,129,134,134,132,133,138,138,136,137,136,134,125,112], insight: 'Heart rate rises gradually as the effort builds, then settles through the cool-down.' }
  };
  function selectMetric(key) {
    const example = examples[key];
    if (!example) return;
    const mean = Math.round(example.values.reduce((sum, value) => sum + value, 0) / example.values.length);
    const points = example.values.map((value, i) => `${(42 + i * 424 / (example.values.length - 1)).toFixed(1)} ${(192 - value / example.max * 168).toFixed(1)}`);
    const path = `M${points.join('L')}`;
    chart.querySelector('.chart-line').setAttribute('d', path);
    chart.querySelector('.chart-area').setAttribute('d', `${path}V192H42Z`);
    chart.querySelectorAll('.chart-labels span').forEach((label, i) => { label.textContent = Math.round(example.max * (3 - i) / 3); });
    chart.querySelector('svg').setAttribute('aria-label', `Illustrative ${example.name} chart, averaging ${mean} ${example.unit} across a 90-minute ride`);
    document.getElementById('preview-average-label').textContent = `Average ${example.name}`;
    document.getElementById('preview-average').replaceChildren(document.createTextNode(`${mean} `), Object.assign(document.createElement('span'), { textContent: example.unit }));
    document.getElementById('preview-chart-label').textContent = example.label;
    document.getElementById('preview-insight').textContent = example.insight;
    document.querySelectorAll('[data-preview-metric]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.previewMetric === key)));
  }
  document.querySelectorAll('[data-preview-metric]').forEach((button) => button.addEventListener('click', () => selectMetric(button.dataset.previewMetric)));
  selectMetric('power');
})();
