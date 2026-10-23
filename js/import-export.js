/* import-export.js: the Import page. Import a dashboard file (.json), or import rows from a CSV file
   into Products, Vendors, Customers, Employees, Machines, Expenses or Work orders. Data is saved in this browser. */
(function () {
  'use strict';
  const { esc, card, toast } = UI;
  const arr = (c) => DB.list(c) || [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const TARGETS = {
    products: { label: 'Products', fields: [
      { k: 'sku', label: 'SKU', req: true }, { k: 'name', label: 'Name', req: true }, { k: 'category', label: 'Category' },
      { k: 'cost', label: 'Cost', num: true }, { k: 'price', label: 'Price', num: true }, { k: 'reorder', label: 'Reorder level', num: true }],
      check: (r) => (arr('products').some((p) => p.sku === r.sku.trim()) ? 'SKU already exists' : null),
      build: (r) => ({ sku: r.sku.trim(), name: r.name.trim(), category: (r.category || 'General').trim(), cost: +r.cost || 0, price: +r.price || 0, reorder: +r.reorder || 0, active: true }), prefix: 'P', msg: 'Imported product' },
    vendors: { label: 'Vendors', fields: [
      { k: 'name', label: 'Name', req: true }, { k: 'city', label: 'City' }, { k: 'email', label: 'Email' }, { k: 'leadDays', label: 'Lead days', num: true }],
      build: (r) => ({ name: r.name.trim(), city: (r.city || '').trim(), email: (r.email || '').trim(), leadDays: +r.leadDays || 0, rating: 4, active: true }), prefix: 'V', msg: 'Imported vendor' },
    customers: { label: 'Customers', fields: [
      { k: 'name', label: 'Name', req: true }, { k: 'type', label: 'Type' }, { k: 'city', label: 'City' }, { k: 'email', label: 'Email' }],
      build: (r) => ({ name: r.name.trim(), type: (r.type || 'Retail').trim(), city: (r.city || '').trim(), email: (r.email || '').trim() }), prefix: 'C', msg: 'Imported customer' },
    employees: { label: 'Employees', fields: [
      { k: 'name', label: 'Name', req: true }, { k: 'dept', label: 'Department' }, { k: 'role', label: 'Role' }, { k: 'email', label: 'Email' }, { k: 'joined', label: 'Joined (YYYY-MM-DD)' }],
      build: (r) => ({ name: r.name.trim(), dept: (r.dept || '').trim(), role: (r.role || '').trim(), email: (r.email || '').trim(), joined: r.joined || DB.today(), status: 'Active' }), prefix: 'E', msg: 'Imported employee' },
    assets: { label: 'Machines', fields: [
      { k: 'name', label: 'Name', req: true }, { k: 'make', label: 'Make' }, { k: 'location', label: 'Location' }, { k: 'serviceEvery', label: 'Service every (days)', num: true }, { k: 'status', label: 'Status' }],
      build: (r) => ({ name: r.name.trim(), make: (r.make || '').trim(), location: (r.location || '').trim(), serviceEvery: +r.serviceEvery || 90, status: (r.status || 'Running').trim(), lastService: DB.today() }), prefix: 'MC', msg: 'Imported machine' },
    expenses: { label: 'Expenses', fields: [
      { k: 'date', label: 'Date (YYYY-MM-DD)', req: true }, { k: 'category', label: 'Category' }, { k: 'payee', label: 'Payee', req: true }, { k: 'amount', label: 'Amount', req: true, num: true }, { k: 'note', label: 'Note' }],
      build: (r) => ({ date: r.date, category: (r.category || 'Other').trim(), payee: r.payee.trim(), amount: +r.amount, note: (r.note || '').trim() }), prefix: 'EX', msg: 'Imported expense' },
    workOrders: { label: 'Work orders', fields: [
      { k: 'sku', label: 'Product SKU', req: true }, { k: 'qty', label: 'Quantity', req: true, num: true }, { k: 'date', label: 'Date (YYYY-MM-DD)' }],
      check: (r) => (arr('products').some((p) => p.sku === r.sku.trim()) ? null : 'Product SKU not found'),
      build: (r) => { const p = arr('products').find((x) => x.sku === r.sku.trim()); const bom = arr('boms').find((b) => b.productId === p?.id);
        return { productId: p?.id, qty: +r.qty, date: r.date || DB.today(), bomId: bom?.id, status: 'Planned' }; }, prefix: 'WO', msg: 'Imported work order' },
  };

  // CSV parser: handles quoted cells, commas and line breaks inside quotes
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }
  const fixDate = (v) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : (v || '').trim(); };

  // ---------- page ----------
  const state = { target: 'products', headers: [], rows: [], map: {}, fileName: '' };

  function importPage(el) {
    UI.head('Import', 'Bring in a dashboard file or a CSV from your PMS, FMS or any sheet.');
    el.insertAdjacentHTML('beforeend', `
      <div class="grid two">
        ${card('Import a dashboard file', `
          <p class="muted small">Choose a file you exported from Custom dashboards (.dashboard.json).</p>
          <label class="file-pick">Dashboard file<input type="file" accept=".json,application/json" id="imp-json"></label>
          <p class="form-error" id="imp-json-err" hidden></p>`)}
        ${card('Import data from CSV', `
          <label>Import into<select id="imp-target" class="form-select">
            ${Object.entries(TARGETS).map(([k, t]) => `<option value="${k}" ${k === state.target ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select></label>
          <label class="file-pick">CSV file<input type="file" accept=".csv,text/csv" id="imp-csv"></label>
          <p class="muted small">Export your sheet from Excel or Google Sheets as CSV. The first row must be column names. Dates: YYYY-MM-DD or DD/MM/YYYY.</p>
          <div id="imp-map"></div>`)}
      </div>`);

    el.querySelector('#imp-json').onchange = (e) => importJSON(e.target, el);
    el.querySelector('#imp-target').onchange = (e) => { state.target = e.target.value; state.map = {}; renderMap(el); };
    el.querySelector('#imp-csv').onchange = (e) => readCSV(e.target, el);
    renderMap(el);
  }

  function importJSON(input, el) {
    const err = el.querySelector('#imp-json-err');
    const file = input.files[0];
    if (!file) return;
    file.text().then((txt) => {
      const { board, skipped } = DashBuilder.importBoard(JSON.parse(txt));
      toast(`Imported “${board.name}”${skipped ? ` (${skipped} unknown widget(s) skipped)` : ''}`);
      err.hidden = true;
      App.navigate('custom/' + board.id);
      App.refresh();
    }).catch((e) => { err.textContent = e.message || 'Could not read that file.'; err.hidden = false; input.value = ''; });
  }

  function readCSV(input, el) {
    const file = input.files[0];
    if (!file) return;
    file.text().then((txt) => {
      const rows = parseCSV(txt);
      if (rows.length < 2) { toast('The CSV needs a header row and at least one data row', 'warn'); return; }
      state.headers = rows[0].map((h) => h.trim());
      state.rows = rows.slice(1);
      state.fileName = file.name;
      state.map = {};
      const t = TARGETS[state.target];
      const used = new Set();
      const pick = (test) => t.fields.forEach((f) => {
        if (state.map[f.k] !== undefined) return;
        const hit = state.headers.findIndex((h, i) => !used.has(i) && test(norm(h), norm(f.k), norm(f.label.split(' (')[0])));
        if (hit >= 0) { state.map[f.k] = hit; used.add(hit); }
      });
      pick((h, k, l) => h === k || h === l);                 // exact: "name", "Name"
      pick((h, k, l) => h.includes(k) || h.includes(l));     // loose: "Product Name" contains "name"

      renderMap(el);
    });
  }

  function mapped(r, t) {
    const out = {};
    t.fields.forEach((f) => {
      const idx = state.map[f.k];
      let v = idx === undefined || idx === '' ? '' : (r[idx] ?? '');
      if (f.k === 'date' || f.k === 'joined') v = fixDate(v);
      out[f.k] = v;
    });
    return out;
  }

  function problem(rec, t) {
    const missing = t.fields.filter((f) => f.req && !String(rec[f.k] || '').trim()).map((f) => f.label);
    if (missing.length) return `missing ${missing.join(', ')}`;
    const nums = t.fields.filter((f) => f.num && String(rec[f.k] || '').trim() && isNaN(Number(rec[f.k]))).map((f) => f.label);
    if (nums.length) return `not a number: ${nums.join(', ')}`;
    return t.check ? t.check(rec) : null;
  }

  function renderMap(el) {
    const box = el.querySelector('#imp-map');
    const t = TARGETS[state.target];
    if (!state.headers.length) { box.innerHTML = ''; return; }
    const opts = (sel) => `<option value="">— not in file —</option>` + state.headers.map((h, i) =>
      `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
    const previewRecs = state.rows.slice(0, 5).map((r) => mapped(r, t));
    const bad = state.rows.map((r) => problem(mapped(r, t), t)).filter(Boolean).length;
    box.innerHTML = `
      <p class="muted small" style="margin-top:12px"><strong>${esc(state.fileName)}</strong>: ${state.rows.length} data row(s). Match each field to a column:</p>
      ${t.fields.map((f) => `<label>${esc(f.label)}${f.req ? ' *' : ''}<select class="form-select" data-map="${f.k}">${opts(state.map[f.k])}</select></label>`).join('')}
      <div class="table-wrap" style="margin-top:10px"><table class="mini"><thead><tr>${t.fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${previewRecs.map((rec) => `<tr>${t.fields.map((f) => `<td>${esc(rec[f.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">${bad ? `${bad} row(s) have a problem and will be skipped.` : 'All rows look good.'}</p>
      <button class="btn primary" id="imp-go" type="button">Import ${state.rows.length} row(s)</button>`;

    box.querySelectorAll('[data-map]').forEach((s) => s.onchange = () => {
      state.map[s.dataset.map] = s.value === '' ? undefined : Number(s.value);
      renderMap(el);
    });
    box.querySelector('#imp-go').onclick = () => runImport(el);
  }

  function runImport(el) {
    const t = TARGETS[state.target];
    let added = 0; const skipped = [];
    state.rows.forEach((r, i) => {
      const rec = mapped(r, t);
      const why = problem(rec, t);
      if (why) { skipped.push(`row ${i + 2}: ${why}`); return; }
      DB.add(state.target, t.prefix, t.build(rec), `${t.msg} from CSV`);
      added++;
    });
    toast(`Imported ${added} ${t.label.toLowerCase()}${skipped.length ? `, ${skipped.length} skipped` : ''}`);
    state.rows = []; state.headers = []; state.map = {}; state.fileName = '';
    const summary = skipped.length ? `<p class="form-error">${skipped.slice(0, 20).map(esc).join('<br>')}${skipped.length > 20 ? '<br>…' : ''}</p>` : '';
    el.querySelector('#imp-map').innerHTML = `<p><strong>${added}</strong> ${esc(t.label.toLowerCase())} imported.</p>${summary}
      <p class="muted small">Open them from the ${esc(t.label)} screen in the sidebar.</p>`;
  }

  App.register('custom/import', { group: null, label: 'Import', icon: '⤓', render: importPage });
})();
