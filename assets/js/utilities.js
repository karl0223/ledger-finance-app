// ==========================================================================
// UTILITIES — formatting, id generation, date helpers, shared constants
// ==========================================================================

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

export function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/* ---------------- Currency ---------------- */
const CURRENCY_SYMBOLS = { PHP: '₱', USD: '$', EUR: '€', GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$', CAD: 'C$' };

export function currencySymbol() {
  const s = window.__LEDGER_SETTINGS__ || { currency: 'PHP' };
  return CURRENCY_SYMBOLS[s.currency] || s.currency + ' ';
}

export function formatMoney(amount, opts = {}) {
  const n = Number(amount) || 0;
  const symbol = currencySymbol();
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : (opts.forceSign && n > 0 ? '+' : '');
  return `${sign}${symbol}${formatted}`;
}

export function formatCompact(amount) {
  const n = Number(amount) || 0;
  const symbol = currencySymbol();
  const abs = Math.abs(n);
  let out;
  if (abs >= 1_000_000) out = (n / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) out = (n / 1_000).toFixed(1) + 'K';
  else out = n.toFixed(0);
  return `${symbol}${out}`;
}

/* ---------------- Dates ---------------- */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export function formatDate(iso, fmt) {
  if (!iso) return '—';
  const s = window.__LEDGER_SETTINGS__ || { dateFormat: 'MMM D, YYYY' };
  fmt = fmt || s.dateFormat || 'MMM D, YYYY';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  switch (fmt) {
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'MMM D, YYYY':
    default: return `${months[d.getMonth()]} ${d.getDate()}, ${yyyy}`;
  }
}

export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso.slice(0, 10));
}

export function daysUntil(iso) {
  const target = new Date(iso + 'T00:00:00').getTime();
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now.getTime()) / 86400000);
}

export function monthKey(iso) { return iso.slice(0, 7); } // YYYY-MM

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
export function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
export function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${y}`;
}

/* ---------------- Misc ---------------- */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

export function download(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- Palettes ---------------- */
export const WALLET_COLORS = ['#5fe3a8', '#6f93ff', '#ff6f6f', '#f2b25c', '#e7c581', '#b18aff', '#4dd0e1', '#f06fb0', '#8bc34a', '#ff9e5e'];

export const WALLET_ICONS = [
  'fa-solid fa-wallet','fa-solid fa-money-bill-wave','fa-solid fa-building-columns','fa-solid fa-mobile-screen',
  'fa-solid fa-piggy-bank','fa-solid fa-plane','fa-solid fa-chart-line','fa-solid fa-briefcase',
  'fa-solid fa-gamepad','fa-solid fa-shield-heart','fa-solid fa-house','fa-solid fa-car',
  'fa-solid fa-graduation-cap','fa-solid fa-gift','fa-solid fa-coins','fa-solid fa-credit-card',
  'fa-solid fa-sack-dollar','fa-solid fa-umbrella','fa-solid fa-heart-pulse','fa-solid fa-utensils'
];

export const DEFAULT_WALLET_TYPES = ['Savings','Bills','Emergency','Food','Allowance','Shopping','Investment','Travel','Business','Gaming','Cash','Custom'];

export const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: 'fa-solid fa-utensils', color: '#f2b25c', kind: 'expense' },
  { name: 'Transportation', icon: 'fa-solid fa-car', color: '#6f93ff', kind: 'expense' },
  { name: 'Utilities', icon: 'fa-solid fa-bolt', color: '#f2b25c', kind: 'expense' },
  { name: 'Shopping', icon: 'fa-solid fa-bag-shopping', color: '#f06fb0', kind: 'expense' },
  { name: 'Bills', icon: 'fa-solid fa-file-invoice-dollar', color: '#ff6f6f', kind: 'expense' },
  { name: 'Healthcare', icon: 'fa-solid fa-heart-pulse', color: '#ff6f6f', kind: 'expense' },
  { name: 'Education', icon: 'fa-solid fa-graduation-cap', color: '#6f93ff', kind: 'expense' },
  { name: 'Entertainment', icon: 'fa-solid fa-film', color: '#b18aff', kind: 'expense' },
  { name: 'Travel', icon: 'fa-solid fa-plane', color: '#4dd0e1', kind: 'expense' },
  { name: 'Insurance', icon: 'fa-solid fa-umbrella', color: '#9aa7b6', kind: 'expense' },
  { name: 'Debt', icon: 'fa-solid fa-hand-holding-dollar', color: '#ff6f6f', kind: 'expense' },
  { name: 'Investment', icon: 'fa-solid fa-chart-line', color: '#5fe3a8', kind: 'both' },
  { name: 'Salary', icon: 'fa-solid fa-sack-dollar', color: '#5fe3a8', kind: 'income' },
  { name: 'Allowance', icon: 'fa-solid fa-hand-holding-heart', color: '#5fe3a8', kind: 'income' },
  { name: 'Gift', icon: 'fa-solid fa-gift', color: '#e7c581', kind: 'both' },
  { name: 'Savings', icon: 'fa-solid fa-piggy-bank', color: '#5fe3a8', kind: 'both' },
  { name: 'Freelance', icon: 'fa-solid fa-laptop', color: '#5fe3a8', kind: 'income' },
  { name: 'Bonus', icon: 'fa-solid fa-star', color: '#5fe3a8', kind: 'income' },
  { name: 'Interest', icon: 'fa-solid fa-percent', color: '#5fe3a8', kind: 'income' },
  { name: 'Business', icon: 'fa-solid fa-store', color: '#5fe3a8', kind: 'both' },
  { name: 'Others', icon: 'fa-solid fa-ellipsis', color: '#9aa7b6', kind: 'both' },
];

export const PAYMENT_METHODS = ['Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'E-Wallet', 'Check', 'Other'];

export function categoryMeta(categories, name) {
  return categories.find(c => c.name === name) || { name, icon: 'fa-solid fa-circle-question', color: '#9aa7b6' };
}
