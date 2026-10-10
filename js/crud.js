/* crud.js: Add, edit, delete and reverse for every module.
   Each entity has a schema (form fields, validation, what is blocked, what cascades).
   Rules protect the records: a product that already has stock history cannot be deleted,
   and orders or purchase orders can only be changed while they are still open.
   Pages call CRUD.rowActions('<collection>') for table rows and CRUD.act(...) for cards. */
(function (global) {
  'use strict';
  const { esc, drawer, modal, toast } = UI;
  const L = (c) => DB.list(c);
  const money = DB.money;
  const isEmail = (e) => /^\S+@\S+\.\S+$/.test(e);
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5) + 1;
  const opt = (arr, label, value = (x) => x.id) => arr.map((x) => ({ value: value(x), label: label(x) }));
  const CATS = ['Electronics', 'Hardware', 'Office', 'Packaging'];
  const DEPTS = ['Sales', 'Warehouse', 'Finance', 'HR', 'IT', 'Purchasing'];
  const ATT = ['Present', 'Late', 'Half-day', 'Absent'];
  const CUST_TYPES = ['Retail', 'B2B', 'Online'];
  const lineOpts = (priceKey) => L('products').map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, price: p[priceKey] }));
  const cleanLines = (lines) => {
    if (!lines.length) throw new Error('Add at least one line item');
    lines.forEach((l) => {
      if (!l.productId) throw new Error('Choose a product on every line');
      if (!(l.qty > 0)) throw new Error('Quantity must be at least 1');
      if (!(l.price >= 0)) throw new Error('Price cannot be negative');
    });
    return lines;
  };
  const used = (list, fn) => list.filter(fn).length;
  const sel = (name, label, options, extra = {}) => ({ name, label, type: 'select', options, ...extra });
  const dsel = (arr) => arr.map((x) => ({ value: x, label: x }));

  // ---------- schemas ----------
  const SCHEMA = {
    products: {
      name: 'product',
      label: (p) => `${p.sku} · ${p.name}`,
      fields: () => [
        { name: 'sku', label: 'SKU', required: true, help: 'Unique code' },
        { name: 'name', label: 'Name', required: true, full: true },
        sel('category', 'Category', dsel(CATS)),
        { name: 'cost', label: 'Cost', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'price', label: 'Selling price', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'reorder', label: 'Reorder level', type: 'number', min: 0, step: 1 },
      ],
      build: (v, rec) => {
        if (L('products').some((p) => p.id !== rec?.id && p.sku.toLowerCase() === v.sku.trim().toLowerCase())) throw new Error('SKU already exists');
        return { sku: v.sku.trim(), name: v.name.trim(), category: v.category, cost: +v.cost, price: +v.price, reorder: +v.reorder };
      },
      blocked: (p) => {
        const n = used(L('movements'), (m) => m.productId === p.id)
          + L('orders').reduce((s, o) => s + o.lines.filter((l) => l.productId === p.id).length, 0)
          + L('purchaseOrders').reduce((s, o) => s + o.lines.filter((l) => l.productId === p.id).length, 0);
        return n ? `${p.name} has ${n} stock or order record(s), so it cannot be deleted. Edit it instead.` : null;
      },
    },

    warehouses: {
      name: 'warehouse',
      label: (w) => w.name,
      fields: () => [
        { name: 'name', label: 'Name', required: true },
        { name: 'city', label: 'City', required: true },
        { name: 'capacity', label: 'Capacity (units)', type: 'number', min: 1, step: 1, required: true },
      ],
      build: (v) => ({ name: v.name.trim(), city: v.city.trim(), capacity: +v.capacity }),
      create: (v) => DB.add('warehouses', 'W', SCHEMA.warehouses.build(v), `Warehouse ${v.name} added`),
      blocked: (w) => {
        const stock = DB.stockRows().filter((r) => r.warehouse.id === w.id && r.qty !== 0).length;
        const refs = used(L('movements'), (m) => m.warehouseId === w.id || m.toWarehouseId === w.id)
          + used(L('orders'), (o) => o.warehouseId === w.id) + used(L('purchaseOrders'), (o) => o.warehouseId === w.id);
        if (stock || refs) return `${w.name} still holds stock or has history. It cannot be deleted.`;
        return null;
      },
    },

    vendors: {
      name: 'vendor',
      label: (v) => v.name,
      fields: () => [
        { name: 'name', label: 'Vendor name', required: true, full: true },
        { name: 'city', label: 'City', required: true },
        { name: 'email', label: 'Email', required: true },
        { name: 'leadDays', label: 'Lead time (days)', type: 'number', min: 0, step: 1, required: true },
        { name: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, max: 5, step: 0.1, required: true },
      ],
      build: (v) => {
        if (!isEmail(v.email)) throw new Error('Enter a valid email');
        if (!(v.rating >= 1 && v.rating <= 5)) throw new Error('Rating must be between 1 and 5');
        return { name: v.name.trim(), city: v.city.trim(), email: v.email.trim(), leadDays: +v.leadDays, rating: +v.rating };
      },
      blocked: (v) => (used(L('purchaseOrders'), (p) => p.vendorId === v.id) ? `${v.name} has purchase orders. It cannot be deleted.` : null),
    },

    customers: {
      name: 'customer',
      label: (c) => c.name,
      fields: () => [
        { name: 'name', label: 'Customer name', required: true, full: true },
        sel('type', 'Type', dsel(CUST_TYPES)),
        { name: 'city', label: 'City', required: true },
        { name: 'email', label: 'Email', required: true },
      ],
      build: (v) => {
        if (!isEmail(v.email)) throw new Error('Enter a valid email');
        return { name: v.name.trim(), type: v.type, city: v.city.trim(), email: v.email.trim() };
      },
      blocked: (c) => (used(L('orders'), (o) => o.customerId === c.id) || used(L('invoices'), (i) => i.customerId === c.id)
        ? `${c.name} has orders or invoices. It cannot be deleted.` : null),
    },

    purchaseOrders: {
      name: 'purchase order',
      label: (p) => p.id,
      canEdit: (p) => p.status === 'Draft',
      fields: () => [
        sel('vendorId', 'Vendor', opt(L('vendors'), (v) => v.name)),
        sel('warehouseId', 'Deliver to', opt(L('warehouses'), (w) => `${w.name} (${w.city})`)),
        { name: 'date', label: 'Order date', type: 'date', required: true },
        { name: 'expected', label: 'Expected delivery', type: 'date', required: true },
        { name: 'lines', label: 'Items (price = unit cost)', type: 'lines', full: true, options: lineOpts('cost') },
      ],
      get: (p) => ({ ...p, lines: p.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.unitCost })) }),
      note: () => 'Only draft POs can be edited. Approved and received POs are kept for the record.',
      save: (v, rec) => {
        const lines = cleanLines(v.lines);
        DB.update('purchaseOrders', rec.id, {
          vendorId: v.vendorId, warehouseId: v.warehouseId, date: v.date, expected: v.expected,
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.price })),
        }, `PO ${rec.id} edited`);
      },
      blocked: (p) => (p.status !== 'Draft' ? `${p.id} is ${p.status}. Only draft POs can be deleted.` : null),
    },

    orders: {
      name: 'sales order',
      label: (o) => o.id,
      canEdit: (o) => o.status === 'Pending',
      fields: () => [
        sel('customerId', 'Customer', opt(L('customers'), (c) => c.name)),
        sel('warehouseId', 'Ship from', opt(L('warehouses'), (w) => `${w.name} (${w.city})`)),
        { name: 'date', label: 'Order date', type: 'date', required: true },
        { name: 'lines', label: 'Items (price = selling price)', type: 'lines', full: true, options: lineOpts('price') },
      ],
      get: (o) => ({ ...o }),
      note: () => 'Only pending orders can be edited or deleted. Shipped orders already moved stock and raised invoices.',
      save: (v, rec) => {
        const lines = cleanLines(v.lines);
        DB.update('orders', rec.id, {
          customerId: v.customerId, warehouseId: v.warehouseId, date: v.date,
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
        }, `Order ${rec.id} edited`);
      },
      blocked: (o) => (o.status !== 'Pending' ? `${o.id} is ${o.status}. Only pending orders can be deleted.` : null),
    },

    employees: {
      name: 'employee',
      label: (e) => e.name,
      fields: () => [
        { name: 'name', label: 'Full name', required: true, full: true },
        sel('dept', 'Department', dsel(DEPTS)),
        { name: 'role', label: 'Role', required: true },
        { name: 'email', label: 'Work email', required: true },
        { name: 'joined', label: 'Joining date', type: 'date', required: true },
        sel('status', 'Status', dsel(['Active', 'On leave', 'Inactive'])),
      ],
      build: (v) => {
        if (!isEmail(v.email)) throw new Error('Enter a valid email');
        return { name: v.name.trim(), dept: v.dept, role: v.role.trim(), email: v.email.trim(), joined: v.joined, status: v.status };
      },
      cascade: (e) => `Their attendance and leave records (${L('attendance').filter((a) => a.empId === e.id).length} days, ${L('leaves').filter((l) => l.empId === e.id).length} leave requests) are removed too.`,
      onDelete: (e) => {
        DB.removeWhere('attendance', (a) => a.empId === e.id, `Attendance of ${e.name} removed`);
        DB.removeWhere('leaves', (l) => l.empId === e.id, `Leave of ${e.name} removed`);
        DB.remove('employees', e.id, `Employee ${e.name} deleted`);
      },
    },

    leaves: {
      name: 'leave request',
      label: (l) => `${DB.employee(l.empId)?.name || '—'} · ${l.type} ${l.from}`,
      canEdit: (l) => l.status === 'Pending',
      fields: () => [
        sel('empId', 'Employee', opt(L('employees'), (e) => e.name)),
        sel('type', 'Leave type', dsel(['Annual', 'Sick', 'Casual'])),
        { name: 'from', label: 'From', type: 'date', required: true },
        { name: 'to', label: 'To', type: 'date', required: true },
        { name: 'reason', label: 'Reason', full: true },
      ],
      get: (l) => ({ ...l }),
      note: () => 'Only pending requests can be edited. Approved requests can be deleted.',
      save: (v, rec) => {
        if (v.to < v.from) throw new Error('End date is before start date');
        DB.update('leaves', rec.id, { empId: v.empId, type: v.type, from: v.from, to: v.to, days: daysBetween(v.from, v.to), reason: v.reason || '—' }, `Leave ${rec.id} edited`);
      },
    },

    attendance: {
      name: 'attendance record',
      label: (a) => `${DB.employee(a.empId)?.name || '—'} · ${a.date}`,
      fields: () => [
        sel('status', 'Status', dsel(ATT)),
        { name: 'checkIn', label: 'Check-in time', type: 'time', help: 'Leave empty for absent' },
      ],
      get: (a) => ({ ...a }),
      save: (v, rec) => {
        if (v.status !== 'Absent' && !v.checkIn) throw new Error('Enter a check-in time');
        DB.setAttendance(rec.empId, rec.date, v.status, v.checkIn);
      },
    },

    movements: {
      name: 'stock movement',
      label: (m) => `${m.type} ${m.qty} · ${m.date}`,
      canDelete: false,
      // A ledger is never edited. A mistake is corrected with an equal and opposite entry.
      reverse: (m) => {
        const base = { productId: m.productId, qty: m.qty, date: DB.today(), ref: 'REV-' + m.id, note: `Reversal of ${m.id}` };
        if (m.type === 'IN') return DB.addMovement({ ...base, type: 'OUT', warehouseId: m.warehouseId });
        if (m.type === 'OUT') return DB.addMovement({ ...base, type: 'IN', warehouseId: m.warehouseId });
        if (m.type === 'TRANSFER') return DB.addMovement({ ...base, type: 'TRANSFER', warehouseId: m.toWarehouseId, toWarehouseId: m.warehouseId });
        return DB.addMovement({ ...base, type: 'ADJUST', qty: -m.qty, warehouseId: m.warehouseId });
      },
    },
  };

  // ---------- generic actions ----------
  function create(coll) {
    const sc = SCHEMA[coll];
    drawer({
      title: `New ${sc.name}`, submitLabel: `Add ${sc.name}`,
      fields: sc.fields(),
      onSubmit: (v) => { sc.create(v); toast(`${sc.name[0].toUpperCase() + sc.name.slice(1)} added`); App.refresh(); },
    });
  }

  function edit(coll, rec) {
    const sc = SCHEMA[coll];
    if (sc.canEdit && !sc.canEdit(rec)) return toast(`${sc.label(rec)} is ${rec.status || 'locked'} and can no longer be edited`, 'warn');
    const current = sc.get ? sc.get(rec) : rec;
    drawer({
      title: `Edit ${sc.name}`, submitLabel: 'Save changes', note: sc.note ? sc.note(rec) : undefined,
      fields: sc.fields().map((f) => ({ ...f, value: current[f.name] ?? f.value })),
      onSubmit: (v) => {
        if (sc.save) sc.save(v, rec);
        else DB.update(coll, rec.id, sc.build(v, rec), `${sc.name} ${rec.id} edited`);
        toast('Saved changes'); App.refresh();
      },
    });
  }

  function remove(coll, rec) {
    const sc = SCHEMA[coll];
    const why = sc.blocked ? sc.blocked(rec) : null;
    if (why) return toast(why, 'warn');
    modal({
      title: `Delete ${sc.name}?`,
      body: `<p><strong>${esc(sc.label(rec))}</strong> will be removed. This is recorded in the audit log.</p>
        ${sc.cascade ? `<p class="note">${esc(sc.cascade(rec))}</p>` : ''}`,
      actions: [
        { label: 'Cancel', run: null },
        { label: 'Delete', danger: true, run: () => {
          if (sc.onDelete) sc.onDelete(rec);
          else DB.remove(coll, rec.id, `${sc.name} ${rec.id} deleted`);
          toast('Deleted'); App.refresh();
        } },
      ],
    });
  }

  function reverse(coll, rec) {
    const sc = SCHEMA[coll];
    modal({
      title: 'Reverse this movement?',
      body: `<p>${esc(sc.label(rec))} will be cancelled with an opposite entry. The original stays in the ledger.</p>`,
      actions: [
        { label: 'Cancel', run: null },
        { label: 'Reverse', primary: true, run: () => {
          try { sc.reverse(rec); toast('Reversal posted'); App.refresh(); }
          catch (e) { toast(e.message, 'bad'); }
        } },
      ],
    });
  }

  // Row actions for a table: pass the collection name, get back a function of the row
  function rowActions(coll) {
    return (row) => {
      const sc = SCHEMA[coll];
      const out = [];
      if (sc.fields && (!sc.canEdit || sc.canEdit(row))) out.push({ label: 'Edit', run: (r) => edit(coll, r) });
      if (sc.reverse) out.push({ label: 'Reverse', run: (r) => reverse(coll, r) });
      if (sc.canDelete !== false) out.push({ label: 'Delete', danger: true, run: (r) => remove(coll, r) });
      return out;
    };
  }

  // Used by cards (warehouses) and anywhere a record id is known
  function act(coll, id, action) {
    const rec = DB.byId(coll, id);
    if (!rec) return toast('Record not found', 'bad');
    if (action === 'edit') edit(coll, rec);
    else if (action === 'delete') remove(coll, rec);
    else if (action === 'reverse') reverse(coll, rec);
  }

  global.CRUD = { create, edit, remove, reverse, rowActions, act, SCHEMA };
})(window);
