// ==========================================================================
// CHARTS — thin Chart.js wrapper with app theme baked in
// ==========================================================================
import { formatCompact, formatMoney } from './utilities.js';

const activeCharts = new Map();

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue('--text-mid').trim() || '#9aa7b6',
    grid: cs.getPropertyValue('--border-subtle').trim() || 'rgba(255,255,255,0.06)',
    mint: cs.getPropertyValue('--mint').trim() || '#5fe3a8',
    blue: cs.getPropertyValue('--blue').trim() || '#6f93ff',
    coral: cs.getPropertyValue('--coral').trim() || '#ff6f6f',
    amber: cs.getPropertyValue('--amber').trim() || '#f2b25c',
    gold: cs.getPropertyValue('--gold').trim() || '#e7c581',
    violet: cs.getPropertyValue('--violet').trim() || '#b18aff',
  };
}

export const PALETTE = ['#5fe3a8', '#6f93ff', '#ff6f6f', '#f2b25c', '#e7c581', '#b18aff', '#4dd0e1', '#f06fb0', '#8bc34a', '#ff9e5e'];

function destroy(canvasId) {
  if (activeCharts.has(canvasId)) {
    activeCharts.get(canvasId).destroy();
    activeCharts.delete(canvasId);
  }
}

let defaultsApplied = false;
function ensureChartReady() {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js failed to load from CDN — charts will be skipped. Check your internet connection.');
    return false;
  }
  if (!defaultsApplied) {
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11.5;
    defaultsApplied = true;
  }
  return true;
}

export function renderDonut(canvasId, labels, data, colors = PALETTE) {
  if (!ensureChartReady()) return null;
  destroy(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const t = themeColors();
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: 'transparent', borderWidth: 0, hoverOffset: 6 }] },
    options: {
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2330', borderColor: t.grid, borderWidth: 1, padding: 10, titleColor: '#fff', bodyColor: '#cfd6dd',
          callbacks: { label: (c) => ` ${c.label}: ${formatMoney(c.parsed)}` },
        },
      },
      maintainAspectRatio: false,
      animation: { duration: 500 },
    },
  });
  activeCharts.set(canvasId, chart);
  return chart;
}

export function renderBar(canvasId, labels, datasets, opts = {}) {
  if (!ensureChartReady()) return null;
  destroy(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const t = themeColors();
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: datasets.map((d, i) => ({ borderRadius: 6, barPercentage: 0.6, categoryPercentage: 0.7, ...d })) },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          backgroundColor: '#1a2330', borderColor: t.grid, borderWidth: 1, padding: 10, titleColor: '#fff', bodyColor: '#cfd6dd',
          callbacks: { label: (c) => ` ${c.dataset.label}: ${formatMoney(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.text } },
        y: { grid: { color: t.grid }, ticks: { color: t.text, callback: (v) => formatCompact(v) }, beginAtZero: true },
      },
      animation: { duration: 500 },
      ...opts,
    },
  });
  activeCharts.set(canvasId, chart);
  return chart;
}

export function renderLine(canvasId, labels, datasets, opts = {}) {
  if (!ensureChartReady()) return null;
  destroy(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const t = themeColors();
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(d => ({
        tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, fill: !!d.area,
        ...d,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          backgroundColor: '#1a2330', borderColor: t.grid, borderWidth: 1, padding: 10, titleColor: '#fff', bodyColor: '#cfd6dd',
          callbacks: { label: (c) => ` ${c.dataset.label}: ${formatMoney(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.text } },
        y: { grid: { color: t.grid }, ticks: { color: t.text, callback: (v) => formatCompact(v) } },
      },
      animation: { duration: 500 },
      ...opts,
    },
  });
  activeCharts.set(canvasId, chart);
  return chart;
}

export function renderArea(canvasId, labels, dataset, color) {
  const t = themeColors();
  const c = color || t.mint;
  return renderLine(canvasId, labels, [{
    label: dataset.label || 'Value', data: dataset.data,
    borderColor: c, backgroundColor: hexToRgba(c, 0.14), area: true,
  }]);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function destroyAllCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts.clear();
}
