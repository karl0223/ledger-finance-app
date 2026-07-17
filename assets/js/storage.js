// ==========================================================================
// STORAGE — localStorage persistence + first-run sample data
// ==========================================================================
import { uid, todayISO, addMonths, WALLET_COLORS, WALLET_ICONS, DEFAULT_WALLET_TYPES, DEFAULT_CATEGORIES } from './utilities.js';

const SCHEMA_VERSION = 1;

function defaultSettings() {
  return {
    currency: 'PHP',
    theme: 'dark',
    dateFormat: 'MMM D, YYYY',
    budgetMode: 'traditional', // 'traditional' | 'zero-based'
    ownerInitials: 'JD',
    ownerName: 'Juan Dela Cruz',
  };
}

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    wallets: [],
    transactions: [],
    budgets: [],
    goals: [],
    bills: [],
    debts: [],
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    walletTypes: [...DEFAULT_WALLET_TYPES],
    rules: [], // automation rules: { id, category, walletId }
    notifications: [],
    settings: defaultSettings(),
  };
}

/* ---------------- Sample data ---------------- */
function buildSampleData() {
  const s = emptyState();
  const w = (name, balance, color, icon, type, notes = '') => ({
    id: uid('wal'), name, balance, initialBalance: balance, color, icon, type, notes,
    archived: false, createdAt: new Date().toISOString(),
  });

  const payroll = w('Payroll', 18500, '#5fe3a8', 'fa-solid fa-building-columns', 'Bills');
  const gcash = w('GCash', 4650, '#6f93ff', 'fa-solid fa-mobile-screen', 'Allowance');
  const maya = w('Maya', 2200, '#b18aff', 'fa-solid fa-mobile-screen', 'Shopping');
  const gotyme = w('GoTyme', 12000, '#f2b25c', 'fa-solid fa-piggy-bank', 'Savings');
  const maribank = w('MariBank', 30500, '#e7c581', 'fa-solid fa-chart-line', 'Investment');
  const cash = w('Cash', 1200, '#ff9e5e', 'fa-solid fa-money-bill-wave', 'Cash');
  const emergency = w('Emergency Fund', 25000, '#ff6f6f', 'fa-solid fa-shield-heart', 'Emergency');
  const travel = w('Travel Fund', 8000, '#4dd0e1', 'fa-solid fa-plane', 'Travel');

  s.wallets = [payroll, gcash, maya, gotyme, maribank, cash, emergency, travel];

  s.walletTypes = [...DEFAULT_WALLET_TYPES];

  const t = (type, title, amount, walletId, category, opts = {}) => ({
    id: uid('txn'), type, title, description: opts.description || '', amount,
    walletId, toWalletId: opts.toWalletId || null, category: category || null,
    merchant: opts.merchant || '', tags: opts.tags || [], notes: opts.notes || '',
    receiptName: opts.receiptName || '', paymentMethod: opts.paymentMethod || 'E-Wallet',
    status: opts.status || 'Cleared', date: opts.date || todayISO(), time: opts.time || '09:00',
    createdAt: new Date().toISOString(),
  });

  const today = todayISO();
  const d = (n) => addMonths(today, 0).replace(/\d{2}$/, String(Math.max(1, (new Date(today).getDate() - n))).padStart(2, '0'));

  s.transactions = [
    t('income', 'Monthly Salary', 18500, payroll.id, 'Salary', { merchant: 'ACME Corp', date: addMonths(today, 0).slice(0,8) + '01', paymentMethod: 'Bank Transfer' }),
    t('expense', 'Grocery Run', 1450, gcash.id, 'Food', { merchant: 'SM Supermarket', date: d(1), paymentMethod: 'E-Wallet' }),
    t('expense', 'Grab Ride', 210, gcash.id, 'Transportation', { merchant: 'Grab', date: d(2), paymentMethod: 'E-Wallet' }),
    t('expense', 'Netflix Subscription', 549, maya.id, 'Entertainment', { merchant: 'Netflix', date: d(3), paymentMethod: 'Credit Card' }),
    t('expense', 'Electric Bill', 2340, payroll.id, 'Utilities', { merchant: 'Meralco', date: d(4), paymentMethod: 'Bank Transfer' }),
    t('expense', 'Coffee', 185, cash.id, 'Food', { merchant: 'Local Cafe', date: d(1), paymentMethod: 'Cash' }),
    t('income', 'Freelance Project', 6000, maya.id, 'Freelance', { merchant: 'Upwork Client', date: d(6), paymentMethod: 'Bank Transfer' }),
    t('expense', 'Water Bill', 480, payroll.id, 'Utilities', { merchant: 'Maynilad', date: d(5), paymentMethod: 'Bank Transfer' }),
    t('expense', 'Shopping - Clothes', 2100, maya.id, 'Shopping', { merchant: 'Uniqlo', date: d(7), paymentMethod: 'Credit Card' }),
    t('refund', 'Lazada Refund', 399, maya.id, 'Shopping', { merchant: 'Lazada', date: d(2), paymentMethod: 'E-Wallet' }),
    t('expense', 'Internet Bill', 1799, payroll.id, 'Bills', { merchant: 'PLDT', date: d(8), paymentMethod: 'Bank Transfer' }),
    t('expense', 'Dinner Out', 890, gcash.id, 'Food', { merchant: 'Mang Inasal', date: d(0), paymentMethod: 'E-Wallet' }),
  ];

  // transfers
  const trf1 = t('transfer', 'Transfer to Savings', 3000, payroll.id, 'Savings', { toWalletId: gotyme.id, date: d(9), paymentMethod: 'Bank Transfer' });
  const trf2 = t('transfer', 'Transfer to Emergency', 2000, payroll.id, 'Savings', { toWalletId: emergency.id, date: d(9), paymentMethod: 'Bank Transfer' });
  const trf3 = t('transfer', 'Transfer to Investment', 5000, payroll.id, 'Investment', { toWalletId: maribank.id, date: d(9), paymentMethod: 'Bank Transfer' });
  s.transactions.push(trf1, trf2, trf3);

  // budgets
  s.budgets = [
    { id: uid('bud'), name: 'Food & Dining', category: 'Food', period: 'Monthly', allocated: 6000, startDate: today.slice(0,8) + '01', endDate: null, createdAt: new Date().toISOString() },
    { id: uid('bud'), name: 'Transportation', category: 'Transportation', period: 'Monthly', allocated: 2500, startDate: today.slice(0,8) + '01', endDate: null, createdAt: new Date().toISOString() },
    { id: uid('bud'), name: 'Shopping', category: 'Shopping', period: 'Monthly', allocated: 4000, startDate: today.slice(0,8) + '01', endDate: null, createdAt: new Date().toISOString() },
    { id: uid('bud'), name: 'Bills & Utilities', category: 'Bills', period: 'Monthly', allocated: 5500, startDate: today.slice(0,8) + '01', endDate: null, createdAt: new Date().toISOString() },
    { id: uid('bud'), name: 'Entertainment', category: 'Entertainment', period: 'Monthly', allocated: 1200, startDate: today.slice(0,8) + '01', endDate: null, createdAt: new Date().toISOString() },
  ];

  // goals
  s.goals = [
    { id: uid('goal'), name: 'Japan Trip 2027', target: 80000, current: 8000, deadline: addMonths(today, 8), walletId: travel.id, notes: 'Cherry blossom season', createdAt: new Date().toISOString() },
    { id: uid('goal'), name: 'Emergency Fund (6mo)', target: 120000, current: 25000, deadline: addMonths(today, 12), walletId: emergency.id, notes: '6 months of expenses', createdAt: new Date().toISOString() },
    { id: uid('goal'), name: 'New Laptop', target: 65000, current: 12000, deadline: addMonths(today, 4), walletId: gotyme.id, notes: 'For work + gaming', createdAt: new Date().toISOString() },
  ];

  // bills
  s.bills = [
    { id: uid('bill'), name: 'Electricity (Meralco)', amount: 2340, category: 'Utilities', walletId: payroll.id, dueDate: addMonths(today,0).slice(0,8) + '25', recurrence: 'Monthly', status: 'Upcoming', autopay: false },
    { id: uid('bill'), name: 'Water (Maynilad)', amount: 480, category: 'Utilities', walletId: payroll.id, dueDate: addMonths(today,0).slice(0,8) + '20', recurrence: 'Monthly', status: 'Upcoming', autopay: false },
    { id: uid('bill'), name: 'Internet (PLDT)', amount: 1799, category: 'Bills', walletId: payroll.id, dueDate: addMonths(today,0).slice(0,8) + '18', recurrence: 'Monthly', status: 'Paid', autopay: true },
    { id: uid('bill'), name: 'Netflix', amount: 549, category: 'Entertainment', walletId: maya.id, dueDate: addMonths(today,0).slice(0,8) + '15', recurrence: 'Monthly', status: 'Paid', autopay: true },
    { id: uid('bill'), name: 'Spotify', amount: 149, category: 'Entertainment', walletId: maya.id, dueDate: addMonths(today,0).slice(0,8) + '12', recurrence: 'Monthly', status: 'Late', autopay: false },
    { id: uid('bill'), name: 'Credit Card Bill', amount: 4200, category: 'Debt', walletId: payroll.id, dueDate: addMonths(today,0).slice(0,8) + '28', recurrence: 'Monthly', status: 'Upcoming', autopay: false },
    { id: uid('bill'), name: 'Home Insurance', amount: 3500, category: 'Insurance', walletId: payroll.id, dueDate: addMonths(today,1).slice(0,8) + '05', recurrence: 'Yearly', status: 'Upcoming', autopay: false },
  ];

  // debts
  s.debts = [
    { id: uid('debt'), name: 'Credit Card Balance', principal: 18000, balance: 14200, apr: 36, minimumPayment: 2000, walletId: payroll.id, category: 'Debt', notes: 'Pay more than the minimum to cut down interest.', lastPayment: null, createdAt: new Date().toISOString() },
    { id: uid('debt'), name: 'Personal Loan', principal: 40000, balance: 31000, apr: 18, minimumPayment: 3000, walletId: payroll.id, category: 'Debt', notes: '', lastPayment: null, createdAt: new Date().toISOString() },
  ];

  // automation rules
  s.rules = [
    { id: uid('rule'), category: 'Food', walletId: gcash.id },
    { id: uid('rule'), category: 'Bills', walletId: payroll.id },
    { id: uid('rule'), category: 'Savings', walletId: gotyme.id },
    { id: uid('rule'), category: 'Shopping', walletId: maya.id },
  ];

  s.notifications = [
    { id: uid('notif'), icon: 'fa-solid fa-triangle-exclamation', color: 'amber', title: 'Spotify bill is late', desc: 'Due ' + s.bills[4].dueDate, time: new Date().toISOString(), read: false },
    { id: uid('notif'), icon: 'fa-solid fa-bullseye', color: 'mint', title: 'Goal milestone reached', desc: 'Emergency Fund is 20% funded', time: new Date().toISOString(), read: false },
    { id: uid('notif'), icon: 'fa-solid fa-file-invoice-dollar', color: 'blue', title: 'Electricity bill upcoming', desc: 'Due in a few days', time: new Date().toISOString(), read: true },
  ];

  s.settings = defaultSettings();
  return s;
}

