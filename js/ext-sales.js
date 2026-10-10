/* ext-sales.js: Sales (dashboard, customers in full, customer profile), Purchase invoices
   (created automatically when a PO is received), Accounting (dashboard, ledger, payables). */
(function () {
  'use strict';
  const X = EXT;
  const { L, today, shift, sum, rid, sel, dsel, opt, digits, custName, vendorName, sBal, pBal, purchaseStatus,
    monthsBack, monthName, inMonth, copy, waLink, dashboard, wireCopy, rowActionsWith, money, esc, badge, modal, drawer, toast, kpi, card, barChart } = X;
  const { renderTable } = UI;
  const CUST_TYPES = ['Retail', 'B2B', 'Online'];
  const INT_CHANNELS = ['Call', 'WhatsApp', 'Email', 'Visit', 'Meeting', 'Note'];

  // ---------- automatic purchase invoice when a PO is received ----------
  const origReceive = DB.receivePO;
  DB.receivePO = (id) => {
    origReceive(id);
    const po = DB.byId('purchaseOrders', id);
    DB.add('purchaseInvoices', 'PI', {
      poId: id, vendorId: po.vendorId, date: today(), dueDate: shift(30),
      amount: Math.round(DB.poTotal(po) * (1 + DB.TAX_RATE)), paid: 0,
    }, `Purchase invoice raised for ${id}`);
    toast(`Goods received. Purchase invoice raised for ${id}`);
  };

  // ---------- customer schema: full contact details ----------
  const CS = CRUD.SCHEMA.customers;
  CS.label = (c) => c.name;
  CS.fields = () => [
    { name: 'name', label: 'Company / customer name', required: true, full: true },
    sel('type', 'Type', dsel(CUST_TYPES)),
    { name: 'contactPerson', label: 'Contact person', required: true },
    { name: 'designation', label: 'Designation' },
    { name: 'phone', label: 'Phone', required: true, help: 'With or without country code' },
    { name: 'altPhone', label: 'Alternate phone' },
    { name: 'whatsapp', label: 'WhatsApp number' },
    { name: 'email', label: 'Email', required: true },
    { name: 'gstin', label: 'GSTIN' },
    { name: 'city', label: 'City', required: true },
    { name: 'state', label: 'State' },
    { name: 'pincode', label: 'PIN code' },
    { name: 'paymentTerms', label: 'Payment terms (days)', type: 'number', min: 0, step: 1, value: 30 },
    { name: 'creditLimit', label: 'Credit limit (₹)', type: 'number', min: 0, step: 1 },
    { name: 'address', label: 'Address', type: 'textarea', full: true },
    { name: 'notes', label: 'Internal notes', type: 'textarea', full: true },
  ];
  CS.build = (v) => {
    if (!/^\S+@\S+\.\S+$/.test(v.email)) throw new Error('Enter a valid email');
    if (digits(v.phone).length < 10) throw new Error('Phone needs at least 10 digits');
    return {
      name: v.name.trim(), type: v.type, contactPerson: v.contactPerson.trim(), designation: (v.designation || '').trim(),
      phone: v.phone.trim(), altPhone: (v.altPhone || '').trim(), whatsapp: (v.whatsapp || '').trim(),
      email: v.email.trim(), gstin: (v.gstin || '').trim().toUpperCase(), city: v.city.trim(), state: (v.state || '').trim(),
      pincode: (v.pincode || '').trim(), paymentTerms: Number(v.paymentTerms) || 0, creditLimit: Number(v.creditLimit) || 0,
      address: (v.address || '').trim(), notes: (v.notes || '').trim(),
    };
  };
  CS.create = (v) => DB.add('customers', 'C', { ...CS.build(v), interactions: [] }, `Customer ${v.name} added`);
  X.define('purchaseInvoices', { name: 'purchase invoice', label: (p) => p.id, canDelete: false });

  const nextFollowUp = (c) => (c.interactions || []).map((i) => i.followUp).filter((d) => d && d >= today()).sort()[0] || '';
  const outstandingOf = (cid) => sum(L('invoices').filter((i) => i.customerId === cid), sBal);

  // ---------- Customers ----------
  const openCustomer = (c) => X.navigate ? X.navigate('detail/customer/' + c.id) : App.navigate('detail/customer/' + c.id);
  function customersPage(el) {
    dashboard(el, {
      title: 'Customers',
      desc: 'Full contact details, coordination history and documents for each account.',
      actions: '<button class="btn primary" data-new>+ New customer</button>',
      kpis: [
        kpi('Customers', L('customers').length),
        kpi('B2B accounts', L('customers').filter((c) => c.type === 'B2B').length),
        kpi('Outstanding', money(sum(L('invoices'), sBal)), '', 'warn'),
        kpi('Follow-ups scheduled', L('customers').filter((c) => nextFollowUp(c)).length, 'next 90 days'),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'customers', exportName: 'customers', rows: () => L('customers'), pageSize: 8,
      search: ['name', 'contactPerson', 'phone', 'city', 'gstin', 'email'],
      filters: [{ key: 'type', label: 'Type', get: (c) => c.type, options: CUST_TYPES }],
      columns: [
        { key: 'name', label: 'Customer' },
        { key: 'contactPerson', label: 'Contact person' },
        { key: 'phone', label: 'Phone', sort: false, render: (c) => `${esc(c.phone || '—')} ${c.phone ? copy(c.phone) : ''}` },
        { key: 'city', label: 'City' },
        { key: 'type', label: 'Type', render: (c) => badge(c.type) },
        { key: 'due', label: 'Outstanding', align: 'right', value: (c) => outstandingOf(c.id), render: (c) => money(outstandingOf(c.id)) },
        { key: 'next', label: 'Next follow-up', value: nextFollowUp, render: (c) => nextFollowUp(c) || '—' },
      ],
      rowActions: rowActionsWith('customers', (c) => [{ label: 'Open', run: openCustomer }]),
      onRow: openCustomer,
    });
    wireCopy(el);
    el.querySelector('[data-new]').onclick = () => CRUD.create('customers');
  }

  // ---------- Customer profile: the coordination page ----------
  function customerProfile(el, id) {
    const c = DB.byId('customers', id);
    if (!c) { el.insertAdjacentHTML('beforeend', '<div class="card"><h3>Customer not found</h3></div>'); return; }
    const orders = L('orders').filter((o) => o.customerId === id).slice().reverse();
    const invs = L('invoices').filter((i) => i.customerId === id).slice().reverse();
    const docs = L('documents').filter((d) => d.refType === 'customer' && d.refId === id);
    const ints = (c.interactions || []).slice().sort((a, b) => b.at.localeCompare(a.at));
    const ltv = sum(invs, (i) => i.amount);
    const due = sum(invs, sBal);
    const wa = waLink(c.whatsapp || c.phone);
    const row = (label, value, extra = '') => `<div class="kv"><span class="muted">${label}</span><span>${value || '—'} ${extra}</span></div>`;

    UI.head(c.name, `${c.type} · ${c.city}${c.state ? ', ' + c.state : ''}`, `
      <button class="btn ghost" data-act="edit">Edit details</button>
      <button class="btn ghost" data-act="log">+ Log interaction</button>
      <button class="btn ghost" data-act="upload">Upload document</button>
      <button class="btn primary" data-act="print">Print profile</button>`);
    el.insertAdjacentHTML('beforeend', `
      <div class="grid four">
        ${kpi('Lifetime value', money(ltv))}
        ${kpi('Outstanding', money(due), `of ${money(c.creditLimit || 0)} limit`, due > (c.creditLimit || Infinity) ? 'bad' : '')}
        ${kpi('Orders', orders.length)}
        ${kpi('Next follow-up', nextFollowUp(c) || '—', '', nextFollowUp(c) ? 'warn' : '')}
      </div>
      <div class="grid two">
        ${card('Contact details', `
          ${row('Contact person', esc(c.contactPerson) + (c.designation ? ` · ${esc(c.designation)}` : ''))}
          ${row('Phone', esc(c.phone), c.phone ? copy(c.phone) : '')}
          ${row('Alternate', esc(c.altPhone), c.altPhone ? copy(c.altPhone) : '')}
          ${row('WhatsApp', esc(c.whatsapp), wa ? `<a class="btn ghost xs" href="${wa}" target="_blank" rel="noopener">Open chat</a>` : '')}
          ${row('Email', esc(c.email), copy(c.email))}
          ${row('GSTIN', esc(c.gstin))}
          ${row('Address', esc(c.address).replace(/\n/g, '<br>'))}
          ${row('City / state / PIN', `${esc(c.city)} ${esc(c.state)} ${esc(c.pincode)}`)}
          ${row('Payment terms', (c.paymentTerms ?? 30) + ' days')}
          ${row('Internal notes', esc(c.notes))}`)}
        ${card('Coordination timeline', ints.length ? `<ul class="timeline tl">${ints.map((i) => `
          <li><strong>${esc(i.channel)}</strong> · <span class="muted">${esc(i.at.slice(0, 16).replace('T', ' '))}</span>
            ${i.followUp ? badge('Follow-up ' + i.followUp) : ''}
            <p>${esc(i.summary)}</p>
            <button class="btn ghost xs danger-text" data-del-int="${i.id}">Delete</button></li>`).join('')}</ul>`
          : '<p class="muted">No interactions yet. Use “Log interaction” to record a call, WhatsApp or visit.</p>')}
      </div>
      ${card('Orders', orders.length ? tbl(['Order', 'Date', 'Items', 'Status'],
        orders.map((o) => [esc(o.id), o.date, o.lines.length, badge(o.status)])) : '<p class="muted">No orders.</p>')}
      ${card('Invoices', invs.length ? tbl(['Invoice', 'Date', 'Due', 'Amount', 'Balance', 'Status', ''],
        invs.map((i) => [esc(i.id), i.date, i.dueDate, money(i.amount), money(sBal(i)), badge(DB.invoiceStatus(i)),
          `<a href="#/detail/print/invoice/${i.id}">Print</a>`])) : '<p class="muted">No invoices yet.</p>')}
      ${card('Documents', docs.length ? tbl(['Name', 'Type', 'Uploaded'], docs.map((d) => [esc(d.name), esc(d.mime || '—'), d.uploaded]))
        : '<p class="muted">No documents linked. Upload contracts, GST certificates, or anything else from here.</p>')}`);

    el.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      const del = e.target.closest('[data-del-int]');
      if (del) {
        DB.update('customers', id, { interactions: (c.interactions || []).filter((i) => i.id !== del.dataset.delInt) }, 'Interaction removed');
        toast('Interaction removed'); App.refresh(); return;
      }
      if (!b) return;
      if (b.dataset.act === 'edit') CRUD.edit('customers', c);
      if (b.dataset.act === 'log') logInteraction(c);
      if (b.dataset.act === 'upload') EXT.openUpload({ refType: 'customer', refId: id, module: 'Contacts' });
      if (b.dataset.act === 'print') App.navigate('detail/print/customer/' + id);
    };
    wireCopy(el);
  }

  function logInteraction(c) {
    drawer({
      title: `Log interaction · ${c.name}`, submitLabel: 'Save to timeline',
      note: `Contact: ${c.contactPerson} · ${c.phone}`,
      fields: [
        sel('channel', 'Channel', dsel(INT_CHANNELS)),
        { name: 'date', label: 'Date', type: 'date', value: today(), required: true },
        { name: 'summary', label: 'What was discussed / agreed', type: 'textarea', full: true, required: true },
        { name: 'followUp', label: 'Next follow-up date', type: 'date', full: true },
      ],
      onSubmit: (v) => {
        const item = { id: rid('IA'), at: new Date(v.date + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(), channel: v.channel, summary: v.summary.trim(), followUp: v.followUp || '' };
        DB.update('customers', c.id, { interactions: [item, ...(c.interactions || [])] }, `Interaction logged for ${c.name}`);
        toast('Logged'); App.refresh();
      },
    });
  }

  // small plain table used on the profile and documents
  function tbl(heads, rows) {
    return `<div class="table-wrap"><table class="mini"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- Sales dashboard ----------
  function salesDashboard(el) {
    const months = monthsBack(6);
    const revenue = months.map((m) => Math.round(sum(L('invoices').filter((i) => inMonth(i.date, m)), (i) => i.amount)));
    const statusCount = ['Pending', 'Shipped', 'Delivered'].map((s) => L('orders').filter((o) => o.status === s).length);
    const overdue = L('invoices').filter((i) => DB.invoiceStatus(i) === 'Overdue');
    dashboard(el, {
      title: 'Sales dashboard', desc: 'Revenue, orders and what is still owed, at a glance.',
      actions: '<a class="btn primary" href="#/sales/customers">Customers</a>',
      kpis: [
        kpi('Revenue invoiced', money(sum(L('invoices'), (i) => i.amount))),
        kpi('Outstanding', money(sum(L('invoices'), sBal)), `${overdue.length} overdue`, overdue.length ? 'bad' : ''),
        kpi('Pending orders', statusCount[0], 'ready to ship'),
        kpi('Customers', L('customers').length),
      ],
      charts: [
        card('Revenue, last 6 months', barChart(months.map(monthName), revenue, { fmt: money })),
        card('Orders by status', barChart(['Pending', 'Shipped', 'Delivered'], statusCount)),
      ],
      lists: `<div class="grid two">${card('Overdue invoices', overdue.length
        ? `<ul class="timeline">${overdue.slice(0, 6).map((i) => `<li>${esc(i.id)} · ${esc(custName(i.customerId))} · ${money(sBal(i))} <a href="#/detail/customer/${i.customerId}">Open</a></li>`).join('')}</ul>`
        : '<p class="muted">Nothing overdue.</p>')}
        ${card('Recent orders', `<ul class="timeline">${L('orders').slice(-6).reverse().map((o) => `<li>${esc(o.id)} · ${esc(custName(o.customerId))} · ${badge(o.status)}</li>`).join('')}</ul>`)}</div>`,
    });
  }

  // ---------- Payables (purchase invoices) ----------
  function payablesPage(el) {
    const all = L('purchaseInvoices');
    dashboard(el, {
      title: 'Payables', desc: 'Purchase invoices raised automatically when a PO is received. Record vendor payments here.',
      kpis: [
        kpi('Invoices', all.length),
        kpi('Unpaid balance', money(sum(all, pBal)), '', sum(all, pBal) ? 'warn' : ''),
        kpi('Overdue', all.filter((p) => purchaseStatus(p) === 'Overdue').length, '', 'bad'),
        kpi('Paid', money(sum(all, (p) => p.paid)), '', 'good'),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'payables', exportName: 'purchase-invoices', rows: () => [...L('purchaseInvoices')].reverse(), pageSize: 8,
      search: [(p) => p.id, (p) => vendorName(p.vendorId), (p) => p.poId],
      filters: [{ key: 'status', label: 'Status', get: purchaseStatus, options: ['Unpaid', 'Partial', 'Paid', 'Overdue'] }],
      columns: [
        { key: 'id', label: 'Invoice' },
        { key: 'poId', label: 'PO' },
        { key: 'vendor', label: 'Vendor', value: (p) => vendorName(p.vendorId) },
        { key: 'date', label: 'Date' },
        { key: 'dueDate', label: 'Due' },
        { key: 'amount', label: 'Amount', align: 'right', render: (p) => money(p.amount) },
        { key: 'balance', label: 'Balance', align: 'right', value: pBal, render: (p) => money(pBal(p)) },
        { key: 'status', label: 'Status', sort: false, render: (p) => badge(purchaseStatus(p)), csv: purchaseStatus },
      ],
      rowActions: rowActionsWith('purchaseInvoices', (p) => [
        ...(pBal(p) > 0 ? [{ label: 'Pay', run: payVendor }] : []),
        { label: 'Print', run: (r) => App.navigate('detail/print/purchase/' + r.id) },
      ]),
      onRow: (p) => App.navigate('detail/print/purchase/' + p.id),
    });
  }

  function payVendor(p) {
    drawer({
      title: `Pay ${p.id}`, submitLabel: 'Record payment', note: `${vendorName(p.vendorId)} · balance ${money(pBal(p))}`,
      fields: [{ name: 'amount', label: 'Amount paid', type: 'number', min: 1, step: '0.01', value: pBal(p), required: true }],
      onSubmit: (v) => {
        const amt = Number(v.amount);
        if (!(amt > 0) || amt > pBal(p)) throw new Error('Amount must be between 1 and the balance');
        DB.update('purchaseInvoices', p.id, { paid: p.paid + amt }, `Payment ${money(amt)} on ${p.id}`);
        toast('Payment recorded'); App.refresh();
      },
    });
  }

  // ---------- Accounting ----------
  const journal = () => [
    ...L('invoices').map((i) => ({ id: i.id, date: i.date, type: 'Sales invoice', party: custName(i.customerId), dir: 'Money in', amount: i.amount, paid: i.paid, status: DB.invoiceStatus(i), inflow: i.paid })),
    ...L('purchaseInvoices').map((p) => ({ id: p.id, date: p.date, type: 'Purchase invoice', party: vendorName(p.vendorId), dir: 'Money out', amount: p.amount, paid: p.paid, status: purchaseStatus(p), outflow: p.paid })),
    ...L('expenses').map((e) => ({ id: e.id, date: e.date, type: 'Expense', party: e.payee, dir: 'Money out', amount: e.amount, paid: e.amount, status: 'Paid', outflow: e.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  function accountingDashboard(el) {
    const months = monthsBack(6);
    const inflow = months.map((m) => Math.round(sum(L('invoices').filter((i) => inMonth(i.date, m)), (i) => i.paid)));
    const outflow = months.map((m) => Math.round(sum(L('purchaseInvoices').filter((p) => inMonth(p.date, m)), (p) => p.paid)
      + sum(L('expenses').filter((e) => inMonth(e.date, m)), (e) => e.amount)));
    const cashIn = sum(L('invoices'), (i) => i.paid);
    const cashOut = sum(L('purchaseInvoices'), (p) => p.paid) + sum(L('expenses'), (e) => e.amount);
    dashboard(el, {
      title: 'Accounting dashboard', desc: 'Receivables, payables and cash, from invoices, payments and expenses.',
      actions: '<a class="btn ghost" href="#/accounting/ledger">Ledger</a> <a class="btn primary" href="#/accounting/payables">Payables</a>',
      kpis: [
        kpi('Receivables', money(sum(L('invoices'), sBal)), 'owed to you', 'warn'),
        kpi('Payables', money(sum(L('purchaseInvoices'), pBal)), 'you owe', ''),
        kpi('Cash in', money(cashIn), '', 'good'),
        kpi('Net cash position', money(cashIn - cashOut), 'in − out', cashIn - cashOut < 0 ? 'bad' : 'good'),
      ],
      charts: [
        card('Cash in, last 6 months', barChart(months.map(monthName), inflow, { fmt: money })),
        card('Cash out (vendors + expenses)', barChart(months.map(monthName), outflow, { fmt: money })),
      ],
    });
  }

  function ledgerPage(el) {
    const rows = journal();
    dashboard(el, {
      title: 'Ledger', desc: 'Every sales invoice, purchase invoice and expense in one journal.',
      kpis: [
        kpi('Entries', rows.length),
        kpi('Money in', money(sum(rows.filter((r) => r.dir === 'Money in'), (r) => r.paid)), '', 'good'),
        kpi('Money out', money(sum(rows.filter((r) => r.dir === 'Money out'), (r) => r.paid))),
        kpi('Still open', money(sum(rows, (r) => r.amount - r.paid)), '', 'warn'),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'ledger', exportName: 'ledger', rows: () => journal(), pageSize: 10, selectable: false, rowId: (r) => r.id,
      search: ['id', 'party', 'type'],
      filters: [{ key: 'type', label: 'Type', get: (r) => r.type, options: ['Sales invoice', 'Purchase invoice', 'Expense'] }],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type', render: (r) => badge(r.type) },
        { key: 'id', label: 'Reference' },
        { key: 'party', label: 'Party' },
        { key: 'dir', label: 'Direction' },
        { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
        { key: 'status', label: 'Status', sort: false, render: (r) => badge(r.status) },
      ],
    });
  }

  // ---------- detail route: #/detail/customer/ID or #/detail/print/<kind>/ID (hidden from the menu) ----------
  const parts = () => location.hash.replace(/^#\/?detail\//, '').split('/');
  App.register('detail', {
    hidden: true, label: 'Details',
    render(el) {
      const p = parts();
      if (p[0] === 'customer') return customerProfile(el, p[1]);
      if (p[0] === 'print') return X.printView(el, p[1], p[2]);
      el.insertAdjacentHTML('beforeend', '<div class="card"><h3>Not found</h3></div>');
    },
    crumbs() {
      const p = parts();
      if (p[0] === 'customer') {
        return [{ label: 'Home', href: '#/overview/dashboard' }, { label: 'Customers', href: '#/sales/customers' }, { label: DB.byId('customers', p[1])?.name || 'Profile' }];
      }
      return [{ label: 'Home', href: '#/overview/dashboard' }, { label: 'Documents', href: '#/documents/center' }, { label: 'Print view' }];
    },
  });

  // ---------- registrations ----------
  App.register('sales/dashboard', { group: 'Sales', label: 'Dashboard', render: salesDashboard });
  App.register('sales/customers', { group: 'Sales', label: 'Customers', render: customersPage });
  App.register('accounting/dashboard', { group: 'Accounting', label: 'Dashboard', render: accountingDashboard });
  App.register('accounting/ledger', { group: 'Accounting', label: 'Ledger', render: ledgerPage });
  App.register('accounting/payables', { group: 'Accounting', label: 'Payables', render: payablesPage });
})();
