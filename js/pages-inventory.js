/* pages-inventory.js: Products, Stock, Warehouses, Stock movements. */
(function () {
  'use strict';
  const { esc, badge, renderTable, drawer, modal, toast, kpi, meter } = UI;
  const money = DB.money;
  const opt = (arr, label = (x) => x.name, value = (x) => x.id) => arr.map((x) => ({ value: value(x), label: label(x) }));

  // stock status compares on-hand quantity with the reorder level
  const stockStatus = (qty, reorder) => (qty <= 0 ? 'Out of stock' : qty < reorder ? 'Low stock' : 'In stock');

  // Shared drawer: record a stock movement (used on Stock and Movements pages)
  function movementDrawer(preset = {}) {
    drawer({
      title: 'Record stock movement',
      note: 'IN adds stock, OUT removes it, TRANSFER moves between warehouses, ADJUST corrects a count (use a negative number to reduce).',
      submitLabel: 'Post movement',
      fields: [
        { name: 'type', label: 'Type', type: 'select', value: preset.type || 'IN', required: true, options: ['IN', 'OUT', 'TRANSFER', 'ADJUST'].map((t) => ({ value: t, label: t })) },
        { name: 'productId', label: 'Product', type: 'select', value: preset.productId, required: true, full: true, options: opt(DB.list('products'), (p) => `${p.sku} · ${p.name}`) },
        { name: 'warehouseId', label: 'Warehouse (from)', type: 'select', value: preset.warehouseId, required: true, options: opt(DB.list('warehouses'), (w) => `${w.name} (${w.city})`) },
        { name: 'toWarehouseId', label: 'Warehouse (to, transfers only)', type: 'select', options: [{ value: '', label: '—' }, ...opt(DB.list('warehouses'), (w) => `${w.name} (${w.city})`)] },
        { name: 'qty', label: 'Quantity', type: 'number', value: 1, required: true, min: 1, step: 1 },
        { name: 'date', label: 'Date', type: 'date', value: DB.today(), required: true },
        { name: 'note', label: 'Note', type: 'text', full: true, value: '' },
      ],
      onSubmit: (v) => {
        DB.addMovement({
          type: v.type, productId: v.productId, warehouseId: v.warehouseId,
          toWarehouseId: v.type === 'TRANSFER' ? v.toWarehouseId : undefined,
          qty: Number(v.qty), date: v.date, ref: 'MANUAL', note: v.note || v.type,
        });
        toast('Stock movement posted');
        App.refresh();
      },
    });
  }

  // ---------- Products ----------
  function productsPage(el) {
    const rows = () => DB.list('products');
    const stockOf = (p) => DB.totalStock(p.id);
    UI.head('Products', 'Catalogue with live on-hand stock across all warehouses.',
      '<button class="btn primary" data-new>+ New product</button>');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'products', exportName: 'products', rows, pageSize: 8,
      rowActions: CRUD.rowActions('products'),
      search: ['sku', 'name', 'category'],
      filters: [{ key: 'status', label: 'Status', get: (p) => stockStatus(stockOf(p), p.reorder), options: ['In stock', 'Low stock', 'Out of stock'] }],
      columns: [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product' },
        { key: 'category', label: 'Category' },
        { key: 'price', label: 'Price', align: 'right', render: (p) => money(p.price) },
        { key: 'onhand', label: 'On hand', align: 'right', value: stockOf },
        { key: 'reorder', label: 'Reorder at', align: 'right' },
        { key: 'status', label: 'Status', sort: false, render: (p) => badge(stockStatus(stockOf(p), p.reorder)), csv: (p) => stockStatus(stockOf(p), p.reorder) },
      ],
      bulk: [{ label: 'Export selected', run: (ids) => UI.downloadCSV('products-selected', rows().filter((p) => ids.includes(p.id)), [
        { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'price', label: 'Price' }]) }],
      onRow: (p) => productDetail(p),
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New product', submitLabel: 'Create product',
      fields: [
        { name: 'sku', label: 'SKU', required: true, help: 'Unique code, e.g. ELC-010' },
        { name: 'name', label: 'Name', required: true },
        { name: 'category', label: 'Category', type: 'select', options: ['Electronics', 'Hardware', 'Office', 'Packaging'].map((c) => ({ value: c, label: c })) },
        { name: 'cost', label: 'Cost', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'price', label: 'Selling price', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'reorder', label: 'Reorder level', type: 'number', min: 0, step: 1, value: 10 },
      ],
      onSubmit: (v) => {
        if (DB.list('products').some((p) => p.sku.toLowerCase() === v.sku.trim().toLowerCase())) throw new Error('SKU already exists');
        DB.add('products', 'P', { sku: v.sku.trim(), name: v.name.trim(), category: v.category, cost: +v.cost, price: +v.price, reorder: +v.reorder, active: true }, `Product ${v.sku} created`);
        toast('Product created');
        App.refresh();
      },
    });
  }

  function productDetail(p) {
    const body = `
      <p class="muted">${esc(p.sku)} · ${esc(p.category)} · Cost ${money(p.cost)} · Price ${money(p.price)}</p>
      <table class="mini"><thead><tr><th>Warehouse</th><th class="num">On hand</th></tr></thead><tbody>
        ${DB.list('warehouses').map((w) => `<tr><td>${esc(w.name)}</td><td class="num">${DB.balance(p.id, w.id)}</td></tr>`).join('')}
      </tbody></table>
      <h4>Recent movements</h4>
      <ul class="timeline">${DB.list('movements').filter((m) => m.productId === p.id).slice(-6).reverse()
        .map((m) => `<li>${esc(m.date)} · ${badge(m.type)} ${m.qty} · ${esc(m.note || m.ref)}</li>`).join('') || '<li class="muted">No movements yet</li>'}</ul>`;
    modal({ title: p.name, body, wide: false, actions: [
      { label: 'Close', run: null },
      { label: 'Record movement', primary: true, run: () => movementDrawer({ productId: p.id }) },
    ] });
  }

  // ---------- Stock ----------
  function stockPage(el) {
    UI.head('Stock levels', 'Derived from the movement ledger: never typed in by hand.',
      '<button class="btn primary" data-move>+ Record movement</button>');
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'stock', exportName: 'stock-levels', rows: () => DB.stockRows(), pageSize: 12, selectable: false,
      rowId: (r) => r.id,
      search: [(r) => r.product.sku, (r) => r.product.name, (r) => r.warehouse.name],
      filters: [
        { key: 'wh', label: 'Warehouse', get: (r) => r.warehouse.name, options: DB.list('warehouses').map((w) => w.name) },
        { key: 'status', label: 'Status', get: (r) => stockStatus(r.qty, r.product.reorder), options: ['In stock', 'Low stock', 'Out of stock'] },
      ],
      columns: [
        { key: 'sku', label: 'SKU', value: (r) => r.product.sku },
        { key: 'product', label: 'Product', value: (r) => r.product.name },
        { key: 'warehouse', label: 'Warehouse', value: (r) => r.warehouse.name },
        { key: 'qty', label: 'Qty', align: 'right' },
        { key: 'value', label: 'Stock value', align: 'right', value: (r) => r.qty * r.product.cost, render: (r) => money(r.qty * r.product.cost) },
        { key: 'status', label: 'Status', sort: false, render: (r) => badge(stockStatus(r.qty, r.product.reorder)), csv: (r) => stockStatus(r.qty, r.product.reorder) },
      ],
    });
    el.querySelector('[data-move]').onclick = () => movementDrawer();
  }

  // ---------- Warehouses ----------
  function warehousesPage(el) {
    UI.head('Warehouses', 'Capacity use is the units stored versus the warehouse capacity.',
      '<button class="btn primary" data-new>+ New warehouse</button>');
    const cards = DB.list('warehouses').map((w) => {
      const units = DB.stockRows().filter((r) => r.warehouse.id === w.id).reduce((s, r) => s + Math.max(0, r.qty), 0);
      const pct = Math.round((units / w.capacity) * 100);
      return `<section class="card">
        <header class="card-head"><h3>${esc(w.name)}</h3><span class="muted">${esc(w.city)}</span></header>
        ${kpi('Units stored', `${units.toLocaleString('en-IN')} <small>of ${w.capacity.toLocaleString('en-IN')}</small>`, '', pct > 90 ? 'bad' : '')}
        ${meter(pct, pct > 90 ? 'bad' : pct > 70 ? 'warn' : '')}
        <small class="muted">${pct}% utilised</small>
        <footer class="card-foot"><button class="btn ghost sm" data-wact="edit" data-wid="${esc(w.id)}">Edit</button>
          <button class="btn ghost sm danger-text" data-wact="delete" data-wid="${esc(w.id)}">Delete</button></footer></section>`;
    }).join('');
    el.insertAdjacentHTML('beforeend', `<div class="grid three">${cards}</div>`);
    el.querySelector('[data-new]').onclick = () => CRUD.create('warehouses');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-wact]');
      if (b) CRUD.act('warehouses', b.dataset.wid, b.dataset.wact);
    });
  }

  // ---------- Movements (ledger) ----------
  function movementsPage(el) {
    UI.head('Stock movements', 'Every change to stock, newest first. Nothing here can be edited, only reversed.',
      '<button class="btn primary" data-move>+ Record movement</button>');
    const host = el.appendChild(document.createElement('div'));
    const rows = () => [...DB.list('movements')].reverse();
    renderTable(host, {
      id: 'movements', exportName: 'stock-movements', rows, pageSize: 12, selectable: false,
      rowActions: CRUD.rowActions('movements'),
      search: [(m) => DB.product(m.productId)?.sku, (m) => m.ref, (m) => m.note],
      filters: [{ key: 'type', label: 'Type', get: (m) => m.type, options: ['IN', 'OUT', 'TRANSFER', 'ADJUST'] }],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type', render: (m) => badge(m.type) },
        { key: 'product', label: 'Product', value: (m) => DB.product(m.productId)?.name, render: (m) => esc(DB.product(m.productId)?.name) },
        { key: 'route', label: 'Warehouse', sort: false, render: (m) => m.type === 'TRANSFER'
          ? `${esc(DB.warehouse(m.warehouseId).name)} → ${esc(DB.warehouse(m.toWarehouseId).name)}`
          : esc(DB.warehouse(m.warehouseId).name), csv: (m) => m.warehouseId },
        { key: 'qty', label: 'Qty', align: 'right', render: (m) => (m.type === 'OUT' || m.qty < 0 ? `−${Math.abs(m.qty)}` : `+${m.qty}`), csv: (m) => m.qty },
        { key: 'ref', label: 'Reference' },
        { key: 'note', label: 'Note' },
      ],
    });
    el.querySelector('[data-move]').onclick = () => movementDrawer();
  }

  App.register('inventory/products', { group: 'Inventory', label: 'Products', render: productsPage });
  App.register('inventory/stock', { group: 'Inventory', label: 'Stock', render: stockPage });
  App.register('inventory/warehouses', { group: 'Inventory', label: 'Warehouses', render: warehousesPage });
  App.register('inventory/movements', { group: 'Inventory', label: 'Stock movements', render: movementsPage });
  App.movementDrawer = movementDrawer;
})();
