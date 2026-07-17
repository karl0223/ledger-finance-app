// ==========================================================================
// BILL ENGINE — recurring bills, partial payments, and payment undo
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2, daysUntil, addMonths, todayISO } from './utilities.js';
import { createTransaction, deleteTransaction } from './transactionEngine.js';
import { getDebt } from './debtEngine.js';

export function getBills() { return getState().bills; }
export function getBill(id) { return getState().bills.find(b => b.id === id) || null; }

export function createBill(data) {
  const s = getState();
  const b = {
    id: uid('bill'),
    name: data.name?.trim() || 'New Bill',
    amount: round2(Number(data.amount) || 0),
    amountPaid: 0,
    carryOver: 0,
    category: data.category || 'Bills',
    walletId: data.walletId || null,
    dueDate: data.dueDate || todayISO(),
    recurrence: data.recurrence || 'Monthly',
    status: data.status || 'Upcoming',
    autopay: !!data.autopay,
    linkedDebtId: data.linkedDebtId || null,
    lastPayment: null,
    createdAt: new Date().toISOString(),
  };
  s.bills.push(b);
  persist();
  return b;
}

export function updateBill(id, patch) {
  const b = getBill(id);
  if (!b) return null;
  Object.assign(b, patch);
  if (patch.amount !== undefined) b.amount = round2(Number(patch.amount) || 0);
  if ('linkedDebtId' in patch) b.linkedDebtId = patch.linkedDebtId || null;
  persist();
  return b;
}

export function deleteBill(id) {
  const s = getState();
  s.bills = s.bills.filter(b => b.id !== id);
  persist();
}

export function effectiveStatus(bill) {
  if (bill.status === 'Paid') return 'Paid';
  const days = daysUntil(bill.dueDate);
  if (days < 0) return 'Late';
  return 'Upcoming';
}

/** The full amount owed this cycle, including anything carried over from an unpaid past cycle. */
export function billCycleTotal(bill) {
  return round2(bill.amount + (bill.carryOver || 0));
}
/** How much is still owed on the current cycle, accounting for partial payments already made. */
export function billRemaining(bill) {
  return round2(Math.max(0, billCycleTotal(bill) - (bill.amountPaid || 0)));
}
/** 0-100% of the current cycle's total that's been paid so far. */
export function billProgress(bill) {
  const total = billCycleTotal(bill);
  return total > 0 ? Math.min(100, round2(((bill.amountPaid || 0) / total) * 100)) : 0;
}

