/* pages-overview.js: Dashboard, Reports (sales, inventory, purchasing, employee), Audit log. */
(function () {
  'use strict';
  const { esc, badge, renderTable, modal, toast, kpi, card, barChart, meter, crumbs } = UI;
  const money = DB.money;
  const today = () => DB.today();
  const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
  const custName = (id) => DB.customer(id)?.name || '—';
  const vendorName = (id) => DB.vendor(id)?.name || '—';
  const stockStatus = (qty, reorder) => (qty <= 0 ? 'Out of stock' : qty < reorder ? 'Low stock' : 'In stock');

  // ---------- Dashboard ----------
  function dashboardPage(el) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    UI.head(`${greet}`, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      '<button class="btn ghost" data-reset title="Restore the demo data">Reset demo data</button>');

    const invs = DB.list('invoices');
    const revenue = invs.reduce((s, i) => s + i.amount, 0);
    const outstanding = invs.reduce((s, i) => s + i.amount - i.paid, 0);
    const stockValue = DB.stockRows().reduce((s, r) => s + Math.max(0, r.qty) * r.product.cost, 0);
    const lowStock = DB.list('products').filter((p) => stockStatus(DB.totalStock(p.id), p.reorder) !== 'In stock');
    const openPOs = DB.list('purchaseOrders').filter((p) => p.status !== 'Received').length;
    const pendingLeave = DB.list('leaves').filter((l) => l.status === 'Pending').length;
    const overdue = invs.filter((i) => DB.invoiceStatus(i) === 'Overdue');

    // sales for last 14 days (shipped or delivered orders, subtotal)
    const days = Array.from({ length: 30 }, (_, i) => DB.shift(i - 29));
    const salesByDay = days.map((d) => DB.list('orders')
      .filter((o) => o.date === d && o.status !== 'Pending')
      .reduce((s, o) => s + DB.orderSubtotal(o), 0));

    // stock value per category
    const cats = [...new Set(DB.list('products').map((p) => p.category))];
    const catVal = cats.map((c) => ({ c, v: DB.stockRows().filter((r) => r.product.category === c).reduce((s, r) => s + Math.max(0, r.qty) * r.product.cost, 0) }));
    const catMax = Math.max(1, ...catVal.map((x) => x.v));

    el.insertAdjacentHTML('beforeend', `
      <div class="grid four">
        ${kpi('Revenue invoiced', money(revenue), 'all invoices incl. tax', 'good')}
        ${kpi('Outstanding', money(outstanding), `${overdue.length} overdue`, overdue.length ? 'bad' : '')}
        ${kpi('Stock value', money(stockValue), 'at cost')}
        ${kpi('Items to reorder', lowStock.length, `${openPOs} POs still open`, lowStock.length ? 'warn' : '')}
      </div>
      <div class="grid two">
        ${card('Sales, last 30 days', barChart(days.map((d, i) => (i % 5 === 4 ? d.slice(8) : '')), salesByDay, { fmt: money }), '<span class="muted">Order subtotal</span>')}
        ${card('Stock value by category', catVal.map((x) => `
          <div class="track-row"><span>${esc(x.c)}</span>${meter(Math.round((x.v / catMax) * 100))}<strong>${money(x.v)}</strong></div>`).join(''))}
      </div>
      <div class="grid three">
        ${card('Needs attention', `<ul class="action-list">
          <li>${lowStock.length ? '<span class="badge warn">Low stock</span>' : '<span class="badge good">All good</span>'} ${lowStock.length ? `${lowStock.length} product(s) at or below reorder level` : 'All products are above reorder level'}</li>
          <li>${overdue.length ? badge('Overdue') : badge('Paid')} ${overdue.length} overdue invoice(s)</li>
          <li>${pendingLeave ? badge('Pending') : badge('Approved')} ${pendingLeave} leave request(s) awaiting approval</li>
          <li>${DB.list('purchaseOrders').filter((p) => p.status === 'Draft').length} draft PO(s) to approve</li></ul>`)}
        ${card('Low stock', lowStock.length ? `<ul class="timeline">${lowStock.slice(0, 6).map((p) =>
          `<li>${esc(p.name)} · ${DB.totalStock(p.id)} left (reorder at ${p.reorder})</li>`).join('')}</ul>` : '<p class="muted">Everything is above reorder level.</p>')}
        ${card('Recent activity', `<ul class="timeline">${DB.list('audit').slice(0, 6).map((a) =>
          `<li><span class="muted">${new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span> ${esc(a.action)}: ${esc(a.detail)}</li>`).join('')}</ul>`)}
      </div>`);

    el.querySelector('[data-reset]').onclick = () => modal({
      title: 'Reset demo data?',
      body: '<p>This replaces everything you have changed with the original demo data. It cannot be undone.</p>',
      actions: [{ label: 'Cancel', run: null }, { label: 'Reset', danger: true, run: () => { DB.reset(); toast('Demo data restored'); App.refresh(); } }],
    });
  }

  // ---------- Reports ----------
  // Each report returns rows + a chart (labels/values) for the selected date range.
  const REPORTS = {
    sales: {
      title: 'Sales report', desc: 'Revenue by customer for orders in the selected date range.',
      dated: true,
      build(from, to) {
        const orders = DB.list('orders').filter((o) => o.status !== 'Pending' && inRange(o.date, from, to));
        const rows = DB.list('customers').map((c) => {
          const os = orders.filter((o) => o.customerId === c.id);
          const sub = os.reduce((s, o) => s + DB.orderSubtotal(o), 0);
          return { id: c.id, customer: c.name, type: c.type, orders: os.length, subtotal: sub, tax: sub * DB.TAX_RATE, total: sub * (1 + DB.TAX_RATE) };
        }).filter((r) => r.orders > 0).sort((a, b) => b.total - a.total);
        return { rows, chart: { labels: rows.map((r) => r.customer.split(' ')[0]), values: rows.map((r) => Math.round(r.total)), fmt: money } };
      },
      columns: [
        { key: 'customer', label: 'Customer' }, { key: 'type', label: 'Type' },
        { key: 'orders', label: 'Orders', align: 'right' },
        { key: 'subtotal', label: 'Subtotal', align: 'right', render: (r) => money(r.subtotal) },
        { key: 'tax', label: 'Tax', align: 'right', render: (r) => money(r.tax) },
        { key: 'total', label: 'Total', align: 'right', render: (r) => money(r.total) },
      ],
    },
    inventory: {
      title: 'Inventory report', desc: 'Current stock position per product. Not date-filtered.',
      dated: false,
      build() {
        const rows = DB.list('products').map((p) => {
          const qty = DB.totalStock(p.id);
          return { id: p.id, sku: p.sku, product: p.name, category: p.category, qty, reorder: p.reorder, value: qty * p.cost, status: stockStatus(qty, p.reorder) };
        }).sort((a, b) => a.qty / a.reorder - b.qty / b.reorder);
        const cats = [...new Set(rows.map((r) => r.category))];
        return { rows, chart: { labels: cats, values: cats.map((c) => Math.round(rows.filter((r) => r.category === c).reduce((s, r) => s + r.value, 0))), fmt: money } };
      },
      columns: [
        { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'category', label: 'Category' },
        { key: 'qty', label: 'On hand', align: 'right' }, { key: 'reorder', label: 'Reorder at', align: 'right' },
        { key: 'value', label: 'Value', align: 'right', render: (r) => money(r.value) },
        { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      ],
    },
    purchasing: {
      title: 'Purchasing report', desc: 'Purchase orders in the selected date range, with spend by month.',
      dated: true,
      build(from, to) {
        const pos = DB.list('purchaseOrders').filter((p) => inRange(p.date, from, to));
        const rows = pos.map((p) => ({ id: p.id, vendor: vendorName(p.vendorId), date: p.date, expected: p.expected, received: p.received || '—', amount: DB.poTotal(p), status: p.status }))
          .sort((a, b) => b.date.localeCompare(a.date));
        const months = [...new Set(pos.map((p) => p.date.slice(0, 7)))].sort();
        return { rows, chart: { labels: months, values: months.map((m) => Math.round(pos.filter((p) => p.date.startsWith(m)).reduce((s, p) => s + DB.poTotal(p), 0))), fmt: money } };
      },
      columns: [
        { key: 'id', label: 'PO' }, { key: 'vendor', label: 'Vendor' }, { key: 'date', label: 'Ordered' },
        { key: 'expected', label: 'Expected' }, { key: 'received', label: 'Received' },
        { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
        { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      ],
    },
    employee: {
      title: 'Employee report', desc: 'Attendance and leave per employee for attendance dates in range.',
      dated: true,
      build(from, to) {
        const att = DB.list('attendance').filter((a) => inRange(a.date, from, to));
        const rows = DB.list('employees').map((e) => {
          const mine = att.filter((a) => a.empId === e.id);
          const present = mine.filter((a) => a.status === 'Present' || a.status === 'Late').length;
          const leaveDays = DB.list('leaves').filter((l) => l.empId === e.id && l.status === 'Approved' && inRange(l.from, from, to)).reduce((s, l) => s + l.days, 0);
          return { id: e.id, name: e.name, dept: e.dept, days: mine.length, present, late: mine.filter((a) => a.status === 'Late').length,
            absent: mine.filter((a) => a.status === 'Absent').length, rate: mine.length ? Math.round((present / mine.length) * 100) : null, leaveDays };
        });
        return { rows, chart: { labels: rows.map((r) => r.name.split(' ')[0]), values: rows.map((r) => r.rate ?? 0), fmt: (v) => v + '%' } };
      },
      columns: [
        { key: 'name', label: 'Employee' }, { key: 'dept', label: 'Department' },
        { key: 'days', label: 'Days logged', align: 'right' }, { key: 'present', label: 'Present', align: 'right' },
        { key: 'late', label: 'Late', align: 'right' }, { key: 'absent', label: 'Absent', align: 'right' },
        { key: 'rate', label: 'Attendance', align: 'right', render: (r) => (r.rate === null ? '—' : r.rate + '%') },
        { key: 'leaveDays', label: 'Leave days', align: 'right' },
      ],
    },
  };

  function reportPage(type) {
    return function (el) {
      const R = REPORTS[type];
      const range = (window.__range = window.__range || {});
      const r = (range[type] = range[type] || { from: '', to: '' });
      UI.head(R.title, R.desc);
      if (R.dated) {
        el.insertAdjacentHTML('beforeend', `<div class="toolbar-row">
          <label>From <input type="date" data-from value="${r.from}"></label>
          <label>To <input type="date" data-to value="${r.to}"></label>
          <button class="btn ghost sm" data-clear-range>All dates</button></div>`);
        el.addEventListener('change', (e) => {
          if (e.target.matches('[data-from]')) r.from = e.target.value;
          if (e.target.matches('[data-to]')) r.to = e.target.value;
          if (e.target.matches('[data-from],[data-to]')) App.refresh();
        });
        el.addEventListener('click', (e) => {
          if (e.target.matches('[data-clear-range]')) { r.from = ''; r.to = ''; App.refresh(); }
        });
      }
      const { rows, chart } = R.build(r.from, r.to);
      el.insertAdjacentHTML('beforeend', card('Chart',
        rows.length ? barChart(chart.labels, chart.values, { fmt: chart.fmt }) : '<p class="muted">No data for this range.</p>',
        `<span class="muted">${rows.length} rows</span>`));
      const host = el.appendChild(document.createElement('div'));
      renderTable(host, {
        id: 'report-' + type, exportName: `report-${type}`, rows: () => rows, pageSize: 10, selectable: false,
        search: R.columns.map((c) => c.key),
        columns: R.columns,
        empty: 'No data for this date range.',
      });
    };
  }

  // ---------- Audit log ----------
  function auditPage(el) {
    UI.head('Audit log', 'Every create, update, stock move, payment and approval is recorded here.');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'audit', exportName: 'audit-log', rows: () => DB.list('audit'), pageSize: 12, selectable: false,
      search: ['action', 'detail'],
      filters: [{ key: 'action', label: 'Action', get: (a) => a.action, options: [...new Set(DB.list('audit').map((a) => a.action))] }],
      columns: [
        { key: 'at', label: 'When', render: (a) => new Date(a.at).toLocaleString('en-IN') },
        { key: 'action', label: 'Action', render: (a) => badge(a.action) },
        { key: 'detail', label: 'Detail' },
      ],
    });
  }

  App.register('overview/dashboard', { group: null, label: 'Dashboard', icon: '▦', render: dashboardPage });
  App.register('reports/sales', { group: 'Reports', label: 'Sales', render: reportPage('sales') });
  App.register('reports/inventory', { group: 'Reports', label: 'Inventory', render: reportPage('inventory') });
  App.register('reports/purchasing', { group: 'Reports', label: 'Purchasing', render: reportPage('purchasing') });
  App.register('reports/employee', { group: 'Reports', label: 'Employee', render: reportPage('employee') });
  App.register('system/audit', { group: 'System', label: 'Audit log', render: auditPage });
})();
