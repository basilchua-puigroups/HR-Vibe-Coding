# Codex Notes

Compact handoff for future Codex/Claude sessions in this project.

## Project Map

Vite + React + TypeScript app for mill procurement, inventory, maintenance, process/production, HR scaffold, permissions, audit trail, and optional Supabase sync.

- Routes: `src/App.tsx`
- App state: `src/context/AppContext.tsx`
- Auth state: `src/context/AuthContext.tsx`
- Types: `src/types/index.ts`
- Seed/local storage: `src/utils/storage.ts`
- Codes/IDs: `src/utils/codes.ts`
- Formatting: `src/utils/format.ts`
- Supabase sync: `src/utils/supabase.ts`
- Supabase schema: `supabase_schema.sql`
- System manual: `SYSTEM_MANUAL.md`

## Working Rules

- Do not revert unrelated user/Claude edits.
- Check `git status --short` before edits.
- Prefer existing patterns and local helpers.
- Run `npm.cmd run build` after meaningful code changes when practical.
- Add short notes here only for important workflow/schema/permission changes.
- Watch for mojibake in old UI text; clean only when touching nearby text.

## Architecture

- App state is one `AppState` object persisted to `localStorage`.
- Supabase is optional via `.env.local`; sync uses relational tables.
- `fetchRemoteState`, `pushRemoteState`, and `subscribeToChanges` in `src/utils/supabase.ts` are the public sync API used by `AppContext.tsx`.
- Realtime sync watches `app_sync_log` and refetches full state.
- File/base64 payloads are stripped from `localStorage`; Supabase Storage uses `storage:{path}` refs.
- Numeric/date/text DB mappers must be null-safe. Do not send `null`, `undefined`, or `NaN` into numeric DB columns; dates should be `YYYY-MM-DD` or `null`.
- No dedicated test setup yet.

## Permissions And Audit

- Permissions are centralized in `src/utils/permissions.ts`.
- New pages/buttons should get matching permission keys and UI gates.
- User Settings pages render from the permission module arrays.
- Admins bypass permission checks.
- Audit Trail uses `appendAudit()` and persists through `audit_logs`.
- Audit is app-level, not DB-trigger-level.

## Core Procurement Flow

```text
Item File -> IRF -> RFQ -> CCR -> PO -> Goods Delivered -> Receive In -> Approve Receive In -> Stock Added
```

- IRF items link to Item File via `itemId`.
- RFQ items carry `itemId`, `srcIrf`, and `srcItemIdx`.
- RFQ suppliers link to Supplier File via `supplierId`.
- CCR lives inside RFQ and supports multiple supplier price options per item.
- PO supplier links via `supplierId`.
- PO item rows link via `itemId`.
- Created POs stamp `poRef` back onto CCR items.
- Deleting a PO should clear matching CCR `poRef`.
- PO must be approved and marked Goods Delivered before Receive In import.
- Receive In PO dropdown only shows approved, Goods Delivered POs with pending receivable rows.
- PO-linked Receive In blocks over-receiving.

## Inventory And FIFO

- Item File is the master item list. Avoid duplicate spelling.
- Receive In approval increases inventory, creates stock movement, creates FIFO stock layer, and writes audit.
- Issue Out approval consumes FIFO layers oldest-first.
- Maintenance approval also consumes FIFO layers oldest-first.
- Approved Issue Out/Maintenance edits/deletes restore exact consumed layers.
- Existing old stock without Receive In history becomes an Opening Balance FIFO layer when first consumed; cost is RM0.
- Approved Receive In delete is blocked once its FIFO layer has been consumed.
- Item File View shows main item data plus supplier price/purchase history from PO and Receive In, including no-PO rows with PO/ref as `-`.

## Master Delete Guards

- Supplier cannot be deleted if used in RFQ, PO, or Receive In.
- Item cannot be deleted if used in procurement, Receive In, stock movements, Issue Out, Maintenance, or related links.

## Reports

Procurement Reports:

- Module menu contains Purchase Summary Report.
- User selects date range and generates.
- Sort: PO asc/desc, Total Cost asc/desc.

Inventory Reports:

- Permission group: `viewInventoryReports`, `viewStockListingReport`, `viewIssueOutRecordReport`.
- Stock Listing: date-based FIFO stock value, quantity, average cost, reorder status, last activity.
- Stock Listing filters/sorts: Hide Zero based on total FIFO value RM0, Cost asc/desc, Last Activity asc/desc.
- Issue Out Record: date range plus station filter from Inventory Station.

## Process / Production

- Production data is stored in `production_records`.
- Production values are keyed by stable column IDs in `productionColumns.ts`; avoid renaming keys casually.
- Daily Production Entry is the key-in screen.
- Production Report is a complex monthly grid with sticky headers/columns and explicit report sections.
- Current report layout has renamed sections: Fresh Fruit Bunches (FFB), Throughput, Rainfall, Separator Recovery Oil, Crude Palm Oil (CPO), Palm Kernel (PK), Palm Kernel Shell (PKS), Organic Matter, Animal Feed, Power/Electricity.
- Turbine Running Hour is inside Throughput. Rainfall has Today/MTD/YTD.
- EFB photos are stored through Supabase Storage refs and `production_records.efb_photos`.

## Important SQL Migrations

Run relevant migrations in Supabase SQL Editor for existing databases:

