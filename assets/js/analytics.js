// ==========================================================================
// ANALYTICS — aggregation helpers feeding charts.js and reportEngine.js
// ==========================================================================
import { getState } from './storage.js';
import { round2, monthKey, monthLabel, addMonths, todayISO, categoryMeta } from './utilities.js';
import { getWallets, netWorth } from './walletEngine.js';
import { allBudgetSummaries } from './budgetEngine.js';

export function expenseByCategory({ from = null, to = null } = {}) {
  const s = getState();
  let txns = s.transactions.filter(t => t.type === 'expense');
  if (from) txns = txns.filter(t => t.date >= from);
  if (to) txns = txns.filter(t => t.date <= to);
  const map = {};
  txns.forEach(t => {
    const cat = t.category || 'Others';
    map[cat] = round2((map[cat] || 0) + t.amount);
  });
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount, meta: categoryMeta(s.categories, category) }))
    .sort((a, b) => b.amount - a.amount);
}

export function incomeBySource({ from = null, to = null } = {}) {
  const s = getState();
  let txns = s.transactions.filter(t => t.type === 'income');
  if (from) txns = txns.filter(t => t.date >= from);
  if (to) txns = txns.filter(t => t.date <= to);
  const map = {};
  txns.forEach(t => {
    const cat = t.category || 'Others';
    map[cat] = round2((map[cat] || 0) + t.amount);
  });
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount, meta: categoryMeta(s.categories, category) }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Reconstructs net worth at each point in transaction history by walking
 * backward from the current combined balance of all active wallets,
 * reversing each transaction's effect. Transfers between two tracked
 * wallets net to zero (money didn't leave the system), matching how net
 * worth actually works. Collapses to one point per date so the chart
 * isn't cluttered by same-day activity.
 */
export function netWorthTimeline(limit = 30) {
  const s = getState();
  const wallets = getWallets({ includeArchived: false });
  const walletIds = new Set(wallets.map(w => w.id));
  let running = round2(wallets.reduce((sum, w) => sum + w.balance, 0));

  const txns = s.transactions
    .filter(t => walletIds.has(t.walletId) || walletIds.has(t.toWalletId))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const byDate = {};
  let cursor = running;
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i];
    // Walking newest -> oldest: the first time we touch a date is always its
    // chronologically LATEST transaction, so only set it once (first write wins).
    if (!(t.date in byDate)) byDate[t.date] = cursor;
    const fromTracked = walletIds.has(t.walletId);
    const toTracked = walletIds.has(t.toWalletId);
    let effect = 0;
    if (t.type === 'income' || t.type === 'refund') { if (fromTracked) effect += t.amount; }
    else if (t.type === 'expense') { if (fromTracked) effect -= t.amount; }
    else if (t.type === 'adjustment') { if (fromTracked) effect += t.amount; }
    else if (t.type === 'transfer') {
      if (fromTracked) effect -= t.amount;
      if (toTracked) effect += t.amount;
    }
    cursor = round2(cursor - effect);
  }

  const dates = Object.keys(byDate).sort();
  const points = dates.map(date => ({ date, netWorth: byDate[date] }));
  points.unshift({ date: 'Start', netWorth: cursor });
  return points.slice(-limit);
}

export function walletDistribution() {
  const wallets = getWallets({ includeArchived: false });
  const total = wallets.reduce((s, w) => s + Math.max(0, w.balance), 0) || 1;
  return wallets.map(w => ({ ...w, pct: round2((Math.max(0, w.balance) / total) * 100) }));
}

export function incomeVsExpenseByMonth(months = 6) {
  const s = getState();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKey(addMonths(todayISO(), -i));
    const txns = s.transactions.filter(t => t.date.startsWith(key));
    const income = round2(txns.filter(t => t.type === 'income' || t.type === 'refund').reduce((sum, t) => sum + t.amount, 0));
    const expense = round2(txns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
    out.push({ key, label: monthLabel(key), income, expense, net: round2(income - expense) });
  }
  return out;
}