/* ---------------- Public API ---------------- */
let cachedState = null;
let cachedProfileId = null;

function storageKeyFor(profileId) {
  return `financeData_${profileId}`;
}

/* ---------------- Profiles (password-less, per-browser identities) ---------------- */
const PROFILES_KEY = 'ledgerProfiles';
const ACTIVE_PROFILE_KEY = 'ledgerActiveProfileId';

export function getProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveProfiles(list) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

export function setActiveProfileId(id) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  cachedState = null;
  cachedProfileId = null;
}

export function getActiveProfile() {
  const id = getActiveProfileId();
  return getProfiles().find(p => p.id === id) || null;
}

/** Creates a profile (identity only — name + color, no password) and
 *  initializes its own isolated storage bucket, separate from every other
 *  profile in this browser. */
export function createProfile({ name, color, withSample = true }) {
  const profiles = getProfiles();
  const profile = {
    id: uid('profile'),
    name: (name || 'My Finances').trim() || 'My Finances',
    color: color || '#5fe3a8',
    createdAt: new Date().toISOString(),
  };
  profiles.push(profile);
  saveProfiles(profiles);
  const data = withSample ? buildSampleData() : emptyState();
  localStorage.setItem(storageKeyFor(profile.id), JSON.stringify(data));
  return profile;
}

