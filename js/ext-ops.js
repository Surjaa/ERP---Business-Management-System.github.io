/* ext-ops.js: Manufacturing (dashboard, work orders, bill of materials), Maintenance (dashboard,
   machines, tickets), FMS (finance dashboard, expenses), Contacts (directory), plus dashboards
   for Purchase, Inventory and Attendance. */
(function () {
  'use strict';
  const X = EXT;
  const { L, today, shift, sum, sel, dsel, opt, custName, vendorName, empName, sBal, pBal, purchaseStatus, monthsBack, monthName,
    inMonth, copy, waLink, dashboard, wireCopy, rowActionsWith, money, esc, badge, modal, drawer, toast, kpi, card, barChart } = X;
  const { renderTable } = UI;

  // =====================  MANUFACTURING  =====================
  const bomFor = (pid) => L('boms').find((b) => b.productId === pid);
  const finished = () => L('products').filter((p) => bomFor(p.id));
  const WO_STATUS = ['Planned', 'In progress', 'Completed'];

  CRUD.SCHEMA.workOrders = {
    name: 'work order', label: (w) => `${w.id} · ${DB.product(w.productId)?.name || ''}`,
    canEdit: (w) => w.status === 'Planned',
    fields: () => [
      sel('productId', 'Finished product', opt(finished(), (p) => `${p.sku} · ${p.name}`)),
      { name: 'qty', label: 'Quantity to make', type: 'number', min: 1, step: 1, required: true },
      { name: 'date', label: 'Planned date', type: 'date', required: true },
    ],
    get: (w) => ({ ...w }),
    note: () => 'Only planned work orders can be changed. Start a work order to consume its components.',
    build: (v) => ({ productId: v.productId, qty: Number(v.qty), date: v.date, bomId: bomFor(v.productId)?.id }),
    create: (v) => DB.add('workOrders', 'WO', { ...CRUD.SCHEMA.workOrders.build(v), status: 'Planned' }, 'Work order planned'),
    blocked: (w) => (w.status !== 'Planned' ? `${w.id} is ${w.status}. Only planned work orders can be deleted.` : null),
  };

  // Start: take the components out of stock. Complete: put the finished product in.
  function startWO(w) {
    const bom = L('boms').find((b) => b.id === w.bomId) || bomFor(w.productId);
    if (!bom) return toast('No bill of materials for this product', 'warn');
    try {
      bom.components.forEach((c) => DB.addMovement({ type: 'OUT', productId: c.productId, warehouseId: w.warehouseId || L('warehouses')[0].id, qty: c.qty * w.qty, date: today(), ref: w.id, note: 'Used in ' + w.id }));
      DB.update('workOrders', w.id, { status: 'In progress', started: today(), warehouseId: w.warehouseId || L('warehouses')[0].id }, `${w.id} started`);
      toast(`${w.id} started, components issued`); App.refresh();
    } catch (e) { toast(e.message, 'bad'); }
  }
  function completeWO(w) {
    DB.addMovement({ type: 'IN', productId: w.productId, warehouseId: w.warehouseId || L('warehouses')[0].id, qty: w.qty, date: today(), ref: w.id, note: 'Produced in ' + w.id });
    DB.update('workOrders', w.id, { status: 'Completed', completed: today() }, `${w.id} completed`);
    toast(`${w.id} completed, ${w.qty} added to stock`); App.refresh();
  }

  function manufacturingDashboard(el) {
    const wos = L('workOrders');
    const finishedStock = sum(finished(), (p) => DB.totalStock(p.id));
    const lowParts = L('products').filter((p) => DB.totalStock(p.id) < p.reorder).length;
    dashboard(el, {
      title: 'Manufacturing dashboard', desc: 'Work orders, output and the parts that limit production.',
      actions: '<a class="btn primary" href="#/manufacturing/orders">Work orders</a>',
      kpis: [
        kpi('Open work orders', wos.filter((w) => w.status !== 'Completed').length, 'planned or running', 'warn'),
        kpi('Completed', wos.filter((w) => w.status === 'Completed').length, '', 'good'),
        kpi('Finished goods on hand', finishedStock),
        kpi('Parts below reorder', lowParts, '', lowParts ? 'bad' : ''),
      ],
      charts: [
        card('Work orders by status', barChart(WO_STATUS, WO_STATUS.map((s) => wos.filter((w) => w.status === s).length))),
        card('Bill of materials', `<ul class="timeline">${L('boms').map((b) => `<li>${esc(DB.product(b.productId)?.name)} · ${b.components.length} components</li>`).join('') || '<li class="muted">No BOM yet</li>'}</ul>`),
      ],
    });
  }

  function workOrdersPage(el) {
    dashboard(el, {
      title: 'Work orders', desc: 'Plan production. Starting issues components from stock; completing adds finished goods.',
      actions: '<button class="btn primary" data-new>+ New work order</button>',
      kpis: [
        kpi('Planned', L('workOrders').filter((w) => w.status === 'Planned').length),
        kpi('In progress', L('workOrders').filter((w) => w.status === 'In progress').length, '', 'warn'),
        kpi('Completed', L('workOrders').filter((w) => w.status === 'Completed').length, '', 'good'),
        kpi('Units produced', sum(L('workOrders').filter((w) => w.status === 'Completed'), (w) => w.qty)),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'workorders', exportName: 'work-orders', rows: () => [...L('workOrders')].reverse(), pageSize: 8,
      search: [(w) => w.id, (w) => DB.product(w.productId)?.name],
      filters: [{ key: 'status', label: 'Status', get: (w) => w.status, options: WO_STATUS }],
      columns: [
        { key: 'id', label: 'Work order' },
        { key: 'product', label: 'Product', value: (w) => DB.product(w.productId)?.name },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'date', label: 'Planned' },
        { key: 'status', label: 'Status', render: (w) => badge(w.status) },
      ],
      rowActions: rowActionsWith('workOrders', (w) => [
        ...(w.status === 'Planned' ? [{ label: 'Start', run: startWO }] : []),
        ...(w.status === 'In progress' ? [{ label: 'Complete', run: completeWO }] : []),
      ]),
    });
    el.querySelector('[data-new]').onclick = () => CRUD.create('workOrders');
  }

  function bomPage(el) {
    dashboard(el, {
      title: 'Bill of materials', desc: 'What each finished product is made from.',
      actions: '<button class="btn primary" data-new>+ New BOM</button>',
      kpis: [kpi('Finished products', L('boms').length), kpi('Components used', new Set(L('boms').flatMap((b) => b.components.map((c) => c.productId))).size)],
    });
    el.insertAdjacentHTML('beforeend', `<div class="grid two">${L('boms').map((b) => card(DB.product(b.productId)?.name || '—', `
      <table class="mini"><thead><tr><th>Component</th><th class="num">Per unit</th><th class="num">On hand</th></tr></thead><tbody>
      ${b.components.map((c) => `<tr><td>${esc(DB.product(c.productId)?.name)}</td><td class="num">${c.qty}</td><td class="num">${DB.totalStock(c.productId)}</td></tr>`).join('')}
      </tbody></table>`)).join('') || '<p class="muted">No bill of materials yet.</p>'}</div>`);
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New bill of materials', submitLabel: 'Save BOM',
      fields: [
        sel('productId', 'Finished product', opt(L('products'), (p) => `${p.sku} · ${p.name}`)),
        { name: 'lines', label: 'Components (qty per unit)', type: 'lines', full: true, options: L('products').map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, price: 0 })), value: [] },
      ],
      onSubmit: (v) => {
        const comps = v.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: l.qty }));
        if (!comps.length) throw new Error('Add at least one component');
        if (comps.some((c) => c.productId === v.productId)) throw new Error('A product cannot be its own component');
        if (bomFor(v.productId)) throw new Error('This product already has a BOM');
        DB.add('boms', 'BOM', { productId: v.productId, components: comps }, 'BOM saved');
        toast('BOM saved'); App.refresh();
      },
    });
  }

  // =====================  MAINTENANCE  =====================
  CRUD.SCHEMA.assets = {
    name: 'machine', label: (a) => a.name,
    fields: () => [
      { name: 'name', label: 'Machine name', required: true, full: true },
      { name: 'make', label: 'Make / model' },
      { name: 'location', label: 'Location', required: true },
      { name: 'serviceEvery', label: 'Service every (days)', type: 'number', min: 1, step: 1, required: true },
      sel('status', 'Status', dsel(['Running', 'Under maintenance', 'Stopped'])),
    ],
    build: (v) => ({ name: v.name.trim(), make: (v.make || '').trim(), location: v.location.trim(), serviceEvery: Number(v.serviceEvery), status: v.status }),
    create: (v) => DB.add('assets', 'MC', { ...CRUD.SCHEMA.assets.build(v), lastService: today() }, 'Machine added'),
    blocked: (a) => (L('tickets').some((t) => t.assetId === a.id) ? `${a.name} has maintenance tickets. Close them or keep the machine.` : null),
  };
  CRUD.SCHEMA.tickets = {
    name: 'ticket', label: (t) => `${t.id} · ${issueOf(t)}`,
    canEdit: (t) => t.status !== 'Closed',
    fields: () => [
      sel('assetId', 'Machine', opt(L('assets'), (a) => `${a.name} (${a.location})`)),
      { name: 'issue', label: 'What is wrong / what was done', type: 'textarea', full: true, required: true },
      sel('priority', 'Priority', dsel(['Low', 'Medium', 'High'])),
      { name: 'cost', label: 'Cost (₹)', type: 'number', min: 0, step: 1 },
    ],
    get: (t) => ({ ...t }),
    build: (v) => ({ assetId: v.assetId, issue: v.issue.trim(), priority: v.priority, cost: Number(v.cost) || 0 }),
    create: (v) => DB.add('tickets', 'MT', { ...CRUD.SCHEMA.tickets.build(v), status: 'Open', opened: today() }, 'Ticket raised'),
    blocked: (t) => (t.status === 'Closed' ? `${t.id} is closed and kept as history.` : null),
  };
  const issueOf = (t) => (t.issue || '').slice(0, 40);
  const prioTone = (p) => ({ High: 'bad', Medium: 'warn', Low: 'good' })[p] || '';

  function startTicket(t) { DB.update('tickets', t.id, { status: 'In progress' }, `${t.id} started`); DB.update('assets', t.assetId, { status: 'Under maintenance' }, 'Machine under maintenance'); toast('Ticket started'); App.refresh(); }
  function closeTicket(t) {
    DB.update('tickets', t.id, { status: 'Closed', closed: today() }, `${t.id} closed`);
    DB.update('assets', t.assetId, { status: 'Running', lastService: today() }, 'Machine back in service');
    toast('Ticket closed, machine back in service'); App.refresh();
  }
  function logService(a) { DB.update('assets', a.id, { lastService: today(), status: 'Running' }, `Service logged for ${a.name}`); toast('Service logged'); App.refresh(); }
  const nextDue = (a) => shift(a.serviceEvery, a.lastService || today());
  const daysTo = (d) => Math.round((new Date(d) - new Date(today())) / 864e5);

  function maintenanceDashboard(el) {
    const open = L('tickets').filter((t) => t.status !== 'Closed');
    const due = L('assets').filter((a) => daysTo(nextDue(a)) <= 7);
    dashboard(el, {
      title: 'Maintenance dashboard', desc: 'Machine health, open tickets and services due this week.',
      actions: '<a class="btn primary" href="#/maintenance/tickets">Tickets</a>',
      kpis: [
        kpi('Machines running', L('assets').filter((a) => a.status === 'Running').length, '', 'good'),
        kpi('Under maintenance', L('assets').filter((a) => a.status !== 'Running').length, '', 'warn'),
        kpi('Open tickets', open.length, `${open.filter((t) => t.priority === 'High').length} high priority`, open.some((t) => t.priority === 'High') ? 'bad' : ''),
        kpi('Services due in 7 days', due.length, '', due.length ? 'warn' : ''),
      ],
      charts: [
        card('Tickets by status', barChart(['Open', 'In progress', 'Closed'], ['Open', 'In progress', 'Closed'].map((s) => L('tickets').filter((t) => t.status === s).length))),
        card('Maintenance cost by machine', barChart(L('assets').map((a) => a.name), L('assets').map((a) => sum(L('tickets').filter((t) => t.assetId === a.id), (t) => t.cost)), { fmt: money })),
      ],
    });
  }

  function assetsPage(el) {
    dashboard(el, {
      title: 'Machines', desc: 'Every machine, its service schedule and current status.',
      actions: '<button class="btn primary" data-new>+ New machine</button>',
      kpis: [kpi('Machines', L('assets').length), kpi('Services due in 7 days', L('assets').filter((a) => daysTo(nextDue(a)) <= 7).length, '', 'warn')],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'assets', exportName: 'machines', rows: () => L('assets'), pageSize: 8,
      search: ['name', 'make', 'location'],
      filters: [{ key: 'status', label: 'Status', get: (a) => a.status, options: ['Running', 'Under maintenance', 'Stopped'] }],
      columns: [
        { key: 'name', label: 'Machine' },
        { key: 'make', label: 'Make' },
        { key: 'location', label: 'Location' },
        { key: 'lastService', label: 'Last service' },
        { key: 'next', label: 'Next service', value: nextDue, render: (a) => `${nextDue(a)} ${daysTo(nextDue(a)) <= 7 ? badge('Due') : ''}` },
        { key: 'status', label: 'Status', render: (a) => badge(a.status) },
      ],
      rowActions: rowActionsWith('assets', (a) => [{ label: 'Log service', run: logService }]),
    });
    el.querySelector('[data-new]').onclick = () => CRUD.create('assets');
  }

  function ticketsPage(el) {
    dashboard(el, {
      title: 'Maintenance tickets', desc: 'Raise a ticket, start the work, close it when the machine is back.',
      actions: '<button class="btn primary" data-new>+ New ticket</button>',
      kpis: [
        kpi('Open', L('tickets').filter((t) => t.status === 'Open').length, '', 'warn'),
        kpi('In progress', L('tickets').filter((t) => t.status === 'In progress').length),
        kpi('High priority', L('tickets').filter((t) => t.priority === 'High' && t.status !== 'Closed').length, '', 'bad'),
        kpi('Closed', L('tickets').filter((t) => t.status === 'Closed').length, '', 'good'),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'tickets', exportName: 'tickets', rows: () => [...L('tickets')].reverse(), pageSize: 8,
      search: [(t) => t.id, (t) => t.issue, (t) => DB.byId('assets', t.assetId)?.name],
      filters: [{ key: 'status', label: 'Status', get: (t) => t.status, options: ['Open', 'In progress', 'Closed'] }],
      columns: [
        { key: 'id', label: 'Ticket' },
        { key: 'asset', label: 'Machine', value: (t) => DB.byId('assets', t.assetId)?.name },
        { key: 'issue', label: 'Issue' },
        { key: 'priority', label: 'Priority', render: (t) => `<span class="badge ${prioTone(t.priority)}">${esc(t.priority)}</span>` },
        { key: 'opened', label: 'Opened' },
        { key: 'cost', label: 'Cost', align: 'right', render: (t) => money(t.cost) },
        { key: 'status', label: 'Status', render: (t) => badge(t.status) },
      ],
      rowActions: rowActionsWith('tickets', (t) => [
        ...(t.status === 'Open' ? [{ label: 'Start', run: startTicket }] : []),
        ...(t.status === 'In progress' ? [{ label: 'Close', run: closeTicket }] : []),
      ]),
    });
    el.querySelector('[data-new]').onclick = () => CRUD.create('tickets');
  }

  // =====================  FMS (financial management)  =====================
  CRUD.SCHEMA.expenses = {
    name: 'expense', label: (e) => `${e.category} · ${money(e.amount)}`,
    fields: () => [
      { name: 'date', label: 'Date', type: 'date', required: true },
      sel('category', 'Category', dsel(['Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Other'])),
      { name: 'payee', label: 'Paid to', required: true },
      { name: 'amount', label: 'Amount (₹)', type: 'number', min: 1, step: '0.01', required: true },
      { name: 'note', label: 'Note', full: true },
    ],
    build: (v) => ({ date: v.date, category: v.category, payee: v.payee.trim(), amount: Number(v.amount), note: (v.note || '').trim() }),
    create: (v) => DB.add('expenses', 'EX', CRUD.SCHEMA.expenses.build(v), 'Expense recorded'),
  };

  function fmsDashboard(el) {
    const months = monthsBack(6);
    const exp = L('expenses');
    const byCat = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Other'];
    const monthExp = months.map((m) => Math.round(sum(exp.filter((e) => inMonth(e.date, m)), (e) => e.amount)));
    const cashIn = sum(L('invoices'), (i) => i.paid);
    const cashOut = sum(L('purchaseInvoices'), (p) => p.paid) + sum(exp, (e) => e.amount);
    const thisMonth = monthExp[monthExp.length - 1];
    const avg = Math.round(sum(monthExp, (x) => x) / monthExp.length);
    dashboard(el, {
      title: 'FMS · Financial management', desc: 'Expenses, cash position and the monthly trend.',
      actions: '<button class="btn primary" data-go="fms/expenses">+ Record expense</button>',
      kpis: [
        kpi('Expenses this month', money(thisMonth), `avg ${money(avg)} / month`, thisMonth > avg ? 'warn' : ''),
        kpi('Cash position', money(cashIn - cashOut), 'receipts − payments', cashIn - cashOut < 0 ? 'bad' : 'good'),
        kpi('Expenses logged', exp.length),
        kpi('Largest category', byCat.map((c) => [c, sum(exp.filter((e) => e.category === c), (e) => e.amount)]).sort((a, b) => b[1] - a[1])[0][0]),
      ],
      charts: [
        card('Expenses by category', barChart(byCat, byCat.map((c) => sum(exp.filter((e) => e.category === c), (e) => e.amount)), { fmt: money })),
        card('Monthly expense trend', barChart(months.map(monthName), monthExp, { fmt: money })),
      ],
    });
    el.querySelector('[data-go]').onclick = () => App.navigate('fms/expenses');
  }

  function expensesPage(el) {
    dashboard(el, {
      title: 'Expenses', desc: 'Every business expense, by category and payee.',
      actions: '<button class="btn primary" data-new>+ New expense</button>',
      kpis: [kpi('Total logged', money(sum(L('expenses'), (e) => e.amount))), kpi('Entries', L('expenses').length)],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'expenses', exportName: 'expenses', rows: () => [...L('expenses')].sort((a, b) => b.date.localeCompare(a.date)), pageSize: 8,
      search: ['payee', 'category', 'note'],
      filters: [{ key: 'category', label: 'Category', get: (e) => e.category, options: ['Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Other'] }],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'category', label: 'Category', render: (e) => badge(e.category) },
        { key: 'payee', label: 'Paid to' },
        { key: 'note', label: 'Note' },
        { key: 'amount', label: 'Amount', align: 'right', render: (e) => money(e.amount) },
      ],
      rowActions: rowActionsWith('expenses', () => []),
    });
    el.querySelector('[data-new]').onclick = () => CRUD.create('expenses');
  }

  // =====================  CONTACTS (optional directory)  =====================
  function contactsPage(el) {
    const people = [
      ...L('customers').map((c) => ({ id: c.id, kind: 'Customer', name: c.name, person: c.contactPerson, phone: c.phone, email: c.email, city: c.city, open: '#/detail/customer/' + c.id })),
      ...L('vendors').map((v) => ({ id: v.id, kind: 'Vendor', name: v.name, person: '', phone: '', email: v.email, city: v.city, open: '#/purchasing/vendors' })),
      ...L('employees').map((e) => ({ id: e.id, kind: 'Employee', name: e.name, person: e.role, phone: '', email: e.email, city: e.dept, open: '#/people/employees' })),
    ];
    const cust = L('customers');
    const followUps = cust.filter((c) => (c.interactions || []).some((i) => i.followUp && i.followUp >= today())).length;
    dashboard(el, {
      title: 'Contacts', desc: 'Customers, vendors and staff in one directory. Call, WhatsApp or email straight from here.',
      kpis: [
        kpi('Customers', cust.length),
        kpi('Vendors', L('vendors').length),
        kpi('Staff', L('employees').length),
        kpi('Customers with follow-ups', followUps, '', followUps ? 'warn' : ''),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'contacts', exportName: 'contacts', rows: () => people, pageSize: 10, selectable: false, rowId: (r) => r.kind + r.id,
      search: ['name', 'person', 'phone', 'email', 'city'],
      filters: [{ key: 'kind', label: 'Kind', get: (r) => r.kind, options: ['Customer', 'Vendor', 'Employee'] }],
      columns: [
        { key: 'kind', label: 'Kind', render: (r) => badge(r.kind) },
        { key: 'name', label: 'Name' },
        { key: 'person', label: 'Contact / role' },
        { key: 'phone', label: 'Phone', sort: false, render: (r) => (r.phone ? `${esc(r.phone)} ${copy(r.phone)}` : '—') },
        { key: 'email', label: 'Email', render: (r) => (r.email ? `${esc(r.email)} ${copy(r.email)}` : '—') },
        { key: 'city', label: 'City / dept' },
      ],
      onRow: (r) => {
        const c = r.kind === 'Customer' ? DB.byId('customers', r.id) : null;
        const wa = c ? waLink(c.whatsapp || c.phone) : '';
        modal({
          title: r.name, body: `<p class="muted">${esc(r.kind)} · ${esc(r.person || '')} ${esc(r.city || '')}</p>
            ${r.phone ? `<p>Phone: ${esc(r.phone)} ${copy(r.phone)}</p>` : ''}
            ${r.email ? `<p>Email: ${esc(r.email)} ${copy(r.email)}</p>` : ''}
            ${wa ? `<p><a class="btn ghost xs" href="${wa}" target="_blank" rel="noopener">Open WhatsApp chat</a></p>` : ''}`,
          actions: [{ label: 'Close', run: null }, { label: 'Open record', primary: true, run: () => { location.hash = r.open; } }],
        });
        wireCopy(document.getElementById('overlay'));
      },
    });
    wireCopy(el);
  }

  // =====================  registrations  =====================
  App.register('purchasing/dashboard', { group: 'Purchase', label: 'Dashboard', render: purchasingDashboard });
  App.register('inventory/dashboard', { group: 'Inventory', label: 'Dashboard', render: inventoryDashboard });
  App.register('people/dashboard', { group: 'Attendance', label: 'Dashboard', render: attendanceDashboard });
  App.register('manufacturing/dashboard', { group: 'Manufacturing', label: 'Dashboard', render: manufacturingDashboard });
  App.register('manufacturing/orders', { group: 'Manufacturing', label: 'Work orders', render: workOrdersPage });
  App.register('manufacturing/bom', { group: 'Manufacturing', label: 'Bill of materials', render: bomPage });
  App.register('maintenance/dashboard', { group: 'Maintenance', label: 'Dashboard', render: maintenanceDashboard });
  App.register('maintenance/assets', { group: 'Maintenance', label: 'Machines', render: assetsPage });
  App.register('maintenance/tickets', { group: 'Maintenance', label: 'Tickets', render: ticketsPage });
  App.register('fms/dashboard', { group: 'FMS', label: 'Dashboard', render: fmsDashboard });
  App.register('fms/expenses', { group: 'FMS', label: 'Expenses', render: expensesPage });
  App.register('contacts/directory', { group: 'Contacts', label: 'Directory', render: contactsPage });

  // Dashboards for the existing modules
  function purchasingDashboard(el) {
    const stats = L('vendors').map((v) => ({ v, s: DB.vendorStats(v.id) }));
    const open = L('purchaseOrders').filter((p) => p.status !== 'Received');
    dashboard(el, {
      title: 'Purchase dashboard', desc: 'Orders, supplier performance and what you owe.',
      actions: '<a class="btn primary" href="#/purchasing/orders">Purchase orders</a>',
      kpis: [
        kpi('Open POs', open.length, `${L('purchaseOrders').filter((p) => p.status === 'Draft').length} drafts`, 'warn'),
        kpi('Total spend', money(stats.reduce((a, x) => a + x.s.spend, 0))),
        kpi('Payables', money(sum(L('purchaseInvoices'), pBal)), '', 'warn'),
        kpi('Vendors', L('vendors').length),
      ],
      charts: [
        card('Spend by vendor', barChart(stats.map((x) => x.v.name.split(' ')[0]), stats.map((x) => Math.round(x.s.spend)), { fmt: money })),
        card('PO status', barChart(['Draft', 'Approved', 'Received'], ['Draft', 'Approved', 'Received'].map((s) => L('purchaseOrders').filter((p) => p.status === s).length))),
      ],
    });
  }

  function inventoryDashboard(el) {
    const rows = DB.stockRows();
    const value = sum(rows, (r) => r.qty * r.product.cost);
    const low = L('products').filter((p) => DB.totalStock(p.id) < p.reorder);
    const whs = L('warehouses');
    dashboard(el, {
      title: 'Inventory dashboard', desc: 'Stock value, low items and warehouse fill.',
      actions: '<a class="btn primary" href="#/inventory/products">Products</a>',
      kpis: [
        kpi('Stock value', money(value)),
        kpi('Products', L('products').length),
        kpi('Low or out of stock', low.length, '', low.length ? 'bad' : 'good'),
        kpi('Warehouses', whs.length),
      ],
      charts: [
        card('Units by warehouse', barChart(whs.map((w) => w.name), whs.map((w) => sum(rows.filter((r) => r.warehouse.id === w.id), (r) => Math.max(0, r.qty))))),
        card('Stock value by category', barChart(['Electronics', 'Hardware', 'Office', 'Packaging'],
          ['Electronics', 'Hardware', 'Office', 'Packaging'].map((c) => sum(rows.filter((r) => r.product.category === c), (r) => r.qty * r.product.cost)), { fmt: money })),
      ],
    });
  }

  function attendanceDashboard(el) {
    const day = L('attendance').map((a) => a.date).sort().pop() || today();
    const rows = L('attendance').filter((a) => a.date === day);
    const count = (s) => rows.filter((a) => a.status === s).length;
    const pendingLeave = L('leaves').filter((l) => l.status === 'Pending');
    dashboard(el, {
      title: 'Attendance dashboard', desc: 'Today’s attendance, leave and the team at a glance.',
      actions: '<a class="btn primary" href="#/people/attendance">Attendance</a>',
      kpis: [
        kpi('Present', count('Present'), day, 'good'),
        kpi('Late', count('Late'), '', 'warn'),
        kpi('Absent', count('Absent'), '', 'bad'),
        kpi('Leave awaiting approval', pendingLeave.length, '', pendingLeave.length ? 'warn' : ''),
      ],
      charts: [
        card('Status on ' + day, barChart(['Present', 'Late', 'Half-day', 'Absent'], ['Present', 'Late', 'Half-day', 'Absent'].map(count))),
        card('Team', `<ul class="timeline">${L('employees').slice(0, 8).map((e) => `<li>${esc(e.name)} · ${esc(e.dept)} · ${badge(e.status)}</li>`).join('')}</ul>`),
      ],
    });
  }

  // data-go buttons inside dashboards
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b && b.dataset.go) App.navigate(b.dataset.go);
  });
})();