function lastDayOfMonthNum(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
/** Advance a due date to the same cutoff day next month, clamping to the
 *  month's actual last day (so a "30th" bill still lands on Feb 28/29). */
function advanceCutoffDate(iso, targetDay) {
  const d = new Date(iso + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth();
  const ny = y + Math.floor((m + 1) / 12);
  const nm = (m + 1) % 12;
  const day = Math.min(targetDay, lastDayOfMonthNum(ny, nm));
  return new Date(ny, nm, day).toISOString().slice(0, 10);
}
function nextDueDate(bill) {
  if (bill.recurrence === 'Weekly') {
    const d = new Date(bill.dueDate + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  if (bill.recurrence === '15th Cutoff') return advanceCutoffDate(bill.dueDate, 15);
  if (bill.recurrence === '30th Cutoff') return advanceCutoffDate(bill.dueDate, 30);
  const monthsMap = { Monthly: 1, Yearly: 12 };
  return addMonths(bill.dueDate, monthsMap[bill.recurrence] ?? 1);
}

/**
 * Record a payment - full or partial - toward a bill's current cycle.
 * The transaction is dated to the bill's due date so it always lands in the
 * correct budget period regardless of when you actually pay.
 * Once cumulative payments reach the bill's amount, the cycle auto-completes:
 * status flips to Paid, and (for recurring bills) the due date advances and
 * amountPaid resets to 0 for the new cycle.
 *
 * If the bill has a linkedDebtId, the SAME payment amount also reduces that
 * debt's balance directly (no second transaction, no second wallet deduction
 * — it's the same real-world payment, just tagged against both records).
 */
export function payBill(id, amount) {
  const b = getBill(id);
  if (!b) return null;
  const remaining = billRemaining(b);
  amount = round2(Math.min(Number(amount) || 0, remaining));
  if (amount <= 0) return b;
  if (!b.walletId) throw new Error('This bill has no wallet assigned to pay from - edit it first.');

  const previousDueDate = b.dueDate;
  const previousStatus = b.status;
  const previousAmountPaid = b.amountPaid || 0;
  const previousCarryOver = b.carryOver || 0;
  const isFullPayment = amount >= remaining - 0.001;

  const linkedDebt = b.linkedDebtId ? getDebt(b.linkedDebtId) : null;
  const linkedDebtPreviousBalance = linkedDebt ? linkedDebt.balance : null;

  const txn = createTransaction({
    type: 'expense', title: b.name, amount, walletId: b.walletId,
    category: b.category, paymentMethod: 'Bank Transfer',
    notes: isFullPayment ? 'Bill payment' : 'Partial bill payment',
    date: b.dueDate, billId: b.id, debtId: b.linkedDebtId || null,
  });

  if (linkedDebt) {
    linkedDebt.balance = round2(Math.max(0, linkedDebt.balance - amount));
    linkedDebt.lastPayment = { transactionId: txn.id, previousBalance: linkedDebtPreviousBalance, viaBillId: b.id };
  }

  b.amountPaid = round2(previousAmountPaid + amount);
  let completed = false;
  if (isFullPayment) {
    completed = true;
    b.status = 'Paid';
    if (b.recurrence !== 'One-time') {
      b.dueDate = nextDueDate(b);
      b.status = 'Upcoming';
    }
    b.amountPaid = 0;
    b.carryOver = 0;
  }

  b.lastPayment = { transactionId: txn.id, previousDueDate, previousStatus, previousAmountPaid, previousCarryOver, completed, linkedDebtId: b.linkedDebtId || null, linkedDebtPreviousBalance };
  persist();
  return b;
}

/** Pays off whatever remains on the bill's current cycle in one shot. */
export function markBillPaid(id) {
  const b = getBill(id);
  if (!b) return null;
  return payBill(id, billRemaining(b));
}

/**
 * For a bill you didn't finish paying — instead of leaving it stuck on the
 * same due date forever, this advances it to the next cycle anyway and adds
 * the unpaid remainder onto that new cycle's total (billCycleTotal = amount +
 * carryOver). Nothing is forgiven; the shortfall just moves forward with you.
 * No transaction is recorded here since no money has actually moved, so a
 * linked debt is untouched by a rollover.
 */
export function rollOverBill(id) {
  const b = getBill(id);
  if (!b) return null;
  const shortfall = billRemaining(b);
  if (shortfall <= 0) return b; // nothing unpaid to roll over
  b.carryOver = shortfall;
  b.amountPaid = 0;
  b.dueDate = nextDueDate(b);
  b.status = effectiveStatus(b) === 'Late' && daysUntil(b.dueDate) < 0 ? 'Late' : 'Upcoming';
  b.lastPayment = null; // rolling over supersedes any pending payment-undo for the old cycle
  persist();
  return b;
}

/** Reverses the single most recent payment on a bill: deletes its transaction
 *  (restoring the wallet balance), restores the bill's prior due date,
 *  status, and amountPaid — and if that payment also reduced a linked debt,
 *  restores the debt's prior balance too. Only one level of undo is kept. */
export function undoBillPayment(id) {
  const b = getBill(id);
  if (!b || !b.lastPayment) return null;
  const { transactionId, previousDueDate, previousStatus, previousAmountPaid, previousCarryOver, linkedDebtId, linkedDebtPreviousBalance } = b.lastPayment;
  if (transactionId) deleteTransaction(transactionId);
  b.dueDate = previousDueDate;
  b.status = previousStatus;
  b.amountPaid = previousAmountPaid;
  b.carryOver = previousCarryOver || 0;
  if (linkedDebtId && linkedDebtPreviousBalance !== null && linkedDebtPreviousBalance !== undefined) {
    const debt = getDebt(linkedDebtId);
    if (debt) { debt.balance = linkedDebtPreviousBalance; debt.lastPayment = null; }
  }
  b.lastPayment = null;
  persist();
  return b;
}

export function billPaymentHistory(id) {
  return getState().transactions
    .filter(t => t.billId === id)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function upcomingBills(limit = 5) {
  return getBills()
    .filter(b => b.status !== 'Paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

export function billsSummary() {
  const bills = getBills();
  const upcoming = bills.filter(b => effectiveStatus(b) === 'Upcoming').length;
  const late = bills.filter(b => effectiveStatus(b) === 'Late').length;
  const paid = bills.filter(b => b.status === 'Paid').length;
  const totalDue = round2(bills.filter(b => b.status !== 'Paid').reduce((s, b) => s + billRemaining(b), 0));
  return { upcoming, late, paid, totalDue, total: bills.length };
}