export function renameProfile(id, name) {
  const profiles = getProfiles();
  const p = profiles.find(x => x.id === id);
  if (p && name && name.trim()) { p.name = name.trim(); saveProfiles(profiles); }
  return p;
}

/** Deletes a profile's identity AND its finance data permanently. */
export function deleteProfile(id) {
  saveProfiles(getProfiles().filter(p => p.id !== id));
  localStorage.removeItem(storageKeyFor(id));
  if (getActiveProfileId() === id) localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

/* ---------------- State (scoped to whichever profile is active) ---------------- */
export function loadState() {
  const activeId = getActiveProfileId();
  if (!activeId) throw new Error('No active profile — call setActiveProfileId first.');
  if (cachedState && cachedProfileId === activeId) return cachedState;

  const key = storageKeyFor(activeId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      cachedState = JSON.parse(raw);
      // migration safety: fill any missing keys
      const fallback = emptyState();
      for (const k of Object.keys(fallback)) {
        if (cachedState[k] === undefined) cachedState[k] = fallback[k];
      }
    } else {
      // Shouldn't normally happen (createProfile seeds storage), but guard anyway.
      cachedState = buildSampleData();
    }
  } catch (e) {
    console.error('Failed to load state, resetting.', e);
    cachedState = buildSampleData();
  }
  cachedProfileId = activeId;
  persist();
  window.__LEDGER_SETTINGS__ = cachedState.settings;
  return cachedState;
}

export function persist() {
  if (!cachedState || !cachedProfileId) return;
  localStorage.setItem(storageKeyFor(cachedProfileId), JSON.stringify(cachedState));
}

export function getState() {
  return cachedState || loadState();
}

export function resetApplication(withSample = true) {
  cachedState = withSample ? buildSampleData() : emptyState();
  persist();
  window.__LEDGER_SETTINGS__ = cachedState.settings;
  return cachedState;
}

export function replaceState(newState) {
  const fallback = emptyState();
  for (const k of Object.keys(fallback)) {
    if (newState[k] === undefined) newState[k] = fallback[k];
  }
  cachedState = newState;
  persist();
  window.__LEDGER_SETTINGS__ = cachedState.settings;
  return cachedState;
}

export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}
