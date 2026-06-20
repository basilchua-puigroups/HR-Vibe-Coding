# Simple System Manual

Last updated: 2026-06-05

This manual explains the main purpose of the system, how each module is linked, and what the IT team should watch when maintaining it.

## 1. What This System Is

This is a mill operations web system built with React, TypeScript, and Supabase sync.

Main areas:

- Procurement
- Inventory
- Maintenance
- Process / Production
- Human Resources scaffold
- Administrator / User Settings
- Audit Trail

The system stores data in the app state and syncs to Supabase when Supabase is enabled.

## 2. Important Master Files

These are the master records. They should not be deleted once used.

### Supplier File

Supplier File is the master list of suppliers.

Used by:

- RFQ suppliers
- Purchase Orders
- Receive In item rows for no-PO stock in
- Procurement purchase reports

Delete rule:

- A supplier cannot be deleted if already used in RFQ, PO, or Receive In.

### Item File

Item File is the master list of inventory parts/items.

Used by:

- IRF item rows
- RFQ item rows
- PO item rows
- Receive In item rows
- Issue Out
- Maintenance usage
- Fixed Asset optional item link
- Stock movement history

Delete rule:

- An item cannot be deleted if already used in procurement, receive in, maintenance, or stock movements.

## 3. Procurement Workflow

Main flow:

```text
Item File -> IRF -> RFQ -> CCR -> PO -> Goods Delivered -> Receive In -> Approve Receive In -> Stock Added
```

### IRF - Item Request Form

Purpose:

- Request items for purchase.

Links:

- Each IRF item should link to Item File using `itemId`.
- If the item spelling matches an existing Item File item, the system tries to link it.

### RFQ - Request For Quotation

Purpose:

- Ask suppliers for price quotations.

Links:

- RFQ items link back to Item File using `itemId`.
- RFQ suppliers link to Supplier File using `supplierId`.
- RFQ can be created from approved IRF items.

### CCR - Comparative Cost Report

Purpose:

- Compare supplier prices/options before creating PO.

Links:

- CCR lives inside RFQ.
- Selected supplier and option can be used to create PO.
- When PO is created, CCR item rows store the PO reference.

### PO - Purchase Order

Purpose:

- Official order to supplier.

Links:

- PO supplier links to Supplier File using `supplierId`.
- PO item rows link to Item File using `itemId`.
- PO created from CCR carries supplier and item links forward.

Important rules:

- PO must be verified and approved.
- Approved PO means purchase is authorized.
- Approved PO does not mean stock arrived.
- User must click Goods Delivered when goods physically arrive.
- PO item rows must be linked to Item File before Receive In can import them.

### Goods Delivered

Purpose:

- Marks that supplier delivered goods for the PO.

Used by:

- Receive In PO dropdown.

Rule:

- Receive In only lists POs that are approved, marked Goods Delivered, and still have pending quantities.

## 4. Inventory Workflow

### Receive In

Purpose:

- Records stock received into inventory.

There are two ways:

#### A. Receive In With PO

Flow:

```text
Select PO -> Import PO Items -> Save Receive In -> Approve Receive In -> Stock increases
```

Rules:

- Only approved and Goods Delivered POs appear.
- Fully received POs disappear from the dropdown.
- Partially received POs remain until pending quantity becomes zero.
- User cannot receive more quantity than ordered.
- Supplier comes from PO.
- Unit price comes from PO.
- SST can be filled.
- Item rows already carry Item File link.

#### B. Receive In Without PO

Purpose:

- Manual stock in where no PO is linked.

Rules:

- Each item row must select Item File item.
- Each item row must fill supplier.
- Each item row must fill unit price.
- SST is filled per item row.
- Total price is calculated.

Formula:

```text
Total Price = (Quantity x Unit Price) + SST Amount
```

### Approving Receive In

Stock quantity changes only when Receive In is approved.

Before approval:

- Receive In is only a pending record.
- Inventory quantity does not increase yet.

After approval:

- Inventory item quantity increases.
- Stock movement record is created.
- FIFO stock layer is created.
- Audit log is created.

### Direct Issue

Receive In also supports Direct Issue flow.

Rule:

- Direct Issue creates a linked Issue Out record.
- Approval happens at Issue Out Form, not Receive In.

## 5. Item File View and Purchase History

Item File has a View button.

The View page shows:

- Main item data
- Current stock
- Reorder level
- Supplier price history

