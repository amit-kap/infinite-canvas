// Mock data for the ledger example. Nothing here knows about the canvas.
window.LEDGER_DATA = {
  accounts: [
    { id: '1000', name: 'Cash', type: 'Asset', balance: 84210 },
    { id: '1100', name: 'Accounts receivable', type: 'Asset', balance: 39150 },
    { id: '2000', name: 'Accounts payable', type: 'Liability', balance: -12480 },
    { id: '2100', name: 'VAT payable', type: 'Liability', balance: -6310 },
    { id: '4000', name: 'Revenue', type: 'Income', balance: 216400 },
    { id: '5000', name: 'Contractors', type: 'Expense', balance: -47800 },
  ],

  invoices: [
    { id: 'INV-2291', client: 'Acme Studio', amount: 12400, status: 'Open', due: '2026-11-02' },
    { id: 'INV-2290', client: 'Northwind', amount: 8200, status: 'Overdue', due: '2026-10-14' },
    { id: 'INV-2288', client: 'Globex', amount: 31500, status: 'Paid', due: '2026-10-01' },
    { id: 'INV-2285', client: 'Initech', amount: 4600, status: 'Overdue', due: '2026-09-28' },
    { id: 'INV-2281', client: 'Umbrella Co', amount: 19800, status: 'Open', due: '2026-11-20' },
    { id: 'INV-2277', client: 'Soylent', amount: 5900, status: 'Paid', due: '2026-09-12' },
  ],

  entries: [
    { date: '2026-10-24', memo: 'Acme Studio — retainer', account: 'Revenue', amount: 6200 },
    { date: '2026-10-23', memo: 'Contractor invoice #44', account: 'Contractors', amount: -3100 },
    { date: '2026-10-22', memo: 'Office rent', account: 'Cash', amount: -2400 },
    { date: '2026-10-21', memo: 'Globex payment received', account: 'Cash', amount: 31500 },
    { date: '2026-10-20', memo: 'VAT filing Q3', account: 'VAT payable', amount: -6310 },
    { date: '2026-10-18', memo: 'Northwind — change order', account: 'Revenue', amount: 8200 },
    { date: '2026-10-17', memo: 'Software subscriptions', account: 'Cash', amount: -412 },
    { date: '2026-10-15', memo: 'Umbrella Co — deposit', account: 'Revenue', amount: 9900 },
    { date: '2026-10-14', memo: 'Contractor invoice #43', account: 'Contractors', amount: -2800 },
    { date: '2026-10-12', memo: 'Initech — late fee', account: 'Revenue', amount: 240 },
  ],

  reports: [
    { name: 'Profit and loss', note: 'Revenue, costs and margin for the quarter' },
    { name: 'Balance sheet', note: 'Assets, liabilities and equity as of today' },
    { name: 'Aged receivables', note: 'Who owes what, bucketed by days overdue' },
    { name: 'Cash flow', note: 'Money in and out, week by week' },
    { name: 'VAT summary', note: 'Collected and paid, ready for filing' },
  ],
};