- `supabase_migration_2026-05-30_production_adj.sql`
- `supabase_migration_2026-06-01_rls_authenticated.sql`
- `supabase_migration_2026-06-02_rfq_supplier_id.sql`
- `supabase_migration_2026-06-02_procurement_item_id.sql`
- `supabase_migration_2026-06-02_receive_in_po_link.sql`
- `supabase_migration_2026-06-02_po_goods_delivered.sql`
- `supabase_migration_2026-06-03_receive_in_unit_price.sql`
- `supabase_migration_2026-06-03_receive_in_sst.sql`
- `supabase_migration_2026-06-03_receive_in_supplier.sql`
- `supabase_migration_2026-06-03_receive_in_item_supplier.sql`
- `supabase_migration_2026-06-03_fifo_stock_layers.sql`
- `supabase_migration_2026-06-04_production_efb_photos.sql`
- `supabase_migration_2026-06-14_cages_tipped_photos.sql`
- `supabase_migration_2026-06-14_cages_tipped_slot_hour.sql`
- `supabase_migration_2026-06-14_workers.sql`
- `supabase_migration_2026-06-14_worker_attendance.sql`
- `supabase_migration_2026-06-14_worker_task.sql`

If Supabase says a column is missing from schema cache, run the migration and/or:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

## Recent Important Changes

- 2026-06-05: IRF/RFQ/PO save now requires at least one nonblank item row with an item description/link. Fully blank accidental rows are ignored; partially filled rows without item prompt with row number.
- 2026-06-05: Inventory Report permissions added and Inventory Reports/individual report cards are gated.
- 2026-06-05: Production Report headers now wrap with tier-specific heights; report sections renamed/reordered; Rainfall MTD/YTD added; Turbine Running Hour moved into Throughput.
- 2026-06-04: Money display uses `money()` with `RM 0.00` fixed two decimals.
- 2026-06-04: Item File category View List and Healthy/Reorder sort added. Reorder level `0` means Healthy.
- 2026-06-04: Production Entry added Edited override history modal and several section restructures.
- 2026-06-03: FIFO stock layers and consumptions added for Receive In, Issue Out, and Maintenance.
- 2026-06-03: Receive In supports PO link, Goods Delivered gate, no-PO supplier per item, unit price, SST, total price, blank row tolerance, and over-receive blocking.
- 2026-06-03: Procurement Purchase Summary Report and Inventory Stock Listing/Issue Out Record reports added.
- 2026-06-03: `SYSTEM_MANUAL.md` added as plain-English system manual.

## Current Uncommitted Work To Notice

As of the compression pass, these files had local changes:

- `src/pages/inventory/InventoryReports.tsx`
- `src/pages/procurement/ItemRequestForm.tsx`
- `src/pages/procurement/PurchaseOrder.tsx`
- `src/pages/procurement/RequestForQuotation.tsx`
- `CODEX_NOTES.md`

Re-check `git status --short` before continuing because Claude/user may change files between turns.

## Recent Changes

### 2026-06-20 22:54 - Cages Tipped: image validation + auto-resize on upload
- `CagesTipped.tsx`: added `resizeImage()` using Canvas API — resizes to max 1280px longest side, exports as JPEG at 0.82 quality.
- `handleFileChange` is now async; rejects non-image files and files over 10 MB with inline warning; uses `resizeImage` instead of raw `FileReader`.

### 2026-06-20 22:43 - Remove unused Google service account credentials from .env.local
- Removed `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `VITE_GOOGLE_PRIVATE_KEY`, `VITE_GOOGLE_SHEET_ID` — leftover from deleted `googleSheets.ts`; no code references them.

### 2026-06-20 21:58 - Remove non-HR page files and clean up orphaned components
- Deleted `src/pages/inventory/`, `src/pages/maintenance/`, `src/pages/process/`, `src/pages/procurement/` folders entirely.
- Deleted `src/components/StockItemPicker.tsx`, `src/components/ItemDescriptionInput.tsx` (only used by removed modules).
- Deleted `src/utils/fifo.ts`, `src/utils/googleSheets.ts` (only used by removed modules).
- `src/components/UserSettingsPage.tsx`: Removed `ItemDescriptionInput` import and the two `section === 'procurement'` PO approval/verify limits blocks.

### 2026-06-20 21:46 - Pin dev server to port 5174
- `vite.config.ts`: Added `server: { port: 5174, strictPort: true }` so Vite always uses 5174 instead of auto-bumping.
- `start.bat`: Updated displayed URL from 5173 to 5174.

### 2026-06-20 21:43 - HR-only app: remove Procurement, Inventory, Maintenance, Process modules
- `src/App.tsx`: Removed all imports and routes for procurement, inventory, process, and maintenance modules. Only HR routes + Dashboard/Administrator/AuditTrail remain.
- `src/components/NavBar.tsx`: Removed Procurement, Inventory, Maintenance, Process nav sections (desktop + mobile). Removed all related permission variables. Kept only HR permissions and nav.
- `src/pages/Dashboard.tsx`: Removed Procurement, Inventory, Maintenance, Process module cards. Dashboard now shows only Human Resources and Administrator.

### 2026-06-19 10:34 - Monthly print for Daily Production Entry
- `src/pages/process/DailyProductionEntry.tsx`: Added `handleMonthPrint` that opens a landscape A4 print window showing all entry fields as rows and each day of the selected month as columns. Adj records get an extra column. Added month picker input + "Print Month" button alongside existing "Print Day" button.

### 2026-06-19 10:21 - Print button for Daily Production Entry
- `src/pages/process/DailyProductionEntry.tsx`: Added `handlePrint` function that opens a new window with all entry-form fields and computed values formatted as a printable table (sectioned, with EFB photos). Added Print button to the action bar; disabled when date is invalid or last-day kind is not yet chosen.

### 2026-06-14 23:23 - Worker task selection & mid-shift task switching
- `src/types/index.ts`: Added `task?: string` to `WorkerAttendance` (values: `cagesTipped` | `clarificationStation` | `kernelStation` | `boilerStation` | `waterTreatmentStation`).
- `src/utils/supabase.ts`: `dbToWorkerAttendance` reads `r.task`; `workerAttendanceToDb` writes `task` to DB.
- `src/pages/worker/WorkerPortal.tsx`: On login, workers see a task-picker modal (cannot dismiss without selecting). Colored banner shows current task + "Switch Task" button for mid-shift changes. Each slot clock-in records the active task. Task column (colored abbr badge) shown in attendance table.
- `supabase_migration_2026-06-14_worker_task.sql`: Run `ALTER TABLE worker_attendance ADD COLUMN IF NOT EXISTS task TEXT;` in Supabase.

### 2026-06-14 23:15 - Job List module + Piece Rate Setting (Cages Tipped with 2 tiers × 3 roles)
- `src/types/index.ts`: Added `PieceRateRoles`, `PieceRateCagesTipped`, `PieceRateSettings` interfaces; added `pieceRateSettings: PieceRateSettings` to `AppState`.
- `src/utils/storage.ts`: Added default `pieceRateSettings` (all rates 0) to seed data.
- `src/utils/permissions.ts`: Added `jobList` (viewJobList) and `pieceRateSetting` (viewPieceRateSetting, editPieceRateSetting) modules to `HR_MODULES`.
- `src/context/AppContext.tsx`: Added `pieceRateSettings: prev.pieceRateSettings` to `applyRemote` merge (localStorage-only for now; no Supabase table yet).
- `src/pages/hr/JobList.tsx` (NEW): Menu page under HR with "Piece Rate Setting" card.
- `src/pages/hr/PieceRateSetting.tsx` (NEW): Left sidebar station selector (5 stations); right form. Cages Tipped shows ≤4 and ≥5 tier sections each with Station Head / Assistant Station Head / Operator rate inputs (RM per cage). Other stations show a standard 3-role form (placeholder).
- `src/pages/hr/HumanResourcesMenu.tsx`: Added Attendance Report and Job List cards.
- `src/App.tsx`: Added routes `human-resources/job-list` and `human-resources/job-list/piece-rate`.
- `src/components/NavBar.tsx`: Added `canViewJobList`; "Job List" link under HR in desktop NavMenu and mobile MobileSection.

### 2026-06-14 22:55 - Worker: add role field (Station Head / Assistant Station Head / Operator)
- `src/types/index.ts`: Added `role: string` to `Worker` interface (between shift and department).
- `src/pages/hr/WorkerList.tsx`: Added `ROLES` constant; default role `'Operator'` in `EMPTY_WORKER`; radio buttons in Add/Edit modal (full-width row); Role column in worker table.
- `src/utils/supabase.ts`: `dbToWorker` reads `r.role` (default `'Operator'`); `workerToDb` writes `role` to DB.
- SQL: run `ALTER TABLE workers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Operator';` in Supabase.


