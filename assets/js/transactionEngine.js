// ==========================================================================
// TRANSACTION ENGINE — income / expense / transfer / adjustment / refund
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2, todayISO, nowTime } from './utilities.js';
import { adjustWalletBalance } from './walletEngine.js';

export function getTransactions(filters = {}) {
  let list = [...getState().transactions];
  if (filters.walletId) list = list.filter(t => t.walletId === filters.walletId || t.toWalletId === filters.walletId);
  if (filters.type) list = list.filter(t => t.type === filters.type);
  if (filters.category) list = list.filter(t => t.category === filters.category);
  if (filters.status) list = list.filter(t => t.status === filters.status);
  if (filters.from) list = list.filter(t => t.date >= filters.from);
  if (filters.to) list = list.filter(t => t.date <= filters.to);
  if (filters.query) {
    const q = filters.query.toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.merchant || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  }
  list.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.createdAt.localeCompare(a.createdAt));
  return list;
}

export function getTransaction(id) {
  return getState().transactions.find(t => t.id === id) || null;
}

function applyEffect(t, sign = 1) {
  // sign = 1 to apply, -1 to reverse
  switch (t.type) {
    case 'income':
    case 'refund':
      adjustWalletBalance(t.walletId, sign * t.amount);
      break;
    case 'expense':
      adjustWalletBalance(t.walletId, -sign * t.amount);
      break;
    case 'adjustment':
      adjustWalletBalance(t.walletId, sign * t.amount); // amount can be +/-
      break;
    case 'transfer':
      adjustWalletBalance(t.walletId, -sign * t.amount);
      if (t.toWalletId) adjustWalletBalance(t.toWalletId, sign * t.amount);
      break;
  }
}

export function createTransaction(data) {
  const s = getState();
  const t = {
    id: uid('txn'),
    type: data.type || 'expense',
    title: data.title?.trim() || (data.category || 'Transaction'),
    description: data.description || '',
    amount: round2(Math.abs(Number(data.amount) || 0)) * (data.type === 'adjustment' && Number(data.amount) < 0 ? -1 : 1),
    walletId: data.walletId,
    toWalletId: data.type === 'transfer' ? data.toWalletId : null,
    category: data.category || null,
    merchant: data.merchant || '',
    tags: data.tags || [],
    notes: data.notes || '',
    receiptName: data.receiptName || '',
    paymentMethod: data.paymentMethod || 'Cash',
    status: data.status || 'Cleared',
    billId: data.billId || null,
    debtId: data.debtId || null,
    date: data.date || todayISO(),
    time: data.time || nowTime(),
    createdAt: new Date().toISOString(),
  };
  s.transactions.push(t);
  applyEffect(t, 1);
  persist();
  return t;
}

export function updateTransaction(id, patch) {
  const s = getState();
  const t = s.transactions.find(x => x.id === id);
  if (!t) return null;
  applyEffect(t, -1); // reverse old effect
  Object.assign(t, patch);
  if (patch.amount !== undefined) t.amount = round2(Math.abs(Number(patch.amount) || 0)) * (t.type === 'adjustment' && Number(patch.amount) < 0 ? -1 : 1);
  applyEffect(t, 1); // apply new effect
  persist();
  return t;
}

export function deleteTransaction(id) {
  const s = getState();
  const t = s.transactions.find(x => x.id === id);
  if (!t) return;
  applyEffect(t, -1);
  s.transactions = s.transactions.filter(x => x.id !== id);
  persist();
}

export function recentTransactions(limit = 6) {
  return getTransactions().slice(0, limit);
}

export function transactionsInRange(fromISO, toISO) {
  return getTransactions({ from: fromISO, to: toISO });
}

export function transactionsForMonth(monthKey) {
  return getState().transactions.filter(t => t.date.startsWith(monthKey));
}

/* ---------------- Categories ---------------- */
export function getCategories() { return getState().categories; }

export function addCategory(cat) {
  const s = getState();
  if (!s.categories.find(c => c.name === cat.name)) {
    s.categories.push(cat);
    persist();
  }
  return s.categories;
}

export function deleteCategory(name) {
  const s = getState();
  s.categories = s.categories.filter(c => c.name !== name);
  persist();
}

/* ---------------- Automation rules ---------------- */
export function getRules() { return getState().rules; }

export function setRule(category, walletId) {
  const s = getState();
  let rule = s.rules.find(r => r.category === category);
  if (rule) rule.walletId = walletId;
  else s.rules.push({ id: uid('rule'), category, walletId });
  persist();
  return s.rules;
}

export function deleteRule(id) {
  const s = getState();
  s.rules = s.rules.filter(r => r.id !== id);
  persist();
}

export function suggestedWalletForCategory(category) {
  const rule = getState().rules.find(r => r.category === category);
  return rule ? rule.walletId : null;
}
