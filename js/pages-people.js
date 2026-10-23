/* pages-people.js: Employee directory, Attendance, Leave. */
(function () {
  'use strict';
  const { esc, badge, renderTable, drawer, modal, toast, kpi, card } = UI;
  const empName = (id) => DB.employee(id)?.name || '—';
  const ANNUAL_ALLOWANCE = 12; // days per year, demo policy
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5) + 1;
  const approvedAnnual = (empId) => DB.list('leaves')
    .filter((l) => l.empId === empId && l.type === 'Annual' && l.status === 'Approved')
    .reduce((s, l) => s + l.days, 0);

  // ---------- Employee directory ----------
  function employeesPage(el) {
    UI.head('Employee directory', 'Everyone in the company, with their department and attendance rate.',
      '<button class="btn primary" data-new>+ New employee</button>');
    const host = el.appendChild(document.createElement('div'));
    const attRate = (id) => {
      const rows = DB.list('attendance').filter((a) => a.empId === id);
      if (!rows.length) return null;
      return Math.round((rows.filter((a) => a.status === 'Present' || a.status === 'Late').length / rows.length) * 100);
    };
    renderTable(host, {
      id: 'employees', exportName: 'employees', rows: () => DB.list('employees'), pageSize: 8,
      rowActions: CRUD.rowActions('employees'),
      search: ['name', 'role', 'email', 'dept'],
      filters: [{ key: 'dept', label: 'Department', get: (e) => e.dept, options: [...new Set(DB.list('employees').map((e) => e.dept))] }],
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'dept', label: 'Department' },
        { key: 'role', label: 'Role' },
        { key: 'email', label: 'Email' },
        { key: 'joined', label: 'Joined' },
        { key: 'attendance', label: 'Attendance', align: 'right', value: (e) => attRate(e.id) ?? -1, render: (e) => (attRate(e.id) === null ? '—' : attRate(e.id) + '%') },
        { key: 'status', label: 'Status', render: (e) => badge(e.status) },
      ],
      onRow: (e) => {
        const leaves = DB.list('leaves').filter((l) => l.empId === e.id);
        modal({ title: e.name, wide: false, body: `
          <p class="muted">${esc(e.role)} · ${esc(e.dept)} · ${esc(e.email)}</p>
          <div class="grid two">
            ${kpi('Annual leave left', Math.max(0, ANNUAL_ALLOWANCE - approvedAnnual(e.id)) + ' days')}
            ${kpi('Attendance', attRate(e.id) === null ? '—' : attRate(e.id) + '%')}
          </div>
          <h4>Leave requests</h4>
          <ul class="timeline">${leaves.map((l) => `<li>${esc(l.type)} · ${esc(l.from)} (${l.days}d) · ${badge(l.status)}</li>`).join('') || '<li class="muted">None</li>'}</ul>`,
          actions: [{ label: 'Close', run: null }] });
      },
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'New employee', submitLabel: 'Add employee',
      fields: [
        { name: 'name', label: 'Full name', required: true, full: true },
        { name: 'dept', label: 'Department', type: 'select', options: ['Sales', 'Warehouse', 'Finance', 'HR', 'IT', 'Purchasing'].map((d) => ({ value: d, label: d })) },
        { name: 'role', label: 'Role', required: true },
        { name: 'email', label: 'Work email', required: true },
        { name: 'joined', label: 'Joining date', type: 'date', value: DB.today(), required: true },
      ],
      onSubmit: (v) => {
        if (!/^\S+@\S+\.\S+$/.test(v.email)) throw new Error('Enter a valid email');
        DB.add('employees', 'E', { name: v.name.trim(), dept: v.dept, role: v.role.trim(), email: v.email.trim(), joined: v.joined, status: 'Active' }, `Employee ${v.name} added`);
        toast('Employee added'); App.refresh();
      },
    });
  }

  // ---------- Attendance ----------
  function attendancePage(el) {
    UI.head('Attendance', 'Daily attendance log. Use the button to mark or correct a day.',
      '<button class="btn primary" data-mark>+ Mark attendance</button>');
    const latest = DB.list('attendance').map((a) => a.date).sort().pop() || DB.today();
    const dayRows = DB.list('attendance').filter((a) => a.date === latest);
    const count = (s) => dayRows.filter((a) => a.status === s).length;
    el.insertAdjacentHTML('beforeend', `<div class="grid four">
      ${kpi('Latest day', latest)}
      ${kpi('Present', count('Present'), '', 'good')}
      ${kpi('Late', count('Late'), '', 'warn')}
      ${kpi('Absent', count('Absent'), '', 'bad')}</div>`);
    const host = el.appendChild(document.createElement('div'));
    renderTable(host, {
      id: 'attendance', exportName: 'attendance', rows: () => [...DB.list('attendance')].sort((a, b) => b.date.localeCompare(a.date)),
      rowActions: CRUD.rowActions('attendance'),
      pageSize: 10, selectable: false,
      search: [(a) => empName(a.empId), (a) => a.date],
      filters: [
        { key: 'date', label: 'Date', get: (a) => a.date, options: [...new Set(DB.list('attendance').map((a) => a.date))].sort().reverse() },
        { key: 'status', label: 'Status', get: (a) => a.status, options: ['Present', 'Late', 'Half-day', 'Absent'] },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'name', label: 'Employee', value: (a) => empName(a.empId) },
        { key: 'dept', label: 'Department', value: (a) => DB.employee(a.empId)?.dept },
        { key: 'checkIn', label: 'Check-in', render: (a) => a.checkIn || '—' },
        { key: 'status', label: 'Status', render: (a) => badge(a.status) },
      ],
    });
    el.querySelector('[data-mark]').onclick = () => drawer({
      title: 'Mark attendance', submitLabel: 'Save',
      fields: [
        { name: 'empId', label: 'Employee', type: 'select', required: true, options: DB.list('employees').map((e) => ({ value: e.id, label: e.name })) },
        { name: 'date', label: 'Date', type: 'date', value: DB.today(), required: true },
        { name: 'status', label: 'Status', type: 'select', options: ['Present', 'Late', 'Half-day', 'Absent'].map((s) => ({ value: s, label: s })) },
        { name: 'checkIn', label: 'Check-in time', type: 'time', help: 'Leave empty for absent' },
      ],
      onSubmit: (v) => {
        if (v.status !== 'Absent' && !v.checkIn) throw new Error('Enter a check-in time');
        DB.setAttendance(v.empId, v.date, v.status, v.checkIn);
        toast('Attendance saved'); App.refresh();
      },
    });
  }

  // ---------- Leave ----------
  function leavePage(el) {
    const leaves = () => [...DB.list('leaves')].reverse();
    UI.head('Leave', 'Requests are approved or rejected by a manager. Balances use a 12-day annual allowance.',
      '<button class="btn primary" data-new>+ Request leave</button>');
    const today = DB.today();
    const pending = DB.list('leaves').filter((l) => l.status === 'Pending').length;
    const onLeave = DB.list('leaves').filter((l) => l.status === 'Approved' && l.from <= today && l.to >= today).length;
    el.insertAdjacentHTML('beforeend', `<div class="grid three">
      ${kpi('Pending approval', pending, '', pending ? 'warn' : '')}
      ${kpi('On leave today', onLeave)}
      ${kpi('Annual days used', DB.list('employees').reduce((s, e) => s + approvedAnnual(e.id), 0))}</div>`);
    const host = el.appendChild(document.createElement('div'));
    const decide = (id, status) => { DB.decideLeave(id, status); toast(`Leave ${status.toLowerCase()}`); App.refresh(); };
    renderTable(host, {
      id: 'leave', exportName: 'leave-requests', rows: leaves, pageSize: 8,
      rowActions: CRUD.rowActions('leaves'),
      search: [(l) => empName(l.empId), (l) => l.reason, (l) => l.type],
      filters: [{ key: 'status', label: 'Status', get: (l) => l.status, options: ['Pending', 'Approved', 'Rejected'] }],
      columns: [
        { key: 'name', label: 'Employee', value: (l) => empName(l.empId) },
        { key: 'type', label: 'Type' },
        { key: 'from', label: 'From' },
        { key: 'to', label: 'To' },
        { key: 'days', label: 'Days', align: 'right' },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status', render: (l) => badge(l.status) },
      ],
      bulk: [
        { label: 'Approve', run: (ids) => { ids.forEach((id) => DB.decideLeave(id, 'Approved')); toast(`${ids.length} approved`); App.refresh(); } },
        { label: 'Reject', danger: true, run: (ids) => { ids.forEach((id) => DB.decideLeave(id, 'Rejected')); toast(`${ids.length} rejected`, 'warn'); App.refresh(); } },
      ],
      onRow: (l) => {
        if (l.status !== 'Pending') return modal({ title: 'Leave request', body: `<p>${esc(empName(l.empId))}: ${esc(l.type)} leave is <strong>${l.status}</strong>.</p>`, actions: [{ label: 'Close', run: null }] });
        modal({ title: `${empName(l.empId)} · ${l.type} leave`, body: `<p>${esc(l.from)} to ${esc(l.to)} (${l.days} day${l.days > 1 ? 's' : ''})</p><p class="muted">Reason: ${esc(l.reason)}</p>`,
          actions: [{ label: 'Reject', danger: true, run: () => decide(l.id, 'Rejected') }, { label: 'Approve', primary: true, run: () => decide(l.id, 'Approved') }] });
      },
    });
    el.querySelector('[data-new]').onclick = () => drawer({
      title: 'Request leave', submitLabel: 'Submit request',
      fields: [
        { name: 'empId', label: 'Employee', type: 'select', required: true, options: DB.list('employees').map((e) => ({ value: e.id, label: e.name })) },
        { name: 'type', label: 'Leave type', type: 'select', options: ['Annual', 'Sick', 'Casual'].map((t) => ({ value: t, label: t })) },
        { name: 'from', label: 'From', type: 'date', value: today, required: true },
        { name: 'to', label: 'To', type: 'date', value: today, required: true },
        { name: 'reason', label: 'Reason', full: true, value: '' },
      ],
      onSubmit: (v) => {
        if (v.to < v.from) throw new Error('End date is before start date');
        const days = daysBetween(v.from, v.to);
        if (v.type === 'Annual' && approvedAnnual(v.empId) + days > ANNUAL_ALLOWANCE) {
          throw new Error(`Only ${ANNUAL_ALLOWANCE - approvedAnnual(v.empId)} annual days left for this employee`);
        }
        DB.add('leaves', 'L', { empId: v.empId, type: v.type, from: v.from, to: v.to, days, status: 'Pending', reason: v.reason || '—' }, 'Leave requested');
        toast('Leave request submitted'); App.refresh();
      },
    });
  }

  App.register('people/employees', { group: 'Attendance', label: 'Employee directory', render: employeesPage });
  App.register('people/attendance', { group: 'Attendance', label: 'Attendance', render: attendancePage });
  App.register('people/leave', { group: 'Attendance', label: 'Leave', render: leavePage });
})();
