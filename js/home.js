/* home.js: Home screen. An app grid (one tile per module, like an ERP launcher) that opens each
   module's own dashboard, and a combined overview of all modules below it. It replaces the
   'overview/dashboard' screen, so the sidebar's first item is now "Home". */
(function (global) {
  'use strict';
  const { esc, kpi, card, barChart } = UI;
  const money = DB.money;
  const X = global.EXT;
  const L = (c) => DB.list(c) || [];
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  // One entry per module. stat() returns the short line shown on the tile.
  const MODULES = [
    { name: 'Sales', route: 'sales/dashboard', icon: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
      stat: () => `${L('orders').filter((o) => o.status === 'Pending').length} pending orders` },
    { name: 'Purchase', route: 'purchasing/dashboard', icon: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
      stat: () => `${L('purchaseOrders').filter((p) => p.status !== 'Received').length} open purchase orders` },
    { name: 'Accounting', route: 'accounting/dashboard', icon: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
      stat: () => `${money(X.sum(L('invoices'), X.sBal))} receivable` },
    { name: 'Inventory', route: 'inventory/dashboard', icon: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
      stat: () => `${lowStock().length} to reorder` },
    { name: 'Manufacturing', route: 'manufacturing/dashboard', icon: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
      stat: () => `${L('workOrders').filter((w) => w.status !== 'Completed').length} open work orders` },
    { name: 'Attendance', route: 'people/dashboard', icon: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
      stat: () => `${L('leaves').filter((l) => l.status === 'Pending').length} leave requests pending` },
    { name: 'Maintenance', route: 'maintenance/dashboard', icon: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.6-.6-2.5z"/>'),
      stat: () => `${L('tickets').filter((t) => t.status !== 'Closed').length} open tickets` },
    { name: 'FMS', route: 'fms/dashboard', icon: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h4"/>'),
      stat: () => `${money(thisMonthExpenses())} spent this month` },
    { name: 'Contacts', route: 'contacts/directory', icon: svg('<path d="M4 5h16v11H8l-4 4z"/>'),
      stat: () => `${L('customers').length} customers, ${L('vendors').length} vendors` },
    { name: 'Documents', route: 'documents/library', icon: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
      stat: () => `${L('documents').length} files stored` },
    { name: 'Reports', route: 'reports/sales', icon: svg('<rect x="3" y="12" width="4" height="8"/><rect x="10" y="8" width="4" height="12"/><rect x="17" y="4" width="4" height="16"/>'),
      stat: () => 'Sales, stock, purchase, staff' },
    { name: 'System', route: 'system/audit', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
      stat: () => `${L('audit').length} audit entries` },
  ];

  const lowStock = () => L('products').filter((p) => DB.totalStock(p.id) < p.reorder);
  const thisMonthExpenses = () => X.sum(L('expenses').filter((e) => X.inMonth(e.date, X.today().slice(0, 7))), (e) => e.amount);

  function homePage(el) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    UI.head(greet, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    el.insertAdjacentHTML('beforeend', `
      <div class="app-grid" role="list">
        ${MODULES.map((m) => `
          <a class="app-tile" role="listitem" href="#/${m.route}">
            <span class="app-ico">${m.icon}</span>
            <strong>${esc(m.name)}</strong>
            <span class="muted">${esc(m.stat())}</span>
          </a>`).join('')}
      </div>
      <h2 class="section-title">All modules together</h2>`);

    const invs = L('invoices');
    const revenue = X.sum(invs, (i) => i.amount);
    const outstanding = X.sum(invs, X.sBal);
    const overdue = invs.filter((i) => DB.invoiceStatus(i) === 'Overdue');
    const stockValue = DB.stockRows().reduce((s, r) => s + Math.max(0, r.qty) * r.product.cost, 0);
    const days = Array.from({ length: 30 }, (_, i) => DB.shift(i - 29));
    const salesByDay = days.map((d) => L('orders').filter((o) => o.date === d && o.status !== 'Pending')
      .reduce((s, o) => s + DB.orderSubtotal(o), 0));
    const low = lowStock();
    const draftPO = L('purchaseOrders').filter((p) => p.status === 'Draft').length;
    const pendingLeave = L('leaves').filter((l) => l.status === 'Pending').length;
    const openTickets = L('tickets').filter((t) => t.status !== 'Closed').length;

    el.insertAdjacentHTML('beforeend', `
      <div class="grid four">
        ${kpi('Revenue invoiced', money(revenue), 'all invoices incl. tax', 'good')}
        ${kpi('Outstanding', money(outstanding), `${overdue.length} overdue`, overdue.length ? 'bad' : '')}
        ${kpi('Stock value', money(stockValue), 'at cost')}
        ${kpi('Open tickets', openTickets, `${pendingLeave} leave requests pending`, openTickets ? 'warn' : '')}
      </div>
      <div class="grid two">
        ${card('Sales, last 30 days', barChart(days.map((d, i) => (i % 5 === 4 ? d.slice(8) : '')), salesByDay, { fmt: money }), '<span class="muted">Order subtotal</span>')}
        ${card('Needs attention', `<ul class="action-list">
          <li>${low.length ? '<span class="badge warn">Low stock</span>' : '<span class="badge good">All good</span>'} ${low.length} product(s) at or below reorder level</li>
          <li>${overdue.length ? '<span class="badge bad">Overdue</span>' : '<span class="badge good">On time</span>'} ${overdue.length} overdue invoice(s)</li>
          <li>${pendingLeave ? '<span class="badge warn">Pending</span>' : '<span class="badge good">Clear</span>'} ${pendingLeave} leave request(s) to approve</li>
          <li>${draftPO ? '<span class="badge warn">Draft</span>' : '<span class="badge good">Clear</span>'} ${draftPO} purchase order(s) to approve</li>
          <li>${openTickets ? '<span class="badge warn">Open</span>' : '<span class="badge good">Clear</span>'} ${openTickets} maintenance ticket(s) open</li></ul>`)}
      </div>`);
  }

  App.register('overview/dashboard', { group: null, label: 'Home', icon: '⌂', render: (el) => { homePage(el); UI.animateCounts(el); } });
  global.Home = { modules: MODULES };
})(window);
