# How to Use ERP Business Management System

A walkthrough of every screen. Estimated time: 10 minutes.

## 0. Open the app and sign in

Double-click `index.html`, or run the local server (see README).

- **Quick look:** click **Try the demo account**. No typing needed.
- **Your own account:** click **Create account**, fill in name, business name, email and a password (8+ characters, with a letter and a number). The strength bar shows how strong it is.
- **Sign out:** top-right **Sign out** button.

After signing in you land on the **Dashboard**.

## 0.1 Notice the department look

Each section has its own animated background and colour. The chip at the top shows the department you are in (for example **Inventory** in amber, or **Sales** in rose). Go to the Dashboard to see the teal network again.

## 1. Find your way around

- **Sidebar (left):** all modules, grouped. The current page is highlighted.
- **Breadcrumbs (top):** shows where you are, e.g. `Home / Sales / Orders`. Click to go back.
- **Search or jump (top, or `Ctrl + K`):** type a page name, product SKU, customer, vendor, order number or action.
- **🔔 bell:** open notifications. Click an item to go straight to it.
- **◐ button:** switch dark mode.
- **☰ button (phone):** open the sidebar.

## 2. Work with any table

Every list works the same way:

| To do this | Do this |
|---|---|
| Sort | Click a column heading. Click again to reverse. |
| Filter | Use the dropdown above the table (status, warehouse, type…). |
| Search | Type in the search box. It checks the main text columns. |
| Next page | Use `Prev` / `Next` at the bottom. |
| Select rows | Tick the boxes. A blue bar appears with bulk actions. |
| Export | Click `⤓ Export CSV`. Opens in Excel. |
| Open a record | Click the row. |

## 3. Try the main workflow (Purchase → Stock → Sale → Invoice)

This shows how the modules connect.

**Step A: Buy stock**
1. Go to **Purchasing → Purchase orders**.
2. Click **+ New PO**. Choose a vendor, a warehouse, and add items. Click **Create draft PO**.
3. Click the new **Draft** row. Click **Approve**.
4. Click the same row again (now **Approved**). Click **Receive into stock**.
5. Go to **Inventory → Stock**. The quantities have gone up. Check **Inventory → Stock movements**. You will see an `IN` line with the PO number as the reference.

**Step B: Sell stock**
1. Go to **Sales → Orders**. Click **+ New order**. Choose a customer, a warehouse, and items. The price fills in automatically. Click **Create order**.
2. Click the **Pending** order. Click **Ship & invoice**.
   - If there is not enough stock, you get a red message naming the SKU. Try a smaller quantity or receive more stock first.
3. Stock goes down (`OUT` movement). An invoice is created.

**Step C: Get paid**
1. Go to **Sales → Invoices**. Click an invoice.
2. Enter the amount received. Click **Record payment**.
3. The status changes: `Unpaid` → `Partial` → `Paid`. Invoices past their due date show `Overdue`.

## 4. Inventory

- **Products:** the catalogue. Click a product to see stock in each warehouse and recent movements. **+ New product** adds one. Status shows `Low stock` when stock is below the reorder level.
- **Stock:** stock per product per warehouse, with value at cost. Filter by warehouse or status.
- **Warehouses:** cards showing how full each warehouse is. Over 90% turns red.
- **Stock movements:** the full history. Use **+ Record movement** for:
  - `IN`: add stock (e.g. found items)
  - `OUT`: remove stock (e.g. damaged)
  - `TRANSFER`: move stock from one warehouse to another (choose the "to" warehouse)
  - `ADJUST`: correct a count. Use a **negative** number to reduce.

  The app refuses any movement that would make stock negative.

## 5. Purchasing

- **Vendors:** supplier list. Rating and lead time. **+ New vendor** adds one.
- **Purchase orders:** the workflow `Draft → Approved → Received`. Bulk action **Approve drafts** approves several at once.
- **Supplier tracking:** the scorecard. On-time delivery %, average delay in days, spend, and open POs. Vendors below 70% on time show red.

## 6. Sales

- **Customers:** account list with orders, lifetime value and money still owed. Filter by type (Retail, B2B, Online).
- **Orders:** see Section 3. Bulk action **Ship selected** ships several at once. Skipped orders are reported.
- **Invoices:** see Section 3. Summary cards show total outstanding, overdue, and collected.

## 7. Employees

- **Employee directory:** click a person to see their annual leave left, attendance rate and leave history. **+ New employee** adds one.
- **Attendance:** daily log. Use **+ Mark attendance** to add or correct a day. Check-in time is required unless the status is Absent.
- **Leave:**
  - Click a **Pending** request, then **Approve** or **Reject**.
  - Bulk approve or reject several at once.
  - **+ Request leave** creates a request. Annual leave is limited to 12 days per employee per year. The app blocks requests over the limit.

## 8. Reports

Each report has a table, a chart and a CSV export.

- **Sales:** revenue by customer. Use the From / To dates to filter.
- **Inventory:** current stock position per product, sorted by how close each item is to its reorder level.
- **Purchasing:** POs in a date range, with spend per month.
- **Employee:** attendance and leave per person in a date range.

## 9. System

- **Audit log:** every create, update, stock move, payment and approval, with time. Filter by action.
- **Reset demo data:** on the Dashboard. Restores the original data. Use this after testing.

## 10. Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl + K` or `/` | Open command palette |
| `↑` `↓` | Move in the palette |
| `Enter` | Open the highlighted item |
| `Esc` | Close a popup or drawer |

## Troubleshooting

- **Changes disappeared:** your browser cleared site data, or you are in a private window. Data is stored in this browser only.
- **Page looks broken:** make sure the `css` and `js` folders are next to `index.html` and keep their names.
- **Export file looks garbled in Excel:** use Excel's *Data → From Text/CSV* import. The file is UTF-8, so choose UTF-8 if asked.


## 9. Add, edit and delete

- **Add:** the **+ New …** button at the top of each page.
- **Edit:** click **Edit** on a row. The form opens with the current values. Orders and purchase orders can be edited only while they are still open (Pending or Draft).
- **Delete:** click **Delete** and confirm. If the record is already in use, the app blocks the delete and tells you why.
- **Reverse (stock movements):** the ledger is never edited. **Reverse** posts an opposite entry, so the history stays correct.

## 10. Live mode

Click **Live** in the top bar. New orders, stock arrivals and check-ins appear every few seconds, and the dashboard KPIs update. Click **Live** again to stop. It stays on when you come back.

## 11. Export

Click **Export CSV**. Use **Copy CSV** to paste into Excel or Sheets, or **Download** to save the file.


## 12. Customer profile and coordination

Sales → Customers → click a customer. The profile shows contact details (with Copy buttons and a WhatsApp chat link), the coordination timeline, orders, invoices and documents.
- **+ Log interaction:** record a call, WhatsApp, email, visit or meeting, and set the next follow-up date.
- **Upload document:** attach a contract, GST certificate or quote to this customer.
- **Print profile:** a printable page with all details and history.

## 13. Purchase invoice (automatic)

Purchase → Purchase orders → Approve, then Receive into stock. A vendor bill is raised automatically. Pay it from Accounting → Payables.

## 14. Print and download

Documents → Print & download centre. Every invoice, vendor bill, purchase order and customer profile is listed. Print opens the paper view. Download saves a file.

## 15. Documents

Documents → Library. Drop any file, or choose files. Set the module and link it to a customer, vendor or machine. Click a file to preview it.