export function monthlySpendingTrend(months = 6) {
  return incomeVsExpenseByMonth(months).map(m => ({ label: m.label, amount: m.expense }));
}

export function cashFlow(months = 6) {
  const data = incomeVsExpenseByMonth(months);
  let running = 0;
  return data.map(m => { running = round2(running + m.net); return { ...m, cumulative: running }; });
}

export function budgetUtilization() {
  return allBudgetSummaries().map(b => ({
    name: b.budget.name, category: b.budget.category, allocated: b.allocated, spent: b.spent, progress: b.progress, over: b.over,
  }));
}

export function savingsGrowth(months = 6) {
  const s = getState();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKey(addMonths(todayISO(), -i));
    const contributions = s.transactions.filter(t => t.date.startsWith(key) && t.type === 'transfer' && t.category === 'Savings')
      .reduce((sum, t) => sum + t.amount, 0);
    out.push({ label: monthLabel(key), amount: round2(contributions) });
  }
  return out;
}

/* ---------------- Financial Health Score ---------------- */
export function financialHealthScore() {
  const s = getState();
  const wallets = getWallets({ includeArchived: false });
  const totalBal = wallets.reduce((sum, w) => sum + w.balance, 0);
  const negativeWallets = wallets.filter(w => w.balance < 0).length;

  const monthTxns = s.transactions.filter(t => t.date.startsWith(monthKey(todayISO())));
  const income = monthTxns.filter(t => t.type === 'income' || t.type === 'refund').reduce((sum, t) => sum + t.amount, 0);
  const expense = monthTxns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const savingsRate = income > 0 ? Math.max(0, (income - expense) / income) : 0;

  const budgets = allBudgetSummaries();
  const overBudgetCount = budgets.filter(b => b.over).length;
  const budgetHealth = budgets.length > 0 ? 1 - (overBudgetCount / budgets.length) : 1;

  const lateBillsRatio = (() => {
    const bills = s.bills;
    if (!bills.length) return 1;
    const late = bills.filter(b => b.status === 'Late').length;
    return 1 - (late / bills.length);
  })();

  const emergencyFundMonths = expense > 0 ? totalBal / expense : 1;
  const emergencyScore = Math.min(1, emergencyFundMonths / 3);

  let score = (savingsRate * 30) + (budgetHealth * 25) + (lateBillsRatio * 20) + (emergencyScore * 20) + (negativeWallets === 0 ? 5 : 0);
  score = Math.round(Math.max(0, Math.min(100, score)));

  let label = 'Needs Attention';
  if (score >= 85) label = 'Excellent';
  else if (score >= 70) label = 'Good';
  else if (score >= 50) label = 'Fair';

  return { score, label, savingsRate: round2(savingsRate * 100), budgetHealth: round2(budgetHealth * 100), lateBillsRatio: round2(lateBillsRatio * 100) };
}

export function dashboardTotals() {
  const s = getState();
  const wallets = getWallets({ includeArchived: false });
  const monthTxns = s.transactions.filter(t => t.date.startsWith(monthKey(todayISO())));
  const income = round2(monthTxns.filter(t => t.type === 'income' || t.type === 'refund').reduce((sum, t) => sum + t.amount, 0));
  const expense = round2(monthTxns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
  const budgets = allBudgetSummaries();
  const totalAllocated = round2(budgets.reduce((sum, b) => sum + b.allocated, 0));
  const totalSpent = round2(budgets.reduce((sum, b) => sum + b.spent, 0));
  const remainingBudget = round2(totalAllocated - totalSpent);
  const goals = s.goals;
  const savingsTotal = round2(goals.reduce((sum, g) => sum + g.current, 0));
  return {
    netWorth: netWorth(),
    totalBalance: round2(wallets.reduce((sum, w) => sum + w.balance, 0)),
    income, expense,
    remainingBudget, totalAllocated, totalSpent,
    savingsTotal,
  };
}
