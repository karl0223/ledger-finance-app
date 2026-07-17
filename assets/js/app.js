// ==========================================================================
// APP — router, view rendering, UI wiring
// ==========================================================================
import * as Storage from './storage.js';
import * as Utils from './utilities.js';
import * as Wallets from './walletEngine.js';
import * as Txns from './transactionEngine.js';
import * as Budgets from './budgetEngine.js';
import * as Goals from './goalEngine.js';
import * as Bills from './billEngine.js';
import * as Debts from './debtEngine.js';
import * as Analytics from './analytics.js';
import * as Charts from './charts.js';
import * as Reports from './reportEngine.js';
import * as Settings from './settings.js';

const { formatMoney, formatCompact, formatDate, escapeHtml, uid, todayISO, nowTime, relativeTime, daysUntil,
  WALLET_COLORS, WALLET_ICONS, PAYMENT_METHODS, categoryMeta, initials, download, monthKey, monthLabel } = Utils;
const { loadState, getState, persist } = Storage;

/* ============================================================
   BOOTSTRAP — gated on a local profile (no password, no server)
   ============================================================ */
let state = null;

const pageContent = document.getElementById('pageContent');
let currentRoute = 'dashboard';
let currentSubState = {}; // per-route ephemeral UI state (filters, selected wallet, etc.)

document.addEventListener('DOMContentLoaded', boot);

/** Entry point: decide whether we need a profile picker/creator, or can go
 *  straight into the app because a valid active profile already exists. */
function boot() {
  const activeId = Storage.getActiveProfileId();
  const profiles = Storage.getProfiles();
  const active = profiles.find(p => p.id === activeId);
  if (!active) {
    showProfileGate(profiles.length ? 'pick' : 'create');
    return;
  }
  startApp();
}

/** Called once a valid profile is active — boots the real app on top of it. */
function startApp() {
  state = loadState();
  Settings.applyTheme(state.settings.theme);
  wireSidebar();
  wireTopbar();
  wireModals();
  wirePalette();
  wireFab();
  wireDrawer();
  navigate('dashboard');
  renderNotifBadge();
  updateAvatarDisplay();
}

function updateAvatarDisplay() {
  const profile = Storage.getActiveProfile();
  const avatar = document.getElementById('avatarBtn');
  const sbAvatar = document.getElementById('sidebarProfileAvatar');
  const sbName = document.getElementById('sidebarProfileName');
  const name = profile ? profile.name : (state?.settings?.ownerName || 'JD');
  const gradient = profile?.color ? `linear-gradient(135deg, ${profile.color}, var(--blue))` : '';
  avatar.textContent = initials(name);
  avatar.style.background = gradient;
  if (sbAvatar) { sbAvatar.textContent = initials(name); sbAvatar.style.background = gradient; }
  if (sbName) sbName.textContent = name;
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  analytics: { title: 'Analytics', render: renderAnalytics },
  wallets: { title: 'Wallets', render: renderWallets },
  transactions: { title: 'Transactions', render: renderTransactions },
  transfers: { title: 'Transfers', render: renderTransfers },
  budgets: { title: 'Budgets', render: renderBudgets },
  debts: { title: 'Debts', render: renderDebts },
  paycheck: { title: 'Paycheck Allocator', render: renderPaycheck },
  goals: { title: 'Savings Goals', render: renderGoals },
  bills: { title: 'Bills', render: renderBills },
  reports: { title: 'Reports', render: renderReports },
  settings: { title: 'Settings', render: renderSettings },
};

function navigate(route, params = {}) {
  if (!ROUTES[route]) route = 'dashboard';
  currentRoute = route;
  currentSubState = params;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.route === route));
  Charts.destroyAllCharts();
  pageContent.innerHTML = `<div class="route-view">${ROUTES[route].render(params)}</div>`;
  wireRouteEvents(route);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  closeMobileSidebar();
  updateTopbarNetWorth();
}

function rerender() { navigate(currentRoute, currentSubState); }

function updateTopbarNetWorth() {
  document.getElementById('topbarNetWorthValue').textContent = formatMoney(Wallets.netWorth());
}

/* ============================================================
   SIDEBAR / TOPBAR / GLOBAL CHROME
   ============================================================ */
function wireSidebar() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });
  document.getElementById('sidebarCollapseBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);
  document.getElementById('quickAddSidebarBtn').addEventListener('click', () => openTransactionForm());
  document.getElementById('sidebarProfileBtn').addEventListener('click', (e) => {
    const anchor = e.currentTarget;
    const profile = Storage.getActiveProfile();
    const withClose = (fn) => () => { fn(); closeMobileSidebar(); };
    openActionMenu(anchor, [
      ...(profile ? [{ icon: 'fa-solid fa-user', label: profile.name, onClick: () => {} }, { divider: true }] : []),
      { icon: 'fa-solid fa-people-arrows', label: 'Switch Profile', onClick: withClose(() => openSwitchProfile()) },
      { icon: 'fa-solid fa-sliders', label: 'Manage Profiles', onClick: withClose(() => openManageProfilesModal()) },
    ]);
  });
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 980) closeMobileSidebar();
});

function wireTopbar() {
  document.getElementById('topbarSearchBtn').addEventListener('click', openPalette);
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const newTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
    Settings.updateSettings({ theme: newTheme });
    document.getElementById('themeToggleBtn').innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    rerender();
  });
  document.getElementById('notifBtn').addEventListener('click', toggleNotifDrawer);
  document.getElementById('avatarBtn').addEventListener('click', (e) => {
    const profile = Storage.getActiveProfile();
    openActionMenu(e.currentTarget, [
      ...(profile ? [{ icon: 'fa-solid fa-user', label: profile.name, onClick: () => {} }, { divider: true }] : []),
      { icon: 'fa-solid fa-people-arrows', label: 'Switch Profile', onClick: () => openSwitchProfile() },
      { icon: 'fa-solid fa-sliders', label: 'Manage Profiles', onClick: () => openManageProfilesModal() },
    ]);
  });
}

function wireFab() {
  document.getElementById('fabQuickAdd').addEventListener('click', () => openTransactionForm());
}

/* ---------------- Notifications drawer ---------------- */
function wireDrawer() {
  document.getElementById('notifCloseBtn').addEventListener('click', closeNotifDrawer);
  document.getElementById('notifOverlay').addEventListener('click', closeNotifDrawer);
}
function toggleNotifDrawer() {
  const drawer = document.getElementById('notifDrawer');
  if (drawer.classList.contains('open')) closeNotifDrawer(); else openNotifDrawer();
}
function openNotifDrawer() {
  renderNotifList();
  document.getElementById('notifDrawer').classList.add('open');
  document.getElementById('notifOverlay').classList.add('open');
  state.notifications.forEach(n => n.read = true);
  persist();
  renderNotifBadge();
}
function closeNotifDrawer() {
  document.getElementById('notifDrawer').classList.remove('open');
  document.getElementById('notifOverlay').classList.remove('open');
}
function renderNotifBadge() {
  const hasUnread = state.notifications.some(n => !n.read) || computeLiveAlerts().length > 0;
  document.getElementById('notifDot').hidden = !hasUnread;
}

/** Computed fresh every time — reflects the current state of late bills,
 *  over-budget budgets, bills due soon, and completed goals. These aren't
 *  stored or dismissible; they naturally disappear once the condition
 *  resolves (bill paid, budget back under, etc). */
function computeLiveAlerts() {
  const alerts = [];
  Bills.getBills().forEach(b => {
    const status = Bills.effectiveStatus(b);
    if (status === 'Late') {
      alerts.push({ icon: 'fa-solid fa-triangle-exclamation', color: 'coral', title: `${b.name} is late`, desc: `${formatMoney(Bills.billRemaining(b))} due ${formatDate(b.dueDate)}` });
    } else if (status === 'Upcoming') {
      const days = daysUntil(b.dueDate);
      if (days >= 0 && days <= 3) alerts.push({ icon: 'fa-solid fa-clock', color: 'amber', title: `${b.name} due soon`, desc: `${formatMoney(Bills.billRemaining(b))} due in ${days}d` });
    }
  });
  Budgets.allBudgetSummaries().forEach(b => {
    if (b.over) alerts.push({ icon: 'fa-solid fa-sliders', color: 'coral', title: `${b.budget.name} is over budget`, desc: `Spent ${formatMoney(b.spent)} of ${formatMoney(b.allocated)}` });
  });
  Goals.getGoals().forEach(g => {
    if (Goals.goalSummary(g).complete) alerts.push({ icon: 'fa-solid fa-trophy', color: 'gold', title: `Goal reached: ${g.name}`, desc: `${formatMoney(g.current)} of ${formatMoney(g.target)}` });
  });
  Debts.getDebts().forEach(d => {
    if (d.balance <= 0) return;
    if (d.minimumPayment > 0) {
      const proj = Debts.projectPayoff(d.balance, d.apr, d.minimumPayment);
      if (!proj.feasible) alerts.push({ icon: 'fa-solid fa-triangle-exclamation', color: 'coral', title: `${d.name} payment is too low`, desc: `${formatMoney(d.minimumPayment)}/mo won't cover the interest — it will never shrink at this rate.` });
    }
  });
  return alerts;
}

function renderNotifList() {
  const list = document.getElementById('notifList');
  const live = computeLiveAlerts();
  const stored = [...state.notifications].reverse();
  if (!live.length && !stored.length) {
    list.innerHTML = emptyState('fa-regular fa-bell-slash', 'No notifications', "You're all caught up.");
    return;
  }
  let html = '';
  if (live.length) {
    html += `<div class="palette-group-label">Live Alerts</div>` + live.map(n => `
      <div class="notif-item">
        <div class="ni-icon badge-${n.color}"><i class="${n.icon}"></i></div>
        <div class="ni-main">
          <div class="ni-title">${escapeHtml(n.title)}</div>
          <div class="ni-desc">${escapeHtml(n.desc)}</div>
        </div>
      </div>`).join('');
  }
  if (stored.length) {
    html += `<div class="palette-group-label">Earlier</div>` + stored.map(n => `
      <div class="notif-item">
        <div class="ni-icon badge-${n.color}"><i class="${n.icon}"></i></div>
        <div class="ni-main">
          <div class="ni-title">${escapeHtml(n.title)}</div>
          <div class="ni-desc">${escapeHtml(n.desc)}</div>
          <div class="ni-time">${relativeTime(n.time)}</div>
        </div>
      </div>`).join('');
  }
  list.innerHTML = html;
}

/* ============================================================
   TOAST
   ============================================================ */
export function toast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  const icons = { success: 'fa-solid fa-circle-check', error: 'fa-solid fa-circle-exclamation', info: 'fa-solid fa-circle-info', warning: 'fa-solid fa-triangle-exclamation' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="toast-icon ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span><i class="fa-solid fa-xmark toast-close"></i>`;
  el.querySelector('.toast-close').addEventListener('click', () => el.remove());
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
window.__toast = toast;

/* ============================================================
   MODAL (generic) + CONFIRM
   ============================================================ */
function wireModals() {
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', (e) => { if (e.target.id === 'confirmOverlay') closeConfirm(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeConfirm(); closePalette(); closeNotifDrawer(); closeMobileSidebar(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });
}

function openModal(title, bodyHtml, footerHtml = '', { size = '' } = {}) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  const modal = document.getElementById('modalRoot');
  modal.className = 'modal' + (size ? ' ' + size : '');
  document.getElementById('modalOverlay').classList.add('open');
  document.body.classList.add('no-scroll');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
}

let confirmCallback = null;
function confirmAction(title, message, onConfirm, danger = true) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
  confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  confirmCallback = null;
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });
});

/* ============================================================
   SHARED SMALL RENDERERS
   ============================================================ */
function walletChip(w) {
  if (!w) return `<span class="text-low">—</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:6px;"><span class="chip-icon" style="width:20px;height:20px;border-radius:6px;background:${w.color};color:#04120c;font-size:10px;"><i class="${w.icon}"></i></span>${escapeHtml(w.name)}</span>`;
}

function typeIconMeta(type) {
  const map = {
    income: { icon: 'fa-solid fa-arrow-down', cls: 'type-icon-income' },
    expense: { icon: 'fa-solid fa-arrow-up', cls: 'type-icon-expense' },
    transfer: { icon: 'fa-solid fa-right-left', cls: 'type-icon-transfer' },
    adjustment: { icon: 'fa-solid fa-sliders', cls: 'type-icon-adjustment' },
    refund: { icon: 'fa-solid fa-rotate-left', cls: 'type-icon-refund' },
  };
  return map[type] || map.expense;
}

function amountSign(t) {
  if (t.type === 'income' || t.type === 'refund') return { sign: '+', cls: 'text-positive' };
  if (t.type === 'expense') return { sign: '-', cls: 'text-negative' };
  if (t.type === 'adjustment') return { sign: t.amount >= 0 ? '+' : '-', cls: t.amount >= 0 ? 'text-positive' : 'text-negative' };
  return { sign: '', cls: 'text-mid' };
}

function txRowHtml(t) {
  const wallet = Wallets.getWallet(t.walletId);
  const meta = typeIconMeta(t.type);
  const { sign, cls } = amountSign(t);
  const catMeta = t.category ? categoryMeta(state.categories, t.category) : null;
  return `
  <div class="tx-row" data-tx-id="${t.id}">
    <div class="tx-icon ${meta.cls}"><i class="${catMeta ? catMeta.icon : meta.icon}"></i></div>
    <div class="tx-main">
      <div class="tx-title">${escapeHtml(t.title)}</div>
      <div class="tx-meta">${walletChipText(wallet)} · ${formatDate(t.date)}${t.merchant ? ' · ' + escapeHtml(t.merchant) : ''}</div>
    </div>
    <div class="tx-amount ${cls}">${sign}${formatMoney(Math.abs(t.amount))}</div>
  </div>`;
}
function walletChipText(w) { return w ? escapeHtml(w.name) : 'Unknown'; }

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const totals = Analytics.dashboardTotals();
  const health = Analytics.financialHealthScore();
  const recent = Txns.recentTransactions(6);
  const budgetSums = Budgets.allBudgetSummaries().slice(0, 4);
  const upcomingBills = Bills.upcomingBills(4);
  const goals = Goals.getGoals().slice(0, 2).map(g => ({ goal: g, ...Goals.goalSummary(g) }));

  const ringCirc = 2 * Math.PI * 34;
  const ringOffset = ringCirc - (health.score / 100) * ringCirc;

  return `
  <div class="page-head">
    <div>
      <h1>Dashboard</h1>
      <p>Welcome back, ${escapeHtml((state.settings.ownerName || 'there').split(' ')[0])}. Here's your financial overview.</p>
    </div>
    <div class="page-head-actions">
      <button class="btn btn-secondary" data-action="open-export"><i class="fa-solid fa-file-export"></i> Export</button>
      <button class="btn btn-primary" data-action="quick-add"><i class="fa-solid fa-plus"></i> Add Transaction</button>
    </div>
  </div>

  <div class="grid grid-4" style="margin-bottom:18px;">
    ${statCard('Net Worth', formatMoney(totals.netWorth), 'fa-solid fa-scale-balanced', 'gold')}
    ${statCard('Total Wallet Balance', formatMoney(totals.totalBalance), 'fa-solid fa-wallet', 'mint')}
    ${statCard('Income (This Month)', formatMoney(totals.income), 'fa-solid fa-arrow-down', 'mint', true)}
    ${statCard('Expenses (This Month)', formatMoney(totals.expense), 'fa-solid fa-arrow-up', 'coral', true)}
  </div>

  <div class="grid grid-4" style="margin-bottom:18px;">
    ${statCard('Remaining Budget', formatMoney(totals.remainingBudget), 'fa-solid fa-sliders', 'blue')}
    ${statCard('Total Savings', formatMoney(totals.savingsTotal), 'fa-solid fa-piggy-bank', 'violet')}
    ${statCard('Upcoming Bills', String(Bills.billsSummary().upcoming + Bills.billsSummary().late), 'fa-solid fa-file-invoice-dollar', 'amber')}
    ${statCard('Total Debt Remaining', formatMoney(Debts.totalDebtBalance()), 'fa-solid fa-hand-holding-dollar', 'coral')}
  </div>

  <div class="card health-score-card" style="margin-bottom:18px;">
    <div class="health-ring">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle class="ring-bg" cx="42" cy="42" r="34"></circle>
        <circle class="ring-fill" cx="42" cy="42" r="34" stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"></circle>
      </svg>
      <div class="ring-label">${health.score}</div>
    </div>
    <div class="health-score-body">
      <h3>Financial Health Score — ${health.label}</h3>
      <p>Savings rate ${health.savingsRate}% · Budget health ${health.budgetHealth}% · Bill punctuality ${health.lateBillsRatio}%. This score blends your savings rate, budget discipline, bill payment history, and emergency-fund coverage.</p>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <div class="card-title-row"><h3>Net Worth Trend</h3><span class="card-sub">Reconstructed from your transaction history</span></div>
    <div class="chart-box chart-box-lg"><canvas id="chartNetWorthTrend"></canvas></div>
  </div>

  <div class="quick-actions-row" style="margin-bottom:18px;">
    ${quickAction('fa-solid fa-arrow-down', 'mint', 'Add Income', 'quick-income')}
    ${quickAction('fa-solid fa-arrow-up', 'coral', 'Add Expense', 'quick-expense')}
    ${quickAction('fa-solid fa-right-left', 'blue', 'Transfer Funds', 'quick-transfer')}
    ${quickAction('fa-solid fa-money-check-dollar', 'gold', 'Allocate Paycheck', 'quick-paycheck')}
  </div>

  <div class="dash-2col" style="margin-bottom:18px;">
    <div class="card">
      <div class="card-title-row"><h3>Cash Flow — Income vs Expense</h3><span class="card-sub">Last 6 months</span></div>
      <div class="chart-box"><canvas id="chartCashFlow"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Expense by Category</h3><span class="card-sub">This month</span></div>
      <div class="chart-box"><canvas id="chartExpenseDonut"></canvas></div>
      <div class="chart-legend" id="expenseDonutLegend"></div>
    </div>
  </div>

  <div class="dash-2col">
    <div class="card">
      <div class="card-title-row"><h3>Recent Transactions</h3><span class="card-sub" style="cursor:pointer;" data-action="goto-transactions">View all →</span></div>
      <div class="recent-tx-list">
        ${recent.length ? recent.map(txRowHtml).join('') : emptyState('fa-regular fa-file-lines', 'No transactions yet', 'Add your first transaction to see it here.')}
      </div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Wallet Distribution</h3></div>
      <div class="chart-box"><canvas id="chartWalletDonut"></canvas></div>
      <div class="chart-legend" id="walletDonutLegend"></div>
    </div>
  </div>

  <div class="dash-3col" style="margin-top:18px;">
    <div class="card">
      <div class="card-title-row"><h3>Budget Progress</h3><span class="card-sub" style="cursor:pointer;" data-action="goto-budgets">Manage →</span></div>
      <div class="budget-progress-list">
        ${budgetSums.length ? budgetSums.map(b => budgetProgressItem(b)).join('') : emptyState('fa-solid fa-sliders', 'No budgets set', 'Create a budget to track your spending.')}
      </div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Savings Progress</h3><span class="card-sub" style="cursor:pointer;" data-action="goto-goals">Manage →</span></div>
      <div class="budget-progress-list">
        ${goals.length ? goals.map(g => goalProgressItem(g)).join('') : emptyState('fa-solid fa-bullseye', 'No goals yet', 'Set a savings goal to start tracking.')}
      </div>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Upcoming Bills</h3><span class="card-sub" style="cursor:pointer;" data-action="goto-bills">View all →</span></div>
      <div>
        ${upcomingBills.length ? upcomingBills.map(billUpcomingItem).join('') : emptyState('fa-solid fa-file-invoice-dollar', 'No bills due', 'You are all caught up.')}
      </div>
    </div>
  </div>
  `;
}

