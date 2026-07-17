// ==========================================================================
// DEBT ENGINE — payoff-oriented debt tracking (distinct from flat recurring Bills)
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2, todayISO } from './utilities.js';
import { createTransaction, deleteTransaction } from './transactionEngine.js';

export function getDebts() { return getState().debts || []; }
export function getDebt(id) { return getDebts().find(d => d.id === id) || null; }

export function createDebt(data) {
  const s = getState();
  if (!s.debts) s.debts = [];
  const principal = round2(Number(data.principal) || 0);
  const termMonths = Math.max(0, Math.round(Number(data.termMonths) || 0));
  // Monthly payment: use whatever was submitted (the form auto-computes this
  // client-side as principal ÷ termMonths), but fall back to computing it
  // here too in case the debt is created programmatically without going
  // through the form.
  let minimumPayment = round2(Number(data.minimumPayment) || 0);
  if (minimumPayment <= 0 && termMonths > 0 && principal > 0) {
    minimumPayment = round2(principal / termMonths);
  }
  const d = {
    id: uid('debt'),
    name: data.name?.trim() || 'New Debt',
    principal,
    balance: principal,
    apr: round2(Number(data.apr) || 0),
    termMonths,
    minimumPayment,
    walletId: data.walletId || null,
    category: data.category || 'Debt',
    notes: data.notes || '',
    lastPayment: null,
    balanceAdjustments: [],
    createdAt: new Date().toISOString(),
  };
  s.debts.push(d);
  persist();
  return d;
}

export function updateDebt(id, patch) {
  const d = getDebt(id);
  if (!d) return null;
  Object.assign(d, patch);
  if (patch.principal !== undefined) d.principal = round2(Number(patch.principal) || 0);
  if (patch.apr !== undefined) d.apr = round2(Number(patch.apr) || 0);
  if (patch.termMonths !== undefined) d.termMonths = Math.max(0, Math.round(Number(patch.termMonths) || 0));
  // Monthly payment is normally auto-computed client-side from principal ÷
  // termMonths whenever either changes, so by the time it reaches here it's
  // already consistent — but if it's missing/zero and we have enough info,
  // derive it here too so saved data never ends up out of sync.
  if (patch.minimumPayment !== undefined) {
    let mp = round2(Number(patch.minimumPayment) || 0);
    if (mp <= 0 && d.termMonths > 0 && d.principal > 0) mp = round2(d.principal / d.termMonths);
    d.minimumPayment = mp;
  } else if (patch.principal !== undefined || patch.termMonths !== undefined) {
    if (d.termMonths > 0 && d.principal > 0) d.minimumPayment = round2(d.principal / d.termMonths);
  }
  if (!Array.isArray(d.balanceAdjustments)) d.balanceAdjustments = [];
  persist();
  return d;
}

/** Manually correct a debt's remaining balance (e.g. to match a statement
 *  or fix a calculation error). Unlike payDebt, this does NOT move any
 *  money through a wallet — it only corrects the tracked balance — and it
 *  always records an audit entry (previous balance, new balance, the delta,
 *  a reason, and the date) so the correction is fully transparent. Because
 *  "remaining months" is always computed live from balance/apr/payment
 *  (see projectPayoff), the payoff projection recalculates automatically
 *  the moment the balance changes — nothing extra to do there. */
export function adjustDebtBalance(id, newBalance, reason = '', date = null) {
  const d = getDebt(id);
  if (!d) return null;
  const previousBalance = d.balance;
  const balance = round2(Math.max(0, Number(newBalance)));
  if (Number.isNaN(balance)) throw new Error('Enter a valid balance.');
  const adjustment = round2(balance - previousBalance);
  if (!Array.isArray(d.balanceAdjustments)) d.balanceAdjustments = [];
  const entry = {
    id: uid('badj'),
    date: date || todayISO(),
    previousBalance,
    newBalance: balance,
    adjustment,
    reason: (reason || '').trim() || 'Manual balance correction',
    createdAt: new Date().toISOString(),
  };
  d.balanceAdjustments.push(entry);
  d.balance = balance;
  persist();
  return { debt: d, entry };
}

