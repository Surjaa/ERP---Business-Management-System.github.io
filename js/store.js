/* store.js: data layer for ERP Business Management System.
   Seed data, localStorage persistence, audit log and business rules.
   No backend: everything runs offline by opening index.html. */
(function (global) {
  'use strict';

  const KEY = 'erp-bms-v3';
  const CURRENCY = '₹';
  const TAX_RATE = 0.18;

  // ---------- helpers ----------
  const ymd = (d) => d.toISOString().slice(0, 10);
  const shift = (n, base) => {
    const d = base ? new Date(base) : new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const today = () => ymd(new Date());
  const nextId = (prefix, list) => {
    const max = list.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ''), 10) || 0), 0);
    return prefix + (max + 1);
  };
  const money = (n) => CURRENCY + Math.round(Number(n) || 0).toLocaleString('en-IN');

  // Effect of one movement on one warehouse (positive = stock in, negative = stock out)
  const effect = (m, wid) => {
    if (m.type === 'TRANSFER') {
      return (m.warehouseId === wid ? -m.qty : 0) + (m.toWarehouseId === wid ? m.qty : 0);
    }
    if (m.warehouseId !== wid) return 0;
    return m.type === 'OUT' ? -m.qty : m.qty; // IN, and ADJUST (already signed)
  };

  // ---------- seed data (deterministic, so every demo looks the same) ----------
  function buildSeed() {
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const between = (a, b) => Math.floor(a + rnd() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const pad = (n) => String(n).padStart(2, '0');

    const warehouses = [
      { id: 'W1', name: 'Central Hub', city: 'Pune', capacity: 5000 },
      { id: 'W2', name: 'North Depot', city: 'Delhi', capacity: 3000 },
      { id: 'W3', name: 'West Store', city: 'Mumbai', capacity: 2000 },
    ];

    const products = [
      ['ELC-001', 'USB-C Cable 1m', 'Electronics', 90, 199, 40],
      ['ELC-002', 'Wireless Mouse', 'Electronics', 250, 499, 20],
      ['ELC-003', 'Power Bank 10000mAh', 'Electronics', 600, 1199, 15],
      ['HW-001', 'Steel Hammer', 'Hardware', 180, 349, 25],
      ['HW-002', 'Cordless Drill', 'Hardware', 2200, 3999, 5],
      ['HW-003', 'Wood Screws (box)', 'Hardware', 120, 229, 60],
      ['OFC-001', 'A4 Paper Ream', 'Office', 280, 399, 50],
      ['OFC-002', 'Ballpoint Pens (10)', 'Office', 60, 99, 80],
      ['OFC-003', 'Desk Organiser', 'Office', 350, 649, 10],
      ['PKG-001', 'Small Corrugated Box', 'Packaging', 25, 49, 300],
      ['PKG-002', 'Bubble Wrap Roll', 'Packaging', 400, 699, 12],
      ['PKG-003', 'Packing Tape', 'Packaging', 45, 79, 100],
    ].map(([sku, name, category, cost, price, reorder], i) => ({
      id: 'P' + (i + 1), sku, name, category, cost, price, reorder, active: true,
    }));

    const vendors = [
      ['Vendor Alpha', 'Pune', 4.6, 7],
      ['Vendor Beta', 'Delhi', 4.1, 5],
      ['Vendor Gamma', 'Mumbai', 3.8, 9],
      ['Vendor Delta', 'Pune', 4.4, 4],
      ['Vendor Epsilon', 'Delhi', 3.5, 12],
    ].map(([name, city, rating, leadDays], i) => ({
      id: 'V' + (i + 1), name, city, rating, leadDays,
      email: 'sales@' + name.split(' ')[0].toLowerCase() + '.example.com', active: true,
    }));

    const customers = [
      ['Customer Alpha', 'Pune', 'Retail'],
      ['Customer Beta', 'Mumbai', 'B2B'],
      ['Customer Gamma', 'Delhi', 'Retail'],
      ['Customer Delta', 'Bengaluru', 'Retail'],
      ['Customer Epsilon', 'Pune', 'B2B'],
      ['Customer Zeta', 'Hyderabad', 'Online'],
      ['Customer Eta', 'Mumbai', 'B2B'],
      ['Customer Theta', 'Delhi', 'B2B'],
    ].map(([name, city, type], i) => ({
      id: 'C' + (i + 1), name, city, type,
      email: 'orders@' + name.toLowerCase().replace(/[^a-z]/g, '') + '.example.com',
    }));

    const employees = [
      ['Aarav Mehta', 'Sales', 'Sales Executive'],
      ['Diya Rao', 'Warehouse', 'Inventory Lead'],
      ['Kabir Nair', 'Finance', 'Accountant'],
      ['Meera Iyer', 'HR', 'HR Manager'],
      ['Rohan Gupta', 'IT', 'Developer'],
      ['Ishita Shah', 'Sales', 'Account Manager'],
      ['Vikram Singh', 'Warehouse', 'Picker'],
      ['Ananya Das', 'Purchasing', 'Buyer'],
    ].map(([name, dept, role], i) => ({
      id: 'E' + (i + 1), name, dept, role, status: 'Active',
      email: name.toLowerCase().replace(' ', '.') + '@example.com',
      joined: shift(-between(300, 1500)),
    }));

    // ----- movements (the stock ledger is the single source of truth) -----
    const movements = [];
    const mv = (m) => movements.push({ id: 'M' + (movements.length + 1), ...m });
    const balance = (pid, wid) => movements.reduce((s, m) => (m.productId === pid ? s + effect(m, wid) : s), 0);

    products.forEach((p) => warehouses.forEach((w) => mv({
      date: shift(-100), type: 'IN', productId: p.id, warehouseId: w.id,
      qty: between(60, 300), ref: 'OPENING', note: 'Opening balance',
    })));

    // ----- purchase orders -----
    const purchaseOrders = [];
    for (let i = 0; i < 12; i++) {
      const vendor = pick(vendors);
      const warehouse = pick(warehouses);
      const date = shift(-between(10, 95));
      const status = i < 8 ? 'Received' : i < 10 ? 'Approved' : 'Draft';
      const lines = Array.from({ length: between(1, 3) }, () => {
        const p = pick(products);
        return { productId: p.id, qty: between(20, 120), unitCost: p.cost };
      });
      const expected = shift(vendor.leadDays, date);
      const po = {
        id: 'PO' + (1001 + i), vendorId: vendor.id, warehouseId: warehouse.id,
        date, expected, received: null, status, lines,
      };
      if (status === 'Received') {
        po.received = shift(between(-2, 4), expected);
        lines.forEach((l) => mv({
          date: po.received, type: 'IN', productId: l.productId, warehouseId: warehouse.id,
          qty: l.qty, ref: po.id, note: 'Goods receipt',
        }));
      }
      purchaseOrders.push(po);
    }

    // ----- sales orders + invoices -----
    const specs = Array.from({ length: 36 }, () => shift(-between(0, 60))).sort();
    const orders = [];
    const invoices = [];
    specs.forEach((date, n) => {
      const cust = pick(customers);
      const wh = pick(warehouses);
      const lines = Array.from({ length: between(1, 3) }, () => {
        const p = pick(products);
        return { productId: p.id, qty: between(1, 25), price: p.price };
      });
      let status = n < 24 ? 'Delivered' : n < 30 ? 'Shipped' : 'Pending';
      if (status !== 'Pending' && !lines.every((l) => balance(l.productId, wh.id) >= l.qty)) status = 'Pending';
      const o = { id: 'SO' + (2001 + n), customerId: cust.id, warehouseId: wh.id, date, status, lines };
      if (status !== 'Pending') {
        lines.forEach((l) => mv({
          date, type: 'OUT', productId: l.productId, warehouseId: wh.id,
          qty: l.qty, ref: o.id, note: 'Order shipped',
        }));
        const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
        const paid = [0, Math.round(subtotal * 0.5), Math.round(subtotal * (1 + TAX_RATE))][between(0, 2)];
        invoices.push({
          id: 'INV' + (3001 + n), orderId: o.id, customerId: cust.id, date,
          dueDate: shift(30, date), amount: Math.round(subtotal * (1 + TAX_RATE)), paid,
        });
      }
      orders.push(o);
    });

    // ----- attendance (last 14 days, weekends skipped) -----
    const attendance = [];
    for (let d = 1; d <= 14; d++) {
      const date = shift(-d);
      if ([0, 6].includes(new Date(date).getDay())) continue;
      employees.forEach((e) => {
        const r = rnd();
        const status = r < 0.85 ? 'Present' : r < 0.92 ? 'Late' : r < 0.97 ? 'Absent' : 'Half-day';
        const checkIn = status === 'Absent' ? '' : (status === 'Late' ? '10:' : '09:') + pad(between(0, 55));
        attendance.push({ id: 'A' + (attendance.length + 1), empId: e.id, date, status, checkIn });
      });
    }

    // ----- leave requests -----
    const leaves = Array.from({ length: 7 }, (_, i) => {
      const from = shift(between(-20, 12));
      const days = between(1, 4);
      return {
        id: 'L' + (i + 1), empId: pick(employees).id, type: pick(['Annual', 'Sick', 'Casual']),
        from, to: shift(days - 1, from), days,
        status: pick(['Pending', 'Pending', 'Approved', 'Rejected']),
        reason: pick(['Family function', 'Fever', 'Personal work', 'Travel', 'Rest']),
      };
    });

    return {
      version: 2, currency: CURRENCY,
      warehouses, products, vendors, customers, employees,
      purchaseOrders, orders, invoices, attendance, leaves, movements,
      audit: [{ id: 'X1', at: new Date().toISOString(), action: 'Seed', detail: 'Demo data created' }],
    };
  }

  // ---------- state ----------
  let S = null;

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: keep working in memory */ }
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupt or blocked: fall back to seed */ }
    return buildSeed();
  };
  const audit = (action, detail) => {
    S.audit.unshift({ id: 'X' + Date.now() + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), action, detail });
    S.audit = S.audit.slice(0, 300);
  };

  const api = {
    KEY, CURRENCY, TAX_RATE, money, today, shift,

    init() { S = load(); save(); },
    // add a collection to saved data if it is missing (keeps older saves working)
    ensure(c, def) { if (S[c] === undefined) { S[c] = def; save(); } },
    reset() { S = buildSeed(); save(); },

    // generic collection access
    list: (c) => S[c],
    byId: (c, id) => S[c].find((x) => x.id === id),
    add(c, prefix, data, msg) {
      const rec = { id: nextId(prefix, S[c]), ...data };
      S[c].push(rec);
      audit('Create', msg || `${c} ${rec.id} created`);
      save();
      return rec;
    },
    update(c, id, patch, msg) {
      const rec = api.byId(c, id);
      if (!rec) throw new Error('Record not found');
      Object.assign(rec, patch);
      audit('Update', msg || `${c} ${id} updated`);
      save();
      return rec;
    },

    remove(c, id, msg) {
      S[c] = S[c].filter((x) => x.id !== id);
      audit('Delete', msg || `${c} ${id} deleted`);
      save();
    },

    removeWhere(c, fn, msg) {
      S[c] = S[c].filter((x) => !fn(x));
      audit('Delete', msg || `${c} records removed`);
      save();
    },

    // lookups
    product: (id) => api.byId('products', id),
    vendor: (id) => api.byId('vendors', id),
    customer: (id) => api.byId('customers', id),
    employee: (id) => api.byId('employees', id),
    warehouse: (id) => api.byId('warehouses', id),

    // ----- stock -----
    balance(pid, wid) {
      return S.movements.reduce((s, m) => (m.productId === pid ? s + effect(m, wid) : s), 0);
    },
    totalStock: (pid) => S.warehouses.reduce((s, w) => s + api.balance(pid, w.id), 0),
    stockRows() {
      const rows = [];
      S.products.forEach((p) => S.warehouses.forEach((w) => rows.push({
        id: p.id + '|' + w.id, product: p, warehouse: w, qty: api.balance(p.id, w.id),
      })));
      return rows;
    },
    addMovement(m) {
      const qty = Number(m.qty);
      if (!qty) throw new Error('Quantity cannot be zero');
      if (m.type !== 'ADJUST' && qty < 0) throw new Error('Quantity must be positive');
      if (m.type === 'TRANSFER' && m.warehouseId === m.toWarehouseId) throw new Error('Source and destination must differ');
      const outflow = m.type === 'OUT' || m.type === 'TRANSFER' || (m.type === 'ADJUST' && qty < 0);
      if (outflow) {
        const have = api.balance(m.productId, m.warehouseId);
        if (have < Math.abs(qty)) throw new Error(`Only ${have} units available in this warehouse`);
      }
      const rec = { ...m, id: nextId('M', S.movements), date: m.date || today(), qty };
      S.movements.push(rec);
      audit('Stock move', `${m.type} ${qty} x ${m.productId}`);
      save();
      return rec;
    },

    // ----- totals -----
    orderSubtotal: (o) => o.lines.reduce((s, l) => s + l.qty * l.price, 0),
    poTotal: (po) => po.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
    invoiceStatus(inv) {
      if (inv.paid >= inv.amount) return 'Paid';
      if (inv.dueDate < today()) return 'Overdue';
      return inv.paid > 0 ? 'Partial' : 'Unpaid';
    },

    // ----- purchasing workflow -----
    approvePO(id) {
      const po = api.byId('purchaseOrders', id);
      if (po.status !== 'Draft') throw new Error('Only draft POs can be approved');
      po.status = 'Approved';
      audit('Approve', `${po.id} approved`);
      save();
    },
    receivePO(id) {
      const po = api.byId('purchaseOrders', id);
      if (po.status !== 'Approved') throw new Error('Only approved POs can be received');
      po.status = 'Received';
      po.received = today();
      po.lines.forEach((l) => S.movements.push({
        id: nextId('M', S.movements), date: po.received, type: 'IN', productId: l.productId,
        warehouseId: po.warehouseId, qty: l.qty, ref: po.id, note: 'Goods receipt',
      }));
      audit('Receive', `${po.id} received into stock`);
      save();
    },
    vendorStats(vid) {
      const pos = S.purchaseOrders.filter((p) => p.vendorId === vid);
      const got = pos.filter((p) => p.status === 'Received');
      const onTime = got.filter((p) => p.received <= p.expected).length;
      const delays = got.map((p) => (new Date(p.received) - new Date(p.expected)) / 864e5);
      return {
        total: pos.length,
        received: got.length,
        open: pos.filter((p) => p.status === 'Approved' || p.status === 'Draft').length,
        onTimePct: got.length ? Math.round((onTime / got.length) * 100) : null,
        avgDelay: delays.length ? (delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1) : null,
        spend: pos.reduce((s, p) => s + api.poTotal(p), 0),
      };
    },

    // ----- sales workflow -----
    shipOrder(id) {
      const o = api.byId('orders', id);
      if (o.status !== 'Pending') throw new Error('Only pending orders can be shipped');
      const short = o.lines.filter((l) => api.balance(l.productId, o.warehouseId) < l.qty);
      if (short.length) {
        throw new Error('Not enough stock for: ' + short.map((l) => api.product(l.productId).sku).join(', '));
      }
      o.status = 'Shipped';
      o.lines.forEach((l) => S.movements.push({
        id: nextId('M', S.movements), date: today(), type: 'OUT', productId: l.productId,
        warehouseId: o.warehouseId, qty: l.qty, ref: o.id, note: 'Order shipped',
      }));
      S.invoices.push({
        id: nextId('INV', S.invoices), orderId: o.id, customerId: o.customerId, date: today(),
        dueDate: shift(30), amount: Math.round(api.orderSubtotal(o) * (1 + TAX_RATE)), paid: 0,
      });
      audit('Ship', `${o.id} shipped, invoice raised`);
      save();
    },
    recordPayment(invId, amount) {
      const inv = api.byId('invoices', invId);
      const due = inv.amount - inv.paid;
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error('Enter a positive amount');
      if (amt > due) throw new Error(`Maximum payable is ${money(due)}`);
      inv.paid += amt;
      audit('Payment', `${money(amt)} received on ${inv.id}`);
      save();
    },

    // ----- people -----
    decideLeave(id, status) {
      api.update('leaves', id, { status }, `Leave ${id} ${status.toLowerCase()}`);
    },
    setAttendance(empId, date, status, checkIn) {
      const row = S.attendance.find((a) => a.empId === empId && a.date === date);
      if (row) { row.status = status; row.checkIn = checkIn || ''; }
      else S.attendance.push({ id: nextId('A', S.attendance), empId, date, status, checkIn: checkIn || '' });
      audit('Attendance', `${empId} marked ${status} on ${date}`);
      save();
    },
  };

  global.DB = api;
})(window);
