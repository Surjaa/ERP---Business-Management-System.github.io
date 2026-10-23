/* ext-docs.js: Documents. Upload any file type (stored in the browser's IndexedDB, so large files are
   fine), preview it, link it to a customer, vendor, machine and so on. Also a print and download
   centre for invoices, purchase orders and customer profiles, with a printable paper view. */
(function () {
  'use strict';
  const X = EXT;
  const { L, today, sum, sel, dsel, opt, custName, vendorName, sBal, pBal, purchaseStatus, dashboard, wireCopy,
    rowActionsWith, money, esc, badge, modal, toast, kpi, card } = X;
  const { renderTable } = UI;

  // ---------- file storage (IndexedDB) ----------
  const FILES = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('erp-bms-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('files', mode);
        const req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      put: (id, blob) => run('readwrite', (s) => s.put(blob, id)),
      get: (id) => run('readonly', (s) => s.get(id)),
      del: (id) => run('readwrite', (s) => s.delete(id)),
    };
  })();

  // ---------- helpers ----------
  const MODULES = ['General', 'Sales', 'Purchase', 'Accounting', 'Inventory', 'Manufacturing', 'Attendance', 'Maintenance', 'FMS', 'Contacts'];
  const REF_TYPES = ['general', 'customer', 'vendor', 'employee', 'asset', 'order', 'po'];
  const refOptions = (t) => ({
    customer: () => opt(L('customers'), (c) => c.name),
    vendor: () => opt(L('vendors'), (v) => v.name),
    employee: () => opt(L('employees'), (e) => e.name),
    asset: () => opt(L('assets'), (a) => a.name),
    order: () => opt(L('orders'), (o) => o.id + ' · ' + custName(o.customerId)),
    po: () => opt(L('purchaseOrders'), (p) => p.id + ' · ' + vendorName(p.vendorId)),
    general: () => [{ value: '', label: '—' }],
  })[t]();
  const refLabel = (d) => {
    if (!d.refId) return 'General';
    if (d.refType === 'customer') return custName(d.refId);
    if (d.refType === 'vendor') return vendorName(d.refId);
    if (d.refType === 'employee') return DB.employee(d.refId)?.name || '—';
    if (d.refType === 'asset') return DB.byId('assets', d.refId)?.name || '—';
    if (d.refType === 'order') return d.refId;
    if (d.refType === 'po') return d.refId;
    return '—';
  };
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const kind = (mime, name) => {
    if (/^image\//.test(mime)) return 'Image';
    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF';
    if (/^text\/|json|csv|xml/.test(mime) || /\.(txt|csv|md|json|xml)$/i.test(name)) return 'Text';
    if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return 'Spreadsheet';
    if (/word|document/.test(mime) || /\.(docx?)$/i.test(name)) return 'Document';
    return 'File';
  };

  // Save a file to the viewer's computer. Uses the downloads capability when the page has it.
  async function saveFile(name, data, mime) {
    try {
      const dl = window.claude && (await window.claude.use('downloads'));
      if (dl && typeof data === 'string') { await dl.save({ filename: name, data }); toast('Saved ' + name); return; }
    } catch (e) {
      if (e && e.code === 'declined') return toast('Download cancelled', 'warn');
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Downloaded ' + name);
  }

  // ---------- upload ----------
  async function uploadFiles(files, meta) {
    let n = 0;
    for (const f of files) {
      const rec = DB.add('documents', 'D', {
        name: f.name, size: f.size, mime: f.type || 'application/octet-stream', module: meta.module || 'General',
        refType: meta.refType || 'general', refId: meta.refId || '', uploaded: today(), note: meta.note || '',
      }, `Document ${f.name} uploaded`);
      await FILES.put(rec.id, f);
      n++;
    }
    toast(`${n} file${n === 1 ? '' : 's'} uploaded`);
    App.refresh();
  }

  function openUpload(preset = {}) {
    const ov = modal({
      title: 'Upload documents', wide: true,
      body: `<p class="muted">Any file type works: PDF, Word, Excel, images, text, zip. Files are kept in this browser.</p>
        <div class="drop" id="drop-zone"><strong>Drop files here</strong> or <label class="link">choose files
          <input type="file" id="up-files" multiple hidden></label><small id="up-list" class="muted"></small></div>
        <div class="form-grid">
          <div class="field"><label>Module</label><select id="up-module">${MODULES.map((m) => `<option ${m === (preset.module || 'General') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
          <div class="field"><label>Link to</label><select id="up-ref">${REF_TYPES.map((t) => `<option value="${t}" ${t === (preset.refType || 'general') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field full"><label>Record</label><select id="up-rec"></select></div>
          <div class="field full"><label>Note</label><input id="up-note" type="text" placeholder="e.g. signed contract, GST certificate"></div>
        </div>`,
      actions: [
        { label: 'Cancel', run: null },
        { label: 'Upload', primary: true, keepOpen: true, run: () => {
          const files = [...ov.querySelector('#up-files').files];
          if (!files.length) return toast('Choose at least one file', 'warn');
          const meta = {
            module: ov.querySelector('#up-module').value, refType: ov.querySelector('#up-ref').value,
            refId: ov.querySelector('#up-rec').value, note: ov.querySelector('#up-note').value,
          };
          UI.close();
          uploadFiles(files, meta);
        } },
      ],
    });
    const fillRec = () => {
      const t = ov.querySelector('#up-ref').value;
      const list = t === 'general' ? [] : refOptions(t);
      const sel2 = ov.querySelector('#up-rec');
      sel2.innerHTML = list.length ? list.map((o) => `<option value="${esc(o.value)}" ${o.value === preset.refId ? 'selected' : ''}>${esc(o.label)}</option>`).join('') : '<option value="">— none —</option>';
    };
    ov.querySelector('#up-ref').addEventListener('change', fillRec);
    fillRec();
    const input = ov.querySelector('#up-files');
    const show = () => { ov.querySelector('#up-list').textContent = [...input.files].map((f) => f.name).join(', '); };
    input.addEventListener('change', show);
    const zone = ov.querySelector('#drop-zone');
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); input.files = e.dataTransfer.files; show(); });
  }

  // ---------- preview ----------
  async function preview(d) {
    const blob = await FILES.get(d.id);
    if (!blob) return toast('File is missing from this browser', 'warn');
    const url = URL.createObjectURL(blob);
    const k = kind(d.mime, d.name);
    const ov = modal({
      title: d.name, wide: true,
      body: `<p class="muted">${esc(k)} · ${size(d.size)} · linked to ${esc(refLabel(d))} · ${esc(d.module)}</p><div class="preview-box" id="pv"></div>`,
      actions: [
        { label: 'Close', run: () => URL.revokeObjectURL(url) },
        { label: 'Download', primary: true, keepOpen: true, run: () => saveFile(d.name, blob, d.mime) },
      ],
    });
    const box = ov.querySelector('#pv');
    if (k === 'Image') box.innerHTML = `<img src="${url}" alt="${esc(d.name)}" style="max-width:100%;height:auto">`;
    else if (k === 'PDF') box.innerHTML = `<iframe src="${url}" title="${esc(d.name)}" style="width:100%;height:70vh;border:0;background:#fff"></iframe>`;
    else if (k === 'Text') box.innerHTML = `<pre class="csv-preview">${esc((await blob.text()).slice(0, 200000))}</pre>`;
    else box.innerHTML = `<p class="muted">No inline preview for ${esc(k)} files. Use Download to open it on your computer.</p>`;
  }

  // ---------- documents library ----------
  CRUD.SCHEMA.documents = {
    name: 'document', label: (d) => d.name,
    onDelete: (d) => { DB.remove('documents', d.id, `Document ${d.name} deleted`); FILES.del(d.id).catch(() => {}); },
  };

  function libraryPage(el) {
    const docs = L('documents');
    dashboard(el, {
      title: 'Document library', desc: 'Upload contracts, certificates, photos or any file, then link it to the right customer, vendor or machine.',
      kpis: [
        kpi('Documents', docs.length),
        kpi('Total size', size(sum(docs, (d) => d.size))),
        kpi('Linked to a record', docs.filter((d) => d.refType !== 'general').length, '', 'good'),
        kpi('Modules', new Set(docs.map((d) => d.module)).size),
      ],
    });
    const drop = el.appendChild(document.createElement('div'));
    drop.className = 'card drop-card';
    drop.innerHTML = `<strong>Upload documents</strong><p class="muted">Drop files here, or <button class="btn primary sm" data-up>choose files</button>. Any file type.</p>`;
    drop.querySelector('[data-up]').onclick = () => openUpload({});
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadFiles([...e.dataTransfer.files], {}); });

    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'documents', exportName: 'documents', rows: () => [...L('documents')].reverse(), pageSize: 8,
      search: ['name', 'module', 'note'],
      filters: [
        { key: 'module', label: 'Module', get: (d) => d.module, options: MODULES },
        { key: 'kind', label: 'Type', get: (d) => kind(d.mime, d.name), options: ['Image', 'PDF', 'Text', 'Spreadsheet', 'Document', 'File'] },
      ],
      columns: [
        { key: 'name', label: 'File' },
        { key: 'kind', label: 'Type', value: (d) => kind(d.mime, d.name), render: (d) => badge(kind(d.mime, d.name)) },
        { key: 'module', label: 'Module' },
        { key: 'link', label: 'Linked to', value: refLabel },
        { key: 'size', label: 'Size', align: 'right', value: (d) => d.size, render: (d) => size(d.size) },
        { key: 'uploaded', label: 'Uploaded' },
      ],
      rowActions: rowActionsWith('documents', (d) => [
        { label: 'Preview', run: preview },
        { label: 'Download', run: async (r) => { const b = await FILES.get(r.id); if (b) saveFile(r.name, b, r.mime); else toast('File is missing', 'warn'); } },
      ]),
      onRow: preview,
    });
  }

  // ---------- print & download centre ----------
  function centreRows() {
    return [
      ...L('invoices').map((i) => ({ key: 'invoice:' + i.id, kind: 'invoice', id: i.id, type: 'Sales invoice', party: custName(i.customerId), date: i.date, amount: i.amount, status: DB.invoiceStatus(i) })),
      ...L('purchaseInvoices').map((p) => ({ key: 'purchase:' + p.id, kind: 'purchase', id: p.id, type: 'Vendor bill', party: vendorName(p.vendorId), date: p.date, amount: p.amount, status: purchaseStatus(p) })),
      ...L('purchaseOrders').map((p) => ({ key: 'po:' + p.id, kind: 'po', id: p.id, type: 'Purchase order', party: vendorName(p.vendorId), date: p.date, amount: DB.poTotal(p), status: p.status })),
      ...L('customers').map((c) => ({ key: 'customer:' + c.id, kind: 'customer', id: c.id, type: 'Customer profile', party: c.name, date: '', amount: null, status: c.type })),
    ];
  }

  function centrePage(el) {
    const rows = centreRows();
    dashboard(el, {
      title: 'Print & download centre', desc: 'Every invoice, purchase order and customer profile in one place. Print them or download them as a file.',
      kpis: [
        kpi('Sales invoices', L('invoices').length),
        kpi('Vendor bills', L('purchaseInvoices').length),
        kpi('Purchase orders', L('purchaseOrders').length),
        kpi('Total invoiced', money(sum(L('invoices'), (i) => i.amount))),
      ],
    });
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'centre', exportName: 'documents-index', rows: () => centreRows(), pageSize: 10, selectable: false, rowId: (r) => r.key,
      search: ['id', 'party', 'type'],
      filters: [{ key: 'type', label: 'Type', get: (r) => r.type, options: ['Sales invoice', 'Vendor bill', 'Purchase order', 'Customer profile'] }],
      columns: [
        { key: 'type', label: 'Type', render: (r) => badge(r.type) },
        { key: 'id', label: 'Number' },
        { key: 'party', label: 'Party' },
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Amount', align: 'right', render: (r) => (r.amount == null ? '—' : money(r.amount)) },
        { key: 'status', label: 'Status', sort: false, render: (r) => badge(r.status) },
      ],
      rowActions: (r) => [
        { label: 'Print', run: (x) => App.navigate(`detail/print/${x.kind}/${x.id}`) },
        { label: 'Download', run: (x) => { const d = docFor(x.kind, x.id); saveFile(d.file, d.html, 'text/html'); } },
      ],
      onRow: (r) => App.navigate(`detail/print/${r.kind}/${r.id}`),
    });
  }

  // ---------- printable documents (black and white) ----------
  const DOC_CSS = `
    .doc-paper { background:#fff; color:#000; max-width:820px; margin:0 auto; padding:44px 48px; border:1px solid #000; font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
    .doc-paper h1 { font-size:26px; margin:0; letter-spacing:.04em; text-transform:uppercase; }
    .doc-paper h2 { font-size:12px; margin:22px 0 6px; letter-spacing:.12em; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:4px; }
    .doc-head { display:flex; justify-content:space-between; gap:24px; border-bottom:3px solid #000; padding-bottom:16px; }
    .doc-head small, .doc-meta { color:#333; }
    .doc-grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:18px; }
    .doc-paper table { width:100%; border-collapse:collapse; margin-top:6px; }
    .doc-paper th, .doc-paper td { border-bottom:1px solid #000; padding:7px 6px; text-align:left; vertical-align:top; }
    .doc-paper th { font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .doc-paper .num { text-align:right; font-variant-numeric:tabular-nums; }
    .doc-totals { margin-left:auto; width:300px; margin-top:12px; }
    .doc-totals div { display:flex; justify-content:space-between; padding:4px 0; }
    .doc-totals .grand { border-top:2px solid #000; font-weight:700; font-size:16px; margin-top:4px; padding-top:8px; }
    .doc-foot { margin-top:40px; font-size:12px; color:#333; border-top:1px solid #000; padding-top:10px; }
    @media print {
      body * { visibility:hidden !important; }
      .doc-paper, .doc-paper * { visibility:visible !important; }
      .doc-paper { position:absolute; left:0; top:0; width:100%; max-width:none; border:0; padding:18mm; }
      .no-print { display:none !important; }
    }`;
  if (!document.getElementById('doc-css')) {
    const st = document.createElement('style'); st.id = 'doc-css'; st.textContent = DOC_CSS; document.head.appendChild(st);
  }

  const money0 = (n) => money(n);
  const company = () => (global_auth() || 'Your business');
  function global_auth() { try { return Auth.current()?.business; } catch (e) { return null; } }
  const party = (lines) => lines.filter(Boolean).map((l) => `<div>${l}</div>`).join('');

  function totalsBlock(sub, tax, total, paid) {
    return `<div class="doc-totals">
      <div><span>Subtotal</span><span>${money0(sub)}</span></div>
      <div><span>GST @ ${Math.round(X.TAX * 100)}%</span><span>${money0(tax)}</span></div>
      <div class="grand"><span>Total</span><span>${money0(total)}</span></div>
      ${paid != null ? `<div><span>Paid</span><span>${money0(paid)}</span></div><div><span>Balance due</span><span>${money0(total - paid)}</span></div>` : ''}
    </div>`;
  }

  // Returns {file, title, html} for a document, ready to print or download
  function docFor(k, id) {
    let title = '', file = '', body = '';
    if (k === 'invoice') {
      const i = DB.byId('invoices', id);
      const o = DB.byId('orders', i.orderId);
      const c = DB.customer(i.customerId);
      title = 'Tax invoice'; file = `invoice-${id}.html`;
      const sub = DB.orderSubtotal(o);
      body = `<div class="doc-head"><div><h1>${esc(company())}</h1><small>Tax invoice</small></div>
        <div class="doc-meta" style="text-align:right"><div><strong>Invoice</strong> ${esc(id)}</div><div>Date ${i.date}</div><div>Due ${i.dueDate}</div><div>Order ${esc(i.orderId)}</div></div></div>
        <div class="doc-grid"><div><h2>Bill to</h2>${party([`<strong>${esc(c?.name)}</strong>`, esc(c?.contactPerson), esc(c?.phone), esc(c?.email), esc(c?.address), c?.gstin ? 'GSTIN ' + esc(c.gstin) : ''])}</div>
        <div><h2>Terms</h2>${party([`Payment within ${c?.paymentTerms ?? 30} days`, `Status: ${DB.invoiceStatus(i)}`])}</div></div>
        <h2>Items</h2><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>
        ${o.lines.map((l) => { const p = DB.product(l.productId); return `<tr><td>${esc(p.sku)} · ${esc(p.name)}</td><td class="num">${l.qty}</td><td class="num">${money0(l.price)}</td><td class="num">${money0(l.qty * l.price)}</td></tr>`; }).join('')}
        </tbody></table>${totalsBlock(sub, i.amount - sub, i.amount, i.paid)}
        <div class="doc-foot">Thank you for your business.</div>`;
    } else if (k === 'purchase') {
      const p = DB.byId('purchaseInvoices', id);
      const po = DB.byId('purchaseOrders', p.poId);
      const v = DB.vendor(p.vendorId);
      title = 'Vendor bill'; file = `vendor-bill-${id}.html`;
      const sub = DB.poTotal(po);
      body = `<div class="doc-head"><div><h1>${esc(company())}</h1><small>Purchase invoice (vendor bill) received</small></div>
        <div class="doc-meta" style="text-align:right"><div><strong>Bill</strong> ${esc(id)}</div><div>Date ${p.date}</div><div>Due ${p.dueDate}</div><div>PO ${esc(p.poId)}</div></div></div>
        <div class="doc-grid"><div><h2>From vendor</h2>${party([`<strong>${esc(v?.name)}</strong>`, esc(v?.city), esc(v?.email)])}</div>
        <div><h2>Status</h2>${party([`${purchaseStatus(p)}`, `Paid ${money0(p.paid)} of ${money0(p.amount)}`])}</div></div>
        <h2>Items received</h2><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Amount</th></tr></thead><tbody>
        ${po.lines.map((l) => { const pr = DB.product(l.productId); return `<tr><td>${esc(pr.sku)} · ${esc(pr.name)}</td><td class="num">${l.qty}</td><td class="num">${money0(l.unitCost)}</td><td class="num">${money0(l.qty * l.unitCost)}</td></tr>`; }).join('')}
        </tbody></table>${totalsBlock(sub, p.amount - sub, p.amount, p.paid)}`;
    } else if (k === 'po') {
      const po = DB.byId('purchaseOrders', id);
      const v = DB.vendor(po.vendorId);
      const wh = DB.warehouse(po.warehouseId);
      title = 'Purchase order'; file = `purchase-order-${id}.html`;
      body = `<div class="doc-head"><div><h1>${esc(company())}</h1><small>Purchase order</small></div>
        <div class="doc-meta" style="text-align:right"><div><strong>PO</strong> ${esc(id)}</div><div>Ordered ${po.date}</div><div>Expected ${po.expected}</div><div>Status ${po.status}</div></div></div>
        <div class="doc-grid"><div><h2>Vendor</h2>${party([`<strong>${esc(v?.name)}</strong>`, esc(v?.city), esc(v?.email)])}</div>
        <div><h2>Deliver to</h2>${party([esc(wh?.name), esc(wh?.city)])}</div></div>
        <h2>Items</h2><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit cost</th><th class="num">Amount</th></tr></thead><tbody>
        ${po.lines.map((l) => { const pr = DB.product(l.productId); return `<tr><td>${esc(pr.sku)} · ${esc(pr.name)}</td><td class="num">${l.qty}</td><td class="num">${money0(l.unitCost)}</td><td class="num">${money0(l.qty * l.unitCost)}</td></tr>`; }).join('')}
        </tbody></table>${totalsBlock(DB.poTotal(po), 0, DB.poTotal(po), null).replace(/<div><span>GST[\s\S]*?<\/div>/, '')}`;
    } else if (k === 'customer') {
      const c = DB.byId('customers', id);
      title = 'Customer profile'; file = `customer-${c.name.replace(/\W+/g, '-').toLowerCase()}.html`;
      const ints = (c.interactions || []).slice().sort((a, b) => b.at.localeCompare(a.at));
      body = `<div class="doc-head"><div><h1>${esc(c.name)}</h1><small>Customer profile · ${esc(c.type)}</small></div>
        <div class="doc-meta" style="text-align:right">${esc(company())}</div></div>
        <div class="doc-grid"><div><h2>Contact</h2>${party([esc(c.contactPerson) + (c.designation ? ' · ' + esc(c.designation) : ''), 'Phone ' + esc(c.phone), c.altPhone ? 'Alt ' + esc(c.altPhone) : '', 'WhatsApp ' + esc(c.whatsapp || c.phone), esc(c.email)])}</div>
        <div><h2>Account</h2>${party(['GSTIN ' + esc(c.gstin || '—'), esc(c.address || ''), `${esc(c.city)} ${esc(c.state || '')} ${esc(c.pincode || '')}`, `Payment terms ${c.paymentTerms ?? 30} days`, `Credit limit ${money0(c.creditLimit || 0)}`])}</div></div>
        <h2>Coordination history</h2>
        ${ints.length ? `<table><thead><tr><th>Date</th><th>Channel</th><th>Summary</th><th>Follow-up</th></tr></thead><tbody>${ints.map((i) => `<tr><td>${esc(i.at.slice(0, 10))}</td><td>${esc(i.channel)}</td><td>${esc(i.summary)}</td><td>${esc(i.followUp || '—')}</td></tr>`).join('')}</tbody></table>` : '<p>No interactions recorded.</p>'}`;
    } else {
      throw new Error('Unknown document');
    }
    return { file, title, body, html: standalone(title, body) };
  }

  function standalone(title, body) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>${DOC_CSS}body{margin:0;padding:24px;background:#fff}</style></head>
      <body><article class="doc-paper">${body}</article></body></html>`;
  }

  // Routed from #/detail/print/<kind>/<id>
  function printView(el, k, id) {
    let d;
    try { d = docFor(k, id); } catch (e) { el.insertAdjacentHTML('beforeend', '<div class="card"><h3>Document not found</h3></div>'); return; }
    UI.head(d.title, `${id} · print or download this document`, `
      <button class="btn ghost" data-dl>Download file</button>
      <button class="btn primary zip-only" data-print>Print / save as PDF</button>`);
    el.insertAdjacentHTML('beforeend', `<article class="doc-paper">${d.body}</article>`);
    el.querySelector('[data-dl]').onclick = () => saveFile(d.file, d.html, 'text/html');
    const pb = el.querySelector('[data-print]');
    if (pb) pb.onclick = () => window.print();
  }

  // ---------- registrations ----------
  App.register('documents/library', { group: 'Documents', label: 'Library', render: libraryPage });
  App.register('documents/center', { group: 'Documents', label: 'Print & download', render: centrePage });

  X.openUpload = openUpload;
  X.printView = printView;
  X.saveFile = saveFile;
})();