### 2026-06-15 11:37 - Worker form: Username rename, optional Staff ID, validation error
- `src/types/index.ts`: Added `staffId?: string` to `Worker`; updated status comment to include `'Resigned'`.
- `src/utils/supabase.ts`: `dbToWorker` reads `r.staff_id`; `workerToDb` writes `staff_id`. **Run in Supabase:** `ALTER TABLE workers ADD COLUMN IF NOT EXISTS staff_id text NOT NULL DEFAULT '';`
- `src/pages/hr/WorkerList.tsx`: "Worker ID *" renamed to "Username *" with login hint; new optional "Worker / Staff ID" field (`staffId`); modal state now carries `err` string; `saveWorker` validates required fields and shows inline error message; table has new "Staff ID" column.
- `src/pages/hr/WorkerAttendanceReport.tsx`: Sub-label under worker name shows `staffId` if set, else falls back to username (`workerId`).

### 2026-06-15 11:27 - Add Reinstate button for resigned workers
- `src/pages/hr/WorkerList.tsx`: Added `reinstateWorker()` (async, direct Supabase update same as resign); green **Reinstate** button shown only when `status === 'Resigned'`; uses `canResign` permission; native confirm() dialog.

### 2026-06-15 11:15 - Fix resign not persisting + Login badge shows Inactive
- `src/pages/hr/WorkerList.tsx`: `confirmResign` made async; after local setState, does a direct `supabase.from('workers').update({status:'Resigned'})` to bypass full-push race condition (full push can fail if `role` column missing, causing realtime echo to revert status). Login badge now shows "Inactive" for resigned workers regardless of `authUserId`.

### 2026-06-15 11:08 - Fix Resigned badge colour (danger → bad)
- `src/pages/hr/WorkerList.tsx`: Status badge class corrected from `'danger'` (non-existent) to `'bad'` (red) so Resigned workers show the red badge as intended.

### 2026-06-15 10:45 - Worker resign: block login + keep data for audit
- `src/utils/permissions.ts`: Added `resignWorker` perm (`'Mark Worker as Resigned'`) to `workerList` module.
- `src/pages/hr/WorkerList.tsx`: Added `canResign` perm check; amber **Resign** button (hidden once resigned); resign confirm modal explaining data is kept; `confirmResign()` sets status to `'Resigned'`; Status badge shows red for `'Resigned'`.
- `src/context/AuthContext.tsx`: `login()` returns `false` immediately if matched worker has `status === 'Resigned'`, blocking portal access without deleting the account.

### 2026-06-14 22:37 - Worker Attendance: add Attendance Report link to NavBar (desktop + mobile)
- `NavBar.tsx`: Added `canViewWorkerAttendance` perm check; linked `/human-resources/attendance` ("Attendance Report") in both the desktop HR `NavMenu` and the mobile HR `MobileSection`.