Supplier price history includes:

- PO purchase rows linked to the item
- Received quantity from Receive In
- Pending quantity

Item File listing also has a View List filter:

- All
- Categories from Inventory -> Category

Selecting a category shows only items under that category.

Item File listing can also sort by:

- Stock ID
- Status - Healthy First
- Status - Reorder First

Item File stock status is:

- Reorder: current stock is at or below reorder level
- Healthy: current stock is above reorder level
- If reorder level is 0, status is Healthy because the item does not need reorder monitoring.
- Supplier
- Unit price
- SST
- Total value
- No-PO Receive In rows, with PO shown as `-`

This is where users can check:

- Bought from which supplier
- Bought at what price
- Quantity ordered
- Quantity received
- Pending quantity

## 5A. FIFO Stock Layers

The system now supports FIFO stock layers.

FIFO means:

```text
First In, First Out
```

When stock is received:

- Approved Receive In creates one stock layer per received item row.
- The layer stores received date, supplier, quantity, unit price, SST, and remaining quantity.

When stock is issued:

- Approved Issue Out consumes the oldest remaining stock layer first.
- Approved Maintenance usage also consumes the oldest remaining stock layer first.

Example:

```text
2024 receive 10 pcs @ RM5
2025 receive 10 pcs @ RM7
Issue out 12 pcs
```

FIFO result:

```text
10 pcs consumed from 2024 layer @ RM5
2 pcs consumed from 2025 layer @ RM7
8 pcs remain from 2025 layer @ RM7
```

Important notes:

- Existing old stock without Receive In history is treated as an Opening Balance FIFO layer when it is first issued.
- Opening Balance layer has cost RM0 because old purchase cost is unknown.
- If an approved Issue Out or Maintenance record is edited/deleted, the system restores the exact FIFO layers it consumed.
- An approved Receive In cannot be deleted if its FIFO stock has already been issued.

## 6. Procurement Reports

Procurement Reports now opens as a report module menu.

Current report:

- Purchase Summary Report

Flow:

```text
Procurement -> Reports -> Purchase Summary Report -> choose date range -> Generate
```

Purchase Summary Report shows:

- Total purchase value
- PO count
- Supplier count
- Total quantity
- Item-level purchase listing
- Supplier summary

Available listing sort options:

- PO ascending
- PO descending
- Total cost ascending
- Total cost descending

## 6A. Inventory Reports

Inventory Reports opens as a report module menu.

Current report:

- Stock Listing
- Issue Out Record

Flow:

```text
Inventory -> Reports -> Stock Listing -> choose report date -> Generate
```

Stock Listing shows:

- Stock ID
- Item
- Category
- Store location
- Quantity as at selected date
- FIFO stock value
- Average cost
- Reorder level
- Stock status
- Last activity date based on latest stock in or stock out movement

If the user selects today's date, it shows the latest stock listing based on current FIFO layers and current stock balances.

Available filters/sort:

- Hide Zero hides rows where FIFO stock value is RM0
- Cost ascending
- Cost descending
- Last activity ascending
- Last activity descending

Issue Out Record flow:

```text
Inventory -> Reports -> Issue Out Record -> choose date range -> choose station/all -> Generate
```

Issue Out Record shows item-level issue rows:

- Issue No.
- Date
- Issued To
- Station
- Equipment
- Item
- Quantity
- Purpose
- Status
- Approved By

Station filter:

- All
- Stations from Inventory -> Station

## 6B. Inventory Report Permissions

Inventory Reports is controlled from:

```text
Inventory -> User Settings -> Reports
```

Recommended permissions:

- View Reports: allows the user to open the Inventory Reports module.
- View Stock Listing Report: allows the user to open and generate Stock Listing.
- View Issue Out Record Report: allows the user to open and generate Issue Out Record.

If a user has View Reports but no individual report permission, the Reports page opens but shows no report module.

## 7. Maintenance

Maintenance module handles maintenance jobs and item usage.

Important behavior:

- Maintenance jobs can have multiple item rows.
- Stock is reduced only when maintenance job is approved.
- Editing an approved job reverses previous stock movement and returns the job to Pending.
- Deleting approved maintenance reverses stock usage.

Linked to:

- Item File through `itemId`
- Stock movements
- Audit Trail

## 8. Process / Production

Process module contains production entry and production report.

Important behavior:

