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
  const d = {
    id: uid('debt'),
    name: data.name?.trim() || 'New Debt',
    principal,
    balance: principal,
    apr: round2(Number(data.apr) || 0),
    minimumPayment: round2(Number(data.minimumPayment) || 0),
    walletId: data.walletId || null,
    category: data.category || 'Debt',
    notes: data.notes || '',
    lastPayment: null,
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
  if (patch.minimumPayment !== undefined) d.minimumPayment = round2(Number(patch.minimumPayment) || 0);
  persist();
  return d;
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