### 2026-06-14 22:35 - Worker Attendance system (full implementation)
- `src/types/index.ts`: Added `Worker` and `WorkerAttendance` interfaces; added `workers` and `workerAttendance` arrays to `AppState`.
- `src/utils/storage.ts`: Added `workers: [], workerAttendance: []` to seedData; added `workerAttendance` stripping in `stripFileData`.
- `src/utils/permissions.ts`: Added `manageWorkerLogins` perm to `workerList` module; added new `workerAttendanceReport` module with `viewWorkerAttendance` perm.
- `src/context/AuthContext.tsx`: Added `currentWorker: Worker | null` state (sessionStorage `mp_current_worker`); `login()` now checks staff first then workers by workerId; added `refreshCurrentWorker(workers)`; `logout()` clears both sessions; auth listener also matches workers via `authUserId`.
- `src/pages/Login.tsx`: Passes `state.workers ?? []` as 4th arg to `login()`.
- `src/utils/supabase.ts`: Added `dbToWorker`, `dbToWorkerAttendance`, `workerToDb`, `workerAttendanceToDb` mappers; extended `resolveStorageRefs` for worker attendance photos (`worker-attendance/{workerId}/{date}/{slotHour}`); added `syncWorkers`, `syncWorkerAttendance`; updated `fetchRemoteState` to query `workers` and `worker_attendance` tables; updated `pushRemoteState` to call both sync functions.
- `src/context/AppContext.tsx`: Added `workers` and `workerAttendance` to `applyRemote` merge.
- `src/pages/worker/WorkerPortal.tsx` (NEW): Full-screen isolated interface for workers — custom dark header (name, shift, workerId, date picker, logout), 24-row hourly table with sticky Time column, 1 photo per slot, date+hour validation, lightbox with ESC to close.
- `src/pages/hr/WorkerAttendanceReport.tsx` (NEW): Date + shift filter; wide table with sticky Worker Name column and 24 slot columns showing ✓ (clickable for lightbox); tfoot with per-slot worker counts.
- `src/pages/hr/WorkerList.tsx` (rewritten): Search, Add/Edit modal (workerId, name, shift, department, auto-email, status), Create Login / Reset PW via `adminUsers()` edge function, delete with guard.
- `src/App.tsx`: Added imports for `WorkerPortal` and `WorkerAttendanceReport`; worker redirect in `RootLayout` (`if (currentWorker) return <WorkerPortal>`); added route `human-resources/attendance`.

### 2026-06-14 22:15 - Cages Tipped: restore date+hour validation for uploads
- `CagesTipped.tsx`: Both `shiftDateOf(taken) === date` AND `fileHour === slot` must pass. Users can change the date picker and upload photos taken on that date; photos from a different date are rejected (handles delayed uploads over bad connection).

### 2026-06-14 22:12 - Cages Tipped: revert date check — only validate hour matches slot
- `CagesTipped.tsx`: Removed the date check from upload validation. Users can freely change the date and upload photos for any date; only the hour is checked against the time slot.

### 2026-06-14 22:10 - Cages Tipped: fix photo validation to check date AND hour
- `CagesTipped.tsx`: `handleFileChange` now rejects photos whose shift-date (`shiftDateOf(taken)`) doesn't match the selected date, not just whose hour doesn't match the slot.

### 2026-06-14 22:07 - Cages Tipped: remove photo count label; add Grand Total footer row
- `CagesTipped.tsx`: Removed "N photos on date" label from header toolbar.
- `CagesTipped.tsx`: Added `<tfoot>` Grand Total row summing ≤4, ≥5, and Total columns across all 24 slots for the selected date.

### 2026-06-14 21:29 - Mobile responsiveness overhaul
- `NavBar.tsx`: Added `MobileSection` accordion component and hamburger button; desktop nav hidden at ≤900px; mobile nav panel (full-width dropdown) shows all modules with collapsible sections and username/logout at bottom.
- `index.css`: Added `.mob-header-right`, `.hamburger`, `.mobile-nav-panel`, `.mob-section*`, `.mob-sub-link`, `.mob-nav-footer` styles; refined breakpoints (900/760/680px); enlarged touch targets (`.btn` min-height 42px) on small screens.
- `CagesTipped.tsx`: Made Time column sticky (`position: sticky, left: 0`) in both `<th>` and `<td>` so it stays visible when table scrolls horizontally on mobile.

### 2026-06-14 21:19 - Cages Tipped: add Supabase Storage bucket and RLS policies
- `supabase_migration_2026-06-14_cages_tipped_storage.sql`: Creates `cages-tipped` bucket; adds INSERT/SELECT/DELETE policies for authenticated users to fix "new row violates row-level security policy" sync error.

### 2026-06-14 21:13 - Cages Tipped: move count columns after Photos (Time → Upload → Photos → ≤4 → ≥5 → Total)
- `CagesTipped.tsx`: Reordered table columns so Upload and Photos come before the three count columns.

### 2026-06-14 21:12 - Cages Tipped: add ≤4 / ≥5 / Total columns per time slot row
- `CagesTipped.tsx`: Added 3 table columns after Time — "No. of Cages Tipped (≤ 4 cages)" = `min(count,4)`, "No. of Cages Tipped (≥ 5 cages)" = `max(0,count-4)`, "Total" = photo count. Values bold when non-zero; ≥5 column highlighted green when non-zero.

### 2026-06-14 20:38 - Cages Tipped: press ESC to close lightbox preview
- `CagesTipped.tsx`: Added `useEffect` that listens for `keydown` on `window`; closes preview when `e.key === 'Escape'`. Listener is registered once on mount and cleaned up on unmount.

### 2026-06-14 20:36 - Cages Tipped: click thumbnail to open fullscreen lightbox preview
- `CagesTipped.tsx`: Added `preview` state; thumbnails are now clickable (cursor pointer, title="Click to preview"). Clicking opens a fixed full-screen dark overlay showing the full-size image, filename, and capture time. Click outside the image or the Close button to dismiss.

