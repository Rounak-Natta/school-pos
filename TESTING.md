# School POS Verification Checklist

## 1. Clean local setup

```powershell
cd C:\office\school-pos
npm ci
Copy-Item .env.example .env
```

Set `AUTH_SECRET` in `.env`, then:

```powershell
docker compose up -d
docker ps
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000` and log in with `admin@schoolpos.com / Admin@12345`.

## 2. Automated checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Run everything together:

```powershell
npm run verify
```

## 3. Core workflow tests

### Students
- Create a student with school, name, class and contact number.
- Verify required-field validation.
- Edit the student and confirm the changes.
- Deactivate and restore the student.

### Multi-school Excel stock import
- Export all accessible schools from Import / Export.
- Change stock for products from multiple schools in the same workbook.
- Upload once without selecting a school.
- Confirm the upload form locks and shows processing feedback.
- Confirm final stock equals the workbook quantity (it is not added twice).
- Open Recent Imports and inspect row-level errors for any failed rows.
- Also test the legacy `Branch`, `Warehouse`, `Item`, `Code`, `SIZE`, `Qty(Opening stock)`, `MRP`, `Price` workbook.

### POS + incremental search
- Type one character, then two, then three in product search and verify suggestions update.
- Select a student/customer and create a bill.
- Verify stock is deducted once.

### GST
- Test products with 0%, 5%, 12% and 18% GST.
- Verify taxable value, GST amount and totals on invoice and PDF.

### Additional payment collection
- Create a partially-paid invoice.
- Open the invoice and use Collect Remaining Balance.
- Verify payment history, paid amount, remaining balance and final status.
- Try entering more than the outstanding balance; it must be rejected.

### Return / exchange
- Use a fully paid invoice.
- Return part of an item and verify stock is restored once.
- Attempt to return more than the remaining returnable quantity; it must fail.
- Create an exchange and use its exchange reference on one replacement bill.
- Attempt to use the same exchange reference twice; the second attempt must fail.
- A partially-paid invoice must require its balance to be settled before return/exchange.

### Invoice cancellation
- Cancel an invoice with no return/exchange history.
- Verify stock is restored and the invoice becomes CANCELLED.
- Attempt to cancel it again; it must fail.
- Attempt to cancel an invoice after a return/exchange; it must fail.

### School-wise invoice numbering
- Create invoices under two different schools.
- Verify each school has its own financial-year sequence.

### Safe stock transfer
- Request a transfer from School A to School B.
- Confirm stock is not added to B before receipt.
- Dispatch once and verify source stock decreases once.
- Attempt dispatch again; it must not deduct twice.
- Receive once and verify destination stock increases once.
- Attempt receive again; it must not add twice.

### Bill sharing
- Open an invoice.
- Test PDF, WhatsApp, native Share (where supported), and Copy bill message.

### Notifications
- Set a reorder level and reduce/import stock below it.
- Verify a low-stock notification appears.
- Verify transfer, return and invoice/payment notifications where applicable.

### Audit logs
- Perform product edit, stock adjustment, Excel import, student edit, POS sale, payment receipt, return/exchange, invoice cancellation and stock transfer.
- Verify Audit Logs contains the user, school, action, entity and timestamp.

### RBAC / school isolation
- Log in as one school account and ensure another school's students/invoices/inventory are not exposed.
- Repeat with another school account.
- Verify Super Admin can access all schools.

## 4. Database inspection

```powershell
npm run db:studio
```

Use Prisma Studio to verify Invoice, InvoiceItem, Payment, InventoryStock, StockMovement, Transfer, SaleReturn, ExcelImport, AuditLog and Notification records.

## 5. Fresh development reset

Development database only:

```powershell
npm run db:reset
npm run db:seed
npm run db:generate
npm run dev
```

After a reset, delete the old `school_pos_session` browser cookie if an old browser tab creates a redirect loop.

Never run `db:reset` on production.
