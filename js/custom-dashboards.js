/* custom-dashboards.js: build dashboards for any module (Sales, IMS, PMS, FMS, Maintenance, People...),
   delete them, and show or hide any built-in screen. Everything is saved in this browser (localStorage). */
(function (global) {
  'use strict';
  const { esc, kpi, card, barChart, meter, toast } = UI;
  const money = DB.money;
  const BOARDS_KEY = 'erp-custom-dashboards';
  const HIDDEN_KEY = 'erp-hidden-screens';
  const NEVER_HIDE = ['overview/dashboard', 'custom/manage', 'custom/screens', 'custom/import'];

  // Values are kept in memory too, so changes still work when browser storage is blocked (e.g. inside a preview).
  const mem = {};
  const load = (key, fallback) => {
    if (!(key in mem)) {
      try { const raw = localStorage.getItem(key); mem[key] = raw === null ? fallback : JSON.parse(raw); }
      catch (e) { mem[key] = fallback; }
    }
    return mem[key];
  };
  const save = (key, value) => {
    mem[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* blocked: kept in memory for this visit */ }
  };
  const uid = () => 'cd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const arr = (c) => DB.list(c) || [];
  const sum = (xs, fn) => xs.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
  const daysAgo = (d) => (Date.now() - new Date(d)) / 864e5;

  // ---------- widget catalogue, grouped by module ----------
  const MODULES = {
    Sales: 'Sales', IMS: 'Inventory (IMS)', PMS: 'Purchase & production (PMS)', Maintenance: 'Maintenance',
    FMS: 'Finance (FMS)', People: 'People',
  };
  const METRICS = {
    revenue:      { mod: 'Sales', label: 'Revenue invoiced', kind: 'kpi', hint: 'all invoices', value: () => money(sum(arr('invoices'), (i) => i.amount)) },
    outstanding:  { mod: 'Sales', label: 'Customer outstanding', kind: 'kpi', hint: 'unpaid amount', value: () => money(sum(arr('invoices'), (i) => i.amount - i.paid)) },
    overdue:      { mod: 'Sales', label: 'Overdue invoices', kind: 'kpi', hint: 'past due date', tone: 'bad', value: () => arr('invoices').filter((i) => DB.invoiceStatus(i) === 'Overdue').length },
    orders:       { mod: 'Sales', label: 'Sales orders', kind: 'kpi', hint: 'all orders', value: () => arr('orders').length },
    customers:    { mod: 'Sales', label: 'Customers', kind: 'kpi', hint: 'in directory', value: () => arr('customers').length },
    salesChart:   { mod: 'Sales', label: 'Sales, last 30 days', kind: 'chart', render: () => {
      const days = Array.from({ length: 30 }, (_, i) => DB.shift(i - 29));
      const vals = days.map((d) => sum(arr('orders').filter((o) => o.date === d && o.status !== 'Pending'), (o) => DB.orderSubtotal(o)));
      return barChart(days.map((d, i) => (i % 5 === 4 ? d.slice(8) : '')), vals, { fmt: money });
    } },

    stockValue:   { mod: 'IMS', label: 'Stock value', kind: 'kpi', hint: 'at cost', value: () => money(sum(DB.stockRows(), (r) => Math.max(0, r.qty) * r.product.cost)) },
    products:     { mod: 'IMS', label: 'Products', kind: 'kpi', hint: 'in catalogue', value: () => arr('products').length },
    reorder:      { mod: 'IMS', label: 'Items to reorder', kind: 'kpi', hint: 'at or below reorder level', tone: 'warn', value: () => arr('products').filter((p) => DB.totalStock(p.id) <= p.reorder).length },
    movements:    { mod: 'IMS', label: 'Stock movements', kind: 'kpi', hint: 'all recorded', value: () => arr('movements').length },
    stockChart:   { mod: 'IMS', label: 'Stock value by category', kind: 'chart', render: () => {
      const cats = [...new Set(arr('products').map((p) => p.category))];
      const vals = cats.map((c) => sum(DB.stockRows().filter((r) => r.product.category === c), (r) => Math.max(0, r.qty) * r.product.cost));
      const max = Math.max(1, ...vals);
      return cats.map((c, i) => `<div class="track-row"><span>${esc(c)}</span>${meter(Math.round((vals[i] / max) * 100))}<strong>${money(vals[i])}</strong></div>`).join('');
    } },

    openPOs:      { mod: 'PMS', label: 'Open purchase orders', kind: 'kpi', hint: 'not yet received', value: () => arr('purchaseOrders').filter((p) => p.status !== 'Received').length },
    purchaseDue:  { mod: 'PMS', label: 'Vendor payables', kind: 'kpi', hint: 'unpaid purchase invoices', tone: 'warn', value: () => money(sum(arr('purchaseInvoices'), (p) => p.amount - p.paid)) },
    vendors:      { mod: 'PMS', label: 'Vendors', kind: 'kpi', hint: 'in directory', value: () => arr('vendors').length },
    woPlanned:    { mod: 'PMS', label: 'Work orders planned', kind: 'kpi', hint: 'waiting to start', value: () => arr('workOrders').filter((w) => w.status === 'Planned').length },
    woProgress:   { mod: 'PMS', label: 'Work orders in progress', kind: 'kpi', hint: 'running now', tone: 'warn', value: () => arr('workOrders').filter((w) => w.status === 'In progress').length },
    woDone:       { mod: 'PMS', label: 'Work orders completed', kind: 'kpi', hint: 'finished', tone: 'good', value: () => arr('workOrders').filter((w) => w.status === 'Completed').length },
    unitsMade:    { mod: 'PMS', label: 'Units produced', kind: 'kpi', hint: 'completed work orders', value: () => sum(arr('workOrders').filter((w) => w.status === 'Completed'), (w) => w.qty) },

    assets:       { mod: 'Maintenance', label: 'Machines', kind: 'kpi', hint: 'registered', value: () => arr('assets').length },
    openTickets:  { mod: 'Maintenance', label: 'Open maintenance tickets', kind: 'kpi', hint: 'not yet closed', tone: 'warn', value: () => arr('tickets').filter((t) => t.status !== 'Closed').length },
    servicesDue:  { mod: 'Maintenance', label: 'Services due in 7 days', kind: 'kpi', hint: 'based on service interval', tone: 'warn', value: () => arr('assets').filter((a) => a.lastService && a.serviceEvery && daysAgo(a.lastService) >= a.serviceEvery - 7).length },

    expenseTotal: { mod: 'FMS', label: 'Expenses', kind: 'kpi', hint: 'all recorded', value: () => money(sum(arr('expenses'), (e) => e.amount)) },
    expenseCount: { mod: 'FMS', label: 'Expense entries', kind: 'kpi', hint: 'count', value: () => arr('expenses').length },
    expenseChart: { mod: 'FMS', label: 'Expenses by category', kind: 'chart', render: () => {
      const cats = [...new Set(arr('expenses').map((e) => e.category || 'Other'))];
      const vals = cats.map((c) => sum(arr('expenses').filter((e) => (e.category || 'Other') === c), (e) => e.amount));
      const max = Math.max(1, ...vals);
      return cats.map((c, i) => `<div class="track-row"><span>${esc(c)}</span>${meter(Math.round((vals[i] / max) * 100))}<strong>${money(vals[i])}</strong></div>`).join('');
    } },

    employees:    { mod: 'People', label: 'Employees', kind: 'kpi', hint: 'on roll', value: () => arr('employees').length },
    leave:        { mod: 'People', label: 'Pending leave', kind: 'kpi', hint: 'awaiting approval', tone: 'warn', value: () => arr('leaves').filter((l) => l.status === 'Pending').length },
  };

  // Presets: one click picks the widgets for a module type
  const PRESETS = {
    blank: { label: 'Blank (choose your own)', metrics: [] },
    Sales: { label: 'Sales', metrics: ['revenue', 'outstanding', 'overdue', 'orders', 'customers', 'salesChart'] },
    IMS: { label: 'Inventory (IMS)', metrics: ['stockValue', 'products', 'reorder', 'movements', 'stockChart'] },
    PMS: { label: 'Purchase & production (PMS)', metrics: ['openPOs', 'purchaseDue', 'vendors', 'woPlanned', 'woProgress', 'woDone', 'unitsMade'] },
    Maintenance: { label: 'Maintenance', metrics: ['assets', 'openTickets', 'servicesDue'] },
    FMS: { label: 'Finance (FMS)', metrics: ['expenseTotal', 'expenseCount', 'expenseChart', 'outstanding', 'purchaseDue'] },
    People: { label: 'People', metrics: ['employees', 'leave'] },
  };

  const widgetHtml = (w) => {
    const m = METRICS[w.metric];
    if (!m) return '';
    const rm = `<button type="button" class="btn ghost sm cd-rm" data-rm="${w.id}" aria-label="Remove ${esc(m.label)}">Remove</button>`;
    if (m.kind === 'kpi') return `<div class="cd-wrap">${kpi(m.label, m.value(), m.hint, m.tone || '')}${rm}</div>`;
    return `<div class="cd-wrap cd-chart">${card(m.label, m.render(), rm)}</div>`;
  };

  const metricOptions = () => Object.entries(MODULES).map(([mk, ml]) =>
    `<optgroup label="${esc(ml)}">${Object.entries(METRICS).filter(([, m]) => m.mod === mk)
      .map(([k, m]) => `<option value="${k}">${esc(m.label)}</option>`).join('')}</optgroup>`).join('');

  // ---------- one custom dashboard ----------
  function boardPage(el, id) {
    const board = load(BOARDS_KEY, []).find((b) => b.id === id);
    if (!board) { App.navigate('custom/manage'); return; }
    UI.head(board.name, `${board.widgets.length} widget(s)`, `
      <select class="form-select" data-add aria-label="Add widget" style="width:auto;max-width:100%">
        <option value="">+ Add widget</option>${metricOptions()}</select>
      <button class="btn ghost" data-export>Export</button>
      <button class="btn ghost" data-del>Delete dashboard</button>`);
    el.querySelector('[data-export]').onclick = () => exportBoard(board);

    const kpis = board.widgets.filter((w) => METRICS[w.metric]?.kind === 'kpi');
    const charts = board.widgets.filter((w) => METRICS[w.metric]?.kind === 'chart');
    el.insertAdjacentHTML('beforeend', board.widgets.length ? `
      ${kpis.length ? `<div class="grid four">${kpis.map(widgetHtml).join('')}</div>` : ''}
      ${charts.length ? `<div class="grid two">${charts.map(widgetHtml).join('')}</div>` : ''}`
      : '<div class="card"><p class="muted">This dashboard is empty. Use “Add widget” above to start.</p></div>');

    el.querySelector('[data-add]').onchange = (e) => {
      if (!e.target.value) return;
      const list = load(BOARDS_KEY, []);
      list.find((x) => x.id === id).widgets.push({ id: uid(), metric: e.target.value });
      save(BOARDS_KEY, list);
      App.refresh();
    };
    el.querySelectorAll('[data-rm]').forEach((btn) => btn.onclick = () => {
      const list = load(BOARDS_KEY, []);
      const b = list.find((x) => x.id === id);
      b.widgets = b.widgets.filter((w) => w.id !== btn.dataset.rm);
      save(BOARDS_KEY, list);
      App.refresh();
    });
    el.querySelector('[data-del]').onclick = () => {
      if (confirm(`Delete the dashboard “${board.name}”? Its widgets are removed too.`)) deleteBoard(id);
    };
  }

  // ---------- manage: create and delete dashboards ----------
  function managePage(el) {
    const list = load(BOARDS_KEY, []);
    UI.head('Custom dashboards', 'Build a dashboard for any module, or delete one you no longer need.',
      '<a class="btn ghost" href="#/custom/import">Import</a><a class="btn ghost" href="#/custom/screens">Show or hide screens</a>');
    const presetOptions = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
    const checkboxes = Object.entries(MODULES).map(([mk, ml]) => `
      <fieldset class="cd-group"><legend>${esc(ml)}</legend>
        ${Object.entries(METRICS).filter(([, m]) => m.mod === mk).map(([k, m]) =>
          `<label class="check"><input type="checkbox" name="w" value="${k}"> ${esc(m.label)}</label>`).join('')}
      </fieldset>`).join('');

    el.insertAdjacentHTML('beforeend', `
      <div class="grid two">
        ${card('Your dashboards', list.length ? `<ul class="timeline">${list.map((b) => `
          <li><a href="#/custom/${b.id}"><strong>${esc(b.name)}</strong></a> · ${b.widgets.length} widget(s)
            <button type="button" class="btn ghost sm" data-del="${b.id}" style="margin-left:.5rem">Delete</button></li>`).join('')}</ul>`
          : '<p class="muted">You have no custom dashboards yet.</p>')}
        ${card('New dashboard', `
          <form id="cd-new" class="auth-form" novalidate>
            <label>Name<input name="name" required maxlength="60" placeholder="e.g. Tata plant production"></label>
            <label>Start from<select name="preset" class="form-select">${presetOptions}</select></label>
            <p class="muted small">Widgets (tick to include; you can add or remove them later):</p>
            ${checkboxes}
            <p class="form-error" id="cd-error" hidden></p>
            <button class="btn primary" type="submit">Create dashboard</button>
          </form>`)}
      </div>`);

    const form = el.querySelector('#cd-new');
    const applyPreset = (key) => {
      const picked = new Set(PRESETS[key]?.metrics || []);
      form.querySelectorAll('input[name=w]').forEach((c) => { c.checked = picked.has(c.value); });
    };
    applyPreset(form.preset.value);
    form.preset.onchange = (e) => applyPreset(e.target.value);

    el.querySelectorAll('[data-del]').forEach((btn) => btn.onclick = () => {
      const b = list.find((x) => x.id === btn.dataset.del);
      if (b && confirm(`Delete the dashboard “${b.name}”?`)) deleteBoard(b.id);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      const picked = [...form.querySelectorAll('input[name=w]:checked')].map((c) => c.value);
      const err = el.querySelector('#cd-error');
      if (!name) { err.textContent = 'Please enter a name.'; err.hidden = false; return; }
      const board = { id: uid(), name, widgets: picked.map((metric) => ({ id: uid(), metric })) };
      save(BOARDS_KEY, [...list, board]);
      registerBoard(board);
      toast(`Created “${name}”`);
      App.navigate('custom/' + board.id);
      App.refresh();
    };
  }

  // ---------- show or hide built-in screens (the way to remove a built-in dashboard) ----------
  function screensPage(el) {
    const hidden = new Set(load(HIDDEN_KEY, []));
    const routes = App.routes();
    const keys = Object.keys(routes).filter((k) => !k.startsWith('custom/') && k !== 'detail');
    const groups = {};
    keys.forEach((k) => { const g = routes[k].group || 'Overview'; (groups[g] = groups[g] || []).push(k); });
    UI.head('Show or hide screens', 'Hidden screens are removed from the sidebar and Home. Their data is kept, and you can show them again here.',
      '<button class="btn ghost" data-show-all>Show all</button>');
    el.insertAdjacentHTML('beforeend', Object.entries(groups).map(([g, ks]) => card(g, ks.map((k) => {
      const label = routes[k].label || k;
      const locked = NEVER_HIDE.includes(k);
      return `<div class="form-check form-switch cd-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="s-${esc(k)}" data-screen="${esc(k)}"
          ${hidden.has(k) ? '' : 'checked'} ${locked ? 'disabled' : ''}>
        <label class="form-check-label" for="s-${esc(k)}">${esc(label)} <span class="muted small">${esc(k)}</span>
          ${locked ? '<span class="badge neutral">always on</span>' : ''}</label></div>`;
    }).join(''))).join(''));

    el.querySelectorAll('[data-screen]').forEach((box) => box.onchange = () => {
      const set = new Set(load(HIDDEN_KEY, []));
      box.checked ? set.delete(box.dataset.screen) : set.add(box.dataset.screen);
      save(HIDDEN_KEY, [...set]);
      applyHidden();
      App.refresh();
    });
    el.querySelector('[data-show-all]').onclick = () => { save(HIDDEN_KEY, []); applyHidden(); App.refresh(); App.navigate('custom/screens'); };
  }

  // ---------- routes ----------
  function applyHidden() {
    const hidden = new Set(load(HIDDEN_KEY, []));
    const routes = App.routes();
    Object.keys(routes).forEach((k) => { routes[k].hidden = hidden.has(k) && !NEVER_HIDE.includes(k); });
  }
  function registerBoard(b) {
    App.register('custom/' + b.id, { group: null, label: b.name, icon: '▣', render: (el) => boardPage(el, b.id) });
  }
  function deleteBoard(id) {
    save(BOARDS_KEY, load(BOARDS_KEY, []).filter((b) => b.id !== id));
    delete App.routes()['custom/' + id];
    App.navigate('custom/manage');
    App.refresh();
  }

  // ---------- export and import one dashboard as a .json file ----------
  function exportBoard(b) {
    const data = JSON.stringify({ type: 'erp-dashboard', version: 1, name: b.name, widgets: b.widgets.map((w) => ({ metric: w.metric })) }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = (b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'dashboard') + '.dashboard.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Dashboard exported');
  }
  function importBoard(obj) {
    if (!obj || obj.type !== 'erp-dashboard' || !Array.isArray(obj.widgets)) throw new Error('This file is not an ERP dashboard export.');
    const widgets = obj.widgets.filter((w) => w && METRICS[w.metric]).map((w) => ({ id: uid(), metric: w.metric }));
    const board = { id: uid(), name: String(obj.name || 'Imported dashboard').slice(0, 60), widgets };
    save(BOARDS_KEY, [...load(BOARDS_KEY, []), board]);
    registerBoard(board);
    return { board, skipped: obj.widgets.length - widgets.length };
  }
  global.DashBuilder = { exportBoard, importBoard, METRICS };

  App.register('custom/manage', { group: null, label: 'Custom dashboards', icon: '+', render: managePage });
  App.register('custom/screens', { group: null, label: 'Show or hide screens', icon: '◎', render: screensPage });
  load(BOARDS_KEY, []).forEach(registerBoard);
  applyHidden();

  // Used by home.js so hidden screens also disappear from the Home grid
  global.ScreenPrefs = { isHidden: (route) => new Set(load(HIDDEN_KEY, [])).has(route) && !NEVER_HIDE.includes(route) };
})(window);
