/* ui.js: reusable interface components.
   Data table (sort, filter, search, pagination, bulk actions, CSV export),
   modal, form drawer with line items, toasts, badges, breadcrumbs, SVG chart. */
(function (global) {
  'use strict';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // ---------- badges ----------
  const GOOD = ['Received', 'Delivered', 'Paid', 'Present', 'Approved', 'Active', 'In stock'];
  const WARN = ['Pending', 'Draft', 'Unpaid', 'Late', 'Partial', 'Half-day', 'Low stock'];
  const BAD = ['Overdue', 'Absent', 'Rejected', 'Cancelled', 'Out of stock'];
  const BLUE = ['Shipped', 'Transfer', 'IN', 'OUT', 'ADJUST', 'TRANSFER'];
  const badge = (s) => {
    const cls = GOOD.includes(s) ? 'good' : WARN.includes(s) ? 'warn' : BAD.includes(s) ? 'bad' : BLUE.includes(s) ? 'info' : 'neutral';
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  };

  // ---------- breadcrumbs ----------
  const crumbs = (parts) => `<nav class="crumbs" aria-label="Breadcrumb">${parts
    .map((p, i) => (i === parts.length - 1 ? `<span aria-current="page">${esc(p.label)}</span>`
      : p.href ? `<a href="${esc(p.href)}">${esc(p.label)}</a>` : `<span>${esc(p.label)}</span>`))
    .join('<span class="sep">/</span>')}</nav>`;

  // ---------- toast notifications ----------
  const toast = (msg, type = 'ok') => {
    let wrap = document.getElementById('toasts');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toasts';
      wrap.setAttribute('role', 'status');
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3200);
  };

  // ---------- modal ----------
  const modal = ({ title, body, actions = [], wide = false }) => {
    close();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'overlay';
    ov.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></header>
        <div class="modal-body"></div>
        ${actions.length ? '<footer class="modal-foot"></footer>' : ''}
      </div>`;
    const bodyEl = ov.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const foot = ov.querySelector('.modal-foot');
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : 'ghost');
      b.textContent = a.label;
      b.onclick = () => { if (a.keepOpen !== true) close(); if (a.run) a.run(); };
      foot.appendChild(b);
    });
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.hasAttribute('data-close')) close(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', escHandler);
    return ov;
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    const o = document.getElementById('overlay');
    if (o) o.remove();
    document.removeEventListener('keydown', escHandler);
  }

  // ---------- form drawer (slides in from the right) ----------
  // fields: {name,label,type:text|number|date|select|textarea|lines, options:[{value,label}], value, required, help}
  // lines: product line items; options = [{value,label,price}]
  function drawer({ title, fields, submitLabel = 'Save', onSubmit, note }) {
    close();
    const ov = document.createElement('div');
    ov.className = 'overlay drawer-overlay';
    ov.id = 'overlay';
    const fieldHTML = (f) => {
      if (f.type === 'lines') return `
        <div class="field full"><label>${esc(f.label)}</label>
          <div class="lines" data-lines="${f.name}"></div>
          <button type="button" class="btn ghost sm" data-add-line="${f.name}">+ Add line</button>
        </div>`;
      const req = f.required ? ' required' : '';
      let input;
      if (f.type === 'select') {
        input = `<select name="${f.name}"${req}>${f.options.map((o) =>
          `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      } else if (f.type === 'textarea') {
        input = `<textarea name="${f.name}" rows="3"${req}>${esc(f.value)}</textarea>`;
      } else {
        input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"${req}
          ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`;
      }
      return `<div class="field ${f.full ? 'full' : ''}"><label>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>${input}
        ${f.help ? `<small>${esc(f.help)}</small>` : ''}</div>`;
    };
    ov.innerHTML = `
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></header>
        <form class="form-grid" novalidate>
          ${note ? `<p class="note">${esc(note)}</p>` : ''}
          ${fields.map(fieldHTML).join('')}
          <p class="form-error" role="alert" hidden></p>
          <footer class="drawer-foot">
            <button type="button" class="btn ghost" data-close>Cancel</button>
            <button type="submit" class="btn primary">${esc(submitLabel)}</button>
          </footer>
        </form>
      </aside>`;
    document.body.appendChild(ov);
    document.addEventListener('keydown', escHandler);

    const form = ov.querySelector('form');
    const errBox = ov.querySelector('.form-error');

    // line-item editor
    const addLine = (name, data = {}) => {
      const f = fields.find((x) => x.name === name);
      const box = form.querySelector(`[data-lines="${name}"]`);
      const row = document.createElement('div');
      row.className = 'line-row';
      row.innerHTML = `
        <select data-k="productId">${f.options.map((o) =>
          `<option value="${esc(o.value)}" data-price="${o.price ?? ''}" ${o.value === data.productId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
        <input data-k="qty" type="number" min="1" step="1" value="${data.qty ?? 1}" placeholder="Qty">
        <input data-k="price" type="number" min="0" step="0.01" value="${data.price ?? ''}" placeholder="Price">
        <button type="button" class="icon-btn" data-rm aria-label="Remove line">✕</button>`;
      box.appendChild(row);
      const sel = row.querySelector('[data-k="productId"]');
      const price = row.querySelector('[data-k="price"]');
      if (!data.price) price.value = sel.selectedOptions[0].dataset.price || '';
      sel.onchange = () => { price.value = sel.selectedOptions[0].dataset.price || ''; };
      row.querySelector('[data-rm]').onclick = () => row.remove();
    };
    fields.filter((f) => f.type === 'lines').forEach((f) => {
      (f.value || []).forEach((l) => addLine(f.name, l));
      if (!(f.value || []).length) addLine(f.name);
    });
    form.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-line]');
      if (add) addLine(add.dataset.addLine);
    });

    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const values = {};
      const fd = new FormData(form);
      fields.forEach((f) => {
        if (f.type === 'lines') {
          values[f.name] = [...form.querySelectorAll(`[data-lines="${f.name}"] .line-row`)].map((r) => ({
            productId: r.querySelector('[data-k="productId"]').value,
            qty: Number(r.querySelector('[data-k="qty"]').value),
            price: Number(r.querySelector('[data-k="price"]').value),
          }));
        } else {
          values[f.name] = fd.get(f.name);
        }
      });
      try {
        // required + number checks
        for (const f of fields) {
          if (f.required && (values[f.name] === '' || (Array.isArray(values[f.name]) && !values[f.name].length))) {
            throw new Error(`${f.label} is required`);
          }
          if (f.type === 'number' && values[f.name] !== '' && Number.isNaN(Number(values[f.name]))) {
            throw new Error(`${f.label} must be a number`);
          }
        }
        onSubmit(values);
        close();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
    setTimeout(() => form.querySelector('input,select,textarea')?.focus(), 30);
    return ov;
  }

  // ---------- CSV export ----------
  // Opens a preview with two options: Copy (works in the published preview) and
  // Download (a normal file download in the downloaded copy).
  function downloadCSV(filename, rows, columns) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = columns.map((c) => cell(c.label)).join(',');
    const body = rows.map((r) => columns.map((c) => cell(c.csv ? c.csv(r) : r[c.key])).join(','));
    const text = [head, ...body].join('\n');
    const preview = [head, ...body.slice(0, 6)].map((l) => esc(l)).join('\n');
    modal({
      title: `Export ${filename}.csv`, wide: true,
      body: `<p class="muted">${rows.length} row(s). Copy the text, or download the file.</p>
        <pre class="csv-preview">${preview}${body.length > 6 ? `\n… ${body.length - 6} more rows` : ''}</pre>`,
      actions: [
        { label: 'Close', run: null },
        { label: 'Copy CSV', keepOpen: true, run: async () => {
          try { await navigator.clipboard.writeText('\ufeff' + text); toast('CSV copied to clipboard'); }
          catch (e) { toast('Copy blocked here. Use Download instead.', 'warn'); }
        } },
        { label: 'Download', primary: true, keepOpen: true, run: () => {
          const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = filename + '.csv';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          toast(`Downloaded ${filename}.csv`);
        } },
      ],
    });
  }

  // ---------- data table ----------
  // cfg: {id, columns:[{key,label,sort,render,value,csv,align}], rows():[], rowId, search:[fn|key], filters:[{key,label,get,options?}],
  //       pageSize, bulk:[{label,danger,run(ids)}], exportName, onRow(row), empty}
  const tableState = {};

  function renderTable(container, cfg) {
    const st = tableState[cfg.id] || (tableState[cfg.id] = { sort: null, dir: 1, page: 1, q: '', f: {}, sel: new Set() });
    // command palette can pre-fill a search on the target table
    if (global.UI.pendingSearch && global.UI.pendingSearch.id === cfg.id) {
      st.q = global.UI.pendingSearch.q; st.page = 1; st.f = {};
      global.UI.pendingSearch = null;
    }
    const pageSize = cfg.pageSize || 10;
    const rowId = cfg.rowId || ((r) => r.id);
    const cellVal = (row, col) => (col.value ? col.value(row) : row[col.key]);

    // 1. filter
    let rows = cfg.rows();
    (cfg.filters || []).forEach((f) => {
      const v = st.f[f.key];
      if (v) rows = rows.filter((r) => String(f.get(r)) === v);
    });
    // 2. search
    if (st.q) {
      const q = st.q.toLowerCase();
      rows = rows.filter((r) => (cfg.search || []).some((k) => {
        const v = typeof k === 'function' ? k(r) : r[k];
        return String(v ?? '').toLowerCase().includes(q);
      }));
    }
    // 3. sort
    if (st.sort) {
      const col = cfg.columns.find((c) => c.key === st.sort);
      if (col) {
        rows = [...rows].sort((a, b) => {
          const x = cellVal(a, col), y = cellVal(b, col);
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * st.dir;
          return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * st.dir;
        });
      }
    }
    // 4. paginate
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (st.page > pages) st.page = pages;
    const start = (st.page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const allIds = rows.map(rowId);
    const selCount = [...st.sel].filter((id) => allIds.includes(id)).length;

    const sortIcon = (key) => (st.sort === key ? (st.dir > 0 ? ' ▲' : ' ▼') : '');

    container.innerHTML = `
      <div class="table-card">
        <div class="table-toolbar">
          <input class="search" type="search" placeholder="Search…" value="${esc(st.q)}" data-q aria-label="Search">
          ${(cfg.filters || []).map((f) => `
            <select data-f="${f.key}" aria-label="${esc(f.label)}">
              <option value="">All ${esc(f.label.toLowerCase())}</option>
              ${f.options.map((o) => `<option value="${esc(o)}" ${st.f[f.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select>`).join('')}
          <span class="spacer"></span>
          ${cfg.exportName ? '<button class="btn ghost sm" data-export>⤓ Export CSV</button>' : ''}
        </div>
        ${selCount ? `
          <div class="bulk-bar">
            <strong>${selCount} selected</strong>
            ${(cfg.bulk || []).map((b, i) => `<button class="btn sm ${b.danger ? 'danger' : 'ghost'}" data-bulk="${i}">${esc(b.label)}</button>`).join('')}
            <button class="btn sm ghost" data-clear>Clear</button>
          </div>` : ''}
        <div class="table-wrap">
          <table>
            <thead><tr>
              ${cfg.selectable !== false ? `<th class="chk"><input type="checkbox" data-selall aria-label="Select all" ${selCount && selCount === allIds.length ? 'checked' : ''}></th>` : ''}
              ${cfg.columns.map((c) => `
                <th class="${c.align === 'right' ? 'num' : ''}">
                  ${c.sort === false ? esc(c.label) : `<button class="sort" data-sort="${c.key}">${esc(c.label)}${sortIcon(c.key)}</button>`}
                </th>`).join('')}
              ${cfg.rowActions ? '<th class="ra-head"><span class="sr">Actions</span></th>' : ''}
            </tr></thead>
            <tbody>
              ${pageRows.length ? pageRows.map((r, i) => {
                const id = rowId(r);
                return `<tr style="--r:${i}" class="${cfg.onRow ? 'clickable' : ''} ${st.sel.has(id) ? 'selected' : ''}" data-row="${esc(id)}">
                  ${cfg.selectable !== false ? `<td class="chk"><input type="checkbox" data-sel="${esc(id)}" ${st.sel.has(id) ? 'checked' : ''} aria-label="Select row"></td>` : ''}
                  ${cfg.columns.map((c) => `<td class="${c.align === 'right' ? 'num' : ''}">${c.render ? c.render(r) : esc(cellVal(r, c))}</td>`).join('')}
                  ${cfg.rowActions ? `<td class="row-actions">${cfg.rowActions(r).map((a, i) =>
                    `<button class="btn ghost xs ${a.danger ? 'danger-text' : ''}" data-ra="${i}" data-rrow="${esc(id)}">${esc(a.label)}</button>`).join('')}</td>` : ''}
                </tr>`;
              }).join('') : `<tr><td colspan="99" class="empty">${esc(cfg.empty || 'No records match your filters.')}</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="table-foot">
          <span>${rows.length ? `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length}` : '0 results'}</span>
          <span class="pager">
            <button class="btn ghost sm" data-page="prev" ${st.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
            <span>Page ${st.page} / ${pages}</span>
            <button class="btn ghost sm" data-page="next" ${st.page >= pages ? 'disabled' : ''}>Next ›</button>
          </span>
        </div>
      </div>`;

    // event wiring (delegated, replaced on each render so no listeners pile up)
    container.onclick = (e) => {
      const t = e.target;
      const redraw = () => renderTable(container, cfg);
      if (t.closest('[data-export]')) {
        const cols = cfg.columns.filter((c) => c.csv !== false);
        return downloadCSV(cfg.exportName, rows, cols.map((c) => ({ key: c.key, label: c.label, csv: c.csv })));
      }
      const sortBtn = t.closest('[data-sort]');
      if (sortBtn) {
        const k = sortBtn.dataset.sort;
        if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = 1; }
        return redraw();
      }
      const pg = t.closest('[data-page]');
      if (pg) { st.page += pg.dataset.page === 'next' ? 1 : -1; return redraw(); }
      const bulk = t.closest('[data-bulk]');
      if (bulk) {
        const act = cfg.bulk[Number(bulk.dataset.bulk)];
        const ids = [...st.sel];
        act.run(ids);
        st.sel.clear();
        return renderTable(container, cfg);
      }
      if (t.closest('[data-clear]')) { st.sel.clear(); return redraw(); }
      if (t.matches('[data-selall]')) {
        if (t.checked) allIds.forEach((id) => st.sel.add(id)); else allIds.forEach((id) => st.sel.delete(id));
        return redraw();
      }
      if (t.matches('[data-sel]')) {
        const id = t.dataset.sel;
        if (t.checked) st.sel.add(id); else st.sel.delete(id);
        return redraw();
      }
      const ra = t.closest('[data-ra]');
      if (ra) {
        const row = cfg.rows().find((x) => rowId(x) === ra.dataset.rrow);
        const act = row && cfg.rowActions(row)[Number(ra.dataset.ra)];
        if (act) act.run(row);
        return;
      }
      if (t.closest('.row-actions')) return;
      const tr = t.closest('tr[data-row]');
      if (tr && cfg.onRow && !t.closest('input,button,a')) {
        const row = cfg.rows().find((r) => String(rowId(r)) === tr.dataset.row);
        if (row) cfg.onRow(row);
      }
    };
    container.onchange = (e) => {
      if (e.target.matches('[data-f]')) {
        st.f[e.target.dataset.f] = e.target.value;
        st.page = 1;
        renderTable(container, cfg);
      }
    };
    container.oninput = (e) => {
      if (e.target.matches('[data-q]')) {
        st.q = e.target.value;
        st.page = 1;
        renderTable(container, cfg);
        const again = container.querySelector('[data-q]');
        again.focus();
        again.setSelectionRange(st.q.length, st.q.length);
      }
    };
  }

  // ---------- small pieces ----------
  const kpi = (label, value, hint = '', tone = '') => `
    <div class="kpi ${tone}"><span class="kpi-label">${esc(label)}</span>
    <strong class="kpi-value">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;

  const card = (title, body, extra = '') => `
    <section class="card"><header class="card-head"><h3>${esc(title)}</h3>${extra}</header>${body}</section>`;

  // Simple SVG bar chart (no library)
  function barChart(labels, values, { height = 180, fmt = (v) => v } = {}) {
    const w = 560, h = height, pad = 28;
    const max = Math.max(1, ...values);
    const bw = (w - pad * 2) / values.length;
    const bars = values.map((v, i) => {
      const bh = ((h - pad - 10) * v) / max;
      const x = pad + i * bw + bw * 0.15;
      const y = h - pad - bh;
      return `<g><title>${esc(labels[i])}: ${esc(fmt(v))}</title>
        <rect class="bar" x="${x}" y="${y}" width="${bw * 0.7}" height="${bh}" rx="4"></rect>
        <text x="${x + bw * 0.35}" y="${h - 10}" text-anchor="middle">${esc(labels[i])}</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart">${bars}</svg>`;
  }

  // Horizontal progress bar
  const meter = (pct, tone = '') => `<div class="meter ${tone}"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;

  // Animated workflow stepper, e.g. Draft -> Approved -> Received
  const stepper = (steps, current, { cancelled = false } = {}) => {
    const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 100;
    return `<div class="stepper ${cancelled ? 'cancelled' : ''}" role="list" aria-label="Workflow progress">
      <div class="step-track"><span class="step-fill" style="--pct:${pct}%"></span></div>
      ${steps.map((s, i) => `<div class="step ${i < current ? 'done' : i === current ? 'current' : ''}" role="listitem" style="--i:${i}">
        <span class="step-dot">${i < current ? '✓' : i + 1}</span><span class="step-label">${esc(s)}</span></div>`).join('')}
    </div>`;
  };

  // Count-up animation for KPI numbers: "₹8,61,452" or "10 days" animate from 0
  const animateCounts = (root) => {
    root.querySelectorAll('.kpi-value').forEach((el) => {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      const m = el.textContent.trim().match(/^([^\d]*)([\d,]+)(\s*[a-zA-Z%()]*.*)?$/);
      if (!m || el.querySelector('small')) return;
      const target = parseInt(m[2].replace(/,/g, ''), 10);
      if (!Number.isFinite(target) || target === 0) return;
      const prefix = m[1], suffix = m[3] || '';
      const t0 = performance.now(), dur = 900;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
        el.textContent = prefix + Math.round(target * eased).toLocaleString('en-IN') + suffix;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  global.UI = { esc, badge, crumbs, toast, modal, close, drawer, renderTable, downloadCSV, kpi, card, barChart, meter, stepper, animateCounts };
})(window);
