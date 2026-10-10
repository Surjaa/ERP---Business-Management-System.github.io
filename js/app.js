/* app.js: router, sidebar, top bar, command palette (Ctrl+K), notifications, theme.
   Loaded before the page files, which call App.register() to add their screens. */
(function (global) {
  'use strict';
  const { esc, badge, modal, close, toast } = UI;
  const GROUP_ORDER = ['Sales', 'Purchase', 'Accounting', 'Inventory', 'Manufacturing', 'Attendance', 'Maintenance', 'FMS', 'Contacts', 'Documents', 'Reports', 'System'];
  const routes = {};          // key -> {group,label,icon,render}
  let current = null;         // key of the active route
  let pageEl = null;          // container for the active page

  const $ = (sel) => document.querySelector(sel);

  // Page header: written into the active page element by each render()
  UI.target = null; // set while a screen is rendered inside another (module workspace)
  UI.head = (title, desc = '', actions = '') => {
    (UI.target || pageEl).insertAdjacentHTML('beforeend', `
      <div class="page-head">
        <div><h1>${esc(title)}</h1>${desc ? `<p class="muted">${esc(desc)}</p>` : ''}</div>
        <div class="page-actions">${actions}</div>
      </div>`);
  };

  // ---------- router ----------
  function navigate(key) { location.hash = '#/' + key; }
  function parseHash() {
    const k = location.hash.replace(/^#\/?/, '');
    if (k.startsWith('detail/')) return 'detail';
    return routes[k] ? k : 'overview/dashboard';
  }

  function render(opts = {}) {
    current = parseHash();
    const r = routes[current];
    const main = $('#main');
    main.innerHTML = '';
    // screen links for the current module (Dashboard, Customers, Orders...), shown above every module screen
    if (current !== 'overview/dashboard' && routes[current].group) {
      const grp = routes[current].group;
      const links = Object.entries(routes).filter(([, r]) => r.group === grp)
        .map(([k, r]) => '<a class="mod-link' + (k === current ? ' on' : '') + '" href="#/' + k + '"' + (k === current ? ' aria-current="page"' : '') + '>' + r.label + '</a>').join('');
      main.insertAdjacentHTML('beforeend', '<nav class="mod-nav" aria-label="' + grp + ' screens"><span class="mod-nav-title">' + grp + '</span>' + links + '</nav>');
    }
    pageEl = document.createElement('div');
    pageEl.className = opts.animate === false ? 'page' : 'page page-enter';
    main.appendChild(pageEl);
    try {
      r.render(pageEl);
    } catch (err) {
      console.error(err);
      pageEl.insertAdjacentHTML('beforeend', `<div class="card"><h3>Something went wrong</h3><p class="muted">${esc(err.message)}</p></div>`);
    }
    // breadcrumbs + nav highlight
    const crumbParts = r.crumbs
      ? r.crumbs()
      : r.group
        ? [{ label: 'Home', href: '#/overview/dashboard' }, { label: r.group, href: '#/' + (Object.keys(routes).find((k) => routes[k].group === r.group && routes[k].label === 'Dashboard') || Object.keys(routes).find((k) => routes[k].group === r.group)) }, { label: r.label }]
        : [{ label: 'Home' }];
    $('#crumbs').innerHTML = UI.crumbs(crumbParts);
    // department look: background style, colour and the top-bar chip
    if (global.Background) Background.setDepartment(r.group || 'Overview');
    $('#dept-chip').textContent = r.group || 'Overview';
    document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.key === current));
    document.title = `${r.label} · ERP Business Management System`;
    hideMenu();
    updateBell();
  }

  function refresh() { render(); }

  // Close the slide-in menu on phones after a page is chosen (Bootstrap offcanvas)
  function hideMenu() {
    const el = document.getElementById('sidebar');
    if (global.bootstrap && el) global.bootstrap.Offcanvas.getInstance(el)?.hide();
  }

  // ---------- sidebar ----------
  function buildNav() {
    const groups = {};
    Object.entries(routes).forEach(([key, r]) => {
      if (r.hidden) return;
      const g = r.group || 'Overview';
      (groups[g] = groups[g] || []).push({ key, ...r });
    });
    const order = ['Overview', ...GROUP_ORDER];
    $('#nav').innerHTML = order.filter((g) => groups[g]).map((g) => `
      <div class="nav-group"><div class="nav-title">${esc(g)}</div>
        ${groups[g].map((r) => `<a class="nav-link" href="#/${r.key}" data-key="${r.key}">
          <span class="nav-ico" aria-hidden="true">${r.icon || '•'}</span>${esc(r.label)}</a>`).join('')}
      </div>`).join('');
  }

  // ---------- notifications (bell) ----------
  function attentionItems() {
    const items = [];
    DB.list('products').forEach((p) => {
      const q = DB.totalStock(p.id);
      if (q < p.reorder) items.push({ tone: q <= 0 ? 'bad' : 'warn', text: `${p.name}: ${q} left (reorder at ${p.reorder})`, go: 'inventory/stock', q: p.sku });
    });
    DB.list('invoices').forEach((i) => {
      if (DB.invoiceStatus(i) === 'Overdue') items.push({ tone: 'bad', text: `${i.id} overdue, ${DB.money(i.amount - i.paid)} unpaid`, go: 'sales/invoices', q: i.id });
    });
    DB.list('leaves').filter((l) => l.status === 'Pending').forEach((l) => items.push({ tone: 'warn', text: `${DB.employee(l.empId).name} requested ${l.type.toLowerCase()} leave`, go: 'people/leave' }));
    return items;
  }
  function updateBell() {
    const n = attentionItems().length;
    const b = $('#bell-count');
    b.textContent = n;
    b.hidden = n === 0;
  }
  function openNotifications() {
    const items = attentionItems();
    const body = items.length
      ? `<ul class="notif">${items.map((it, i) => `<li class="${it.tone}"><button class="link" data-go="${i}">${esc(it.text)}</button></li>`).join('')}</ul>`
      : '<p class="muted">Nothing needs your attention right now.</p>';
    const ov = modal({ title: `Notifications (${items.length})`, body, actions: [{ label: 'Close', run: null }] });
    ov.querySelectorAll('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
      const it = items[Number(btn.dataset.go)];
      close();
      if (it.q) UI.pendingSearch = { id: it.go.split('/')[1] === 'stock' ? 'stock' : it.go.split('/')[1], q: it.q };
      navigate(it.go);
    }));
  }

  // ---------- command palette (Ctrl+K) ----------
  function openPalette() {
    const ov = document.createElement('div');
    ov.className = 'overlay palette-overlay';
    ov.id = 'overlay';
    ov.innerHTML = `
      <div class="palette" role="dialog" aria-label="Command palette">
        <input type="text" placeholder="Jump to a page, record or action…" aria-label="Command search" autocomplete="off">
        <ul class="palette-list" role="listbox"></ul>
        <div class="palette-hint"><span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
      </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('input');
    const list = ov.querySelector('.palette-list');
    let idx = 0, results = [];

    const actions = [
      { t: 'action', label: 'New sales order', run: () => { navigate('sales/orders'); setTimeout(() => $('[data-new]')?.click(), 60); } },
      { t: 'action', label: 'New purchase order', run: () => { navigate('purchasing/orders'); setTimeout(() => $('[data-new]')?.click(), 60); } },
      { t: 'action', label: 'Record stock movement', run: () => { navigate('inventory/movements'); setTimeout(() => $('[data-move]')?.click(), 60); } },
      { t: 'action', label: 'Request leave', run: () => { navigate('people/leave'); setTimeout(() => $('[data-new]')?.click(), 60); } },
      { t: 'action', label: 'Toggle dark mode', run: toggleTheme },
    ];

    const build = (q) => {
      const s = q.trim().toLowerCase();
      const hit = (...xs) => xs.some((x) => String(x ?? '').toLowerCase().includes(s));
      const pages = Object.entries(routes).filter(([k, r]) => !s || hit(r.label, r.group))
        .map(([k, r]) => ({ t: 'page', label: r.label, sub: r.group || 'Overview', run: () => navigate(k) }));
      if (!s) return [...pages.slice(0, 6), ...actions];
      const recs = [];
      DB.list('products').filter((p) => hit(p.sku, p.name)).slice(0, 4).forEach((p) => recs.push({ t: 'record', label: p.name, sub: 'Product · ' + p.sku, run: () => search('products', 'inventory/products', p.sku) }));
      DB.list('customers').filter((c) => hit(c.name)).slice(0, 3).forEach((c) => recs.push({ t: 'record', label: c.name, sub: 'Customer', run: () => search('customers', 'sales/customers', c.name) }));
      DB.list('vendors').filter((v) => hit(v.name)).slice(0, 3).forEach((v) => recs.push({ t: 'record', label: v.name, sub: 'Vendor', run: () => search('vendors', 'purchasing/vendors', v.name) }));
      DB.list('orders').filter((o) => hit(o.id)).slice(0, 3).forEach((o) => recs.push({ t: 'record', label: o.id, sub: 'Sales order', run: () => search('orders', 'sales/orders', o.id) }));
      DB.list('employees').filter((e) => hit(e.name)).slice(0, 3).forEach((e) => recs.push({ t: 'record', label: e.name, sub: 'Employee', run: () => search('employees', 'people/employees', e.name) }));
      return [...pages.filter((p) => true).slice(0, 5), ...recs, ...actions.filter((a) => hit(a.label))];
    };
    const search = (tableId, key, q) => { UI.pendingSearch = { id: tableId, q }; navigate(key); };

    const draw = () => {
      results = build(input.value);
      idx = Math.min(idx, Math.max(0, results.length - 1));
      list.innerHTML = results.length ? results.map((r, i) => `
        <li role="option" data-i="${i}" class="${i === idx ? 'on' : ''}">
          <span class="pal-type">${r.t === 'page' ? 'Page' : r.t === 'record' ? 'Record' : 'Action'}</span>
          <span class="pal-label">${esc(r.label)}</span><span class="pal-sub">${esc(r.sub || '')}</span></li>`).join('')
        : '<li class="muted">No matches</li>';
    };
    const go = (i) => { const r = results[i]; if (!r) return; close(); r.run(); };
    input.addEventListener('input', () => { idx = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, results.length - 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); }
      if (e.key === 'Enter') go(idx);
    });
    list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) go(Number(li.dataset.i)); });
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    draw();
    input.focus();
  }

  // ---------- live mode: simulated business activity so the dashboard moves ----------
  const LIVE_KEY = 'erp-bms-live';
  let liveTimer = null;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const hhmm = () => new Date().toTimeString().slice(0, 5);

  function liveTick() {
    const r = Math.random();
    const custs = DB.list('customers'), prods = DB.list('products'), whs = DB.list('warehouses'), emps = DB.list('employees');
    try {
      if (r < 0.45 && custs.length && whs.length) {
        const c = pick(custs), wh = pick(whs);
        const avail = prods.filter((p) => DB.balance(p.id, wh.id) >= 3);
        if (avail.length) {
          const p = pick(avail);
          DB.add('orders', 'SO', { customerId: c.id, warehouseId: wh.id, date: DB.today(), status: 'Pending',
            lines: [{ productId: p.id, qty: 1 + Math.floor(Math.random() * 3), price: p.price }] }, 'Live: new sales order');
          UI.toast(`New order from ${c.name}`);
        }
      } else if (r < 0.75 && prods.length && whs.length) {
        const p = pick(prods), wh = pick(whs), qty = 5 + Math.floor(Math.random() * 20);
        DB.addMovement({ type: 'IN', productId: p.id, warehouseId: wh.id, qty, date: DB.today(), ref: 'LIVE', note: 'Live: goods received' });
        UI.toast(`${qty} × ${p.name} received at ${wh.name}`);
      } else if (emps.length) {
        const e = pick(emps);
        DB.setAttendance(e.id, DB.today(), 'Present', hhmm());
        UI.toast(`${e.name} checked in at ${hhmm()}`);
      }
    } catch (err) { /* keep the simulation going */ }
    if (!document.getElementById('overlay')) render({ animate: false });
  }

  function setLive(on, silent) {
    clearInterval(liveTimer);
    liveTimer = on ? setInterval(liveTick, 7000) : null;
    const b = $('#live');
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
    try { localStorage.setItem(LIVE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!silent) UI.toast(on ? 'Live Mode On: New Activity Every Few Seconds' : 'Live Mode Off');
  }

  // ---------- theme ----------
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('erp-bms-theme', next); } catch (e) { /* ignore */ }
  }

  // ---------- init ----------
  // Called by auth-ui.js once the user is signed in. Sets up the shell once, then renders.
  let booted = false;
  function start() {
    if (!booted) boot();
    render();
  }

  function boot() {
    booted = true;
    DB.init();
    try { document.documentElement.dataset.theme = localStorage.getItem('erp-bms-theme') || 'light'; } catch (e) { /* ignore */ }
    buildNav();
    $('#bell').addEventListener('click', openNotifications);
    $('#live').addEventListener('click', () => setLive(!liveTimer));
    try { if (localStorage.getItem(LIVE_KEY) === '1') setLive(true, true); } catch (e) { /* ignore */ }
    $('#theme').addEventListener('click', toggleTheme);
    $('#palette-btn').addEventListener('click', openPalette);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.getElementById('overlay')) openPalette(); }
      else if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !document.getElementById('overlay')) { e.preventDefault(); openPalette(); }
    });
    window.addEventListener('hashchange', () => { if (booted) render(); });
    if (!location.hash) location.hash = '#/overview/dashboard';
  }

  global.App = {
    register(key, def) { routes[key] = def; },
    refresh,
    routes: () => routes,
    navigate,
    start,
    movementDrawer: null, // filled by pages-inventory.js
  };
})(window);