### 2026-06-14 20:33 - Cages Tipped: validate photo timestamp matches slot before uploading
- `CagesTipped.tsx`: In `handleFileChange`, checks `new Date(file.lastModified).getHours() === slot`. Rejected files are not uploaded; a yellow inline warning appears in that row for 6 seconds showing the file name, its actual time, and the correct row it belongs to. Multiple-file rejection shows a count summary.

### 2026-06-14 20:28 - Cages Tipped: 24-row hourly table with per-row photo upload; shift-aware date
- `types/index.ts`: Added `slotHour: number` to `CagesTippedPhoto` (explicit row assignment, 0-23).
- `supabase.ts`: Updated `dbToCagesTippedPhoto` and `cagesTippedPhotoToDb` to read/write `slot_hour`.
- `CagesTipped.tsx`: Replaced photo-grid UI with 24-row table — slots 0700-0800 … 0600-0700 (SLOT_HOURS=[7..23,0..6]). Single hidden `<input type="file">` shared; `uploadingSlot` state tracks which row triggered it. Default date uses `shiftDateOf(new Date())` — if before 07:00, yesterday's date is shown so midnight photos land on the correct shift day. Photo thumbnails (90×68) with time and delete shown inline per slot.
- Migration: `supabase_migration_2026-06-14_cages_tipped_slot_hour.sql` — run in Supabase SQL Editor after the earlier cages_tipped_photos migration.

### 2026-06-14 20:12 - Cages Tipped: photo upload with date picker and file-lastModified timestamp
- `types/index.ts`: Added `CagesTippedPhoto` interface (`id, shift, date, photoName, photoData, capturedAt`); added `cagesTippedPhotos` to `AppState`.
- `storage.ts`: Seeded `cagesTippedPhotos: []`; strips `photoData` in `stripFileData` (same as EFB photos).
- `supabase.ts`: Added `dbToCagesTippedPhoto`, `cagesTippedPhotoToDb`, `syncCagesTippedPhotos`; wired into `resolveStorageRefs`, `fetchRemoteState`, `pushRemoteState`. Storage path: `cages-tipped/{shift}/{date}/{id}.{ext}`.
- `AppContext.tsx`: Added `cagesTippedPhotos` to `applyRemote` merge guard.
- `CagesTipped.tsx`: Date picker (default today) + multi-photo upload; reads `file.lastModified` as timestamp; photo grid with delete; gated by `viewCagesTipped`/`createCagesTipped`/`deleteCagesTipped`; shift (A/B) derived from URL.
- Migration: `supabase_migration_2026-06-14_cages_tipped_photos.sql` — run in Supabase SQL Editor.

### 2026-06-14 20:01 - Payroll: restructure nav to Payroll → Shift A/B → Cages Tipped
- `Payroll.tsx`: Now shows Shift A and Shift B cards (was Cages Tipped).
- `ShiftA.tsx`: Converted from placeholder to module-grid menu showing Cages Tipped card; back to `/human-resources/payroll`.
- `ShiftB.tsx`: Same as ShiftA for Shift B.
- `CagesTipped.tsx`: Converted from Shift A/B menu to a content page; back path derived from URL (`shift-a` or `shift-b`).
- `App.tsx`: Routes updated — `/payroll/shift-a`, `/payroll/shift-b`, `/payroll/shift-a/cages-tipped`, `/payroll/shift-b/cages-tipped`.
- `NavBar.tsx`: Removed Cages Tipped nav link; Shift A/B links point to new paths.

### 2026-06-14 19:55 - Auth: use sessionStorage for Supabase session to prevent auto-login across browser restarts
- `supabase.ts`: Added `auth: { storage: window.sessionStorage }` to `createClient` options so Supabase stores its session token in `sessionStorage` instead of `localStorage`. Users must log in again each time they open a new browser session or close and reopen the tab.

### 2026-06-12 22:36 - Cages Tipped: add Shift A and Shift B sub-modules
- `CagesTipped.tsx`: Converted from placeholder page to module-grid menu with Shift A and Shift B cards, each gated by `viewShiftA` / `viewShiftB`.
- `ShiftA.tsx`, `ShiftB.tsx`: New scaffold pages at `/human-resources/payroll/cages-tipped/shift-a` and `.../shift-b`, gated by their respective view perms, back-navigate to Cages Tipped.
- `permissions.ts`: Added `cagesTippedShiftA` and `cagesTippedShiftB` entries to `HR_MODULES` with view/create/edit/delete perms.
- `App.tsx`: Added routes for `shift-a` and `shift-b` under `human-resources/payroll/cages-tipped`.
- `NavBar.tsx`: Added `canViewShiftA` / `canViewShiftB` checks and nav links under Cages Tipped.

### 2026-06-12 18:17 - Payroll: add Cages Tipped sub-module
- `permissions.ts`: Replaced old Payroll create/edit/delete perms with a dedicated `cagesTipped` module (`viewCagesTipped`, `createCagesTipped`, `editCagesTipped`, `deleteCagesTipped`); `viewPayroll` gates the Payroll menu itself.
- `Payroll.tsx`: Converted from a single placeholder page to a PayrollMenu (module-grid cards), showing Cages Tipped card gated by `viewCagesTipped`.
- `CagesTipped.tsx`: New scaffold page at `/human-resources/payroll/cages-tipped`, gated by `viewCagesTipped`, back-navigates to `/human-resources/payroll`.
- `App.tsx`: Imported `CagesTipped`; added route `human-resources/payroll/cages-tipped`.
- `NavBar.tsx`: Added `canViewCagesTipped` perm check and nav link under Human Resources submenu.

