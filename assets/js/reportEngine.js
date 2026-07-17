// ==========================================================================
// REPORT ENGINE — monthly / wallet / expense / income / budget / savings reports
// ==========================================================================
import { getState } from './storage.js';
import { formatMoney, formatDate, download, monthLabel } from './utilities.js';
import { getWallets } from './walletEngine.js';
import { expenseByCategory, incomeBySource, incomeVsExpenseByMonth } from './analytics.js';
import { allBudgetSummaries } from './budgetEngine.js';
import { getGoals, goalSummary } from './goalEngine.js';

export function generateMonthlyReport(monthKeyStr) {
  const s = getState();
  const txns = s.transactions.filter(t => t.date.startsWith(monthKeyStr));
  const income = txns.filter(t => t.type === 'income' || t.type === 'refund').reduce((sum, t) => sum + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  return {
    title: `Monthly Report — ${monthLabel(monthKeyStr)}`,
    period: monthKeyStr,
    income, expense, net: income - expense,
    transactions: txns,
    byCategory: expenseByCategory({ from: monthKeyStr + '-01', to: monthKeyStr + '-31' }),
  };
}

export function generateWalletReport() {
  const wallets = getWallets({ includeArchived: true });
  return { title: 'Wallet Report', wallets };
}

export function generateExpenseReport(from, to) {
  return { title: 'Expense Report', from, to, categories: expenseByCategory({ from, to }) };
}

export function generateIncomeReport(from, to) {
  return { title: 'Income Report', from, to, sources: incomeBySource({ from, to }) };
}

export function generateBudgetReport() {
  return { title: 'Budget Report', budgets: allBudgetSummaries() };
}

export function generateSavingsReport() {
  const goals = getGoals().map(g => ({ goal: g, ...goalSummary(g) }));
  return { title: 'Savings Report', goals };
}

/* ---------------- Exports ---------------- */
export function exportReportJSON(report) {
  download(`${slug(report.title)}.json`, JSON.stringify(report, null, 2), 'application/json');
}

export function exportTransactionsCSV(transactions) {
  const headers = ['Date','Time','Type','Title','Category','Wallet','Amount','Merchant','Payment Method','Status','Notes'];
  const s = getState();
  const walletName = (id) => s.wallets.find(w => w.id === id)?.name || '—';
  const rows = transactions.map(t => [
    t.date, t.time, t.type, t.title, t.category || '', walletName(t.walletId), t.amount, t.merchant || '', t.paymentMethod || '', t.status || '', (t.notes || '').replace(/\n/g, ' '),
  ]);
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  download('transactions.csv', csv, 'text/csv');
}

export function exportTransactionsExcel(transactions) {
  const s = getState();
  const walletName = (id) => s.wallets.find(w => w.id === id)?.name || '—';
  const rows = transactions.map(t => ({
    Date: t.date, Time: t.time, Type: t.type, Title: t.title, Category: t.category || '',
    Wallet: walletName(t.walletId), Amount: t.amount, Merchant: t.merchant || '',
    'Payment Method': t.paymentMethod || '', Status: t.status || '', Notes: t.notes || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, 'transactions.xlsx');
}

export function exportFullBackupExcel() {
  const s = getState();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.wallets), 'Wallets');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.transactions), 'Transactions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.budgets), 'Budgets');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.goals), 'Goals');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.bills), 'Bills');
  XLSX.writeFile(wb, 'finance-backup.xlsx');
}

export function importExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const out = {};
        wb.SheetNames.forEach(name => { out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]); });
        resolve(out);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

export function printableHTML(report) {
  const win = window.open('', '_blank');
  const s = getState();
  let bodyHtml = `<h1>${report.title}</h1><p class="meta">Generated ${formatDate(new Date().toISOString().slice(0,10))}</p>`;

  if (report.transactions) {
    bodyHtml += `<div class="summary"><div><span>Income</span><strong class="pos">${formatMoney(report.income)}</strong></div>
      <div><span>Expense</span><strong class="neg">${formatMoney(report.expense)}</strong></div>
      <div><span>Net</span><strong>${formatMoney(report.net)}</strong></div></div>`;
    bodyHtml += `<table><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Type</th><th>Amount</th></tr></thead><tbody>`;
    report.transactions.forEach(t => {
      bodyHtml += `<tr><td>${formatDate(t.date)}</td><td>${t.title}</td><td>${t.category || '—'}</td><td>${t.type}</td><td>${formatMoney(t.amount)}</td></tr>`;
    });
    bodyHtml += `</tbody></table>`;
  } else if (report.wallets) {
    bodyHtml += `<table><thead><tr><th>Wallet</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead><tbody>`;
    report.wallets.forEach(w => {
      bodyHtml += `<tr><td>${w.name}</td><td>${w.type}</td><td>${formatMoney(w.balance)}</td><td>${w.archived ? 'Archived' : 'Active'}</td></tr>`;
    });
    bodyHtml += `</tbody></table>`;
  } else if (report.categories) {
    bodyHtml += `<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>`;
    report.categories.forEach(c => { bodyHtml += `<tr><td>${c.category}</td><td>${formatMoney(c.amount)}</td></tr>`; });
    bodyHtml += `</tbody></table>`;
  } else if (report.sources) {
    bodyHtml += `<table><thead><tr><th>Source</th><th>Amount</th></tr></thead><tbody>`;
    report.sources.forEach(c => { bodyHtml += `<tr><td>${c.category}</td><td>${formatMoney(c.amount)}</td></tr>`; });
    bodyHtml += `</tbody></table>`;
  } else if (report.budgets) {
    bodyHtml += `<table><thead><tr><th>Budget</th><th>Allocated</th><th>Spent</th><th>Remaining</th></tr></thead><tbody>`;
    report.budgets.forEach(b => { bodyHtml += `<tr><td>${b.budget.name}</td><td>${formatMoney(b.allocated)}</td><td>${formatMoney(b.spent)}</td><td>${formatMoney(b.remaining)}</td></tr>`; });
    bodyHtml += `</tbody></table>`;
  } else if (report.goals) {
    bodyHtml += `<table><thead><tr><th>Goal</th><th>Target</th><th>Current</th><th>Progress</th></tr></thead><tbody>`;
    report.goals.forEach(g => { bodyHtml += `<tr><td>${g.goal.name}</td><td>${formatMoney(g.goal.target)}</td><td>${formatMoney(g.goal.current)}</td><td>${g.progress}%</td></tr>`; });
    bodyHtml += `</tbody></table>`;
  }

  win.document.write(`<!DOCTYPE html><html><head><title>${report.title}</title><style>
    body{font-family:Inter,system-ui,sans-serif;color:#131a23;padding:40px;max-width:800px;margin:0 auto;}
    h1{font-size:22px;margin-bottom:2px;} .meta{color:#777;font-size:12px;margin-bottom:24px;}
    table{width:100%;border-collapse:collapse;margin-top:10px;} th,td{padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:left;font-size:13px;}
    th{text-transform:uppercase;font-size:10.5px;letter-spacing:0.05em;color:#888;}
    .summary{display:flex;gap:24px;margin-bottom:20px;} .summary div{display:flex;flex-direction:column;}
    .summary span{font-size:11px;color:#888;} .summary strong{font-size:18px;} .pos{color:#1a9c6b;} .neg{color:#d64545;}
    @media print { body{padding:10px;} }
  </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function csvEscape(v) {
  const str = String(v ?? '');
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}
function slug(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
