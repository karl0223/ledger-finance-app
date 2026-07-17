# Ledger — Personal Finance & Wallet Manager

A complete, offline-first personal finance and wallet management application.
Built with plain HTML5, CSS3, and vanilla JavaScript (ES6 modules) — no build
step, no backend, no accounts. Everything runs entirely in your browser and
is stored in `localStorage` on your own device.

## Getting Started

Just open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).
That's it — no server, no `npm install`, no build tools.

> Tip: some browsers restrict ES module loading from the `file://` protocol.
> If the app appears blank, either enable local file access for modules in
> your browser flags, or serve the folder with any static file server, e.g.
> `npx serve .` or Python's `python -m http.server`, then open
> `http://localhost:PORT/index.html`.

On first launch the app automatically seeds realistic sample data — wallets,
transactions, budgets, savings goals, and bills — so you can explore every
screen immediately. You can wipe this at any time from **Settings → Backup &
Data → Reset**.

## Features

- **Dashboard** — net worth, balances, income/expense, financial health
  score, budget & savings progress, upcoming bills, and six live charts.
- **Wallets** — unlimited wallets with custom colors/icons/types, automatic
  balance calculation, archive, duplicate, merge, and per-wallet balance
  timeline.
- **Transactions** — income, expense, transfer, adjustment, and refund
  types with categories, merchants, tags, payment methods, and notes.
- **Transfers** — dedicated ledger of money moved between wallets.
- **Budgets** — traditional or zero-based budgeting, multiple period types,
  automatic spent/remaining/over-budget calculation.
- **Paycheck Allocator** — enter a salary and split it across wallets by
  percentage; creates real transfer transactions and remembers your rules.
- **Savings Goals** — target/current/deadline tracking with contribution
  history.
- **Bills** — recurring bill tracking with autopay flag, due-date status,
  and one-click "mark paid" that also books the expense.
- **Reports** — monthly, wallet, expense, income, budget, and savings
  reports, exportable as JSON, Excel, or a printable HTML page.
- **Analytics** — cash flow, income vs. expense, category breakdowns,
  spending trend, savings growth, and budget utilization charts.
- **Settings** — currency, date format, theme, categories, wallet types,
  automation rules, and full backup/restore (JSON or Excel).
- **Command Palette** (`Ctrl/Cmd + K`) — jump to any page or search across
  wallets, transactions, bills, goals, budgets, and categories.
- **Import/Export** — JSON, CSV, and Excel (via SheetJS) in and out.

## Project Structure

```
FinanceTracker/
├── index.html
├── assets/
│   ├── css/
│   │   ├── variables.css      design tokens (colors, type, radii, motion)
│   │   ├── layout.css         shell, sidebar, topbar
│   │   ├── components.css     buttons, cards, modals, tables, forms...
│   │   ├── dashboard.css
│   │   ├── wallet.css
│   │   ├── transaction.css
│   │   ├── animations.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── app.js             router + view rendering + UI wiring
│   │   ├── storage.js         localStorage persistence + sample data
│   │   ├── utilities.js       formatting, dates, shared constants
│   │   ├── walletEngine.js
│   │   ├── transactionEngine.js
│   │   ├── budgetEngine.js
│   │   ├── goalEngine.js
│   │   ├── billEngine.js
│   │   ├── analytics.js       aggregations for charts & health score
│   │   ├── charts.js          Chart.js rendering helpers
│   │   ├── reportEngine.js    report generation + export
│   │   └── settings.js
│   └── icons/
└── exports/                   suggested landing spot for your downloads
```

## Data & Privacy

All data lives in your browser's `localStorage` under the key
`financeData`. Nothing is sent anywhere — there is no server component at
all. Use **Settings → Backup & Data** to export a full JSON or Excel backup
regularly, since clearing your browser's site data will erase everything.

## Tech

- HTML5 / CSS3 / Vanilla JavaScript (ES Modules)
- [Chart.js](https://www.chartjs.org/) for charts
- [SheetJS](https://sheetjs.com/) for Excel import/export
- [Font Awesome](https://fontawesome.com/) for icons
- [SortableJS](https://sortablejs.github.io/Sortable/) for drag-to-reorder wallets
- Google Fonts: Sora, Inter, JetBrains Mono

This is a personal-use prototype: there is no authentication, no backend,
and no network calls other than loading the CDN libraries above.
