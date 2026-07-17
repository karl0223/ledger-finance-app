// ==========================================================================
// GOAL ENGINE — savings goals
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2, daysUntil } from './utilities.js';
import { createTransaction } from './transactionEngine.js';

export function getGoals() { return getState().goals; }
export function getGoal(id) { return getState().goals.find(g => g.id === id) || null; }

export function createGoal(data) {
  const s = getState();
  const g = {
    id: uid('goal'),
    name: data.name?.trim() || 'New Goal',
    target: round2(Number(data.target) || 0),
    current: round2(Number(data.current) || 0),
    deadline: data.deadline || null,
    walletId: data.walletId || null,
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
  };
  s.goals.push(g);
  persist();
  return g;
}

export function updateGoal(id, patch) {
  const g = getGoal(id);
  if (!g) return null;
  Object.assign(g, patch);
  persist();
  return g;
}

export function deleteGoal(id) {
  const s = getState();
  s.goals = s.goals.filter(g => g.id !== id);
  persist();
}

/** Contribute funds toward a goal, optionally recording a real transfer transaction from a source wallet. */
export function contributeToGoal(id, amount, sourceWalletId = null) {
  const g = getGoal(id);
  if (!g) return null;
  amount = round2(Number(amount) || 0);
  g.current = round2(g.current + amount);
  if (sourceWalletId && g.walletId) {
    createTransaction({
      type: 'transfer', title: `Goal Contribution: ${g.name}`, amount,
      walletId: sourceWalletId, toWalletId: g.walletId, category: 'Savings',
      paymentMethod: 'Bank Transfer', notes: `Contribution toward goal "${g.name}"`,
    });
  } else {
    persist();
  }
  return g;
}

export function goalSummary(g) {
  const progress = g.target > 0 ? Math.min(100, round2((g.current / g.target) * 100)) : 0;
  const remaining = round2(Math.max(0, g.target - g.current));
  const days = g.deadline ? daysUntil(g.deadline) : null;
  const suggestedMonthly = (days && days > 0) ? round2(remaining / Math.max(1, days / 30)) : null;
  return { progress, remaining, daysLeft: days, suggestedMonthly, complete: g.current >= g.target };
}
