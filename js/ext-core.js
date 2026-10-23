/* ext-core.js: shared helpers, seed data and hooks for the extra modules
   (customers in full, purchase invoices, accounting, manufacturing, maintenance, FMS,
   contacts, documents). Loaded after the original page files, so its register() calls
   replace the older screens with the same key. */
(function (global) {
  'use strict';
  const { esc, badge, modal, drawer, toast, kpi, card, barChart } = UI;
  const money = DB.money;
  const L = (c) => DB.list(c) || [];
  const today = () => DB.today();
  const shift = (n, base) => DB.shift(n, base);
  const TAX = DB.TAX_RATE;
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const rid = (p) => p + Math.random().toString(36).slice(2, 7).toUpperCase();
  const sel = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
  const dsel = (arr) => arr.map((x) => ({ value: x, label: x }));
  const opt = (arr, label, value = (x) => x.id) => arr.map((x) => ({ value: value(x), label: label(x) }));
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const custName = (id) => DB.customer(id)?.name || '—';
  const vendorName = (id) => DB.vendor(id)?.name || '—';
  const empName = (id) => DB.employee(id)?.name || '—';
  const sBal = (i) => i.amount - i.paid;
  const pBal = (p) => p.amount - p.paid;
  const purchaseStatus = (p) => {
    if (pBal(p) <= 0) return 'Paid';
    if (p.paid > 0) return 'Partial';
    return p.dueDate < today() ? 'Overdue' : 'Unpaid';
  };
  const monthsBack = (n) => Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i));
    return d.toISOString().slice(0, 7);
  });
  const monthName = (k) => new Date(k + '-01').toLocaleString('en-IN', { month: 'short' });
  const inMonth = (date, k) => String(date || '').slice(0, 7) === k;
  const copy = (text) => `<button class="btn ghost xs" data-copy="${esc(text)}">Copy</button>`;
  const waLink = (phone) => {
    const d = digits(phone);
    if (!d) return '';
    return `https://wa.me/${d.length === 10 ? '91' + d : d}`;
  };

  // Dashboard page: KPI row + chart row, same look on every module
  // Working section on a module dashboard: every screen of the module as a tab, rendered in place
  // (add, edit, delete, documents, print all work here). The last tab used is remembered.
  const wsLast = {};
  function workspace(el) {
    if (UI.target) return; // already inside a workspace: nested dashboards must not build another
    const key = location.hash.replace(/^#\/?/, '');
    const routes = App.routes();
    const group = routes[key]?.group;
    if (!group) return;
    const subs = Object.entries(routes).filter(([k, r]) => r.group === group && k !== key && r.label !== 'Dashboard');
    if (!subs.length) return;
    const wrap = document.createElement('section');
    wrap.className = 'workspace';
    wrap.innerHTML = `
      <h2 class="section-title">Work in ${esc(group)}</h2>
      <div class="ws-tabs" role="tablist">${subs.map(([k, r]) =>
        `<button class="ws-tab" role="tab" data-ws="${esc(k)}">${esc(r.label)}</button>`).join('')}</div>
      <div class="ws-body"></div>`;
    el.appendChild(wrap);
    const body = wrap.querySelector('.ws-body');
    const show = (k) => {
      wsLast[group] = k;
      wrap.querySelectorAll('.ws-tab').forEach((b) => b.classList.toggle('on', b.dataset.ws === k));
      body.innerHTML = '';
      const prev = UI.target;
      UI.target = body;
      try { routes[k].render(body); } catch (err) {
        console.error(err);
        body.insertAdjacentHTML('beforeend', `<div class="card"><p class="muted">${esc(err.message)}</p></div>`);
      } finally { UI.target = prev; }
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ws]');
      if (b) show(b.dataset.ws);
    });
    const first = subs.find(([k]) => k === wsLast[group]) || subs[0];
    show(first[0]);
  }

  function dashboard(el, { title, desc, actions = '', kpis = [], charts = [], lists = '' }) {
    UI.head(title, desc, actions);
    el.insertAdjacentHTML('beforeend', `
      <div class="grid four">${kpis.join('')}</div>
      ${charts.length ? `<div class="grid two">${charts.join('')}</div>` : ''}
      ${lists}`);
    UI.animateCounts(el);
    workspace(el);
  }

  // Copy buttons inside any element (works in the published preview)
  function wireCopy(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      navigator.clipboard?.writeText(b.dataset.copy).then(
        () => toast('Copied'), () => toast('Copy blocked here. Select the text instead.', 'warn'));
    });
  }

  // Row actions = extra actions first, then the standard Edit / Reverse / Delete
  function rowActionsWith(coll, extras) {
    const base = UI_rowActions(coll);
    return (row) => [...extras(row), ...base(row)];
  }
  function UI_rowActions(coll) { return CRUD.rowActions(coll); }

  // Seed data for collections added in this version. Runs once per save, idempotent.
  function ensureExtras() {
    DB.ensure('purchaseInvoices', L('purchaseOrders').filter((p) => p.status === 'Received').map((po, i) => ({
      id: 'PI' + (i + 1), poId: po.id, vendorId: po.vendorId, date: po.received, dueDate: shift(30, po.received),
      amount: Math.round(DB.poTotal(po) * (1 + TAX)), paid: i % 2 ? Math.round(DB.poTotal(po) * (1 + TAX)) : 0,
    })));
    DB.ensure('expenses', [
      { id: 'EX1', date: shift(-4), category: 'Rent', payee: 'Warehouse landlord', amount: 45000, note: 'Monthly rent' },
      { id: 'EX2', date: shift(-9), category: 'Utilities', payee: 'Power board', amount: 12850, note: 'Electricity' },
      { id: 'EX3', date: shift(-15), category: 'Transport', payee: 'Local carrier', amount: 8200, note: 'Dispatch vehicle' },
      { id: 'EX4', date: shift(-40), category: 'Salaries', payee: 'Payroll', amount: 186000, note: 'Monthly payroll' },
      { id: 'EX5', date: shift(-70), category: 'Rent', payee: 'Warehouse landlord', amount: 45000, note: 'Monthly rent' },
      { id: 'EX6', date: shift(-100), category: 'Maintenance', payee: 'Service crew', amount: 6400, note: 'Pallet racks repair' },
    ]);
    DB.ensure('assets', [
      { id: 'MC1', name: 'Packing line 1', location: 'Warehouse A', make: 'PackTech', serviceEvery: 30, lastService: shift(-25), status: 'Running' },
      { id: 'MC2', name: 'Mixer 200 L', location: 'Warehouse B', make: 'MixRight', serviceEvery: 60, lastService: shift(-70), status: 'Running' },
      { id: 'MC3', name: 'Labelling machine', location: 'Warehouse A', make: 'LabelPro', serviceEvery: 45, lastService: shift(-10), status: 'Under maintenance' },
    ]);
    DB.ensure('tickets', [
      { id: 'MT1', assetId: 'MC3', issue: 'Label head jams on roll change', priority: 'High', status: 'In progress', opened: shift(-2), cost: 1800 },
      { id: 'MT2', assetId: 'MC1', issue: 'Conveyor belt slipping', priority: 'Medium', status: 'Open', opened: shift(-1), cost: 0 },
      { id: 'MT3', assetId: 'MC2', issue: 'Routine oil change', priority: 'Low', status: 'Closed', opened: shift(-20), closed: shift(-19), cost: 900 },
    ]);
    DB.ensure('workOrders', []);
    DB.ensure('boms', []);
    DB.ensure('documents', []);
    // A finished product with a bill of materials, so manufacturing has something to make
    if (!L('products').some((p) => p.sku === 'KIT-DESK')) {
      const office = L('products').find((p) => p.category === 'Office');
      const pack = L('products').find((p) => p.category === 'Packaging');
      const kit = DB.add('products', 'P', { sku: 'KIT-DESK', name: 'Desk Organiser Kit', category: 'Office', cost: 300, price: 650, reorder: 5, active: true }, 'Seed: kit product');
      const comps = [office && { productId: office.id, qty: 2 }, pack && { productId: pack.id, qty: 1 }].filter(Boolean);
      if (comps.length) DB.add('boms', 'BOM', { productId: kit.id, components: comps }, 'Seed: bill of materials');
    }
  }

  // Run the seeds after the app starts, and again after "Reset demo data"
  const origStart = App.start;
  App.start = () => { origStart(); ensureExtras(); App.refresh(); };
  const origReset = DB.reset;
  DB.reset = () => { origReset(); ensureExtras(); };

  // Export to shared namespace
  global.EXT = {
    L, today, shift, TAX, sum, rid, sel, dsel, opt, digits, custName, vendorName, empName,
    sBal, pBal, purchaseStatus, monthsBack, monthName, inMonth, copy, waLink, dashboard, wireCopy,
    rowActionsWith, ensureExtras, money, esc, badge, modal, drawer, toast, kpi, card, barChart,
    define(name, schema) { CRUD.SCHEMA[name] = schema; },
  };
})(window);