- Daily Production Entry is where users key in operational values.
- Production Report shows monthly production data.
- Some fields are manual.
- Some fields are calculated.
- Some opening balances are carried forward from previous records.
- Production data is stored in Supabase `production_records`.

Important rule:

- Production structure is complex. IT should avoid changing production column keys casually because saved data depends on those keys.

## 9. Audit Trail

Audit Trail records important user actions.

Examples:

- Create
- Edit
- Delete
- Verify
- Approve
- Goods Delivered
- Receive In approval
- Production entry save/delete

Important note:

- Audit Trail is app-level audit, not database-trigger audit.
- New future actions must call `appendAudit()` in code if they should appear in Audit Trail.

Supabase table:

- `audit_logs`

## 10. Supabase and SQL Migrations

Supabase stores synced data.

Whenever new columns are added, the matching SQL migration must be run in Supabase SQL Editor.

If the app shows an error like:

```text
Could not find the column 'xxx' in the schema cache
```

It usually means:

- The migration was not run, or
- Supabase/PostgREST schema cache did not reload yet.

Many newer migrations include:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

This helps Supabase refresh its schema cache.

## 11. Recent Important SQL Migrations

Run these on existing Supabase databases when needed:

- `supabase_migration_2026-06-02_rfq_supplier_id.sql`
- `supabase_migration_2026-06-02_procurement_item_id.sql`
- `supabase_migration_2026-06-02_receive_in_po_link.sql`
- `supabase_migration_2026-06-02_po_goods_delivered.sql`
- `supabase_migration_2026-06-03_receive_in_unit_price.sql`
- `supabase_migration_2026-06-03_receive_in_sst.sql`
- `supabase_migration_2026-06-03_receive_in_supplier.sql`
- `supabase_migration_2026-06-03_receive_in_item_supplier.sql`
- `supabase_migration_2026-06-03_fifo_stock_layers.sql`

## 12. Data Links Summary

### Supplier Link

```text
suppliers.id
  -> rfq_suppliers.supplier_id
  -> purchase_orders.supplier_id
  -> receive_ins.supplier_id
  -> receive_in_items.supplier_id
```

### Item Link

```text
inventory_items.id
  -> item_request_items.item_id
  -> rfq_items.item_id
  -> purchase_order_items.item_id
  -> receive_in_items.item_id
  -> issue_out_items.item_id
  -> stock_movements.item_id
  -> maintenance item rows
  -> fixed_assets.item_id
```

### PO to Receive In Link

```text
purchase_orders.id
  -> receive_ins.po_id

purchase_order_items row index
  -> receive_in_items.po_item_idx
```

This lets the system know how much of each PO line has already been received.

### FIFO Layer Link

```text
receive_in_items
  -> stock_layers

issue_outs / maintenance_jobs
  -> stock_layer_consumptions
  -> stock_layers
```

This lets the system know which purchase batch was consumed.

## 13. Practical User Rules

Users should follow these rules:

1. Create Item File item before using it in procurement when possible.
2. Create Supplier File supplier before RFQ/PO/Receive In when possible.
3. Do not create duplicate item names with different spelling.
4. For PO receiving, always mark Goods Delivered first.
5. Use Receive In with PO when stock comes from a PO.
6. Use Receive In without PO only for manual/direct stock in.
7. Approve Receive In only when stock is confirmed.
8. Do not delete master records that already have transaction history.

## 14. IT Maintenance Rules

IT should follow these rules:

1. Run `npm.cmd run build` after code changes.
2. Run matching Supabase SQL migration after schema changes.
3. Never remove or rename linked ID fields without a migration plan.
4. Keep `CODEX_NOTES.md` updated after meaningful changes.
5. Keep this manual updated when workflow changes.
6. Before changing Receive In, PO, Item File, or Supplier File, check the links first.
7. Before deployment, test:
   - Create supplier
   - Create item
   - Create PO
   - Mark Goods Delivered
   - Import into Receive In
   - Approve Receive In
   - Check Item File purchase history
   - Check Procurement Purchase Summary Report

## 15. Honest Maintainability Notes

The system is usable, but it is now more like a small ERP system.

That means:

- It is no longer just independent pages.
- Many modules are linked by IDs.
- Changing one module can affect reports/history/delete rules.
- IT should maintain it carefully.

The most important linked modules are:

- Supplier File
- Item File
- Purchase Order
- Receive In
- Item File View / Purchase History
- Supabase sync

If these are maintained carefully, the system should remain manageable.
