# ERP Business Management System, Explained Simply

## What is an ERP?

An **ERP** (Enterprise Resource Planning) is the software a company uses to run its daily business in one place, instead of in many spreadsheets.

Think of a shop:
- It **buys** goods from suppliers.
- It **keeps** them in a warehouse.
- It **sells** them to customers.
- It **bills** the customers and **collects** money.
- It **pays** its own staff and tracks their attendance.

An ERP connects all of these. When you sell something, the stock goes down and the invoice is created. When you receive goods, the stock goes up. Nobody has to update three different sheets by hand.

## What does this project do?

This project is a **demo** of that kind of software. It runs in a web browser, with no setup. It pretends to be the system of a small trading company that sells electronics, hardware, office supplies and packaging.

It has five main areas:

| Area | In plain words |
|---|---|
| **Inventory** | What we have, where it is, and how much |
| **Purchasing** | What we ordered from suppliers, and whether they delivered on time |
| **Sales** | Who bought what, and whether they have paid |
| **Employees** | Who works here, who is in, and who is on leave |
| **Reports** | Summaries that answer questions like "what sold best?" |

## The big idea: rules that protect the business

A basic app lets you type any number you like. A real business system does not. This system follows the same rules a real company would:

- **You cannot sell what you do not have.** If a warehouse has 5 cables, an order for 20 is refused, and the message tells you which item is short.
- **Stock is not typed in.** It is worked out from every purchase, sale and transfer ever made, like a bank statement. You can always see why stock is what it is.
- **Nothing is hidden.** Every action is written in an audit log with the time it happened.

## A simple example

1. We order 100 USB cables from a supplier. The order is a **draft**.
2. A manager **approves** it.
3. The cables arrive. We **receive** the order, and stock goes from 0 to 100.
4. A customer orders 30 cables. We **ship** the order. Stock goes from 100 to 70, and an **invoice** is created automatically.
5. The customer pays. The invoice is marked **Paid**.
6. If the stock falls below the minimum level, the **bell** icon tells us to reorder.

## Why does this project matter for a portfolio?

Most student or portfolio projects are simple lists with add, edit and delete buttons. This one shows that the builder understands **how a business actually works**:

- **Workflows:** orders move through steps (draft, approved, received), and each step has rules.
- **Data that connects:** a purchase changes stock, a sale changes stock and creates money owed.
- **Usability:** sorting, filtering, search, bulk actions, export, and a keyboard command bar, like a real professional tool.
- **Clean code:** organised into layers (data, interface, screens), with no external libraries, so it is easy to explain line by line.

## How to describe it in an interview (30 seconds)

> "I built a browser-based ERP for a fictional trading company. It covers inventory, purchasing, sales, HR and reports. What makes it different is that the business rules are enforced: stock is calculated from a movement ledger, you can't ship more than is in stock, and receiving a purchase order updates inventory automatically. I built it in plain JavaScript with no frameworks, so the whole thing runs by opening one file."

## Key words, explained

| Word | Meaning |
|---|---|
| **SKU** | A short code that identifies a product, like a barcode number you can read |
| **Warehouse** | A place where stock is kept |
| **Purchase order (PO)** | Our official request to a supplier for goods |
| **Stock movement** | Any change in stock: in, out, transfer, or correction |
| **Reorder level** | The stock level at which we should order more |
| **Invoice** | The bill we send to a customer |
| **Overdue** | A bill that was not paid by its due date |
| **Attendance** | Whether staff were present, late or absent |
| **Dashboard** | The summary page with the most important numbers at a glance |
| **Audit log** | A record of everything that happened and when |
| **Export (CSV)** | Saving a table as a file that opens in Excel |