function statCard(label, value, icon, accent, delta = false) {
  return `
  <div class="stat-card accent-${accent}">
    <div class="stat-icon"><i class="${icon}"></i></div>
    <div class="stat-label">${label}</div>
    <div class="stat-value mono">${value}</div>
  </div>`;
}

function quickAction(icon, accent, label, action) {
  return `<div class="quick-action-btn" data-action="${action}">
    <div class="qa-icon accent-${accent}" style="background:var(--${accent}-dim, var(--mint-dim));color:var(--${accent});"><i class="${icon}"></i></div>
    <span>${label}</span>
  </div>`;
}

function emptyState(icon, title, desc) {
  return `<div class="empty-state"><i class="${icon}"></i><h4>${title}</h4><p>${desc}</p></div>`;
}

function budgetProgressItem(b) {
  const pct = b.progress;
  const cls = b.over ? 'over' : (pct > 85 ? 'warn' : '');
  return `<div class="bp-item">
    <div class="bp-top"><span class="bp-name">${escapeHtml(b.budget.name)}</span><span class="bp-figs">${formatMoney(b.spent)} / ${formatMoney(b.allocated)}</span></div>
    <div class="progress thin"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
  </div>`;
}
function goalProgressItem(g) {
  return `<div class="bp-item">
    <div class="bp-top"><span class="bp-name">${escapeHtml(g.goal.name)}</span><span class="bp-figs">${formatMoney(g.goal.current)} / ${formatMoney(g.goal.target)}</span></div>
    <div class="progress thin"><div class="progress-fill" style="width:${g.progress}%"></div></div>
  </div>`;
}
function billUpcomingItem(b) {
  const status = Bills.effectiveStatus(b);
  const color = status === 'Late' ? 'coral' : status === 'Paid' ? 'mint' : 'amber';
  const days = daysUntil(b.dueDate);
  return `<div class="bill-upcoming-item">
    <span class="bu-dot" style="background:var(--${color});"></span>
    <div class="bu-main"><div class="bu-name">${escapeHtml(b.name)}</div><div class="bu-date">${days < 0 ? Math.abs(days) + 'd overdue' : 'Due in ' + days + 'd'} · ${formatDate(b.dueDate)}</div></div>
    <div class="bu-amount">${formatMoney(Bills.billRemaining(b))}</div>
  </div>`;
}

function renderDashboardCharts() {
  const nwt = Analytics.netWorthTimeline(30);
  Charts.renderArea('chartNetWorthTrend', nwt.map(p => p.date === 'Start' ? 'Start' : formatDate(p.date)), { label: 'Net Worth', data: nwt.map(p => p.netWorth) }, getCss('--gold'));

  const cf = Analytics.cashFlow(6);
  Charts.renderLine('chartCashFlow', cf.map(m => m.label), [
    { label: 'Income', data: cf.map(m => m.income), borderColor: getCss('--mint'), backgroundColor: 'transparent' },
    { label: 'Expense', data: cf.map(m => m.expense), borderColor: getCss('--coral'), backgroundColor: 'transparent' },
  ]);

  const exp = Analytics.expenseByCategory({ from: monthKey(todayISO()) + '-01', to: monthKey(todayISO()) + '-31' });
  const top = exp.slice(0, 6);
  Charts.renderDonut('chartExpenseDonut', top.map(c => c.category), top.map(c => c.amount), top.map((c, i) => Charts.PALETTE[i % Charts.PALETTE.length]));
  document.getElementById('expenseDonutLegend').innerHTML = top.length ? top.map((c, i) => legendItem(Charts.PALETTE[i % Charts.PALETTE.length], c.category, formatMoney(c.amount))).join('') : '<span class="text-low" style="font-size:12px;">No expenses this month yet.</span>';

  const dist = Analytics.walletDistribution();
  Charts.renderDonut('chartWalletDonut', dist.map(w => w.name), dist.map(w => Math.max(0, w.balance)), dist.map(w => w.color));
  document.getElementById('walletDonutLegend').innerHTML = dist.length ? dist.map(w => legendItem(w.color, w.name, formatMoney(w.balance))).join('') : '';
}
function legendItem(color, label, value) {
  return `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(label)} <span class="text-low">${value}</span></span>`;
}
function getCss(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }

/* ============================================================
   WALLETS
   ============================================================ */
function renderWallets() {
  const showArchived = currentSubState.showArchived || false;
  const wallets = Wallets.getWallets({ includeArchived: showArchived }).filter(w => showArchived ? true : !w.archived);
  return `
  <div class="page-head">
    <div><h1>Wallets</h1><p>${wallets.length} wallet${wallets.length === 1 ? '' : 's'} · Total ${formatMoney(Wallets.totalBalance())}</p></div>
    <div class="page-head-actions">
      <button class="filter-pill ${showArchived ? 'active' : ''}" data-action="toggle-archived"><i class="fa-solid fa-box-archive"></i> Show archived</button>
      <button class="btn btn-primary" data-action="add-wallet"><i class="fa-solid fa-plus"></i> New Wallet</button>
    </div>
  </div>
  <div class="wallet-grid">
    ${wallets.map(walletCardHtml).join('')}
    <div class="add-wallet-card" data-action="add-wallet"><i class="fa-solid fa-plus"></i><span>Add Wallet</span></div>
  </div>`;
}

function walletCardHtml(w) {
  return `
  <div class="wallet-card ${w.archived ? 'archived' : ''}" style="--wc-color:${w.color}" data-action="open-wallet" data-id="${w.id}">
    <div class="wallet-card-top">
      <div class="wc-icon" style="background:${w.color}"><i class="${w.icon}"></i></div>
      <div class="wallet-card-top-actions">
        <span class="wallet-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical"></i></span>
        <div class="dropdown">
          <button class="wc-menu-btn" data-action="wallet-menu" data-id="${w.id}" onclick="event.stopPropagation()"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>
      </div>
    </div>
    <div class="wc-name">${escapeHtml(w.name)}</div>
    <div class="wc-type">${escapeHtml(w.type)}${w.archived ? ' · Archived' : ''}</div>
    <div class="wc-balance mono">${formatMoney(w.balance)}</div>
    <div class="wc-footer"><span>Initial: ${formatMoney(w.initialBalance)}</span></div>
  </div>`;
}

function openWalletDetail(id) {
  const w = Wallets.getWallet(id);
  if (!w) return;
  const timeline = Wallets.walletBalanceTimeline(id, 14);
  const txns = Txns.getTransactions({ walletId: id }).slice(0, 8);
  const body = `
    <div class="wallet-detail-header">
      <div class="wd-icon" style="background:${w.color}"><i class="${w.icon}"></i></div>
      <div><h2>${escapeHtml(w.name)}</h2><div class="wd-sub">${escapeHtml(w.type)} · Created ${formatDate(w.createdAt.slice(0,10))}</div></div>
    </div>
    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="stat-card accent-mint"><div class="stat-label">Current Balance</div><div class="stat-value mono">${formatMoney(w.balance)}</div></div>
      <div class="stat-card accent-blue"><div class="stat-label">Initial Balance</div><div class="stat-value mono">${formatMoney(w.initialBalance)}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:14px;">
      <div class="card-title-row"><h3 style="font-size:13px;">Balance Timeline</h3></div>
      <div class="chart-box"><canvas id="chartWalletTimeline"></canvas></div>
    </div>
    ${w.notes ? `<div class="form-group"><span class="form-label">Notes</span><p style="font-size:13px;color:var(--text-mid);">${escapeHtml(w.notes)}</p></div>` : ''}
    <div class="card-title-row"><h3 style="font-size:13px;">Recent Activity</h3></div>
    <div class="recent-tx-list">${txns.length ? txns.map(txRowHtml).join('') : emptyState('fa-regular fa-file-lines', 'No activity', 'This wallet has no transactions yet.')}</div>
  `;
  const footer = `
    <button class="btn btn-ghost" data-action="wallet-history" data-id="${w.id}"><i class="fa-solid fa-clock-rotate-left"></i> Full History</button>
    <button class="btn btn-secondary" data-action="edit-wallet" data-id="${w.id}"><i class="fa-solid fa-pen"></i> Edit</button>
    <button class="btn btn-primary" data-action="quick-transfer-from" data-id="${w.id}"><i class="fa-solid fa-right-left"></i> Transfer</button>
  `;
  openModal(w.name, body, footer, { size: 'modal-lg' });
  const t = timeline;
  Charts.renderArea('chartWalletTimeline', t.map(p => p.date === 'start' ? 'Start' : formatDate(p.date)), { label: 'Balance', data: t.map(p => p.balance) }, w.color);
}

