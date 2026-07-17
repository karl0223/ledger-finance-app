// ==========================================================================
// WALLET ENGINE — wallet CRUD + balance computation
// ==========================================================================
import { getState, persist } from './storage.js';
import { uid, round2 } from './utilities.js';

export function getWallets({ includeArchived = true } = {}) {
  const s = getState();
  return includeArchived ? s.wallets : s.wallets.filter(w => !w.archived);
}

export function getWallet(id) {
  return getState().wallets.find(w => w.id === id) || null;
}

export function createWallet(data) {
  const s = getState();
  const wallet = {
    id: uid('wal'),
    name: data.name?.trim() || 'Untitled Wallet',
    balance: round2(Number(data.initialBalance) || 0),
    initialBalance: round2(Number(data.initialBalance) || 0),
    color: data.color || '#5fe3a8',
    icon: data.icon || 'fa-solid fa-wallet',
    type: data.type || 'Custom',
    notes: data.notes || '',
    archived: false,
    createdAt: new Date().toISOString(),
  };
  s.wallets.push(wallet);
  persist();
  return wallet;
}

export function updateWallet(id, patch) {
  const s = getState();
  const w = s.wallets.find(x => x.id === id);
  if (!w) return null;
  // If initialBalance changes, adjust current balance by the delta so historical
  // transactions remain consistent.
  if (patch.initialBalance !== undefined && Number(patch.initialBalance) !== w.initialBalance) {
    const delta = round2(Number(patch.initialBalance) - w.initialBalance);
    w.balance = round2(w.balance + delta);
    w.initialBalance = round2(Number(patch.initialBalance));
    delete patch.initialBalance;
  }
  Object.assign(w, patch);
  persist();
  return w;
}

export function deleteWallet(id) {
  const s = getState();
  s.wallets = s.wallets.filter(w => w.id !== id);
  s.transactions = s.transactions.filter(t => t.walletId !== id && t.toWalletId !== id);
  s.goals.forEach(g => { if (g.walletId === id) g.walletId = null; });
  s.bills.forEach(b => { if (b.walletId === id) b.walletId = null; });
  persist();
}

export function archiveWallet(id, archived = true) {
  const w = getWallet(id);
  if (!w) return null;
  w.archived = archived;
  persist();
  return w;
}

export function duplicateWallet(id) {
  const w = getWallet(id);
  if (!w) return null;
  const s = getState();
  const copy = { ...w, id: uid('wal'), name: w.name + ' Copy', createdAt: new Date().toISOString() };
  s.wallets.push(copy);
  persist();
  return copy;
}

export function mergeWallets(sourceId, targetId) {
  const s = getState();
  const source = getWallet(sourceId);
  const target = getWallet(targetId);
  if (!source || !target || sourceId === targetId) return null;
  target.balance = round2(target.balance + source.balance);
  s.transactions.forEach(t => {
    if (t.walletId === sourceId) t.walletId = targetId;
    if (t.toWalletId === sourceId) t.toWalletId = targetId;
  });
  s.wallets = s.wallets.filter(w => w.id !== sourceId);
  persist();
  return target;
}

export function adjustWalletBalance(id, delta) {
  const w = getWallet(id);
  if (!w) return null;
  w.balance = round2(w.balance + delta);
  persist();
  return w;
}

export function totalBalance({ includeArchived = false } = {}) {
  return round2(getWallets({ includeArchived }).reduce((sum, w) => sum + w.balance, 0));
}

export function netWorth() {
  return totalBalance({ includeArchived: false });
}

/** Balance timeline for a wallet: running balance day-by-day from transactions, ending at current balance. */
export function walletBalanceTimeline(walletId, limit = 30) {
  const s = getState();
  const wallet = getWallet(walletId);
  if (!wallet) return [];
  const txns = s.transactions
    .filter(t => t.walletId === walletId || t.toWalletId === walletId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  // Work backwards from current balance
  let running = wallet.balance;
  const points = [];
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i];
    points.unshift({ date: t.date, balance: round2(running) });
    let effect = 0;
    if (t.type === 'income' || t.type === 'refund') effect = t.walletId === walletId ? t.amount : 0;
    else if (t.type === 'expense') effect = t.walletId === walletId ? -t.amount : 0;
    else if (t.type === 'adjustment') effect = t.walletId === walletId ? t.amount : 0;
    else if (t.type === 'transfer') {
      if (t.walletId === walletId) effect = -t.amount;
      if (t.toWalletId === walletId) effect = t.amount;
    }
    running = round2(running - effect);
  }
  points.unshift({ date: 'start', balance: round2(running) });
  return points.slice(-limit);
}

export function walletTypes() {
  return getState().walletTypes;
}

export function addWalletType(name) {
  const s = getState();
  if (!s.walletTypes.includes(name)) s.walletTypes.push(name);
  persist();
  return s.walletTypes;
}
