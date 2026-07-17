// ==========================================================================
// BUDGET ENGINE — traditional + zero-based budgeting
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2, todayISO, startOfMonth, endOfMonth } from './utilities.js';

export function getBudgets() { return getState().budgets; }
export function getBudget(id) { return getState().budgets.find(b => b.id === id) || null; }

export function createBudget(data) {
  const s = getState();
  const b = {
    id: uid('bud'),
    name: data.name?.trim() || data.category,
    category: data.category,
    period: data.period || 'Monthly',
    allocated: round2(Number(data.allocated) || 0),
    startDate: data.startDate || startOfMonth(),
    endDate: data.endDate || null,
    createdAt: new Date().toISOString(),
  };
  s.budgets.push(b);
  persist();
  return b;
}

export function updateBudget(id, patch) {
  const b = getBudget(id);
  if (!b) return null;
  Object.assign(b, patch);
  if (patch.allocated !== undefined) b.allocated = round2(Number(patch.allocated) || 0);
  persist();
  return b;
}

export function deleteBudget(id) {
  const s = getState();
  s.budgets = s.budgets.filter(b => b.id !== id);
  persist();
}

function periodRange(budget) {
  const now = new Date();
  switch (budget.period) {
    case 'Weekly': {
      const d = new Date(now); const day = d.getDay();
      const start = new Date(d); start.setDate(d.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return [start.toISOString().slice(0,10), end.toISOString().slice(0,10)];
    }
    case 'Biweekly': {
      const start = new Date(now); start.setDate(now.getDate() - 13);
      return [start.toISOString().slice(0,10), now.toISOString().slice(0,10)];
    }
    case '15th Cutoff': {
      const y = now.getFullYear(), m = now.getMonth();
      return [new Date(y,m,1).toISOString().slice(0,10), new Date(y,m,15).toISOString().slice(0,10)];
    }
    case '30th Cutoff': {
      const y = now.getFullYear(), m = now.getMonth();
      return [new Date(y,m,16).toISOString().slice(0,10), new Date(y,m+1,0).toISOString().slice(0,10)];
    }
    case 'Custom':
      return [budget.startDate, budget.endDate || todayISO()];
    case 'Monthly':
    default:
      return [startOfMonth(), endOfMonth()];
  }
}

export function budgetSpent(budget) {
  const s = getState();
  const [start, end] = periodRange(budget);
  return round2(s.transactions
    .filter(t => t.type === 'expense' && t.category === budget.category && t.date >= start && t.date <= end)
    .reduce((sum, t) => sum + t.amount, 0));
}

export function budgetSummary(budget) {
  const spent = budgetSpent(budget);
  const remaining = round2(budget.allocated - spent);
  const progress = budget.allocated > 0 ? Math.min(100, round2((spent / budget.allocated) * 100)) : 0;
  const over = spent > budget.allocated;
  return { spent, remaining, progress, over, allocated: budget.allocated };
}

export function allBudgetSummaries() {
  return getBudgets().map(b => ({ budget: b, ...budgetSummary(b) }));
}

/* ---------------- Zero-based budgeting ---------------- */
export function zeroBasedSummary(monthlyIncome) {
  const budgets = getBudgets();
  const allocated = round2(budgets.reduce((sum, b) => sum + b.allocated, 0));
  const remaining = round2(monthlyIncome - allocated);
  return { income: monthlyIncome, allocated, remaining, isBalanced: Math.abs(remaining) < 0.01 };
}