### 2026-06-11 13:30 - Administrator: audit-log create/edit/delete user actions
- `Administrator.tsx`: imported `appendAudit`; all three user mutations now write to `auditLogs` — **Create User** logs username + admin flag; **Edit User** logs a diff of every changed field (username, email, password reset, per-module access, admin status); **Delete User** logs the deleted username. Works in both local and Supabase modes.

### 2026-06-11 13:26 - Administrator: make username clickable to open Edit
- `Administrator.tsx` user table: the username cell was plain text; now it's a link-styled `<button>` that calls `openEdit(u)` — same Edit modal as the row's Edit button (edit username/email/password/module access/admin). Styled inline (blue, underlined) since no `link-button` CSS class exists.
- No change to access control: the page, dashboard tile (`Dashboard.tsx`), and nav link (`NavBar.tsx`) are already gated behind `isAdmin`, so non-admins never see or reach Administrator.

### 2026-06-10 11:28 - ItemFile supplier price history: label No-PO rows instead of bare '-'
- `ItemFile.tsx` PO#/REF. cell: the link is intentional & deterministic — rows from a real PO (`poRows`, poId=order.id) always link to `/procurement/orders` (openPoId); direct stock-ins with no PO (`directReceiveRows`, poId='') had no PO to link. Previously the no-PO case showed a bare '-' which looked inconsistent.
- Change: keep the link; for unlinked rows show `row.poNo` as plain text if present, else a muted `badge neutral` "No PO" tag (title: "Received directly without a Purchase Order"). Clarifies WHY there's no link; no logic change to when linking happens.

### 2026-06-10 11:19 - Production Report PDF: paginate into multi-page A4 landscape (print-ready)
- User chose multi-page A4 landscape over one giant ~3m-wide page (109 cols). `ProductionReport.tsx` `exportPDF` now tiles the (correct, wide) html2canvas capture across A4 landscape pages like a spreadsheet print: REPEATS the frozen Day column on every horizontal page and REPEATS the 3-row header band on every vertical band.
- Measures Day-col width + header-band height from the live table; derives per-col / per-row canvas size by dividing the remaining canvas evenly (`colCW = (canvas.width - dayCW)/totalCols`, `rowCH = (canvas.height - headCH)/totalRows`) so tiles align with no rounding drift. colsPerPage/rowsPerBand from A4 usable area at natural size (1 CSS px ≈ 0.75pt, canvas is 2x). Each page: compose a tile canvas (corner + col headers + Day col + body slice) via 4 `drawImage` calls, add as JPEG with a title line (`Cols x–y of N · Rows a–b of M · Page p/total`). ~109 cols × 31 rows ⇒ ~13 across × 3 down ≈ 39 A4 pages, all legible.
- Supersedes the 11:12 single-wide-page output (orientation fix still applies in spirit; format is now `a4`/`landscape`).