function walletFormHtml(w = null) {
  const isEdit = !!w;
  return `
  <form id="walletForm">
    <div class="form-group">
      <label class="form-label">Wallet Name</label>
      <input class="form-input" name="name" placeholder="e.g. GCash" value="${w ? escapeHtml(w.name) : ''}" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${isEdit ? 'Initial Balance' : 'Starting Balance'}</label>
        <input class="form-input" name="initialBalance" type="number" step="0.01" value="${w ? w.initialBalance : '0'}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Wallet Type</label>
        <select class="form-select" name="type">
          ${Wallets.walletTypes().map(t => `<option value="${t}" ${w && w.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-swatch-row" id="colorSwatchRow">
        ${WALLET_COLORS.map(c => `<div class="color-swatch ${w && w.color === c ? 'selected' : (!w && c === WALLET_COLORS[0] ? 'selected' : '')}" style="background:${c}" data-color="${c}"></div>`).join('')}
      </div>
      <input type="hidden" name="color" value="${w ? w.color : WALLET_COLORS[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Icon</label>
      <div class="icon-picker" id="iconPicker">
        ${WALLET_ICONS.map(ic => `<div class="icon-opt ${w && w.icon === ic ? 'selected' : (!w && ic === WALLET_ICONS[0] ? 'selected' : '')}" data-icon="${ic}"><i class="${ic}"></i></div>`).join('')}
      </div>
      <input type="hidden" name="icon" value="${w ? w.icon : WALLET_ICONS[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" name="notes" placeholder="Optional notes...">${w ? escapeHtml(w.notes) : ''}</textarea>
    </div>
  </form>`;
}

function openWalletForm(existing = null) {
  closeModal();
  setTimeout(() => {
    openModal(existing ? 'Edit Wallet' : 'New Wallet', walletFormHtml(existing), `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-wallet" data-id="${existing ? existing.id : ''}"><i class="fa-solid fa-check"></i> ${existing ? 'Save Changes' : 'Create Wallet'}</button>
    `);
    document.querySelectorAll('#colorSwatchRow .color-swatch').forEach(sw => sw.addEventListener('click', () => {
      document.querySelectorAll('#colorSwatchRow .color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      document.querySelector('#walletForm [name="color"]').value = sw.dataset.color;
    }));
    document.querySelectorAll('#iconPicker .icon-opt').forEach(op => op.addEventListener('click', () => {
      document.querySelectorAll('#iconPicker .icon-opt').forEach(o => o.classList.remove('selected'));
      op.classList.add('selected');
      document.querySelector('#walletForm [name="icon"]').value = op.dataset.icon;
    }));
  }, 60);
}

function saveWalletFromForm(id) {
  const form = document.getElementById('walletForm');
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  if (!data.name || !data.name.trim()) { toast('Please enter a wallet name.', 'error'); return; }
  if (id) { Wallets.updateWallet(id, data); toast('Wallet updated.', 'success'); }
  else { Wallets.createWallet(data); toast('Wallet created.', 'success'); }
  closeModal();
  rerender();
}

/* ============================================================
   TRANSACTIONS
   ============================================================ */
function renderTransactions() {
  const f = currentSubState.filters || {};
  const list = Txns.getTransactions(f);
  return `
  <div class="page-head">
    <div><h1>Transactions</h1><p>${list.length} record${list.length === 1 ? '' : 's'} found</p></div>
    <div class="page-head-actions">
      <button class="btn btn-secondary" data-action="export-tx-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>
      <button class="btn btn-secondary" data-action="export-tx-xlsx"><i class="fa-solid fa-file-excel"></i> Excel</button>
      <button class="btn btn-primary" data-action="quick-add"><i class="fa-solid fa-plus"></i> Add Transaction</button>
    </div>
  </div>
  <div class="tx-filter-bar">
    <div class="input-icon-wrap" style="width:240px;"><i class="fa-solid fa-magnifying-glass"></i><input class="form-input" id="txSearchInput" placeholder="Search title, merchant, tag..." value="${f.query || ''}"></div>
    <select class="form-select" id="txTypeFilter" style="width:150px;">
      <option value="">All Types</option>
      ${['income','expense','transfer','adjustment','refund'].map(t => `<option value="${t}" ${f.type===t?'selected':''}>${cap(t)}</option>`).join('')}
    </select>
    <select class="form-select" id="txCategoryFilter" style="width:170px;">
      <option value="">All Categories</option>
      ${state.categories.map(c => `<option value="${c.name}" ${f.category===c.name?'selected':''}>${c.name}</option>`).join('')}
    </select>
    <select class="form-select" id="txWalletFilter" style="width:160px;">
      <option value="">All Wallets</option>
      ${Wallets.getWallets().map(w => `<option value="${w.id}" ${f.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}
    </select>
    ${(f.query||f.type||f.category||f.walletId) ? `<button class="filter-pill" data-action="clear-tx-filters"><i class="fa-solid fa-xmark"></i> Clear</button>` : ''}
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Wallet</th><th>Type</th><th>Payment</th><th style="text-align:right;">Amount</th><th></th></tr></thead>
      <tbody>
        ${list.length ? list.map(txTableRow).join('') : `<tr><td colspan="8"><div class="table-empty"><i class="fa-regular fa-file-lines"></i>No transactions match your filters.</div></td></tr>`}
      </tbody>
    </table>
  </div>`;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function txTableRow(t) {
  const wallet = Wallets.getWallet(t.walletId);
  const toWallet = t.toWalletId ? Wallets.getWallet(t.toWalletId) : null;
  const { sign, cls } = amountSign(t);
  const meta = typeIconMeta(t.type);
  return `
  <tr>
    <td class="text-mid">${formatDate(t.date)}</td>
    <td><strong>${escapeHtml(t.title)}</strong>${t.merchant ? `<div class="text-low" style="font-size:11px;">${escapeHtml(t.merchant)}</div>` : ''}</td>
    <td>${t.category ? `<span class="badge badge-neutral">${escapeHtml(t.category)}</span>` : '—'}</td>
    <td>${walletChip(wallet)}${toWallet ? ' → ' + walletChip(toWallet) : ''}</td>
    <td><span class="badge ${badgeClassForType(t.type)}"><i class="${meta.icon}"></i> ${cap(t.type)}</span></td>
    <td class="text-mid">${escapeHtml(t.paymentMethod || '—')}</td>
    <td style="text-align:right;" class="mono ${cls}">${sign}${formatMoney(Math.abs(t.amount))}</td>
    <td>
      <div class="row-actions">
        <button class="icon-btn btn-icon-only" data-action="edit-tx" data-id="${t.id}" data-tooltip="Edit"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
        <button class="icon-btn btn-icon-only" data-action="delete-tx" data-id="${t.id}" data-tooltip="Delete"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
      </div>
    </td>
  </tr>`;
}
function badgeClassForType(type) {
  return { income: 'badge-mint', expense: 'badge-coral', transfer: 'badge-blue', adjustment: 'badge-amber', refund: 'badge-violet' }[type] || 'badge-neutral';
}

function transactionFormHtml(t = null, presetType = 'expense') {
  const type = t ? t.type : presetType;
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <form id="txForm">
    <div class="tx-type-selector" id="txTypeSelector">
      ${['income','expense','transfer','adjustment','refund'].map(ty => `<div class="tt-opt ${type===ty?'active '+ty:''}" data-type="${ty}">${cap(ty)}</div>`).join('')}
    </div>
    <input type="hidden" name="type" value="${type}">
    <div class="form-group">
      <div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" name="amount" type="number" step="0.01" min="0" placeholder="0.00" value="${t ? Math.abs(t.amount) : ''}" required></div>
    </div>
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" name="title" placeholder="e.g. Grocery Run" value="${t ? escapeHtml(t.title) : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" id="walletLabel">${type === 'transfer' ? 'From Wallet' : 'Wallet'}</label>
        <select class="form-select" name="walletId" id="walletSelect" required>
          ${wallets.map(w => `<option value="${w.id}" ${t && t.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="toWalletGroup" style="${type==='transfer'?'':'display:none;'}">
        <label class="form-label">To Wallet</label>
        <select class="form-select" name="toWalletId" id="toWalletSelect">
          ${wallets.map(w => `<option value="${w.id}" ${t && t.toWalletId===w.id?'selected':''}>${w.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group" id="categoryGroup" style="${type==='transfer'?'display:none;':''}">
      <label class="form-label">Category</label>
      <div class="category-picker" id="categoryPicker">
        ${state.categories.map(c => `<div class="cat-opt ${t && t.category===c.name?'selected':''}" data-category="${c.name}"><i class="${c.icon}"></i>${c.name}</div>`).join('')}
      </div>
      <input type="hidden" name="category" value="${t ? (t.category||'') : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" name="date" type="date" value="${t ? t.date : todayISO()}">
      </div>
      <div class="form-group">
        <label class="form-label">Time</label>
        <input class="form-input" name="time" type="time" value="${t ? t.time : nowTime()}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Merchant</label>
        <input class="form-input" name="merchant" placeholder="Optional" value="${t ? escapeHtml(t.merchant) : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select class="form-select" name="paymentMethod">
          ${PAYMENT_METHODS.map(p => `<option value="${p}" ${t && t.paymentMethod===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" name="status">
          ${['Cleared','Pending','Reconciled'].map(s => `<option value="${s}" ${t && t.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Receipt filename</label>
        <input class="form-input" name="receiptName" placeholder="receipt.jpg" value="${t ? escapeHtml(t.receiptName) : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" name="notes" placeholder="Optional notes...">${t ? escapeHtml(t.notes) : ''}</textarea>
    </div>
  </form>`;
}

function openTransactionForm(existing = null, presetType = 'expense') {
  const doOpen = () => {
    openModal(existing ? 'Edit Transaction' : 'Add Transaction', transactionFormHtml(existing, presetType), `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-tx" data-id="${existing ? existing.id : ''}"><i class="fa-solid fa-check"></i> ${existing ? 'Save Changes' : 'Add Transaction'}</button>
    `, { size: 'modal-lg' });
    wireTxFormInteractivity();
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function wireTxFormInteractivity() {
  document.querySelectorAll('#txTypeSelector .tt-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#txTypeSelector .tt-opt').forEach(o => o.className = 'tt-opt');
      opt.classList.add('active', opt.dataset.type);
      document.querySelector('#txForm [name="type"]').value = opt.dataset.type;
      const isTransfer = opt.dataset.type === 'transfer';
      document.getElementById('toWalletGroup').style.display = isTransfer ? '' : 'none';
      document.getElementById('categoryGroup').style.display = isTransfer ? 'none' : '';
      document.getElementById('walletLabel').textContent = isTransfer ? 'From Wallet' : 'Wallet';
      const suggested = Txns.suggestedWalletForCategory(document.querySelector('#txForm [name="category"]').value);
      if (suggested && !isTransfer) document.getElementById('walletSelect').value = suggested;
    });
  });
  document.querySelectorAll('#categoryPicker .cat-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#categoryPicker .cat-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      document.querySelector('#txForm [name="category"]').value = opt.dataset.category;
      const suggested = Txns.suggestedWalletForCategory(opt.dataset.category);
      const type = document.querySelector('#txForm [name="type"]').value;
      if (suggested && type !== 'transfer') document.getElementById('walletSelect').value = suggested;
    });
  });
}

function saveTxFromForm(id) {
  const form = document.getElementById('txForm');
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  if (!data.amount || Number(data.amount) <= 0) { toast('Please enter a valid amount.', 'error'); return; }
  if (!data.walletId) { toast('Please select a wallet.', 'error'); return; }
  if (data.type === 'transfer' && data.walletId === data.toWalletId) { toast('Source and destination wallets must differ.', 'error'); return; }
  if (id) { Txns.updateTransaction(id, data); toast('Transaction updated.', 'success'); }
  else { Txns.createTransaction(data); toast('Transaction added.', 'success'); }
  closeModal();
  rerender();
}

/* ============================================================
   TRANSFERS (dedicated view)
   ============================================================ */
function renderTransfers() {
  const transfers = Txns.getTransactions({ type: 'transfer' });
  return `
  <div class="page-head">
    <div><h1>Transfers</h1><p>Move money between your wallets. ${transfers.length} transfer${transfers.length===1?'':'s'} recorded.</p></div>
    <div class="page-head-actions">
      <button class="btn btn-primary" data-action="quick-transfer"><i class="fa-solid fa-right-left"></i> New Transfer</button>
    </div>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>Date</th><th>From</th><th>To</th><th>Reason</th><th style="text-align:right;">Amount</th><th></th></tr></thead>
      <tbody>
      ${transfers.length ? transfers.map(t => `
        <tr>
          <td class="text-mid">${formatDate(t.date)}</td>
          <td>${walletChip(Wallets.getWallet(t.walletId))}</td>
          <td>${walletChip(Wallets.getWallet(t.toWalletId))}</td>
          <td class="text-mid">${escapeHtml(t.title)}</td>
          <td style="text-align:right;" class="mono">${formatMoney(t.amount)}</td>
          <td><div class="row-actions"><button class="icon-btn btn-icon-only" data-action="delete-tx" data-id="${t.id}"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button></div></td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="table-empty"><i class="fa-solid fa-right-left"></i>No transfers yet.</div></td></tr>`}
      </tbody>
    </table>
  </div>`;
}

function transferFormHtml(fromId = null) {
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <form id="transferForm">
    <div class="form-group">
      <div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">From Wallet</label>
        <select class="form-select" name="walletId" required>${wallets.map(w => `<option value="${w.id}" ${fromId===w.id?'selected':''}>${w.name} (${formatMoney(w.balance)})</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">To Wallet</label>
        <select class="form-select" name="toWalletId" required>${wallets.map(w => `<option value="${w.id}" ${fromId && fromId!==w.id?'':''}>${w.name} (${formatMoney(w.balance)})</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <input class="form-input" name="title" placeholder="e.g. Monthly savings transfer">
    </div>
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" name="date" type="date" value="${todayISO()}">
    </div>
  </form>`;
}

function openTransferForm(fromId = null) {
  const doOpen = () => {
    openModal('Transfer Funds', transferFormHtml(fromId), `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" data-action="save-transfer"><i class="fa-solid fa-check"></i> Transfer</button>
    `);
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function saveTransferFromForm() {
  const form = document.getElementById('transferForm');
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  if (!data.amount || Number(data.amount) <= 0) { toast('Please enter a valid amount.', 'error'); return; }
  if (data.walletId === data.toWalletId) { toast('Please choose two different wallets.', 'error'); return; }
  Txns.createTransaction({ type: 'transfer', title: data.title || 'Wallet Transfer', amount: data.amount, walletId: data.walletId, toWalletId: data.toWalletId, date: data.date, paymentMethod: 'Bank Transfer', category: 'Transfer' });
  toast('Transfer completed.', 'success');
  closeModal();
  rerender();
}

/* ============================================================
   BUDGETS
   ============================================================ */
function renderBudgets() {
  const summaries = Budgets.allBudgetSummaries();
  const totals = summaries.reduce((acc, b) => { acc.allocated += b.allocated; acc.spent += b.spent; return acc; }, { allocated: 0, spent: 0 });
  const mode = state.settings.budgetMode;
  const monthIncome = Analytics.dashboardTotals().income || Wallets.netWorth();

  let zeroBasedHtml = '';
  if (mode === 'zero-based') {
    const zb = Budgets.zeroBasedSummary(monthIncome);
    zeroBasedHtml = `
    <div class="card" style="margin-bottom:18px;background:${zb.isBalanced ? 'var(--mint-dim)' : 'var(--amber-dim)'};border-color:${zb.isBalanced?'rgba(95,227,168,0.3)':'rgba(242,178,92,0.3)'};">
      <div class="grid grid-3">
        <div><div class="stat-label">Income</div><div class="stat-value mono">${formatMoney(zb.income)}</div></div>
        <div><div class="stat-label">Allocated</div><div class="stat-value mono">${formatMoney(zb.allocated)}</div></div>
        <div><div class="stat-label">${zb.remaining >= 0 ? 'Remaining To Allocate' : 'Over-allocated'}</div><div class="stat-value mono ${zb.remaining>=0?'text-positive':'text-negative'}">${formatMoney(Math.abs(zb.remaining))}</div></div>
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:var(--text-mid);">${zb.isBalanced ? 'Every peso is allocated. Nicely balanced budget.' : (zb.remaining > 0 ? 'You still have unallocated income — assign it to a budget or goal.' : 'You have allocated more than your income. Consider adjusting.')}</p>
    </div>`;
  }

  return `
  <div class="page-head">
    <div><h1>Budgets</h1><p>${summaries.length} budget${summaries.length===1?'':'s'} · ${formatMoney(totals.spent)} spent of ${formatMoney(totals.allocated)} allocated</p></div>
    <div class="page-head-actions">
      <button class="filter-pill ${mode==='zero-based'?'active':''}" data-action="toggle-budget-mode"><i class="fa-solid fa-scale-balanced"></i> ${mode === 'zero-based' ? 'Zero-Based Mode' : 'Traditional Mode'}</button>
      <button class="btn btn-primary" data-action="add-budget"><i class="fa-solid fa-plus"></i> New Budget</button>
    </div>
  </div>
  ${zeroBasedHtml}
  <div class="grid grid-3">
    ${summaries.length ? summaries.map(budgetCardHtml).join('') : `<div class="empty-state" style="grid-column:1/-1;">${emptyState('fa-solid fa-sliders','No budgets yet','Create your first budget to start tracking spending limits.')}</div>`}
  </div>`;
}

function budgetCardHtml(b) {
  const cls = b.over ? 'over' : (b.progress > 85 ? 'warn' : '');
  const meta = categoryMeta(state.categories, b.budget.category);
  return `
  <div class="card">
    <div class="card-title-row">
      <h3><i class="${meta.icon}" style="margin-right:8px;color:${meta.color};"></i>${escapeHtml(b.budget.name)}</h3>
      <div class="dropdown">
        <button class="icon-btn btn-icon-only" data-action="budget-menu" data-id="${b.budget.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
    </div>
    <div class="text-mid" style="font-size:11.5px;margin-bottom:10px;">${b.budget.period}${b.over ? ' · <span class="text-negative">Over budget</span>' : ''}</div>
    <div class="progress" style="margin-bottom:10px;"><div class="progress-fill ${cls}" style="width:${b.progress}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;">
      <span class="text-mid">Spent <strong class="mono" style="color:var(--text-hi);">${formatMoney(b.spent)}</strong></span>
      <span class="text-mid">of <strong class="mono" style="color:var(--text-hi);">${formatMoney(b.allocated)}</strong></span>
    </div>
    <div style="margin-top:6px;font-size:12px;" class="${b.remaining<0?'text-negative':'text-positive'}">${b.remaining<0 ? formatMoney(Math.abs(b.remaining)) + ' over' : formatMoney(b.remaining) + ' remaining'}</div>
  </div>`;
}

function budgetFormHtml(b = null) {
  return `
  <form id="budgetForm">
    <div class="form-group">
      <label class="form-label">Budget Name</label>
      <input class="form-input" name="name" placeholder="e.g. Food & Dining" value="${b ? escapeHtml(b.name) : ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" name="category" required>
          ${state.categories.map(c => `<option value="${c.name}" ${b && b.category===c.name?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Allocated Amount</label>
        <input class="form-input" name="allocated" type="number" step="0.01" min="0" value="${b ? b.allocated : ''}" required>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Period</label>
      <select class="form-select" name="period">
        ${['Monthly','Weekly','Biweekly','15th Cutoff','30th Cutoff','Custom'].map(p => `<option value="${p}" ${b && b.period===p?'selected':''}>${p}</option>`).join('')}
      </select>
    </div>
  </form>`;
}

function openBudgetForm(existing = null) {
  const doOpen = () => openModal(existing ? 'Edit Budget' : 'New Budget', budgetFormHtml(existing), `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="save-budget" data-id="${existing ? existing.id : ''}"><i class="fa-solid fa-check"></i> ${existing ? 'Save' : 'Create Budget'}</button>
  `);
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}
function saveBudgetFromForm(id) {
  const form = document.getElementById('budgetForm');
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.category || !data.allocated) { toast('Please complete all required fields.', 'error'); return; }
  const duplicate = Budgets.getBudgets().find(b => b.id !== id && b.category === data.category && b.period === data.period);
  if (duplicate) { toast(`"${duplicate.name}" already budgets ${data.category} for ${data.period} — edit that one instead of creating a duplicate (duplicates would combine spending).`, 'error'); return; }
  if (!data.name) data.name = data.category;
  if (id) Budgets.updateBudget(id, data); else Budgets.createBudget(data);
  toast(id ? 'Budget updated.' : 'Budget created.', 'success');
  closeModal(); rerender();
}

/* ============================================================
   PAYCHECK ALLOCATOR
   ============================================================ */
function renderPaycheck() {
  const wallets = Wallets.getWallets({ includeArchived: false });
  const rules = Txns.getRules();
  const categories = ['Bills','Savings','Emergency','Allowance','Investment','Shopping','Travel'];
  return `
  <div class="page-head">
    <div><h1>Paycheck Allocator</h1><p>Enter your salary and automatically distribute it across your wallets.</p></div>
  </div>
  <div class="grid grid-1-2">
    <div class="card">
      <div class="card-title-row"><h3>1. Enter Salary</h3></div>
      <div class="form-group">
        <div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" id="paycheckAmount" type="number" step="0.01" min="0" placeholder="0.00" value="18500"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Source Wallet (where salary lands)</label>
        <select class="form-select" id="paycheckSourceWallet">${wallets.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input class="form-input" id="paycheckDate" type="date" value="${todayISO()}">
      </div>
      <div class="card-title-row" style="margin-top:20px;"><h3>2. Allocate</h3><span class="card-sub" id="paycheckRemainLabel"></span></div>
      <div id="paycheckAllocRows"></div>
      <button class="btn btn-ghost btn-block" id="paycheckAddRowBtn" style="margin-top:8px;"><i class="fa-solid fa-plus"></i> Add allocation row</button>
    </div>
    <div class="card">
      <div class="card-title-row"><h3>Preview</h3></div>
      <div id="paycheckPreview"></div>
      <button class="btn btn-primary btn-block" id="paycheckApplyBtn" style="margin-top:16px;"><i class="fa-solid fa-check"></i> Allocate &amp; Create Transfers</button>
      <p class="form-hint" style="text-align:center;margin-top:10px;">This creates real transfer transactions and updates wallet balances automatically.</p>
    </div>
  </div>`;
}

let paycheckRows = [];
function initPaycheckWizard() {
  const wallets = Wallets.getWallets({ includeArchived: false });
  const rules = Txns.getRules();
  const categories = ['Bills','Savings','Emergency','Allowance','Investment','Shopping','Travel'];
  paycheckRows = categories.slice(0, 5).map((cat, i) => ({
    id: uid('pr'), category: cat, pct: [30,20,10,15,10][i] || 10,
    walletId: (rules.find(r => r.category === cat) || {}).walletId || (wallets[i % wallets.length] || {}).id,
  }));
  renderPaycheckRows();
  document.getElementById('paycheckAddRowBtn').addEventListener('click', () => {
    paycheckRows.push({ id: uid('pr'), category: categories[0], pct: 0, walletId: wallets[0]?.id });
    renderPaycheckRows();
  });
  document.getElementById('paycheckAmount').addEventListener('input', renderPaycheckPreview);
  document.getElementById('paycheckApplyBtn').addEventListener('click', applyPaycheckAllocation);
  renderPaycheckPreview();
}

function renderPaycheckRows() {
  const wallets = Wallets.getWallets({ includeArchived: false });
  const categories = ['Bills','Savings','Emergency','Allowance','Investment','Shopping','Travel','Food','Others'];
  const wrap = document.getElementById('paycheckAllocRows');
  wrap.innerHTML = paycheckRows.map(r => `
    <div class="form-row" style="grid-template-columns:1.3fr 0.7fr 1.3fr auto;gap:8px;align-items:end;margin-bottom:10px;" data-row-id="${r.id}">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Category</label>
        <select class="form-select pr-category">${categories.map(c => `<option value="${c}" ${r.category===c?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">%</label>
        <input class="form-input pr-pct" type="number" min="0" max="100" value="${r.pct}">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Wallet</label>
        <select class="form-select pr-wallet">${wallets.map(w => `<option value="${w.id}" ${r.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}</select>
      </div>
      <button class="icon-btn btn-icon-only pr-remove" type="button"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
    </div>`).join('');

  wrap.querySelectorAll('[data-row-id]').forEach(rowEl => {
    const id = rowEl.dataset.rowId;
    rowEl.querySelector('.pr-category').addEventListener('change', e => { updateRow(id, { category: e.target.value }); });
    rowEl.querySelector('.pr-pct').addEventListener('input', e => { updateRow(id, { pct: Number(e.target.value) || 0 }); });
    rowEl.querySelector('.pr-wallet').addEventListener('change', e => { updateRow(id, { walletId: e.target.value }); });
    rowEl.querySelector('.pr-remove').addEventListener('click', () => { paycheckRows = paycheckRows.filter(r => r.id !== id); renderPaycheckRows(); renderPaycheckPreview(); });
  });
  renderPaycheckPreview();
}
function updateRow(id, patch) {
  const r = paycheckRows.find(x => x.id === id);
  if (r) Object.assign(r, patch);
  renderPaycheckPreview();
}

function renderPaycheckPreview() {
  const amount = Number(document.getElementById('paycheckAmount')?.value) || 0;
  const totalPct = paycheckRows.reduce((s, r) => s + r.pct, 0);
  const remainPct = round2(100 - totalPct);
  const label = document.getElementById('paycheckRemainLabel');
  if (label) { label.textContent = `${remainPct}% unallocated`; label.style.color = remainPct < 0 ? 'var(--coral)' : 'var(--text-low)'; }
  const preview = document.getElementById('paycheckPreview');
  if (!preview) return;
  const wallets = Wallets.getWallets();
  preview.innerHTML = paycheckRows.map(r => {
    const amt = round2(amount * (r.pct / 100));
    const w = wallets.find(x => x.id === r.walletId);
    return `<div class="bp-item"><div class="bp-top"><span class="bp-name">${r.category} → ${w ? w.name : '—'}</span><span class="bp-figs">${formatMoney(amt)} (${r.pct}%)</span></div><div class="progress thin"><div class="progress-fill" style="width:${Math.min(100,r.pct)}%"></div></div></div>`;
  }).join('') + `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;font-weight:700;"><span>Total Allocated</span><span class="mono">${formatMoney(round2(amount * (totalPct/100)))}</span></div>`;
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function applyPaycheckAllocation() {
  const amount = Number(document.getElementById('paycheckAmount').value) || 0;
  const sourceId = document.getElementById('paycheckSourceWallet').value;
  const date = document.getElementById('paycheckDate').value || todayISO();
  if (amount <= 0) { toast('Enter a salary amount first.', 'error'); return; }
  Txns.createTransaction({ type: 'income', title: 'Paycheck Received', amount, walletId: sourceId, category: 'Salary', date, paymentMethod: 'Bank Transfer' });
  paycheckRows.forEach(r => {
    const amt = round2(amount * (r.pct / 100));
    if (amt <= 0 || !r.walletId || r.walletId === sourceId) return;
    Txns.createTransaction({ type: 'transfer', title: `Paycheck Allocation: ${r.category}`, amount: amt, walletId: sourceId, toWalletId: r.walletId, category: r.category, date, paymentMethod: 'Bank Transfer' });
    Txns.setRule(r.category, r.walletId);
  });
  toast('Paycheck allocated across wallets!', 'success');
  navigate('dashboard');
}

/* ============================================================
   SAVINGS GOALS
   ============================================================ */
function renderGoals() {
  const goals = Goals.getGoals().map(g => ({ goal: g, ...Goals.goalSummary(g) }));
  return `
  <div class="page-head">
    <div><h1>Savings Goals</h1><p>${goals.length} goal${goals.length===1?'':'s'} in progress</p></div>
    <div class="page-head-actions"><button class="btn btn-primary" data-action="add-goal"><i class="fa-solid fa-plus"></i> New Goal</button></div>
  </div>
  <div class="grid grid-3">
    ${goals.length ? goals.map(goalCardHtml).join('') : `<div style="grid-column:1/-1;">${emptyState('fa-solid fa-bullseye','No savings goals yet','Set a target and start building toward it.')}</div>`}
  </div>`;
}
function goalCardHtml(g) {
  const wallet = g.goal.walletId ? Wallets.getWallet(g.goal.walletId) : null;
  return `
  <div class="card">
    <div class="card-title-row">
      <h3><i class="fa-solid fa-bullseye" style="margin-right:8px;color:var(--gold);"></i>${escapeHtml(g.goal.name)}</h3>
      <div class="dropdown"><button class="icon-btn btn-icon-only" data-action="goal-menu" data-id="${g.goal.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>
    </div>
    <div class="text-mid" style="font-size:11.5px;margin-bottom:10px;">${wallet ? 'Linked to ' + escapeHtml(wallet.name) : 'No linked wallet'}${g.goal.deadline ? ' · Due ' + formatDate(g.goal.deadline) : ''}</div>
    <div class="progress" style="margin-bottom:10px;"><div class="progress-fill" style="width:${g.progress}%;${g.complete ? 'background:linear-gradient(90deg,var(--gold),var(--mint));' : ''}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;">
      <span class="text-mid">${formatMoney(g.goal.current)} <span style="color:var(--text-low)">of</span> ${formatMoney(g.goal.target)}</span>
      <span class="text-gold" style="font-weight:700;">${g.progress}%</span>
    </div>
    ${g.complete ? `<div class="badge badge-gold" style="margin-top:10px;"><i class="fa-solid fa-trophy"></i> Goal Reached!</div>` : `
    <button class="btn btn-secondary btn-block" style="margin-top:14px;" data-action="contribute-goal" data-id="${g.goal.id}"><i class="fa-solid fa-plus"></i> Add Contribution</button>`}
  </div>`;
}
function goalFormHtml(g = null) {
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <form id="goalForm">
    <div class="form-group"><label class="form-label">Goal Name</label><input class="form-input" name="name" placeholder="e.g. Japan Trip 2027" value="${g?escapeHtml(g.name):''}" required></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Target Amount</label><input class="form-input" name="target" type="number" step="0.01" min="0" value="${g?g.target:''}" required></div>
      <div class="form-group"><label class="form-label">Current Amount</label><input class="form-input" name="current" type="number" step="0.01" min="0" value="${g?g.current:'0'}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Deadline</label><input class="form-input" name="deadline" type="date" value="${g&&g.deadline?g.deadline:''}"></div>
      <div class="form-group"><label class="form-label">Linked Wallet</label><select class="form-select" name="walletId"><option value="">None</option>${wallets.map(w=>`<option value="${w.id}" ${g&&g.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes" placeholder="Optional notes...">${g?escapeHtml(g.notes):''}</textarea></div>
  </form>`;
}
function openGoalForm(existing = null) {
  const doOpen = () => openModal(existing?'Edit Goal':'New Savings Goal', goalFormHtml(existing), `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="save-goal" data-id="${existing?existing.id:''}"><i class="fa-solid fa-check"></i> ${existing?'Save':'Create Goal'}</button>`);
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen,60); } else doOpen();
}
function saveGoalFromForm(id) {
  const data = Object.fromEntries(new FormData(document.getElementById('goalForm')).entries());
  if (!data.name || !data.target) { toast('Please complete required fields.', 'error'); return; }
  if (id) Goals.updateGoal(id, data); else Goals.createGoal(data);
  toast(id?'Goal updated.':'Goal created.', 'success');
  closeModal(); rerender();
}
function openContributeForm(id) {
  const g = Goals.getGoal(id);
  if (!g) return;
  const wallets = Wallets.getWallets({ includeArchived: false });
  const body = `
  <form id="contribForm">
    <div class="form-group"><div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required></div></div>
    <div class="form-group"><label class="form-label">From Wallet (optional — records a transfer)</label>
      <select class="form-select" name="sourceWalletId"><option value="">Don't record a transfer</option>${wallets.map(w=>`<option value="${w.id}">${w.name} (${formatMoney(w.balance)})</option>`).join('')}</select>
    </div>
  </form>`;
  const doOpen = () => openModal(`Contribute to "${g.name}"`, body, `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="save-contribution" data-id="${id}"><i class="fa-solid fa-check"></i> Add Contribution</button>`);
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen,60); } else doOpen();
}
function saveContributionFromForm(id) {
  const data = Object.fromEntries(new FormData(document.getElementById('contribForm')).entries());
  if (!data.amount || Number(data.amount) <= 0) { toast('Enter a valid amount.', 'error'); return; }
  Goals.contributeToGoal(id, data.amount, data.sourceWalletId || null);
  toast('Contribution added.', 'success');
  closeModal(); rerender();
}

/* ============================================================
   BILLS
   ============================================================ */
function renderBills() {
  const bills = Bills.getBills();
  const summary = Bills.billsSummary();
  return `
  <div class="page-head">
    <div><h1>Bills</h1><p>${summary.upcoming} upcoming · ${summary.late} late · ${formatMoney(summary.totalDue)} due</p></div>
    <div class="page-head-actions"><button class="btn btn-primary" data-action="add-bill"><i class="fa-solid fa-plus"></i> New Bill</button></div>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>Bill</th><th>Category</th><th>Wallet</th><th>Due Date</th><th>Recurrence</th><th>Status</th><th style="text-align:right;">Amount</th><th></th></tr></thead>
      <tbody>
      ${bills.length ? bills.map(billRowHtml).join('') : `<tr><td colspan="8"><div class="table-empty"><i class="fa-solid fa-file-invoice-dollar"></i>No bills tracked yet.</div></td></tr>`}
      </tbody>
    </table>
  </div>`;
}
function billRowHtml(b) {
  const status = Bills.effectiveStatus(b);
  const badgeCls = status === 'Late' ? 'badge-coral' : status === 'Paid' ? 'badge-mint' : 'badge-amber';
  const wallet = b.walletId ? Wallets.getWallet(b.walletId) : null;
  const remaining = Bills.billRemaining(b);
  const cycleTotal = Bills.billCycleTotal(b);
  const progress = Bills.billProgress(b);
  const hasPartial = (b.amountPaid || 0) > 0 && status !== 'Paid';
  const hasCarryOver = (b.carryOver || 0) > 0;
  const linkedDebt = b.linkedDebtId ? Debts.getDebt(b.linkedDebtId) : null;
  return `
  <tr>
    <td>
      <strong>${escapeHtml(b.name)}</strong>${b.autopay ? ' <span class="badge badge-blue" style="margin-left:6px;">Autopay</span>' : ''}
      ${linkedDebt ? `<div class="text-mid" style="font-size:10.5px;margin-top:3px;"><i class="fa-solid fa-link" style="font-size:9px;"></i> Also pays down "${escapeHtml(linkedDebt.name)}"</div>` : ''}
      ${hasCarryOver ? `<div class="text-negative" style="font-size:10.5px;margin-top:3px;"><i class="fa-solid fa-arrow-turn-down" style="font-size:9px;"></i> ${formatMoney(b.carryOver)} carried over from last cycle</div>` : ''}
      ${hasPartial ? `
        <div class="progress thin" style="width:130px;margin-top:6px;"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="text-low" style="font-size:10.5px;margin-top:3px;">${formatMoney(b.amountPaid)} of ${formatMoney(cycleTotal)} paid</div>
      ` : ''}
    </td>
    <td>${escapeHtml(b.category)}</td>
    <td>${wallet ? walletChip(wallet) : '—'}</td>
    <td class="text-mid">${formatDate(b.dueDate)}</td>
    <td class="text-mid">${b.recurrence}</td>
    <td><span class="badge ${badgeCls}">${status}</span></td>
    <td style="text-align:right;" class="mono">${hasPartial || hasCarryOver ? formatMoney(remaining) + ' left' : formatMoney(b.amount)}</td>
    <td>
      <div class="row-actions">
        ${status !== 'Paid' ? `<button class="icon-btn btn-icon-only" data-action="bill-pay-menu" data-id="${b.id}" data-tooltip="Pay"><i class="fa-solid fa-money-bill-wave" style="font-size:11px;"></i></button>` : ''}
        ${b.lastPayment ? `<button class="icon-btn btn-icon-only" data-action="undo-bill-payment" data-id="${b.id}" data-tooltip="Undo Last Payment"><i class="fa-solid fa-rotate-left" style="font-size:11px;"></i></button>` : ''}
        <button class="icon-btn btn-icon-only" data-action="bill-history" data-id="${b.id}" data-tooltip="Payment History"><i class="fa-solid fa-clock-rotate-left" style="font-size:11px;"></i></button>
        <button class="icon-btn btn-icon-only" data-action="edit-bill" data-id="${b.id}" data-tooltip="Edit"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
        <button class="icon-btn btn-icon-only" data-action="delete-bill" data-id="${b.id}" data-tooltip="Delete"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
      </div>
    </td>
  </tr>`;
}
function billFormHtml(b = null) {
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <form id="billForm">
    <div class="form-group"><label class="form-label">Bill Name</label><input class="form-input" name="name" placeholder="e.g. Electricity (Meralco)" value="${b?escapeHtml(b.name):''}" required></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Amount</label><input class="form-input" name="amount" type="number" step="0.01" min="0" value="${b?b.amount:''}" required></div>
      <div class="form-group"><label class="form-label">Category</label><select class="form-select" name="category">${state.categories.map(c=>`<option value="${c.name}" ${b&&b.category===c.name?'selected':''}>${c.name}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" name="dueDate" type="date" value="${b?b.dueDate:todayISO()}"></div>
      <div class="form-group"><label class="form-label">Recurrence</label><select class="form-select" name="recurrence">${['Monthly','Weekly','15th Cutoff','30th Cutoff','Yearly','One-time'].map(r=>`<option value="${r}" ${b&&b.recurrence===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <p class="form-hint" style="margin:-8px 0 14px;">Use "15th Cutoff" / "30th Cutoff" for semi-monthly bills — each one recurs monthly, landing on the 15th or the last day near the 30th (clamped to shorter months).</p>
    </div>
    <div class="form-group"><label class="form-label">Pay From Wallet</label><select class="form-select" name="walletId"><option value="">None</option>${wallets.map(w=>`<option value="${w.id}" ${b&&b.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}</select></div>
    <div class="form-group">
      <label class="form-label">Link to Debt <span class="text-low">(optional)</span></label>
      <select class="form-select" name="linkedDebtId"><option value="">None — standalone bill</option>${Debts.getDebts().filter(d=>d.balance>0).map(d=>`<option value="${d.id}" ${b&&b.linkedDebtId===d.id?'selected':''}>${d.name} (${formatMoney(d.balance)} left)</option>`).join('')}</select>
      <p class="form-hint">When you pay this bill, the same payment also reduces the linked debt's balance — no double charge, one real payment tagged to both.</p>
    </div>
    <div class="form-toggle-row"><span class="form-label" style="margin:0;">Autopay enabled</span><label class="switch"><input type="checkbox" name="autopay" ${b&&b.autopay?'checked':''}><span class="slider"></span></label></div>
  </form>`;
}
function openBillForm(existing = null) {
  const doOpen = () => openModal(existing?'Edit Bill':'New Bill', billFormHtml(existing), `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="save-bill" data-id="${existing?existing.id:''}"><i class="fa-solid fa-check"></i> ${existing?'Save':'Create Bill'}</button>`);
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen,60); } else doOpen();
}
function saveBillFromForm(id) {
  const form = document.getElementById('billForm');
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  data.autopay = fd.get('autopay') === 'on';
  if (!data.name || !data.amount) { toast('Please complete required fields.', 'error'); return; }
  const otherSameCategory = Bills.getBills().filter(b => b.id !== id && b.category === data.category);
  if (id) Bills.updateBill(id, data); else Bills.createBill(data);
  closeModal(); rerender();
  if (otherSameCategory.length) {
    toast(`Heads up: ${otherSameCategory.length} other bill(s) also use "${data.category}" — a Budget for that category will combine all of them.`, 'warning');
  } else {
    toast(id ? 'Bill updated.' : 'Bill created.', 'success');
  }
}

function openPartialPaymentForm(id) {
  const b = Bills.getBill(id);
  if (!b) return;
  const remaining = Bills.billRemaining(b);
  const linkedDebt = b.linkedDebtId ? Debts.getDebt(b.linkedDebtId) : null;
  const doOpen = () => {
    openModal(`Partial Payment — ${b.name}`, `
      <form id="partialPayForm">
        <p class="form-hint" style="margin-bottom:12px;">Remaining balance this cycle: <strong style="color:var(--text-hi);">${formatMoney(remaining)}</strong></p>
        <div class="form-group"><div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" name="amount" type="number" step="0.01" min="0.01" max="${remaining}" placeholder="0.00" required></div></div>
        <p class="form-hint">Paying the full remaining amount will automatically mark this bill Paid and advance it to the next cycle.${linkedDebt ? ` This also reduces "${escapeHtml(linkedDebt.name)}" by the amount you pay here.` : ''}</p>
      </form>
    `, `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" id="savePartialPayBtn"><i class="fa-solid fa-check"></i> Record Payment</button>
    `);
    document.getElementById('savePartialPayBtn').addEventListener('click', () => {
      const amt = Number(document.querySelector('#partialPayForm [name="amount"]').value);
      if (!amt || amt <= 0) { toast('Enter a valid amount.', 'error'); return; }
      try {
        const wasFull = amt >= remaining - 0.001;
        Bills.payBill(id, amt);
        toast(wasFull ? 'Bill paid in full.' : 'Partial payment recorded.', 'success');
        closeModal(); rerender();
      } catch (e) { toast(e.message, 'error'); }
    });
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function openBillHistoryModal(id) {
  const b = Bills.getBill(id);
  if (!b) return;
  const history = Bills.billPaymentHistory(id);
  const totalPaid = round2(history.reduce((sum, t) => sum + t.amount, 0));
  const body = `
    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="stat-card accent-mint"><div class="stat-label">Total Paid (all time)</div><div class="stat-value mono">${formatMoney(totalPaid)}</div></div>
      <div class="stat-card accent-amber"><div class="stat-label">Current Cycle Remaining</div><div class="stat-value mono">${formatMoney(Bills.billRemaining(b))}</div></div>
    </div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Note</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${history.length ? history.map(t => `<tr><td>${formatDate(t.date)}</td><td class="text-mid">${escapeHtml(t.notes || '—')}</td><td style="text-align:right;" class="mono text-negative">-${formatMoney(t.amount)}</td></tr>`).join('') : `<tr><td colspan="3"><div class="table-empty"><i class="fa-solid fa-clock-rotate-left"></i>No payments recorded yet.</div></td></tr>`}
    </tbody></table></div>
  `;
  openModal(`${b.name} — Payment History`, body, `<button class="btn btn-ghost" data-action="close-modal">Close</button>`, { size: 'modal-lg' });
}

/* ============================================================
   REPORTS
   ============================================================ */
function renderReports() {
  return `
  <div class="page-head"><div><h1>Reports</h1><p>Generate and export detailed financial reports.</p></div></div>
  <div class="grid grid-3">
    ${reportCardHtml('fa-solid fa-calendar-days', 'mint', 'Monthly Report', 'Income, expenses, and category breakdown for the selected month.', 'monthly')}
    ${reportCardHtml('fa-solid fa-wallet', 'blue', 'Wallet Report', 'Balances and status across all your wallets.', 'wallet')}
    ${reportCardHtml('fa-solid fa-arrow-up', 'coral', 'Expense Report', 'Where your money went, broken down by category.', 'expense')}
    ${reportCardHtml('fa-solid fa-arrow-down', 'mint', 'Income Report', 'All income sources for a given date range.', 'income')}
    ${reportCardHtml('fa-solid fa-sliders', 'amber', 'Budget Report', 'Allocated vs spent across all active budgets.', 'budget')}
    ${reportCardHtml('fa-solid fa-piggy-bank', 'violet', 'Savings Report', 'Progress across all your savings goals.', 'savings')}
  </div>`;
}
function reportCardHtml(icon, accent, title, desc, key) {
  return `
  <div class="card">
    <div class="stat-icon accent-${accent}" style="background:var(--${accent}-dim);color:var(--${accent});margin-bottom:14px;"><i class="${icon}"></i></div>
    <h3 style="font-family:var(--font-display);font-size:15px;margin:0 0 6px;">${title}</h3>
    <p style="font-size:12.5px;color:var(--text-mid);margin:0 0 16px;">${desc}</p>
    <button class="btn btn-secondary btn-block" data-action="generate-report" data-report="${key}"><i class="fa-solid fa-file-lines"></i> Generate</button>
  </div>`;
}

function openReportModal(key) {
  let report, extraForm = '';
  const thisMonth = monthKey(todayISO());
  if (key === 'monthly') report = Reports.generateMonthlyReport(thisMonth);
  else if (key === 'wallet') report = Reports.generateWalletReport();
  else if (key === 'expense') report = Reports.generateExpenseReport(null, null);
  else if (key === 'income') report = Reports.generateIncomeReport(null, null);
  else if (key === 'budget') report = Reports.generateBudgetReport();
  else if (key === 'savings') report = Reports.generateSavingsReport();

  const body = `<div id="reportPreviewBody">${reportPreviewHtml(report)}</div>`;
  const footer = `
    <button class="btn btn-ghost" data-action="close-modal">Close</button>
    <button class="btn btn-secondary" data-action="report-print" data-report="${key}"><i class="fa-solid fa-print"></i> Print / PDF</button>
    <button class="btn btn-secondary" data-action="report-json" data-report="${key}"><i class="fa-solid fa-file-code"></i> JSON</button>
    <button class="btn btn-primary" data-action="report-excel" data-report="${key}"><i class="fa-solid fa-file-excel"></i> Excel</button>
  `;
  openModal(report.title, body, footer, { size: 'modal-lg' });
  window.__lastReport = { key, report };
}

function reportPreviewHtml(report) {
  if (report.transactions) {
    return `<div class="grid grid-3" style="margin-bottom:16px;">
      <div class="stat-card accent-mint"><div class="stat-label">Income</div><div class="stat-value mono">${formatMoney(report.income)}</div></div>
      <div class="stat-card accent-coral"><div class="stat-label">Expense</div><div class="stat-value mono">${formatMoney(report.expense)}</div></div>
      <div class="stat-card accent-blue"><div class="stat-label">Net</div><div class="stat-value mono">${formatMoney(report.net)}</div></div>
    </div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Title</th><th>Category</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${report.transactions.slice(0,50).map(t => `<tr><td>${formatDate(t.date)}</td><td>${escapeHtml(t.title)}</td><td>${t.category||'—'}</td><td style="text-align:right;" class="mono">${formatMoney(t.amount)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="table-empty">No records.</div></td></tr>'}
    </tbody></table></div>`;
  }
  if (report.wallets) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Wallet</th><th>Type</th><th>Status</th><th style="text-align:right;">Balance</th></tr></thead><tbody>
      ${report.wallets.map(w => `<tr><td>${walletChip(w)}</td><td>${w.type}</td><td>${w.archived?'Archived':'Active'}</td><td style="text-align:right;" class="mono">${formatMoney(w.balance)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  if (report.categories) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Category</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${report.categories.map(c => `<tr><td>${c.category}</td><td style="text-align:right;" class="mono">${formatMoney(c.amount)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="table-empty">No data.</div></td></tr>'}
    </tbody></table></div>`;
  }
  if (report.sources) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Source</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${report.sources.map(c => `<tr><td>${c.category}</td><td style="text-align:right;" class="mono">${formatMoney(c.amount)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="table-empty">No data.</div></td></tr>'}
    </tbody></table></div>`;
  }
  if (report.budgets) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Budget</th><th style="text-align:right;">Allocated</th><th style="text-align:right;">Spent</th><th style="text-align:right;">Remaining</th></tr></thead><tbody>
      ${report.budgets.map(b => `<tr><td>${b.budget.name}</td><td style="text-align:right;" class="mono">${formatMoney(b.allocated)}</td><td style="text-align:right;" class="mono">${formatMoney(b.spent)}</td><td style="text-align:right;" class="mono">${formatMoney(b.remaining)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="table-empty">No budgets.</div></td></tr>'}
    </tbody></table></div>`;
  }
  if (report.goals) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Goal</th><th style="text-align:right;">Target</th><th style="text-align:right;">Current</th><th>Progress</th></tr></thead><tbody>
      ${report.goals.map(g => `<tr><td>${g.goal.name}</td><td style="text-align:right;" class="mono">${formatMoney(g.goal.target)}</td><td style="text-align:right;" class="mono">${formatMoney(g.goal.current)}</td><td>${g.progress}%</td></tr>`).join('') || '<tr><td colspan="4"><div class="table-empty">No goals.</div></td></tr>'}
    </tbody></table></div>`;
  }
  return '';
}

/* ============================================================
   ANALYTICS
   ============================================================ */
function renderAnalytics() {
  return `
  <div class="page-head"><div><h1>Analytics</h1><p>Deep dive into your spending and saving patterns.</p></div></div>
  <div class="chart-card" style="margin-bottom:18px;">
    <div class="card-title-row"><h3>Net Worth Over Time</h3><span class="card-sub">Reconstructed from your full transaction history</span></div>
    <div class="chart-box chart-box-lg"><canvas id="anChartNetWorth"></canvas></div>
  </div>
  <div class="dash-2col" style="margin-bottom:18px;">
    <div class="chart-card"><div class="card-title-row"><h3>Income vs Expense</h3><span class="card-sub">Last 6 months</span></div><div class="chart-box"><canvas id="anChartIncomeExpense"></canvas></div></div>
    <div class="chart-card"><div class="card-title-row"><h3>Cash Flow (Cumulative)</h3></div><div class="chart-box"><canvas id="anChartCashFlow"></canvas></div></div>
  </div>
  <div class="dash-2col" style="margin-bottom:18px;">
    <div class="chart-card"><div class="card-title-row"><h3>Expense Categories</h3></div><div class="chart-box chart-box-sm"><canvas id="anChartExpenseCat"></canvas></div><div class="chart-legend" id="anExpenseCatLegend"></div></div>
    <div class="chart-card"><div class="card-title-row"><h3>Income Sources</h3></div><div class="chart-box chart-box-sm"><canvas id="anChartIncomeSrc"></canvas></div><div class="chart-legend" id="anIncomeSrcLegend"></div></div>
  </div>
  <div class="dash-2col">
    <div class="chart-card"><div class="card-title-row"><h3>Monthly Spending Trend</h3></div><div class="chart-box"><canvas id="anChartSpendTrend"></canvas></div></div>
    <div class="chart-card"><div class="card-title-row"><h3>Savings Growth</h3></div><div class="chart-box"><canvas id="anChartSavingsGrowth"></canvas></div></div>
  </div>
  <div class="card" style="margin-top:18px;">
    <div class="card-title-row"><h3>Budget Utilization</h3></div>
    <div class="chart-box chart-box-lg"><canvas id="anChartBudgetUtil"></canvas></div>
  </div>
  <div class="chart-card" style="margin-top:18px;">
    <div class="card-title-row"><h3>Wallet Distribution</h3></div>
    <div class="chart-box chart-box-sm"><canvas id="anChartWalletDist"></canvas></div><div class="chart-legend" id="anWalletDistLegend"></div>
  </div>`;
}
function renderAnalyticsCharts() {
  const nwt = Analytics.netWorthTimeline(60);
  Charts.renderArea('anChartNetWorth', nwt.map(p => p.date === 'Start' ? 'Start' : formatDate(p.date)), { label: 'Net Worth', data: nwt.map(p => p.netWorth) }, getCss('--gold'));

  const ie = Analytics.incomeVsExpenseByMonth(6);
  Charts.renderBar('anChartIncomeExpense', ie.map(m => m.label), [
    { label: 'Income', data: ie.map(m => m.income), backgroundColor: getCss('--mint') },
    { label: 'Expense', data: ie.map(m => m.expense), backgroundColor: getCss('--coral') },
  ]);
  const cf = Analytics.cashFlow(6);
  Charts.renderArea('anChartCashFlow', cf.map(m => m.label), { label: 'Cumulative', data: cf.map(m => m.cumulative) }, getCss('--gold'));

  const exp = Analytics.expenseByCategory();
  const topExp = exp.slice(0, 7);
  Charts.renderDonut('anChartExpenseCat', topExp.map(c => c.category), topExp.map(c => c.amount), topExp.map((c,i)=>Charts.PALETTE[i%Charts.PALETTE.length]));
  document.getElementById('anExpenseCatLegend').innerHTML = topExp.map((c,i)=>legendItem(Charts.PALETTE[i%Charts.PALETTE.length], c.category, formatMoney(c.amount))).join('') || '<span class="text-low" style="font-size:12px;">No expense data.</span>';

  const inc = Analytics.incomeBySource();
  Charts.renderDonut('anChartIncomeSrc', inc.map(c=>c.category), inc.map(c=>c.amount), inc.map((c,i)=>Charts.PALETTE[i%Charts.PALETTE.length]));
  document.getElementById('anIncomeSrcLegend').innerHTML = inc.map((c,i)=>legendItem(Charts.PALETTE[i%Charts.PALETTE.length], c.category, formatMoney(c.amount))).join('') || '<span class="text-low" style="font-size:12px;">No income data.</span>';

  const trend = Analytics.monthlySpendingTrend(6);
  Charts.renderBar('anChartSpendTrend', trend.map(t=>t.label), [{ label: 'Spending', data: trend.map(t=>t.amount), backgroundColor: getCss('--blue') }]);

  const sg = Analytics.savingsGrowth(6);
  Charts.renderArea('anChartSavingsGrowth', sg.map(s=>s.label), { label: 'Savings Contributions', data: sg.map(s=>s.amount) }, getCss('--mint'));

  const util = Analytics.budgetUtilization();
  Charts.renderBar('anChartBudgetUtil', util.map(u=>u.name), [
    { label: 'Allocated', data: util.map(u=>u.allocated), backgroundColor: getCss('--border-strong') },
    { label: 'Spent', data: util.map(u=>u.spent), backgroundColor: util.map(u=>u.over?getCss('--coral'):getCss('--mint')) },
  ]);

  const dist = Analytics.walletDistribution();
  Charts.renderDonut('anChartWalletDist', dist.map(w=>w.name), dist.map(w=>Math.max(0,w.balance)), dist.map(w=>w.color));
  document.getElementById('anWalletDistLegend').innerHTML = dist.map(w=>legendItem(w.color, w.name, formatMoney(w.balance) + ` (${w.pct}%)`)).join('');
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const s = state.settings;
  return `
  <div class="page-head"><div><h1>Settings</h1><p>Configure your preferences, categories, and data.</p></div></div>
  <div class="tabs" id="settingsTabs">
    <div class="tab-item active" data-tab="general">General</div>
    <div class="tab-item" data-tab="categories">Categories</div>
    <div class="tab-item" data-tab="walletTypes">Wallet Types</div>
    <div class="tab-item" data-tab="automation">Automation Rules</div>
    <div class="tab-item" data-tab="data">Backup &amp; Data</div>
  </div>
  <div id="settingsPanel">${settingsGeneralPanel(s)}</div>`;
}

function settingsGeneralPanel(s) {
  return `
  <div class="card" style="max-width:640px;">
    <div class="form-group"><label class="form-label">Owner Name</label><input class="form-input" id="setOwnerName" value="${escapeHtml(s.ownerName)}"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Currency</label>
        <select class="form-select" id="setCurrency">
          ${['PHP','USD','EUR','GBP','JPY','SGD','AUD','CAD'].map(c => `<option value="${c}" ${s.currency===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Date Format</label>
        <select class="form-select" id="setDateFormat">
          ${['MMM D, YYYY','MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD'].map(f => `<option value="${f}" ${s.dateFormat===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-toggle-row">
      <div><span class="form-label" style="margin:0;">Theme</span><div class="form-hint">Switch between dark and light mode</div></div>
      <label class="switch"><input type="checkbox" id="setThemeToggle" ${s.theme==='light'?'checked':''}><span class="slider"></span></label>
    </div>
    <div class="form-toggle-row">
      <div><span class="form-label" style="margin:0;">Zero-Based Budgeting</span><div class="form-hint">Require every peso of income to be allocated</div></div>
      <label class="switch"><input type="checkbox" id="setBudgetMode" ${s.budgetMode==='zero-based'?'checked':''}><span class="slider"></span></label>
    </div>
    <button class="btn btn-primary" id="saveGeneralSettingsBtn" style="margin-top:10px;"><i class="fa-solid fa-check"></i> Save Settings</button>
  </div>`;
}
function settingsCategoriesPanel() {
  return `
  <div class="card" style="max-width:720px;">
    <div class="section-toolbar"><h3 style="font-family:var(--font-display);font-size:14px;margin:0;">Transaction Categories</h3><div class="spacer"></div>
      <button class="btn btn-secondary btn-sm" id="addCategoryBtn"><i class="fa-solid fa-plus"></i> Add Category</button></div>
    <div class="tag-input-list">
      ${state.categories.map(c => `<span class="tag-chip"><i class="${c.icon}" style="color:${c.color}"></i>${escapeHtml(c.name)}<i class="fa-solid fa-xmark" data-action="delete-category" data-name="${escapeHtml(c.name)}"></i></span>`).join('')}
    </div>
  </div>`;
}
function settingsWalletTypesPanel() {
  return `
  <div class="card" style="max-width:640px;">
    <div class="section-toolbar"><h3 style="font-family:var(--font-display);font-size:14px;margin:0;">Wallet Types</h3><div class="spacer"></div>
      <button class="btn btn-secondary btn-sm" id="addWalletTypeBtn"><i class="fa-solid fa-plus"></i> Add Type</button></div>
    <div class="tag-input-list">${Wallets.walletTypes().map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>
  </div>`;
}
function settingsAutomationPanel() {
  const rules = Txns.getRules();
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <div class="card" style="max-width:640px;">
    <div class="card-title-row"><h3 style="font-size:14px;">Automation Rules</h3></div>
    <p class="form-hint" style="margin-bottom:14px;">When adding a transaction under a matching category, the wallet below is auto-suggested.</p>
    ${rules.length ? rules.map(r => `
      <div class="form-row" style="grid-template-columns:1fr 1fr auto;align-items:center;margin-bottom:10px;">
        <span class="badge badge-neutral">${escapeHtml(r.category)}</span>
        <select class="form-select rule-wallet-select" data-rule-id="${r.id}">${wallets.map(w=>`<option value="${w.id}" ${r.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}</select>
        <button class="icon-btn btn-icon-only" data-action="delete-rule" data-id="${r.id}"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
      </div>`).join('') : emptyState('fa-solid fa-wand-magic-sparkles', 'No rules yet', 'Rules are created automatically via the Paycheck Allocator, or add one below.')}
    <div class="form-row" style="margin-top:16px;">
      <select class="form-select" id="newRuleCategory">${state.categories.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select>
      <select class="form-select" id="newRuleWallet">${wallets.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}</select>
    </div>
    <button class="btn btn-secondary" id="addRuleBtn" style="margin-top:10px;"><i class="fa-solid fa-plus"></i> Add Rule</button>
  </div>`;
}
function settingsDataPanel() {
  return `
  <div class="grid grid-2" style="max-width:900px;">
    <div class="card">
      <h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 6px;">Export Data</h3>
      <p class="form-hint" style="margin-bottom:14px;">Download a full backup or specific exports.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-secondary" id="exportBackupJsonBtn"><i class="fa-solid fa-file-code"></i> Export Full Backup (JSON)</button>
        <button class="btn btn-secondary" id="exportBackupXlsxBtn"><i class="fa-solid fa-file-excel"></i> Export Full Backup (Excel)</button>
        <button class="btn btn-secondary" id="exportTxCsvBtn"><i class="fa-solid fa-file-csv"></i> Export Transactions (CSV)</button>
      </div>
    </div>
    <div class="card">
      <h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 6px;">Import Data</h3>
      <p class="form-hint" style="margin-bottom:14px;">Restore from a JSON backup, or import transactions from CSV/Excel.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label class="btn btn-secondary" style="cursor:pointer;"><i class="fa-solid fa-upload"></i> Import Full Backup (JSON)<input type="file" id="importJsonInput" accept=".json" hidden></label>
        <label class="btn btn-secondary" style="cursor:pointer;"><i class="fa-solid fa-upload"></i> Import Backup (Excel)<input type="file" id="importXlsxInput" accept=".xlsx,.xls" hidden></label>
      </div>
    </div>
    <div class="card" style="border-color:rgba(255,111,111,0.3);">
      <h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 6px;color:var(--coral);">Danger Zone</h3>
      <p class="form-hint" style="margin-bottom:14px;">Resetting will erase all current data on this device.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-danger" id="resetWithSampleBtn"><i class="fa-solid fa-rotate-left"></i> Reset with Sample Data</button>
        <button class="btn btn-danger" id="resetEmptyBtn"><i class="fa-solid fa-trash"></i> Reset to Empty</button>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   ACTION MENU (lightweight floating dropdown)
   ============================================================ */
function openActionMenu(anchorEl, items) {
  closeActionMenu();
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu open';
  menu.id = 'floatingActionMenu';
  menu.style.position = 'fixed';
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = Math.max(8, rect.right - 190) + 'px';
  menu.innerHTML = items.map((it, i) => it.divider ? `<div class="dd-divider"></div>` : `<div class="dd-item ${it.danger ? 'danger' : ''}" data-idx="${i}"><i class="${it.icon}"></i>${it.label}</div>`).join('');
  document.body.appendChild(menu);
  menu.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('click', () => { items[Number(el.dataset.idx)].onClick(); closeActionMenu(); });
  });
  setTimeout(() => document.addEventListener('click', outsideMenuHandler), 0);
}
function outsideMenuHandler(e) {
  const menu = document.getElementById('floatingActionMenu');
  if (menu && !menu.contains(e.target)) closeActionMenu();
}
function closeActionMenu() {
  const menu = document.getElementById('floatingActionMenu');
  if (menu) menu.remove();
  document.removeEventListener('click', outsideMenuHandler);
}

/* ============================================================
   GLOBAL ACTION DISPATCH (event delegation)
   ============================================================ */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  handleAction(action, id, el);
});

function handleAction(action, id, el) {
  switch (action) {
    case 'close-modal': closeModal(); break;
    case 'quick-add': openTransactionForm(null, 'expense'); break;
    case 'quick-income': openTransactionForm(null, 'income'); break;
    case 'quick-expense': openTransactionForm(null, 'expense'); break;
    case 'quick-transfer': openTransferForm(); break;
    case 'quick-transfer-from': closeModal(); setTimeout(() => openTransferForm(id), 80); break;
    case 'quick-paycheck': closeModal(); navigate('paycheck'); break;
    case 'goto-transactions': navigate('transactions'); break;
    case 'goto-budgets': navigate('budgets'); break;
    case 'goto-goals': navigate('goals'); break;
    case 'goto-bills': navigate('bills'); break;
    case 'open-export': openExportMenu(); break;

    // Wallets
    case 'add-wallet': openWalletForm(); break;
    case 'open-wallet': openWalletDetail(id); break;
    case 'edit-wallet': { const w = Wallets.getWallet(id); closeModal(); setTimeout(()=>openWalletForm(w), 80); break; }
    case 'wallet-history': openWalletFullHistory(id); break;
    case 'toggle-archived': navigate('wallets', { showArchived: !currentSubState.showArchived }); break;
    case 'save-wallet': saveWalletFromForm(id || null); break;
    case 'wallet-menu': {
      const w = Wallets.getWallet(id);
      openActionMenu(el, [
        { icon: 'fa-solid fa-eye', label: 'View Details', onClick: () => openWalletDetail(id) },
        { icon: 'fa-solid fa-pen', label: 'Edit', onClick: () => openWalletForm(w) },
        { icon: 'fa-solid fa-copy', label: 'Duplicate', onClick: () => { Wallets.duplicateWallet(id); toast('Wallet duplicated.', 'success'); rerender(); } },
        { icon: 'fa-solid fa-code-merge', label: 'Merge Into…', onClick: () => openMergeWalletModal(id) },
        { icon: w.archived ? 'fa-solid fa-box-open' : 'fa-solid fa-box-archive', label: w.archived ? 'Unarchive' : 'Archive', onClick: () => { Wallets.archiveWallet(id, !w.archived); toast(w.archived ? 'Wallet unarchived.' : 'Wallet archived.', 'success'); rerender(); } },
        { divider: true },
        { icon: 'fa-solid fa-trash', label: 'Delete', danger: true, onClick: () => confirmAction('Delete Wallet?', `This will permanently delete "${w.name}" and its transactions.`, () => { Wallets.deleteWallet(id); toast('Wallet deleted.', 'success'); rerender(); }) },
      ]);
      break;
    }

    // Transactions
    case 'export-tx-csv': Reports.exportTransactionsCSV(Txns.getTransactions(currentSubState.filters || {})); toast('CSV exported.', 'success'); break;
    case 'export-tx-xlsx': Reports.exportTransactionsExcel(Txns.getTransactions(currentSubState.filters || {})); toast('Excel file exported.', 'success'); break;
    case 'edit-tx': { const t = Txns.getTransaction(id); openTransactionForm(t, t.type); break; }
    case 'delete-tx': confirmAction('Delete Transaction?', 'This action cannot be undone and will reverse its effect on wallet balances.', () => { Txns.deleteTransaction(id); toast('Transaction deleted.', 'success'); rerender(); }); break;
    case 'save-tx': saveTxFromForm(id || null); break;
    case 'clear-tx-filters': navigate('transactions', { filters: {} }); break;
    case 'save-transfer': saveTransferFromForm(); break;

    // Budgets
    case 'toggle-budget-mode': { const mode = state.settings.budgetMode === 'zero-based' ? 'traditional' : 'zero-based'; Settings.updateSettings({ budgetMode: mode }); rerender(); break; }
    case 'add-budget': openBudgetForm(); break;
    case 'save-budget': saveBudgetFromForm(id || null); break;
    case 'budget-menu': {
      const b = Budgets.getBudget(id);
      openActionMenu(el, [
        { icon: 'fa-solid fa-pen', label: 'Edit', onClick: () => openBudgetForm(b) },
        { divider: true },
        { icon: 'fa-solid fa-trash', label: 'Delete', danger: true, onClick: () => confirmAction('Delete Budget?', `Delete "${b.name}"?`, () => { Budgets.deleteBudget(id); toast('Budget deleted.', 'success'); rerender(); }) },
      ]);
      break;
    }

    // Goals
    case 'add-goal': openGoalForm(); break;
    case 'save-goal': saveGoalFromForm(id || null); break;
    case 'contribute-goal': openContributeForm(id); break;
    case 'save-contribution': saveContributionFromForm(id); break;
    case 'goal-menu': {
      const g = Goals.getGoal(id);
      openActionMenu(el, [
        { icon: 'fa-solid fa-pen', label: 'Edit', onClick: () => openGoalForm(g) },
        { icon: 'fa-solid fa-plus', label: 'Add Contribution', onClick: () => openContributeForm(id) },
        { divider: true },
        { icon: 'fa-solid fa-trash', label: 'Delete', danger: true, onClick: () => confirmAction('Delete Goal?', `Delete "${g.name}"?`, () => { Goals.deleteGoal(id); toast('Goal deleted.', 'success'); rerender(); }) },
      ]);
      break;
    }

    // Bills
    case 'add-bill': openBillForm(); break;
    case 'edit-bill': openBillForm(Bills.getBill(id)); break;
    case 'save-bill': saveBillFromForm(id || null); break;
    case 'delete-bill': confirmAction('Delete Bill?', 'This will remove the bill permanently.', () => { Bills.deleteBill(id); toast('Bill deleted.', 'success'); rerender(); }); break;
    case 'bill-pay-menu': {
      const b = Bills.getBill(id);
      const remaining = Bills.billRemaining(b);
      const isLate = Bills.effectiveStatus(b) === 'Late';
      const linkedDebt = b.linkedDebtId ? Debts.getDebt(b.linkedDebtId) : null;
      const linkNote = linkedDebt ? ` This will also reduce "${linkedDebt.name}"'s balance by the same amount.` : '';
      openActionMenu(el, [
        { icon: 'fa-solid fa-check', label: `Pay in Full (${formatMoney(remaining)})`, onClick: () => confirmAction('Mark as Paid?', `This records a ${formatMoney(remaining)} expense and advances the due date.${linkNote}`, () => { try { Bills.markBillPaid(id); toast('Bill marked as paid.', 'success'); rerender(); } catch (e) { toast(e.message, 'error'); } }, false) },
        { icon: 'fa-solid fa-coins', label: 'Add Partial Payment…', onClick: () => openPartialPaymentForm(id) },
        ...(isLate && b.recurrence !== 'One-time' ? [{ icon: 'fa-solid fa-arrow-turn-down', label: `Roll Over to Next Cycle (+${formatMoney(remaining)})`, onClick: () => confirmAction('Roll Over Unpaid Balance?', `This advances "${b.name}" to its next due date and adds the unpaid ${formatMoney(remaining)} onto that cycle's total — nothing is forgiven, it just moves forward.`, () => { Bills.rollOverBill(id); toast('Rolled over to next cycle.', 'success'); rerender(); }, false) }] : []),
      ]);
      break;
    }
    case 'undo-bill-payment': {
      const b = Bills.getBill(id);
      confirmAction('Undo Last Payment?', 'This removes the recorded transaction, restores the wallet balance, and reverts the due date/status.', () => { Bills.undoBillPayment(id); toast('Payment undone.', 'success'); rerender(); });
      break;
    }
    case 'bill-history': openBillHistoryModal(id); break;

    // Reports
    case 'generate-report': openReportModal(el.dataset.report); break;
    case 'report-print': Reports.printableHTML(window.__lastReport.report); break;
    case 'report-json': Reports.exportReportJSON(window.__lastReport.report); toast('Report exported as JSON.', 'success'); break;
    case 'report-excel': exportReportExcel(window.__lastReport.report); toast('Report exported as Excel.', 'success'); break;

    // Settings misc
    case 'delete-category': confirmAction('Remove Category?', `Remove "${el.dataset.name}" from your category list?`, () => { Txns.deleteCategory(el.dataset.name); toast('Category removed.', 'success'); rerender(); }); break;
    case 'delete-rule': Txns.deleteRule(id); toast('Rule removed.', 'success'); rerender(); break;

    // Debts
    case 'add-debt': openDebtForm(); break;
    case 'save-debt': saveDebtFromForm(id || null); break;
    case 'pay-debt-menu': openPayDebtForm(id); break;
    case 'adjust-debt-balance': openAdjustDebtBalanceForm(id); break;
    case 'debt-menu': {
      const d = Debts.getDebt(id);
      openActionMenu(el, [
        ...(d.balance > 0 ? [{ icon: 'fa-solid fa-money-bill-wave', label: 'Make a Payment', onClick: () => openPayDebtForm(id) }] : []),
        { icon: 'fa-solid fa-pen', label: 'Edit', onClick: () => openDebtForm(d) },
        { icon: 'fa-solid fa-sliders', label: 'Adjust Balance', onClick: () => openAdjustDebtBalanceForm(id) },
        { icon: 'fa-solid fa-clock-rotate-left', label: 'Payment & Adjustment History', onClick: () => openDebtHistoryModal(id) },
        ...(d.lastPayment ? [{ icon: 'fa-solid fa-rotate-left', label: 'Undo Last Payment', onClick: () => confirmAction('Undo Last Payment?', 'This removes the recorded transaction and restores the wallet balance and prior debt balance.', () => { Debts.undoDebtPayment(id); toast('Payment undone.', 'success'); rerender(); }) }] : []),
        { divider: true },
        { icon: 'fa-solid fa-trash', label: 'Delete', danger: true, onClick: () => confirmAction('Delete Debt?', `Delete "${d.name}"? This doesn't delete its past payment transactions, and any bills linked to it will become standalone again.`, () => { Debts.deleteDebt(id); toast('Debt deleted.', 'success'); rerender(); }) },
      ]);
      break;
    }

    default: break;
  }
}

function exportReportExcel(report) {
  const rows = report.transactions || report.wallets || report.categories || report.sources || report.budgets?.map(b=>({Name:b.budget.name,Allocated:b.allocated,Spent:b.spent,Remaining:b.remaining})) || report.goals?.map(g=>({Name:g.goal.name,Target:g.goal.target,Current:g.goal.current,Progress:g.progress})) || [];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${report.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.xlsx`);
}

function openExportMenu() {
  openModal('Export Data', `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button class="btn btn-secondary btn-block" id="exportModalJson"><i class="fa-solid fa-file-code"></i> Full Backup (JSON)</button>
      <button class="btn btn-secondary btn-block" id="exportModalXlsx"><i class="fa-solid fa-file-excel"></i> Full Backup (Excel)</button>
      <button class="btn btn-secondary btn-block" id="exportModalCsv"><i class="fa-solid fa-file-csv"></i> Transactions (CSV)</button>
    </div>`, `<button class="btn btn-ghost" data-action="close-modal">Close</button>`);
  document.getElementById('exportModalJson').addEventListener('click', () => { Settings.exportBackupJSON(); toast('Backup exported.', 'success'); });
  document.getElementById('exportModalXlsx').addEventListener('click', () => { Reports.exportFullBackupExcel(); toast('Backup exported.', 'success'); });
  document.getElementById('exportModalCsv').addEventListener('click', () => { Reports.exportTransactionsCSV(Txns.getTransactions()); toast('CSV exported.', 'success'); });
}

function openMergeWalletModal(sourceId) {
  const source = Wallets.getWallet(sourceId);
  const targets = Wallets.getWallets({ includeArchived: false }).filter(w => w.id !== sourceId);
  if (!targets.length) { toast('No other wallets to merge into.', 'error'); return; }
  openModal(`Merge "${source.name}" Into…`, `
    <p style="font-size:13px;color:var(--text-mid);margin-bottom:14px;">All transactions and balance from "${escapeHtml(source.name)}" will move into the selected wallet. This cannot be undone.</p>
    <select class="form-select" id="mergeTargetSelect">${targets.map(w => `<option value="${w.id}">${w.name} (${formatMoney(w.balance)})</option>`).join('')}</select>
  `, `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-danger" id="confirmMergeBtn"><i class="fa-solid fa-code-merge"></i> Merge Wallets</button>
  `);
  document.getElementById('confirmMergeBtn').addEventListener('click', () => {
    const targetId = document.getElementById('mergeTargetSelect').value;
    Wallets.mergeWallets(sourceId, targetId);
    toast('Wallets merged.', 'success');
    closeModal(); rerender();
  });
}

function openWalletFullHistory(id) {
  const w = Wallets.getWallet(id);
  const txns = Txns.getTransactions({ walletId: id });
  openModal(`${w.name} — Full History`, `
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Title</th><th>Type</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${txns.length ? txns.map(t => { const {sign,cls} = amountSign(t); return `<tr><td>${formatDate(t.date)}</td><td>${escapeHtml(t.title)}</td><td><span class="badge ${badgeClassForType(t.type)}">${cap(t.type)}</span></td><td style="text-align:right;" class="mono ${cls}">${sign}${formatMoney(Math.abs(t.amount))}</td></tr>`; }).join('') : `<tr><td colspan="4"><div class="table-empty">No history.</div></td></tr>`}
    </tbody></table></div>
  `, `<button class="btn btn-ghost" data-action="close-modal">Close</button>`, { size: 'modal-lg' });
}

/* ============================================================
   PER-ROUTE WIRING (inputs, tabs, filters, charts)
   ============================================================ */
function wireRouteEvents(route) {
  if (route === 'dashboard') { renderDashboardCharts(); }
  else if (route === 'analytics') { renderAnalyticsCharts(); }
  else if (route === 'transactions') { wireTransactionFilters(); }
  else if (route === 'wallets') { wireWalletDragSort(); }
  else if (route === 'paycheck') { initPaycheckWizard(); }
  else if (route === 'settings') { wireSettingsTabs(); }
}

function wireTransactionFilters() {
  const apply = () => {
    const query = document.getElementById('txSearchInput').value;
    const type = document.getElementById('txTypeFilter').value;
    const category = document.getElementById('txCategoryFilter').value;
    const walletId = document.getElementById('txWalletFilter').value;
    const filters = {};
    if (query) filters.query = query;
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (walletId) filters.walletId = walletId;
    navigate('transactions', { filters });
  };
  document.getElementById('txSearchInput').addEventListener('input', Utils.debounce(apply, 300));
  document.getElementById('txTypeFilter').addEventListener('change', apply);
  document.getElementById('txCategoryFilter').addEventListener('change', apply);
  document.getElementById('txWalletFilter').addEventListener('change', apply);
}

function wireSettingsTabs() {
  document.querySelectorAll('#settingsTabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#settingsTabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('settingsPanel');
      const key = tab.dataset.tab;
      if (key === 'general') panel.innerHTML = settingsGeneralPanel(state.settings);
      else if (key === 'categories') panel.innerHTML = settingsCategoriesPanel();
      else if (key === 'walletTypes') panel.innerHTML = settingsWalletTypesPanel();
      else if (key === 'automation') panel.innerHTML = settingsAutomationPanel();
      else if (key === 'data') panel.innerHTML = settingsDataPanel();
      wireSettingsPanel(key);
    });
  });
  wireSettingsPanel('general');
}

function wireSettingsPanel(key) {
  if (key === 'general') {
    document.getElementById('saveGeneralSettingsBtn').addEventListener('click', () => {
      const patch = {
        ownerName: document.getElementById('setOwnerName').value,
        currency: document.getElementById('setCurrency').value,
        dateFormat: document.getElementById('setDateFormat').value,
        theme: document.getElementById('setThemeToggle').checked ? 'light' : 'dark',
        budgetMode: document.getElementById('setBudgetMode').checked ? 'zero-based' : 'traditional',
      };
      Settings.updateSettings(patch);
      toast('Settings saved.', 'success');
      updateAvatarDisplay();
      updateTopbarNetWorth();
    });
  } else if (key === 'categories') {
    document.getElementById('addCategoryBtn').addEventListener('click', () => openAddCategoryModal());
  } else if (key === 'walletTypes') {
    document.getElementById('addWalletTypeBtn').addEventListener('click', () => openAddWalletTypeModal());
  } else if (key === 'automation') {
    document.querySelectorAll('.rule-wallet-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const rule = state.rules.find(r => r.id === sel.dataset.ruleId);
        if (rule) { rule.walletId = sel.value; persist(); toast('Rule updated.', 'success'); }
      });
    });
    document.getElementById('addRuleBtn').addEventListener('click', () => {
      const category = document.getElementById('newRuleCategory').value;
      const walletId = document.getElementById('newRuleWallet').value;
      Txns.setRule(category, walletId);
      toast('Rule added.', 'success');
      rerender();
    });
  } else if (key === 'data') {
    document.getElementById('exportBackupJsonBtn').addEventListener('click', () => { Settings.exportBackupJSON(); toast('Backup exported.', 'success'); });
    document.getElementById('exportBackupXlsxBtn').addEventListener('click', () => { Reports.exportFullBackupExcel(); toast('Backup exported.', 'success'); });
    document.getElementById('exportTxCsvBtn').addEventListener('click', () => { Reports.exportTransactionsCSV(Txns.getTransactions()); toast('CSV exported.', 'success'); });
    document.getElementById('importJsonInput').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { const text = await file.text(); Settings.importBackupJSON(text); state = getState(); toast('Backup restored successfully.', 'success'); navigate('dashboard'); }
      catch (err) { toast('Failed to import backup. Invalid file.', 'error'); }
    });
    document.getElementById('importXlsxInput').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const sheets = await Reports.importExcelFile(file);
        let imported = 0;
        if (sheets.Transactions) { sheets.Transactions.forEach(row => { try { Txns.createTransaction(mapImportedRow(row)); imported++; } catch(_){} }); }
        toast(`Imported ${imported} transaction(s) from Excel.`, 'success');
        rerender();
      } catch (err) { toast('Failed to import Excel file.', 'error'); }
    });
    document.getElementById('resetWithSampleBtn').addEventListener('click', () => confirmAction('Reset with Sample Data?', 'This replaces all current data with fresh sample data.', () => { Settings.resetApp(true); state = getState(); toast('Application reset with sample data.', 'success'); navigate('dashboard'); }));
    document.getElementById('resetEmptyBtn').addEventListener('click', () => confirmAction('Reset to Empty?', 'This permanently erases all your data.', () => { Settings.resetApp(false); state = getState(); toast('Application reset.', 'success'); navigate('dashboard'); }));
  }
}

function mapImportedRow(row) {
  const wallet = Wallets.getWallets().find(w => w.name === row.Wallet) || Wallets.getWallets()[0];
  return {
    type: (row.Type || 'expense').toLowerCase(), title: row.Title || row.Category || 'Imported',
    amount: Number(row.Amount) || 0, walletId: wallet?.id, category: row.Category || 'Others',
    merchant: row.Merchant || '', paymentMethod: row['Payment Method'] || 'Cash',
    status: row.Status || 'Cleared', date: row.Date || todayISO(), notes: row.Notes || '',
  };
}

function openAddCategoryModal() {
  openModal('Add Category', `
    <form id="addCatForm">
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name" required></div>
      <div class="form-group"><label class="form-label">Icon (Font Awesome class)</label><input class="form-input" name="icon" placeholder="fa-solid fa-tag" value="fa-solid fa-tag"></div>
      <div class="form-group"><label class="form-label">Color</label>
        <div class="color-swatch-row">${WALLET_COLORS.map((c,i) => `<div class="color-swatch ${i===0?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}</div>
        <input type="hidden" name="color" value="${WALLET_COLORS[0]}">
      </div>
    </form>
  `, `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" id="saveCatBtn"><i class="fa-solid fa-check"></i> Add</button>`);
  document.querySelectorAll('#addCatForm .color-swatch').forEach(sw => sw.addEventListener('click', () => {
    document.querySelectorAll('#addCatForm .color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected'); document.querySelector('#addCatForm [name="color"]').value = sw.dataset.color;
  }));
  document.getElementById('saveCatBtn').addEventListener('click', () => {
    const data = Object.fromEntries(new FormData(document.getElementById('addCatForm')).entries());
    if (!data.name) { toast('Enter a category name.', 'error'); return; }
    Txns.addCategory({ name: data.name, icon: data.icon || 'fa-solid fa-tag', color: data.color, kind: 'both' });
    toast('Category added.', 'success'); closeModal(); rerender();
  });
}
function openAddWalletTypeModal() {
  openModal('Add Wallet Type', `<form id="addTypeForm"><div class="form-group"><label class="form-label">Type Name</label><input class="form-input" name="name" required></div></form>`,
    `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" id="saveTypeBtn"><i class="fa-solid fa-check"></i> Add</button>`);
  document.getElementById('saveTypeBtn').addEventListener('click', () => {
    const name = document.querySelector('#addTypeForm [name="name"]').value.trim();
    if (!name) { toast('Enter a type name.', 'error'); return; }
    Wallets.addWalletType(name); toast('Wallet type added.', 'success'); closeModal(); rerender();
  });
}

/* ============================================================
   COMMAND PALETTE (Ctrl+K) + GLOBAL SEARCH
   ============================================================ */
let paletteSelectedIdx = 0;
let paletteCurrentItems = [];

function wirePalette() {
  document.getElementById('paletteOverlay').addEventListener('click', (e) => { if (e.target.id === 'paletteOverlay') closePalette(); });
  const input = document.getElementById('paletteInput');
  input.addEventListener('input', () => renderPaletteResults(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteSelectedIdx = Math.min(paletteSelectedIdx + 1, paletteCurrentItems.length - 1); highlightPaletteSelection(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSelectedIdx = Math.max(paletteSelectedIdx - 1, 0); highlightPaletteSelection(); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = paletteCurrentItems[paletteSelectedIdx]; if (item) { item.onSelect(); closePalette(); } }
  });
}
function openPalette() {
  document.getElementById('paletteOverlay').classList.add('open');
  const input = document.getElementById('paletteInput');
  input.value = ''; input.focus();
  renderPaletteResults('');
}
function closePalette() { document.getElementById('paletteOverlay').classList.remove('open'); }

function paletteCommands() {
  return [
    { icon: 'fa-solid fa-gauge-high', label: 'Go to Dashboard', group: 'Navigate', onSelect: () => navigate('dashboard') },
    { icon: 'fa-solid fa-wallet', label: 'Go to Wallets', group: 'Navigate', onSelect: () => navigate('wallets') },
    { icon: 'fa-solid fa-right-left', label: 'Go to Transactions', group: 'Navigate', onSelect: () => navigate('transactions') },
    { icon: 'fa-solid fa-sliders', label: 'Go to Budgets', group: 'Navigate', onSelect: () => navigate('budgets') },
    { icon: 'fa-solid fa-bullseye', label: 'Go to Savings Goals', group: 'Navigate', onSelect: () => navigate('goals') },
    { icon: 'fa-solid fa-file-invoice-dollar', label: 'Go to Bills', group: 'Navigate', onSelect: () => navigate('bills') },
    { icon: 'fa-solid fa-hand-holding-dollar', label: 'Go to Debts', group: 'Navigate', onSelect: () => navigate('debts') },
    { icon: 'fa-solid fa-chart-pie', label: 'Go to Analytics', group: 'Navigate', onSelect: () => navigate('analytics') },
    { icon: 'fa-solid fa-chart-line', label: 'Go to Reports', group: 'Navigate', onSelect: () => navigate('reports') },
    { icon: 'fa-solid fa-gear', label: 'Go to Settings', group: 'Navigate', onSelect: () => navigate('settings') },
    { icon: 'fa-solid fa-plus', label: 'Add Transaction', group: 'Actions', onSelect: () => openTransactionForm() },
    { icon: 'fa-solid fa-right-left', label: 'Transfer Funds', group: 'Actions', onSelect: () => openTransferForm() },
    { icon: 'fa-solid fa-wallet', label: 'Create New Wallet', group: 'Actions', onSelect: () => openWalletForm() },
    { icon: 'fa-solid fa-bullseye', label: 'Create Savings Goal', group: 'Actions', onSelect: () => openGoalForm() },
    { icon: 'fa-solid fa-money-check-dollar', label: 'Allocate Paycheck', group: 'Actions', onSelect: () => navigate('paycheck') },
    { icon: 'fa-solid fa-moon', label: 'Toggle Theme', group: 'Actions', onSelect: () => document.getElementById('themeToggleBtn').click() },
  ];
}

function renderPaletteResults(query) {
  const q = query.trim().toLowerCase();
  const resultsEl = document.getElementById('paletteResults');
  let items = [];

  if (!q) {
    items = paletteCommands();
  } else {
    items = paletteCommands().filter(c => c.label.toLowerCase().includes(q));
    // search wallets
    Wallets.getWallets().forEach(w => { if (w.name.toLowerCase().includes(q)) items.push({ icon: w.icon, label: `Wallet: ${w.name}`, sub: formatMoney(w.balance), group: 'Wallets', onSelect: () => { navigate('wallets'); setTimeout(() => openWalletDetail(w.id), 100); } }); });
    // search transactions
    Txns.getTransactions({ query: q }).slice(0, 6).forEach(t => { items.push({ icon: 'fa-solid fa-receipt', label: t.title, sub: formatMoney(t.amount), group: 'Transactions', onSelect: () => { navigate('transactions', { filters: { query: t.title } }); } }); });
    // search bills
    Bills.getBills().forEach(b => { if (b.name.toLowerCase().includes(q)) items.push({ icon: 'fa-solid fa-file-invoice-dollar', label: `Bill: ${b.name}`, sub: formatMoney(b.amount), group: 'Bills', onSelect: () => navigate('bills') }); });
    // search goals
    Goals.getGoals().forEach(g => { if (g.name.toLowerCase().includes(q)) items.push({ icon: 'fa-solid fa-bullseye', label: `Goal: ${g.name}`, sub: `${Goals.goalSummary(g).progress}%`, group: 'Goals', onSelect: () => navigate('goals') }); });
    // search budgets
    Budgets.getBudgets().forEach(b => { if (b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)) items.push({ icon: 'fa-solid fa-sliders', label: `Budget: ${b.name}`, sub: b.category, group: 'Budgets', onSelect: () => navigate('budgets') }); });
    // search categories
    state.categories.forEach(c => { if (c.name.toLowerCase().includes(q)) items.push({ icon: c.icon, label: `Category: ${c.name}`, group: 'Categories', onSelect: () => navigate('transactions', { filters: { category: c.name } }) }); });
  }

  paletteCurrentItems = items;
  paletteSelectedIdx = 0;

  if (!items.length) { resultsEl.innerHTML = `<div class="palette-empty">No results for "${escapeHtml(query)}"</div>`; return; }

  const groups = {};
  items.forEach((it, i) => { it.__idx = i; (groups[it.group] = groups[it.group] || []).push(it); });
  resultsEl.innerHTML = Object.entries(groups).map(([group, groupItems]) => `
    <div class="palette-group-label">${group}</div>
    ${groupItems.map(it => `
      <div class="palette-item ${it.__idx === paletteSelectedIdx ? 'selected' : ''}" data-idx="${it.__idx}">
        <i class="${it.icon}"></i><span>${escapeHtml(it.label)}</span>${it.sub ? `<span class="pi-sub">${it.sub}</span>` : ''}
      </div>`).join('')}
  `).join('');

  resultsEl.querySelectorAll('.palette-item').forEach(el => {
    el.addEventListener('click', () => { paletteCurrentItems[Number(el.dataset.idx)].onSelect(); closePalette(); });
    el.addEventListener('mouseenter', () => { paletteSelectedIdx = Number(el.dataset.idx); highlightPaletteSelection(); });
  });
}
function highlightPaletteSelection() {
  document.querySelectorAll('.palette-item').forEach(el => el.classList.toggle('selected', Number(el.dataset.idx) === paletteSelectedIdx));
}

/* ============================================================
   DRAG-TO-REORDER (SortableJS) — wallets grid
   ============================================================ */
function wireWalletDragSort() {
  if (typeof Sortable === 'undefined') return;
  const grid = document.querySelector('.wallet-grid');
  if (!grid) return;
  Sortable.create(grid, {
    animation: 180,
    filter: '.add-wallet-card',
    draggable: '.wallet-card',
    handle: '.wallet-drag-handle',
    delay: 120,
    delayOnTouchOnly: true,
    touchStartThreshold: 6,
    ghostClass: 'skeleton',
    onEnd: () => {
      const ids = [...grid.querySelectorAll('.wallet-card')].map(el => el.dataset.id);
      const s = getState();
      s.wallets.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      persist();
    },
  });
}

/* ============================================================
   DEBTS (payoff tracker — distinct from flat recurring Bills)
   ============================================================ */
function renderDebts() {
  const debts = Debts.getDebts();
  const total = Debts.totalDebtBalance();
  return `
  <div class="page-head">
    <div><h1>Debts</h1><p>${debts.length} debt${debts.length===1?'':'s'} tracked · ${formatMoney(total)} remaining across all of them</p></div>
    <div class="page-head-actions"><button class="btn btn-primary" data-action="add-debt"><i class="fa-solid fa-plus"></i> New Debt</button></div>
  </div>
  <div class="grid grid-2">
    ${debts.length ? debts.map(debtCardHtml).join('') : `<div style="grid-column:1/-1;">${emptyState('fa-solid fa-hand-holding-dollar','No debts tracked yet','Add a credit card, loan, or anything you are paying down over time.')}</div>`}
  </div>`;
}

function debtCardHtml(d) {
  const progress = Debts.debtProgress(d);
  const wallet = d.walletId ? Wallets.getWallet(d.walletId) : null;
  const paidOff = round2(d.principal - d.balance);
  const projection = d.minimumPayment > 0 ? Debts.projectPayoff(d.balance, d.apr, d.minimumPayment) : null;
  const linkedBills = Bills.getBills().filter(b => b.linkedDebtId === d.id);
  return `
  <div class="card">
    <div class="card-title-row">
      <h3><i class="fa-solid fa-hand-holding-dollar" style="margin-right:8px;color:var(--coral);"></i>${escapeHtml(d.name)}</h3>
      <div class="dropdown"><button class="icon-btn btn-icon-only" data-action="debt-menu" data-id="${d.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>
    </div>
    <div class="text-mid" style="font-size:11.5px;margin-bottom:10px;">${wallet ? 'Paid from ' + escapeHtml(wallet.name) : 'No linked wallet'}${d.apr > 0 ? ` · ${d.apr}% APR` : ' · No interest tracked'}${d.termMonths ? ` · ${d.termMonths}-month term` : ''}</div>
    ${linkedBills.length ? `<div class="text-mid" style="font-size:11px;margin-bottom:10px;"><i class="fa-solid fa-link" style="font-size:9px;"></i> Auto-paid via: ${linkedBills.map(b=>escapeHtml(b.name)).join(', ')}</div>` : ''}
    <div class="progress" style="margin-bottom:10px;"><div class="progress-fill" style="width:${progress}%;${progress>=100?'background:linear-gradient(90deg,var(--gold),var(--mint));':''}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
      <span class="text-mid">${formatMoney(paidOff)} <span style="color:var(--text-low)">paid of</span> ${formatMoney(d.principal)}</span>
      <span class="text-gold" style="font-weight:700;">${progress}%</span>
    </div>
    <div class="stat-value mono" style="font-size:19px;margin:8px 0;">${formatMoney(d.balance)} <span style="font-size:11px;font-weight:500;color:var(--text-low);">remaining</span></div>
    ${d.balance <= 0 ? `<div class="badge badge-gold" style="margin-bottom:10px;"><i class="fa-solid fa-trophy"></i> Debt-Free!</div>` : projection ? `
      <div class="text-mid" style="font-size:11.5px;margin-bottom:12px;">
        ${projection.feasible
          ? `At ${formatMoney(d.minimumPayment)}/mo: <strong style="color:var(--text-hi);">${projection.months} month${projection.months===1?'':'s'}</strong> to payoff${d.apr>0 ? `, ~${formatMoney(projection.totalInterest)} in interest` : ''}.`
          : `<span class="text-negative">${formatMoney(d.minimumPayment)}/mo doesn't cover the interest — this debt will never shrink at that rate.</span>`}
      </div>` : `<p class="form-hint" style="margin-bottom:12px;">Set a minimum/monthly payment to see a payoff projection.</p>`}
    ${d.balance > 0 ? `<button class="btn btn-secondary btn-block" data-action="pay-debt-menu" data-id="${d.id}"><i class="fa-solid fa-money-bill-wave"></i> Make a Payment</button>` : ''}
  </div>`;
}

function debtFormHtml(d = null) {
  const wallets = Wallets.getWallets({ includeArchived: false });
  return `
  <form id="debtForm">
    <div class="form-group"><label class="form-label">Debt Name</label><input class="form-input" name="name" placeholder="e.g. Credit Card Balance" value="${d?escapeHtml(d.name):''}" required></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Original Principal Amount</label><input class="form-input" name="principal" id="debtPrincipalInput" type="number" step="0.01" min="0" value="${d?d.principal:''}" required></div>
      <div class="form-group"><label class="form-label">Number of Months to Pay</label><input class="form-input" name="termMonths" id="debtTermInput" type="number" step="1" min="0" placeholder="e.g. 12" value="${d && d.termMonths ? d.termMonths : ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monthly Payment <span class="text-low">(auto-calculated)</span></label>
        <input class="form-input" name="minimumPayment" id="debtMonthlyPaymentInput" type="number" step="0.01" min="0" value="${d?d.minimumPayment:''}">
        <p class="form-hint">Principal ÷ Months, filled in automatically — edit it yourself if your actual payment differs (e.g. interest-adjusted).</p>
      </div>
      <div class="form-group"><label class="form-label">APR % <span class="text-low">(0 if none)</span></label><input class="form-input" name="apr" type="number" step="0.01" min="0" value="${d?d.apr:'0'}"></div>
    </div>
    <div class="form-group"><label class="form-label">Pay From Wallet</label><select class="form-select" name="walletId"><option value="">None</option>${wallets.map(w=>`<option value="${w.id}" ${d&&d.walletId===w.id?'selected':''}>${w.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" name="notes" placeholder="Optional notes...">${d?escapeHtml(d.notes):''}</textarea></div>
    ${!d ? `<p class="form-hint">This sets both the original principal and starting balance to the amount above.</p>` : `
    <div class="card" style="padding:14px;margin-top:4px;background:var(--bg-2);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div>
          <div class="form-label" style="margin-bottom:2px;">Current Remaining Balance</div>
          <div class="stat-value mono" style="font-size:18px;">${formatMoney(d.balance)}</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="adjust-debt-balance" data-id="${d.id}"><i class="fa-solid fa-sliders"></i> Adjust Balance</button>
      </div>
      <p class="form-hint" style="margin-top:8px;margin-bottom:0;">Editing the principal or term here doesn't change what you currently owe — use Adjust Balance to correct the remaining balance itself. That always keeps a dated record of the change.</p>
    </div>`}
  </form>`;
}

/** Keeps Monthly Payment auto-computed as Principal ÷ Months whenever either
 *  changes, so the two stay consistent without the user doing the math. */
function wireDebtFormAutoCalc() {
  const principalEl = document.getElementById('debtPrincipalInput');
  const termEl = document.getElementById('debtTermInput');
  const paymentEl = document.getElementById('debtMonthlyPaymentInput');
  if (!principalEl || !termEl || !paymentEl) return;
  const recalc = () => {
    const principal = Number(principalEl.value) || 0;
    const months = Number(termEl.value) || 0;
    if (principal > 0 && months > 0) paymentEl.value = round2(principal / months);
  };
  principalEl.addEventListener('input', recalc);
  termEl.addEventListener('input', recalc);
}

function openDebtForm(existing = null) {
  const doOpen = () => {
    openModal(existing?'Edit Debt':'New Debt', debtFormHtml(existing), `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-primary" data-action="save-debt" data-id="${existing?existing.id:''}"><i class="fa-solid fa-check"></i> ${existing?'Save':'Create Debt'}</button>`);
    wireDebtFormAutoCalc();
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function saveDebtFromForm(id) {
  const data = Object.fromEntries(new FormData(document.getElementById('debtForm')).entries());
  if (!data.name || !data.principal) { toast('Please complete required fields.', 'error'); return; }
  if (id) Debts.updateDebt(id, data); else Debts.createDebt(data);
  toast(id?'Debt updated.':'Debt created.', 'success');
  closeModal(); rerender();
}

function openAdjustDebtBalanceForm(id) {
  const d = Debts.getDebt(id);
  if (!d) return;
  const doOpen = () => {
    openModal(`Adjust Balance — ${escapeHtml(d.name)}`, `
      <form id="adjustBalanceForm">
        <p class="form-hint" style="margin-bottom:14px;">Use this to correct the remaining balance if it doesn't match your statement or the payoff was recorded wrong. This doesn't move any money — it only fixes what's tracked here — and it's logged with a reason so the correction stays auditable.</p>
        <div class="stat-card accent-coral" style="margin-bottom:16px;">
          <div class="stat-label">Current Tracked Balance</div>
          <div class="stat-value mono">${formatMoney(d.balance)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Correct Remaining Balance</label>
          <div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" id="adjustNewBalanceInput" name="newBalance" type="number" step="0.01" min="0" value="${d.balance}" required></div>
        </div>
        <div class="form-group">
          <label class="form-label">Reason for Adjustment</label>
          <textarea class="form-textarea" name="reason" id="adjustReasonInput" placeholder="e.g. Statement shows a different balance, correcting a data-entry error, bank added a fee..." required></textarea>
        </div>
        <div class="form-group"><label class="form-label">Date</label><input class="form-input" name="date" type="date" value="${todayISO()}"></div>
        <p class="form-hint" id="adjustPreviewText"></p>
      </form>
    `, `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" id="saveAdjustBalanceBtn"><i class="fa-solid fa-check"></i> Save Adjustment</button>
    `);
    const newBalanceEl = document.getElementById('adjustNewBalanceInput');
    const previewEl = document.getElementById('adjustPreviewText');
    const updatePreview = () => {
      const newBalance = Number(newBalanceEl.value);
      if (Number.isNaN(newBalance) || newBalance < 0) { previewEl.textContent = ''; return; }
      const delta = round2(newBalance - d.balance);
      const proj = d.minimumPayment > 0 ? Debts.projectPayoff(newBalance, d.apr, d.minimumPayment) : null;
      const deltaTxt = delta === 0 ? 'No change from the current balance.' : `${delta > 0 ? 'Increases' : 'Decreases'} the balance by ${formatMoney(Math.abs(delta))}.`;
      const monthsTxt = proj && proj.feasible ? ` Remaining months recalculates to ${proj.months} at the current monthly payment.` : '';
      previewEl.textContent = deltaTxt + monthsTxt;
    };
    newBalanceEl.addEventListener('input', updatePreview);
    updatePreview();
    document.getElementById('saveAdjustBalanceBtn').addEventListener('click', () => {
      const newBalance = Number(document.getElementById('adjustNewBalanceInput').value);
      const reason = document.getElementById('adjustReasonInput').value.trim();
      const date = document.querySelector('#adjustBalanceForm [name="date"]').value;
      if (Number.isNaN(newBalance) || newBalance < 0) { toast('Enter a valid balance.', 'error'); return; }
      if (!reason) { toast('A reason is required for the audit trail.', 'error'); return; }
      try {
        Debts.adjustDebtBalance(id, newBalance, reason, date);
        toast('Balance adjusted.', 'success');
        closeModal(); rerender();
      } catch (e) { toast(e.message, 'error'); }
    });
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function openPayDebtForm(id) {
  const d = Debts.getDebt(id);
  if (!d) return;
  const doOpen = () => {
    openModal(`Make a Payment — ${d.name}`, `
      <form id="payDebtForm">
        <p class="form-hint" style="margin-bottom:12px;">Current balance: <strong style="color:var(--text-hi);">${formatMoney(d.balance)}</strong></p>
        <div class="form-group"><div class="amount-currency-prefix"><span class="mono">${Utils.currencySymbol()}</span><input class="amount-input-big" name="amount" type="number" step="0.01" min="0.01" max="${d.balance}" placeholder="${d.minimumPayment || '0.00'}" value="${d.minimumPayment || ''}" required></div></div>
      </form>
    `, `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" id="savePayDebtBtn"><i class="fa-solid fa-check"></i> Record Payment</button>
    `);
    document.getElementById('savePayDebtBtn').addEventListener('click', () => {
      const amt = Number(document.querySelector('#payDebtForm [name="amount"]').value);
      if (!amt || amt <= 0) { toast('Enter a valid amount.', 'error'); return; }
      try { Debts.payDebt(id, amt); toast('Payment recorded.', 'success'); closeModal(); rerender(); }
      catch (e) { toast(e.message, 'error'); }
    });
  };
  if (document.getElementById('modalOverlay').classList.contains('open')) { closeModal(); setTimeout(doOpen, 60); } else doOpen();
}

function openDebtHistoryModal(id) {
  const d = Debts.getDebt(id);
  if (!d) return;
  const trail = Debts.debtAuditTrail(id);
  const totalPaid = round2(trail.filter(e => e.kind === 'payment').reduce((sum, e) => sum + e.amount, 0));
  const adjustmentCount = trail.filter(e => e.kind === 'adjustment').length;
  const rowHtml = (e) => {
    if (e.kind === 'payment') {
      return `<tr>
        <td>${formatDate(e.date)}</td>
        <td><span class="badge badge-mint" style="font-size:10px;"><i class="fa-solid fa-money-bill-wave"></i> Payment</span></td>
        <td class="text-mid">${escapeHtml(e.notes || '—')}</td>
        <td style="text-align:right;" class="mono text-negative">-${formatMoney(e.amount)}</td>
      </tr>`;
    }
    const deltaCls = e.adjustment > 0 ? 'text-negative' : e.adjustment < 0 ? 'text-positive' : 'text-mid';
    const deltaSign = e.adjustment > 0 ? '+' : e.adjustment < 0 ? '-' : '';
    return `<tr>
      <td>${formatDate(e.date)}</td>
      <td><span class="badge badge-gold" style="font-size:10px;"><i class="fa-solid fa-sliders"></i> Adjustment</span></td>
      <td class="text-mid">${escapeHtml(e.reason)}<br><span style="font-size:11px;">${formatMoney(e.previousBalance)} → ${formatMoney(e.newBalance)}</span></td>
      <td style="text-align:right;" class="mono ${deltaCls}">${deltaSign}${formatMoney(Math.abs(e.adjustment))}</td>
    </tr>`;
  };
  const body = `
    <div class="grid grid-3" style="margin-bottom:16px;">
      <div class="stat-card accent-mint"><div class="stat-label">Total Paid</div><div class="stat-value mono">${formatMoney(totalPaid)}</div></div>
      <div class="stat-card accent-coral"><div class="stat-label">Balance Remaining</div><div class="stat-value mono">${formatMoney(d.balance)}</div></div>
      <div class="stat-card accent-gold"><div class="stat-label">Balance Adjustments</div><div class="stat-value mono">${adjustmentCount}</div></div>
    </div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Details</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
      ${trail.length ? trail.map(rowHtml).join('') : `<tr><td colspan="4"><div class="table-empty"><i class="fa-solid fa-clock-rotate-left"></i>No payments or adjustments recorded yet.</div></td></tr>`}
    </tbody></table></div>
  `;
  openModal(`${escapeHtml(d.name)} — Payment & Adjustment History`, body, `<button class="btn btn-ghost" data-action="close-modal">Close</button>`, { size: 'modal-lg' });
}

/* ============================================================
   PROFILE GATE — password-less local profile picker/creator
   ============================================================ */
function showProfileGate(mode) {
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('fabQuickAdd').style.display = 'none';
  Charts.destroyAllCharts();
  document.getElementById('profileGate').classList.add('open');
  if (mode === 'create') renderProfileCreateGate();
  else renderProfilePickGate();
}

function hideProfileGate() {
  document.getElementById('profileGate').classList.remove('open');
  document.getElementById('app-shell').style.display = '';
  document.getElementById('fabQuickAdd').style.display = '';
}

function renderProfilePickGate() {
  const profiles = Storage.getProfiles();
  const inner = document.getElementById('profileGateInner');
  inner.innerHTML = `
    <div class="profile-gate-brand"><i class="fa-solid fa-layer-group"></i></div>
    <h2>Who's using Ledger?</h2>
    <p class="sub">Pick a profile — no password needed. Each one keeps its own separate wallets, bills, and budgets on this device.</p>
    <div class="profile-grid">
      ${profiles.map(p => `
        <div class="profile-card" data-id="${p.id}">
          <div class="pc-avatar" style="background:${p.color}">${initials(p.name)}</div>
          <div class="pc-name">${escapeHtml(p.name)}</div>
        </div>`).join('')}
      <div class="profile-card add-profile-card" id="gateAddProfileBtn">
        <div class="pc-avatar"><i class="fa-solid fa-plus"></i></div>
        <div class="pc-name">Add Profile</div>
      </div>
    </div>
    <div id="profileCreateSlot"></div>
  `;
  inner.querySelectorAll('.profile-card[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      Storage.setActiveProfileId(el.dataset.id);
      hideProfileGate();
      startApp();
    });
  });
  document.getElementById('gateAddProfileBtn').addEventListener('click', () => {
    document.getElementById('profileCreateSlot').innerHTML = profileCreateFormHtml();
    wireProfileCreateForm(false);
  });
}

function renderProfileCreateGate() {
  const inner = document.getElementById('profileGateInner');
  inner.innerHTML = `
    <div class="profile-gate-brand"><i class="fa-solid fa-layer-group"></i></div>
    <h2>Welcome to Ledger</h2>
    <p class="sub">Create a profile to get started — just a name, no password. You can add more profiles later so other people can use this device with their own separate data.</p>
    ${profileCreateFormHtml()}
  `;
  wireProfileCreateForm(true);
}

function profileCreateFormHtml() {
  return `
  <form id="profileCreateForm" class="profile-create-form">
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" name="name" placeholder="e.g. Karl, Mom, Household" required autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-swatch-row" id="gateColorSwatchRow">
        ${WALLET_COLORS.map((c,i) => `<div class="color-swatch ${i===0?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
      </div>
      <input type="hidden" name="color" value="${WALLET_COLORS[0]}">
    </div>
    <div class="form-toggle-row">
      <div><span class="form-label" style="margin:0;">Start with example data</span><div class="form-hint">Adds sample wallets/bills/budgets so there's something to look at right away</div></div>
      <label class="switch"><input type="checkbox" name="withSample" checked><span class="slider"></span></label>
    </div>
    <button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;"><i class="fa-solid fa-check"></i> Create Profile</button>
  </form>`;
}

function wireProfileCreateForm(isFirst) {
  const form = document.getElementById('profileCreateForm');
  form.querySelectorAll('.color-swatch').forEach(sw => sw.addEventListener('click', () => {
    form.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    form.querySelector('[name="color"]').value = sw.dataset.color;
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = fd.get('name');
    if (!name || !name.trim()) return;
    const profile = Storage.createProfile({ name, color: fd.get('color'), withSample: fd.get('withSample') === 'on' });
    Storage.setActiveProfileId(profile.id);
    hideProfileGate();
    startApp();
  });
}

/* ---------------- In-app profile switching / management ---------------- */
function openSwitchProfile() {
  showProfileGate('pick');
}

function openManageProfilesModal() {
  const profiles = Storage.getProfiles();
  const activeId = Storage.getActiveProfileId();
  const body = `
    <p class="form-hint" style="margin-bottom:14px;">Rename or delete profiles on this device. Deleting a profile permanently erases its finance data — this can't be undone.</p>
    <div id="profileManageList">
      ${profiles.map(p => profileManageRowHtml(p, p.id === activeId)).join('')}
    </div>
  `;
  openModal('Manage Profiles', body, `<button class="btn btn-ghost" data-action="close-modal">Close</button>`);
  wireProfileManageList();
}

function profileManageRowHtml(p, isActive) {
  return `
  <div class="profile-manage-row" data-id="${p.id}">
    <div class="pm-avatar" style="background:${p.color}">${initials(p.name)}</div>
    <div class="pm-name">${escapeHtml(p.name)}${isActive ? ' <span class="badge badge-mint pm-active-badge">Active</span>' : ''}</div>
    <button class="icon-btn btn-icon-only pm-rename-btn" data-tooltip="Rename"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
    <button class="icon-btn btn-icon-only pm-delete-btn" data-tooltip="${isActive ? 'Switch away first to delete' : 'Delete'}" ${isActive ? 'disabled' : ''}><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
  </div>`;
}

function wireProfileManageList() {
  document.querySelectorAll('.profile-manage-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.pm-rename-btn').addEventListener('click', () => {
      const p = Storage.getProfiles().find(x => x.id === id);
      const newName = window.prompt('Rename profile', p.name);
      if (newName && newName.trim()) {
        Storage.renameProfile(id, newName);
        toast('Profile renamed.', 'success');
        if (id === Storage.getActiveProfileId()) updateAvatarDisplay();
        closeModal(); openManageProfilesModal();
      }
    });
    const delBtn = row.querySelector('.pm-delete-btn');
    if (!delBtn.disabled) {
      delBtn.addEventListener('click', () => {
        const p = Storage.getProfiles().find(x => x.id === id);
        confirmAction('Delete Profile?', `Permanently delete "${p.name}" and all of its finance data? This cannot be undone.`, () => {
          Storage.deleteProfile(id);
          toast('Profile deleted.', 'success');
          closeModal(); openManageProfilesModal();
        });
      });
    }
  });
}
