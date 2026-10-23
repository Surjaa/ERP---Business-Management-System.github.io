/* pages-trade.js: Vendors, Purchase orders, Supplier tracking, Customers, Orders, Invoices. */
(function () {
  'use strict';
  const { esc, badge, renderTable, drawer, modal, toast, card, barChart, meter, kpi } = UI;
  const money = DB.money;
  const todayStr = () => DB.today();
  const opt = (arr, label, value = (x) => x.id) => arr.map((x) => ({ value: value(x), label: label(x) }));
  const productLineOpts = (priceKey) => DB.list('products').map((p) => ({
    value: p.id, label: `${p.sku} · ${p.name}`, price: p[priceKey],
  }));
  const cleanLines = (lines) => {
    if (!lines.length) throw new Error('Add at least one line item');
    lines.forEach((l) => {
      if (!l.productId) throw new Error('Choose a product on every line');
      if (!(l.qty > 0)) throw new Error('Quantity must be at least 1');
      if (!(l.price >= 0)) throw new Error('Price cannot be negative');
    });
    return lines;
  };
  const stars = (r) => `<span class="stars" title="${r}/5">${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</span>`;
  const custName = (id) => DB.customer(id)?.name || '—';
  const vendorName = (id) => DB.vendor(id)?.name || '—';

  // ---------- Vendors ----------
  function vendorsPage(el) {
    UI.head('Vendors', 'Supplier master data. Performance details live under Supplier tracking.',
      '<button class="btn primary" data-new>+ New vendor</button>');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'vendors', exportName: 'vendors', rows: () => DB.list('vendors'), pageSize: 8,
      rowActions: CRUD.rowActions('vendors'),
      search: ['name', 'city', 'email'],
      filters: [{ key: 'city', label: 'City', get: (v) => v.city, options: [...new Set(DB.list('vendors').map((v) => v.city))] }],
      columns: [
        { key: 'name', label: 'Vendor' },
        { key: 'city', label: 'City' },
        { key: 'rating', label: 'Rating', render: (v) => stars(v.rating) },
        { key: 'leadDays', label: 'Lead time', align: 'right', render: (v) => `${v.leadDays} days` },
        { key: 'open', label: 'Open POs', align: 'right', value: (v) => DB.vendorStats(v.id).open },
        { key: 'email', label: 'Email' },
      ],
      bulk: [{ label: 'Export selected', run: (ids) => UI.downloadCSV('vendors-selected', DB.list('vendors').filter((v) => ids.includes(v.id)), [
        { key: 'name', label: 'Vendor' }, { key: 'city', label: 'City' }, { key: 'email', label: 'Email' }]) }],
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New vendor', submitLabel: 'Add vendor',
      fields: [
        { name: 'name', label: 'Vendor name', required: true, full: true },
        { name: 'city', label: 'City', required: true },
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'leadDays', label: 'Lead time (days)', type: 'number', min: 0, step: 1, value: 7, required: true },
      ],
      onSubmit: (v) => {
        if (!/^\S+@\S+\.\S+$/.test(v.email)) throw new Error('Enter a valid email');
        DB.add('vendors', 'V', { name: v.name.trim(), city: v.city.trim(), email: v.email.trim(), leadDays: +v.leadDays, rating: 4, active: true }, `Vendor ${v.name} added`);
        toast('Vendor added'); App.refresh();
      },
    });
  }

  // ---------- Purchase orders ----------
  function poDetail(po) {
    const lines = po.lines.map((l) => {
      const p = DB.product(l.productId);
      return `<tr><td>${esc(p.sku)} · ${esc(p.name)}</td><td class="num">${l.qty}</td><td class="num">${money(l.unitCost)}</td><td class="num">${money(l.qty * l.unitCost)}</td></tr>`;
    }).join('');
    const actions = [{ label: 'Close', run: null }];
    if (po.status === 'Draft') actions.push({ label: 'Approve', primary: true, run: () => { DB.approvePO(po.id); toast(`${po.id} approved`); App.refresh(); } });
    if (po.status === 'Approved') actions.push({ label: 'Receive into stock', primary: true, run: () => { DB.receivePO(po.id); toast('Goods received, stock updated'); App.refresh(); } });
    modal({
      title: `${po.id} · ${vendorName(po.vendorId)}`, wide: true, actions,
      body: `<p class="muted">Warehouse: ${esc(DB.warehouse(po.warehouseId).name)} · Ordered ${po.date} · Expected ${po.expected}${po.received ? ` · Received ${po.received}` : ''} · ${badge(po.status)}</p>
        <table class="mini"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Amount</th></tr></thead>
        <tbody>${lines}</tbody><tfoot><tr><th colspan="3">Total</th><th class="num">${money(DB.poTotal(po))}</th></tr></tfoot></table>`,
    });
  }

  function purchaseOrdersPage(el) {
    UI.head('Purchase orders', 'Draft → Approved → Received. Receiving a PO writes IN movements to stock.',
      '<button class="btn primary" data-new>+ New PO</button>');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'pos', exportName: 'purchase-orders', rows: () => [...DB.list('purchaseOrders')].reverse(), pageSize: 8,
      rowActions: CRUD.rowActions('purchaseOrders'),
      search: [(p) => p.id, (p) => vendorName(p.vendorId)],
      filters: [{ key: 'status', label: 'Status', get: (p) => p.status, options: ['Draft', 'Approved', 'Received'] }],
      columns: [
        { key: 'id', label: 'PO' },
        { key: 'vendor', label: 'Vendor', value: (p) => vendorName(p.vendorId) },
        { key: 'date', label: 'Ordered' },
        { key: 'expected', label: 'Expected' },
        { key: 'received', label: 'Received', render: (p) => p.received || '—' },
        { key: 'total', label: 'Amount', align: 'right', value: DB.poTotal, render: (p) => money(DB.poTotal(p)) },
        { key: 'status', label: 'Status', render: (p) => badge(p.status) },
      ],
      bulk: [{ label: 'Approve drafts', run: (ids) => {
        let n = 0;
        ids.forEach((id) => { try { DB.approvePO(id); n++; } catch (e) { /* skip non-drafts */ } });
        toast(`${n} PO(s) approved`); App.refresh();
      } }],
      onRow: poDetail,
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New purchase order', submitLabel: 'Create draft PO',
      fields: [
        { name: 'vendorId', label: 'Vendor', type: 'select', required: true, options: opt(DB.list('vendors'), (v) => v.name) },
        { name: 'warehouseId', label: 'Deliver to', type: 'select', required: true, options: opt(DB.list('warehouses'), (w) => `${w.name} (${w.city})`) },
        { name: 'date', label: 'Order date', type: 'date', value: todayStr(), required: true },
        { name: 'expected', label: 'Expected delivery', type: 'date', value: DB.shift(7), required: true },
        { name: 'lines', label: 'Items (price = unit cost)', type: 'lines', full: true, options: productLineOpts('cost'), value: [] },
      ],
      onSubmit: (v) => {
        const lines = cleanLines(v.lines);
        DB.add('purchaseOrders', 'PO', {
          vendorId: v.vendorId, warehouseId: v.warehouseId, date: v.date, expected: v.expected, received: null, status: 'Draft',
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.price })),
        }, 'Purchase order drafted');
        toast('Draft PO created'); App.refresh();
      },
    });
  }

  // ---------- Supplier tracking ----------
  function trackingPage(el) {
    UI.head('Supplier tracking', 'On-time delivery, delay and spend per vendor, calculated from real PO dates.');
    const vs = DB.list('vendors');
    const stats = vs.map((v) => ({ v, s: DB.vendorStats(v.id) }));
    const best = [...stats].filter((x) => x.s.onTimePct !== null).sort((a, b) => b.s.onTimePct - a.s.onTimePct)[0];
    el.insertAdjacentHTML('beforeend', `
      <div class="grid four">
        ${kpi('Vendors', vs.length)}
        ${kpi('Open POs', stats.reduce((a, x) => a + x.s.open, 0))}
        ${kpi('Total spend', money(stats.reduce((a, x) => a + x.s.spend, 0)))}
        ${kpi('Most reliable', best ? esc(best.v.name) : '—', best ? `${best.s.onTimePct}% on time` : '')}
      </div>
      <div class="grid two">
        ${card('On-time delivery', stats.map(({ v, s }) => `
          <div class="track-row"><span>${esc(v.name)}</span>${s.onTimePct === null ? '<span class="muted">no receipts</span>' : meter(s.onTimePct, s.onTimePct < 70 ? 'bad' : s.onTimePct < 90 ? 'warn' : '')}
          <strong>${s.onTimePct === null ? '—' : s.onTimePct + '%'}</strong></div>`).join(''))}
        ${card('Spend by vendor', barChart(vs.map((v) => v.name.split(' ')[0]), stats.map((x) => Math.round(x.s.spend)), { fmt: money }))}
      </div>
      ${card('Scorecard', `<div class="table-wrap"><table><thead><tr>
        <th>Vendor</th><th class="num">POs</th><th class="num">Received</th><th class="num">Open</th>
        <th class="num">On-time</th><th class="num">Avg delay (days)</th><th class="num">Spend</th><th>Rating</th></tr></thead><tbody>
        ${stats.map(({ v, s }) => `<tr><td>${esc(v.name)}</td><td class="num">${s.total}</td><td class="num">${s.received}</td><td class="num">${s.open}</td>
          <td class="num">${s.onTimePct === null ? '—' : s.onTimePct + '%'}</td><td class="num">${s.avgDelay ?? '—'}</td>
          <td class="num">${money(s.spend)}</td><td>${stars(v.rating)}</td></tr>`).join('')}
        </tbody></table></div>`)}`);
  }

  // ---------- Customers ----------
  function customersPage(el) {
    UI.head('Customers', 'Account list with order count, lifetime value and money still owed.',
      '<button class="btn primary" data-new>+ New customer</button>');
    const host = el.appendChild(document.createElement('div'));
    const invFor = (cid) => DB.list('invoices').filter((i) => i.customerId === cid);
    renderTable(host, {
      id: 'customers', exportName: 'customers', rows: () => DB.list('customers'), pageSize: 8,
      rowActions: CRUD.rowActions('customers'),
      search: ['name', 'city', 'email'],
      filters: [{ key: 'type', label: 'Type', get: (c) => c.type, options: ['Retail', 'B2B', 'Online'] }],
      columns: [
        { key: 'name', label: 'Customer' },
        { key: 'type', label: 'Type' },
        { key: 'city', label: 'City' },
        { key: 'orders', label: 'Orders', align: 'right', value: (c) => DB.list('orders').filter((o) => o.customerId === c.id).length },
        { key: 'ltv', label: 'Lifetime value', align: 'right', value: (c) => invFor(c.id).reduce((s, i) => s + i.amount, 0), render: (c) => money(invFor(c.id).reduce((s, i) => s + i.amount, 0)) },
        { key: 'due', label: 'Outstanding', align: 'right', value: (c) => invFor(c.id).reduce((s, i) => s + i.amount - i.paid, 0), render: (c) => money(invFor(c.id).reduce((s, i) => s + i.amount - i.paid, 0)) },
      ],
      onRow: (c) => modal({ title: c.name, body: `<p class="muted">${esc(c.type)} · ${esc(c.city)} · ${esc(c.email)}</p>
        <h4>Recent orders</h4><ul class="timeline">${DB.list('orders').filter((o) => o.customerId === c.id).slice(-6).reverse()
          .map((o) => `<li>${esc(o.id)} · ${esc(o.date)} · ${badge(o.status)}</li>`).join('') || '<li class="muted">No orders yet</li>'}</ul>`,
        actions: [{ label: 'Close', run: null }] }),
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New customer', submitLabel: 'Add customer',
      fields: [
        { name: 'name', label: 'Customer name', required: true, full: true },
        { name: 'type', label: 'Type', type: 'select', options: ['Retail', 'B2B', 'Online'].map((t) => ({ value: t, label: t })) },
        { name: 'city', label: 'City', required: true },
        { name: 'email', label: 'Email', required: true },
      ],
      onSubmit: (v) => {
        if (!/^\S+@\S+\.\S+$/.test(v.email)) throw new Error('Enter a valid email');
        DB.add('customers', 'C', { name: v.name.trim(), type: v.type, city: v.city.trim(), email: v.email.trim() }, `Customer ${v.name} added`);
        toast('Customer added'); App.refresh();
      },
    });
  }

  // ---------- Sales orders ----------
  function orderDetail(o) {
    const actions = [{ label: 'Close', run: null }];
    if (o.status === 'Pending') actions.push({ label: 'Ship & invoice', primary: true, run: () => {
      try { DB.shipOrder(o.id); toast(`${o.id} shipped, invoice raised`); App.refresh(); }
      catch (e) { toast(e.message, 'bad'); }
    } });
    modal({
      title: `${o.id} · ${custName(o.customerId)}`, wide: true, actions,
      body: `<p class="muted">Dispatch from ${esc(DB.warehouse(o.warehouseId).name)} · ${o.date} · ${badge(o.status)}</p>
        <table class="mini"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
        <tbody>${o.lines.map((l) => {
          const p = DB.product(l.productId);
          const avail = DB.balance(l.productId, o.warehouseId);
          return `<tr><td>${esc(p.sku)} · ${esc(p.name)} ${avail < l.qty && o.status === 'Pending' ? badge('Out of stock') : ''}</td>
            <td class="num">${l.qty}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.qty * l.price)}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><th colspan="3">Subtotal (before ${Math.round(DB.TAX_RATE * 100)}% tax)</th><th class="num">${money(DB.orderSubtotal(o))}</th></tr></tfoot></table>`,
    });
  }

  function ordersPage(el) {
    UI.head('Sales orders', 'Pending orders can be shipped only when stock is available in the chosen warehouse.',
      '<button class="btn primary" data-new>+ New order</button>');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'orders', exportName: 'sales-orders', rows: () => [...DB.list('orders')].reverse(), pageSize: 8,
      rowActions: CRUD.rowActions('orders'),
      search: [(o) => o.id, (o) => custName(o.customerId)],
      filters: [{ key: 'status', label: 'Status', get: (o) => o.status, options: ['Pending', 'Shipped', 'Delivered'] }],
      columns: [
        { key: 'id', label: 'Order' },
        { key: 'customer', label: 'Customer', value: (o) => custName(o.customerId) },
        { key: 'date', label: 'Date' },
        { key: 'items', label: 'Items', align: 'right', value: (o) => o.lines.length },
        { key: 'subtotal', label: 'Subtotal', align: 'right', value: DB.orderSubtotal, render: (o) => money(DB.orderSubtotal(o)) },
        { key: 'status', label: 'Status', render: (o) => badge(o.status) },
      ],
      bulk: [{ label: 'Ship selected', run: (ids) => {
        let ok = 0, fail = [];
        ids.forEach((id) => { try { DB.shipOrder(id); ok++; } catch (e) { fail.push(id); } });
        toast(`${ok} shipped${fail.length ? `, ${fail.length} skipped (stock or status)` : ''}`, fail.length ? 'warn' : 'ok');
        App.refresh();
      } }],
      onRow: orderDetail,
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New sales order', submitLabel: 'Create order',
      fields: [
        { name: 'customerId', label: 'Customer', type: 'select', required: true, options: opt(DB.list('customers'), (c) => c.name) },
        { name: 'warehouseId', label: 'Ship from', type: 'select', required: true, options: opt(DB.list('warehouses'), (w) => `${w.name} (${w.city})`) },
        { name: 'date', label: 'Order date', type: 'date', value: todayStr(), required: true },
        { name: 'lines', label: 'Items (price = selling price)', type: 'lines', full: true, options: productLineOpts('price'), value: [] },
      ],
      onSubmit: (v) => {
        const lines = cleanLines(v.lines);
        DB.add('orders', 'SO', {
          customerId: v.customerId, warehouseId: v.warehouseId, date: v.date, status: 'Pending',
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
        }, 'Sales order created');
        toast('Order created (ship it from the list when ready)'); App.refresh();
      },
    });
  }

  // ---------- Invoices ----------
  function invoicesPage(el) {
    UI.head('Invoices', 'Raised automatically when an order ships. Click an invoice to record a payment.');
    const invs = () => [...DB.list('invoices')].reverse();
    const bal = (i) => i.amount - i.paid;
    const totalDue = DB.list('invoices').reduce((s, i) => s + bal(i), 0);
    const overdue = DB.list('invoices').filter((i) => DB.invoiceStatus(i) === 'Overdue');
    el.insertAdjacentHTML('beforeend', `<div class="grid three">
      ${kpi('Outstanding', money(totalDue))}
      ${kpi('Overdue', overdue.length, money(overdue.reduce((s, i) => s + bal(i), 0)) + ' owed', overdue.length ? 'bad' : '')}
      ${kpi('Collected', money(DB.list('invoices').reduce((s, i) => s + i.paid, 0)), '', 'good')}</div>`);
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'invoices', exportName: 'invoices', rows: invs, pageSize: 8,
      search: [(i) => i.id, (i) => custName(i.customerId), (i) => i.orderId],
      filters: [{ key: 'status', label: 'Status', get: (i) => DB.invoiceStatus(i), options: ['Unpaid', 'Partial', 'Paid', 'Overdue'] }],
      columns: [
        { key: 'id', label: 'Invoice' },
        { key: 'order', label: 'Order', value: (i) => i.orderId },
        { key: 'customer', label: 'Customer', value: (i) => custName(i.customerId) },
        { key: 'dueDate', label: 'Due' },
        { key: 'amount', label: 'Amount', align: 'right', render: (i) => money(i.amount) },
        { key: 'balance', label: 'Balance', align: 'right', value: bal, render: (i) => money(bal(i)) },
        { key: 'status', label: 'Status', sort: false, render: (i) => badge(DB.invoiceStatus(i)), csv: (i) => DB.invoiceStatus(i) },
      ],
      bulk: [{ label: 'Export selected', run: (ids) => UI.downloadCSV('invoices-selected', DB.list('invoices').filter((i) => ids.includes(i.id)), [
        { key: 'id', label: 'Invoice' }, { key: 'amount', label: 'Amount' }, { key: 'paid', label: 'Paid' }]) }],
      onRow: (i) => {
        if (bal(i) <= 0) return modal({ title: i.id, body: '<p>This invoice is fully paid.</p>', actions: [{ label: 'Close', run: null }] });
        drawer({
          title: `Payment for ${i.id}`, submitLabel: 'Record payment',
          note: `${custName(i.customerId)} · balance ${money(bal(i))}`,
          fields: [{ name: 'amount', label: 'Amount received', type: 'number', min: 1, step: '0.01', value: bal(i), required: true }],
          onSubmit: (v) => { DB.recordPayment(i.id, v.amount); toast('Payment recorded'); App.refresh(); },
        });
      },
    });
  }

  App.register('purchasing/vendors', { group: 'Purchase', label: 'Vendors', render: vendorsPage });
  App.register('purchasing/orders', { group: 'Purchase', label: 'Purchase orders', render: purchaseOrdersPage });
  App.register('purchasing/tracking', { group: 'Purchase', label: 'Supplier tracking', render: trackingPage });
  App.register('sales/customers', { group: 'Sales', label: 'Customers', render: customersPage });
  App.register('sales/orders', { group: 'Sales', label: 'Orders', render: ordersPage });
  App.register('sales/invoices', { group: 'Sales', label: 'Invoices', render: invoicesPage });
})();