### 2026-06-10 11:12 - Fix Production Report PDF: ROOT CAUSE was jsPDF portrait swap (NOT the capture)
- Diagnostic alert proved the html2canvas capture was correct ALL ALONG: 109 leaf cols → table 12031px wide x 1438px tall, canvas 24062x2876 (perfect 2x, wide+short). Nothing wrong with clone/colgroup/in-place capture — all 6 prior "fixes" chased a non-bug.
- REAL BUG: `new jsPDF({ unit:'pt', format:[pageW, pageH] })` with no `orientation`. jsPDF defaults to portrait and SILENTLY SWAPS a [w,h] format so the larger value becomes height. Our page is far wider than tall, so it flipped to a tall ~125in sliver; the wide image overflowed the narrowed page (right clipped) leaving a huge empty band below = the "tall thin ribbon".
- FIX (`ProductionReport.tsx` `exportPDF`): pass `orientation: pageW >= pageH ? 'landscape' : 'portrait'` to the jsPDF constructor so it keeps our computed dimensions. Removed the TEMP diagnostic alert + getBoundingClientRect block. Kept the in-place capture from 11:01 (it's correct and simpler than the old clone).
- PDF #10 (gen 11:03, after the 11:01 in-place-capture fix; dev server confirmed serving new code via `curl localhost:5173` marker match + Vite Fast Refresh) is STILL the tall thin ribbon. So the in-place capture did NOT fix it either — stop guessing at html2canvas internals.
- Added a TEMP `alert()` in `exportPDF` dumping: leaf col count, expected width (40+cols*110), `table.scrollWidth`, `getBoundingClientRect().width`, `table.scrollHeight`, first body row height, and final `canvas.width x canvas.height`. Goal: ground-truth whether the ribbon is narrow-columns (width collapse) or tall-rows (height inflation) before the next fix. REMOVE this alert + the two `// TEMP DIAGNOSTIC` blocks once diagnosed.

### 2026-06-10 11:01 - Fix Production Report PDF: capture REAL table in place, not a clone (tall thin ribbon, again)
- User uploaded `Production_Report_2026-06 (9).pdf` — still a tall thin ribbon: a sliver of header+data at top, huge empty expanse, one giant page. The 09:06 "explicit clone width" fix did NOT work.
- ROOT CAUSE: html2canvas renders from each element's *computed* style. The off-screen clone's column widths come from a `<colgroup>` (40px Day + 110px leaves), and colgroup widths don't reliably apply in a detached/`position:fixed` holder — so the clone's columns collapse to content min-width BEFORE html2canvas reads it, text wraps, row heights explode, ribbon. html2canvas faithfully reproduces the clone's broken layout. The on-screen table is laid out correctly, so capturing the clone was the mistake all along.
- FIX: `ProductionReport.tsx` `exportPDF` now captures the live `tableRef` element in place. Temporarily set the scroll box to `height:auto; maxHeight:none; overflow:visible`, un-sticky every sticky cell (saving originals), `await` two rAFs, capture with html2canvas at `scale:2`, then restore box styles + sticky cells in `finally`. No more clone, so html2canvas reads the real, correct computed column widths.

### 2026-06-10 09:06 - Fix Production Report PDF: explicit clone width (was tall thin ribbon)
- `ProductionReport.tsx` `exportPDF`: read the actual saved PDF and found the table was collapsing to a narrow column — header/cell text wrapped into many lines, row heights exploded, capture became a super-tall narrow ribbon with content squished at top. Fix: clone into a body-level `holder` div with explicit `width: table.scrollWidth` and set the same width + `tableLayout:fixed` on the clone so columns keep their 110px and rows stay short. Un-sticky in the clone only (live table untouched). Bumped render to `scale:2` for crisp text; `PX = 0.75/SCALE` divides the upscale back out for page sizing.
- NOTE: html2canvas HMR confirmed working — successive saved PDFs differed in byte size, so dev server was serving new code all along; the bug was the clone width, not stale build.

### 2026-06-10 08:52 - Fix build-blocking tsc error in ItemFile.tsx (stale dist root cause)
- `ItemFile.tsx` `purchaseHistoryFor`: the no-PO `directReceiveRows` branch was missing `poId`, so the union row type lacked `poId` and `row.poId` at line 394 was a tsc error. Added `poId: ''` to that branch. ROOT CAUSE of "PDF still same": `npm run build` is `tsc && vite build`; tsc failed here so vite build never ran and `dist/` stayed frozen at 2026-06-05 — none of the PDF fixes were ever served. Build now passes end-to-end.

### 2026-06-10 08:49 - Fix Production Report PDF: clone table to body to bypass overflow clipping
- `ProductionReport.tsx` `exportPDF`: replaced onclone approach with a body-level fixed-position clone. html2canvas measures `getBoundingClientRect()` on the live element before cloning; if that element is inside an `overflow:auto` container it only paints the visible rows even after onclone patches the cloned DOM. Cloning directly to `document.body` with `position:fixed;top:0;left:0;z-index:-9999` has no overflow ancestors, so all rows render.

### 2026-06-10 08:37 - Fix Production Report PDF: use onclone to strip parent overflow before capture
- `ProductionReport.tsx` `exportPDF`: replaced live-DOM overflow expansion with an `onclone` callback that strips `overflow/height/max-height/clip/clip-path` from every ancestor of the table in the cloned document. html2canvas only renders visually unclipped rows; `onclone` ensures all 31+ rows are painted even though they overflow the live scroll container. Also passes explicit `width: tW, height: tH` (table scrollWidth/scrollHeight) so the canvas is sized to the full table, not the visible viewport.

### 2026-06-10 08:30 - Fix Production Report PDF clipping (content only at top)
- `ProductionReport.tsx` `exportPDF`: Added `windowWidth: table.scrollWidth, windowHeight: table.scrollHeight, scrollX: 0, scrollY: 0` to `html2canvas` call so it captures the full table rather than clipping to the browser viewport. Also resets `wrap.scrollTop/Left = 0` before capture and temporarily expands `panel` (article.panel parent) overflow/height to prevent ancestor clipping.

### 2026-06-09 15:50 - Add "Save as PDF" button to Production Report
- `ProductionReport.tsx`: Added `exportPDF` function using `jspdf` + `html2canvas`; generates a custom-size single-page PDF matching the full table dimensions (all columns readable); temporarily removes sticky positioning before capture to avoid scroll-offset artifacts. Button shows "Exporting…" spinner while in progress.
- Installed `jspdf@4.2.1` and `html2canvas@1.4.1` as runtime dependencies.

### 2026-06-09 15:38 - Add press averages, turbine, throughput, and rainfall to Google Sheets column map
- `googleSheets.ts`: Added AA=`press_hr_t`, AB=`press_hr_m`, AC=`press_throughput`, AD=`press_eff`, AE=`turb_t`, AF=`turb_m`, AG=`turb_throughput`, AH=`rainfall`.

### 2026-06-09 15:35 - Add cages, process time, and press hours to Google Sheets column map
- `googleSheets.ts`: Added P=`recv_cages_filled` (total cages processed), Q=`cages_avg` (avg cage weight), R=`proc_start`, S=`proc_stop`, T–Z=`press1`–`press7` running hours.

### 2026-06-09 15:33 - Add ramp zero-day count MTD and YTD to Google Sheets column map
- `googleSheets.ts`: Added N=`ramp_mtd` and O=`ramp_ytd` (count of days ramp balance = 0, MTD and YTD) to COLUMN_MAP.

### 2026-06-09 15:29 - Add FFB processed MTD and YTD to Google Sheets column map
- `googleSheets.ts`: Added I=`ffb_proc_m` (FFB processed month-to-date) and J=`ffb_proc_y` (FFB processed year-to-date) to COLUMN_MAP.

### 2026-06-09 15:28 - Add FFB received MTD and YTD to Google Sheets column map
- `googleSheets.ts`: Added C=`ffb_rec_m` (FFB received month-to-date) and D=`ffb_rec_y` (FFB received year-to-date) to COLUMN_MAP.

### 2026-06-09 15:22 - Allow Save on unchanged production entry for Google Sheets re-sync
- `DailyProductionEntry.tsx`: Removed `!dirty` from Save button disabled condition — Save is now always clickable (when date/permission/lock conditions pass), so the user can force a Google Sheets push on an old date without editing anything.

### 2026-06-09 15:13 - Add visible Google Sheets sync status indicator
- `DailyProductionEntry.tsx`: Added `sheetStatus`/`sheetError` state; push now shows "Syncing…" / "Google Sheets updated" / "Google Sheets failed — check console" next to Save button instead of failing silently.

### 2026-06-09 15:00 - Google Sheets auto-push on production entry save
- `src/utils/googleSheets.ts`: New utility — signs JWT with service account key (Web Crypto API), gets Google OAuth token, writes mapped columns via Sheets batchUpdate. Tab name is derived from date (`May 2026` format). Row = 5 + day of month.
- `DailyProductionEntry.tsx`: Calls `pushProductionToSheet` fire-and-forget after every save.
- Column map: B=`ffb_rec_t`, H=`ffb_proc_t`, K=`ffb_bal_o`, L=`ffb_bal_c`, M=`ffb_ramp`.
- Requires `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL`, `VITE_GOOGLE_PRIVATE_KEY`, `VITE_GOOGLE_SHEET_ID` in `.env.local`.

### 2026-06-09 14:01 - Remove Status column from Receive In and Issue Out lists
- `ReceiveIn.tsx`: Removed Status column; Approved column alone conveys approval state.
- `IssueOutForm.tsx`: Removed Status column; same reason.

### 2026-06-09 13:21 - Combined approval columns across PO, Receive In, Issue Out lists
- `types/index.ts`: Added `approvedDate?: string` to `ReceiveInRecord`; added `verifiedDate?: string` and `approvedDate?: string` to `IssueOut`.
- `ReceiveIn.tsx`: Store `approvedDate: today()` on approval; added Approved column showing `name @ date`.
- `IssueOutForm.tsx`: Store `approvedDate: today()` on both approval paths and `setDetail`; added Approved column showing `name @ date`.
- `PurchaseOrder.tsx`: Merged Ver. By + Ver. Date → "Verified" and App. By + App. Date → "Approved", each showing `name @ date`; colSpan fixed 12 → 10.

### 2026-06-09 13:04 - Combine Approved/Rejected By and Date columns in IRF list
- `ItemRequestForm.tsx`: Merged two columns into one "Approved/Rejected" column showing `name @ date` format; colSpan fixed from 9 to 8.

### 2026-06-09 12:49 - Item Link status column in PO list
- `PurchaseOrder.tsx`: Added `itemLinkBadge()` helper and **Item Link** column in the PO list — `All Linked` (green), `Partial` (yellow), `Not Linked` / `No Items` (grey) based on how many of the PO's item lines have an `itemId`.

### 2026-06-09 12:43 - PO Link status column in Item File list
- `ItemFile.tsx`: Added `poLinkedSet` (useMemo over `state.orders`) to track which item IDs have at least one PO line; added **PO Link** column showing `Linked` (green) / `Not Linked` (grey) badge; added `linked-first` and `not-linked-first` sort options.
- `index.css`: Added `.badge.neutral` (grey) for "Not Linked" and similar neutral states.

### 2026-06-09 12:18 - Clickable PO links from Item File and Purchase Summary Report
- `ItemFile.tsx`: Added `poId` to purchase history rows; PO# renders as a `btn-link` button that navigates to `/procurement/orders` with `{ openPoId }` state.
- `ProcurementReports.tsx`: Added `orderId` to purchase rows; PO# renders as a `btn-link` button with same navigation.
- `PurchaseOrder.tsx`: Added `openPoId` handler in the `location.state` useEffect — finds the order by id and opens its detail view directly.
- `index.css`: Added `.btn-link` style (unstyled button that looks like a text link).

### 2026-06-09 11:20 - Fix production data not clearing after Supabase delete
- `AppContext.tsx`: Removed empty-remote guard for `production` in `applyRemote`; previously an empty Supabase result fell back to localStorage cache, so deleting all rows from `production_records` had no effect on the UI until localStorage was also cleared.

### 2026-06-05 21:12 - Fix Save button jumping position in Daily Production Entry
- `DailyProductionEntry.tsx`: Added `marginLeft: auto` to Save button so it stays pinned to the right regardless of the "Unsaved changes" span toggling after it.

### 2026-06-05 21:07 - CPO and PK total despatch fields always show 0.00 instead of blank
- `productionCalculations.ts`: Changed `cpo_desp_t` and `pk_desp_t` to use `fmtProd` so total despatch shows 0.00 instead of "Auto-calculated" when no despatch is entered.

### 2026-06-05 21:05 - CPO and PK production fields always show 0.00 instead of blank
- `productionCalculations.ts`: Added `fmtProd` (shows 0.00 for zero); used it for `cpo_t1/t2/t3_prod`, `cpo_prod_t`, `pk_b1/b2/floor_prod`, `pk_prod_t` so production never shows "Auto-calculated" when result is 0.

### 2026-06-05 20:54 - Remove 0.00 defaults from editable production entry fields
- `DailyProductionEntry.tsx`: Carry editable fields no longer pre-fill with `0.00` (zero carry shows blank instead). `om_prod_t` auto-val only computes when trips > 0, otherwise blank.

### 2026-06-05 20:47 - Remove seed day hint text from Daily Production Entry
- `DailyProductionEntry.tsx`: Removed "First recorded day — enter the Opening balances..." banner.

### 2026-06-05 20:18 - Fix green buttons and rename Monthly Report
- `DailyProductionEntry.tsx`: Fixed class from `btn-primary` to `btn primary` (correct CSS); renamed "Monthly Report" button to "Production Report".

### 2026-06-05 20:17 - Style Monthly Report and Edit History buttons green
- `DailyProductionEntry.tsx`: Changed "Monthly Report" and "Edit History" buttons from `btn` to `btn btn-primary` (green); Back button remains white.

### 2026-06-05 12:26 - Rename production pages
- `NavBar.tsx`, `ProcessMenu.tsx`, `DailyProductionEntry.tsx`: "Daily Production Entry" → **Daily Production Report Data Entry**; "Production Report" → **Daily Production Report** (navbar, menu cards, page `<h3>` headers, audit trail label).