/** Combined, chronological audit trail for a debt: real payments (which move
 *  wallet money) plus manual balance adjustments (which don't), so the
 *  history modal can show one transparent timeline of everything that
 *  changed the balance and why. */
export function debtAuditTrail(id) {
  const payments = debtPaymentHistory(id).map(t => ({
    kind: 'payment',
    id: t.id,
    date: t.date,
    time: t.time,
    amount: t.amount,
    notes: t.notes,
    sortKey: t.date + (t.time || ''),
  }));
  const adjustments = (getDebt(id)?.balanceAdjustments || []).map(a => ({
    kind: 'adjustment',
    id: a.id,
    date: a.date,
    previousBalance: a.previousBalance,
    newBalance: a.newBalance,
    adjustment: a.adjustment,
    reason: a.reason,
    sortKey: a.date + (a.createdAt || ''),
  }));
  return [...payments, ...adjustments].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export function deleteDebt(id) {
  const s = getState();
  s.debts = getDebts().filter(d => d.id !== id);
  (s.bills || []).forEach(b => { if (b.linkedDebtId === id) b.linkedDebtId = null; });
  persist();
}

/** % of the original principal that's been paid off so far. */
export function debtProgress(debt) {
  return debt.principal > 0 ? Math.min(100, round2(((debt.principal - debt.balance) / debt.principal) * 100)) : 0;
}

/** Record a real payment against a debt's balance. Balance only ever moves
 *  via an actual recorded payment — interest is never silently added to it. */
export function payDebt(id, amount, date = null) {
  const d = getDebt(id);
  if (!d) return null;
  amount = round2(Math.min(Number(amount) || 0, d.balance));
  if (amount <= 0) return d;
  if (!d.walletId) throw new Error('This debt has no wallet assigned to pay from — edit it first.');

  const previousBalance = d.balance;
  const txn = createTransaction({
    type: 'expense', title: `${d.name} Payment`, amount, walletId: d.walletId,
    category: d.category, paymentMethod: 'Bank Transfer', notes: 'Debt payment',
    date: date || todayISO(), debtId: d.id,
  });
  d.balance = round2(Math.max(0, d.balance - amount));
  d.lastPayment = { transactionId: txn.id, previousBalance };
  persist();
  return d;
}

/** Undo the single most recent payment: deletes its transaction (restoring the
 *  wallet balance) and restores the debt's prior balance. One level of undo. */
export function undoDebtPayment(id) {
  const d = getDebt(id);
  if (!d || !d.lastPayment) return null;
  const { transactionId, previousBalance } = d.lastPayment;
  if (transactionId) deleteTransaction(transactionId);
  d.balance = previousBalance;
  d.lastPayment = null;
  persist();
  return d;
}

export function debtPaymentHistory(id) {
  return getState().transactions
    .filter(t => t.debtId === id)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function totalDebtBalance() {
  return round2(getDebts().reduce((sum, d) => sum + d.balance, 0));
}

/**
 * Amortization projection: given a fixed monthly payment, estimate months to
 * payoff and total interest paid, using the debt's current balance and APR.
 * This is a pure calculator for display only — it never mutates stored state.
 * If apr is 0, this is just balance / monthlyPayment with zero interest.
 */
export function projectPayoff(balance, apr, monthlyPayment) {
  if (balance <= 0) return { months: 0, totalInterest: 0, feasible: true };
  if (monthlyPayment <= 0) return { months: Infinity, totalInterest: Infinity, feasible: false };
  const r = (apr / 100) / 12;
  if (r === 0) {
    const months = Math.ceil(balance / monthlyPayment);
    return { months, totalInterest: 0, feasible: true };
  }
  const minNeededToEverPayItOff = balance * r;
  if (monthlyPayment <= minNeededToEverPayItOff) return { months: Infinity, totalInterest: Infinity, feasible: false };
  const months = Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
  const totalInterest = round2((months * monthlyPayment) - balance);
  return { months, totalInterest, feasible: true };
}
