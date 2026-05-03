import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, invoiceItemsTable, itemsTable, partiesTable,
  ledgerEntriesTable, outstandingsTable, moneyEventsTable, businessesTable, auditLogsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

async function getNextInvoiceNumber(businessId: number, type: string): Promise<string> {
  const prefix = type === "purchase" ? "PUR" : type === "credit_note" ? "CN" : type === "debit_note" ? "DN" : "INV";
  const count = await db.select({ c: sql<number>`count(*)` }).from(invoicesTable)
    .where(and(eq(invoicesTable.businessId, businessId), eq(invoicesTable.invoiceType, type)));
  const num = (parseInt(String(count[0]?.c || 0)) + 1).toString().padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `${prefix}/${year}/${num}`;
}

function fmtInvoice(inv: typeof invoicesTable.$inferSelect, items: typeof invoiceItemsTable.$inferSelect[]) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceType: inv.invoiceType,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    partyId: inv.partyId,
    partyName: inv.partyName,
    partyGstin: inv.partyGstin,
    partyAddress: inv.partyAddress,
    subtotal: parseFloat(inv.subtotal || "0"),
    cgstTotal: parseFloat(inv.cgstTotal || "0"),
    sgstTotal: parseFloat(inv.sgstTotal || "0"),
    igstTotal: parseFloat(inv.igstTotal || "0"),
    total: parseFloat(inv.total || "0"),
    amountPaid: parseFloat(inv.amountPaid || "0"),
    balanceDue: parseFloat(inv.balanceDue || "0"),
    status: inv.status,
    notes: inv.notes,
    terms: inv.terms,
    isInterState: inv.isInterState,
    items: items.map(it => ({
      id: it.id,
      itemId: it.itemId,
      name: it.name,
      hsn: it.hsn,
      unit: it.unit,
      qty: parseFloat(it.qty || "1"),
      rate: parseFloat(it.rate || "0"),
      amount: parseFloat(it.amount || "0"),
      gstRate: parseFloat(it.gstRate || "0"),
      cgst: parseFloat(it.cgst || "0"),
      sgst: parseFloat(it.sgst || "0"),
      igst: parseFloat(it.igst || "0"),
      lineTotal: parseFloat(it.lineTotal || "0"),
    })),
    createdAt: inv.createdAt,
  };
}

// GET /api/invoices
router.get("/invoices", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { type, status, party_id } = req.query;
  const conditions: ReturnType<typeof eq>[] = [eq(invoicesTable.businessId, businessId)];
  if (type) conditions.push(eq(invoicesTable.invoiceType, type as string));
  if (status) conditions.push(eq(invoicesTable.status, status as string));
  if (party_id) conditions.push(eq(invoicesTable.partyId, parseInt(party_id as string)));

  const invs = await db.select().from(invoicesTable).where(and(...conditions)).orderBy(desc(invoicesTable.invoiceDate)).limit(100);

  const result = [];
  for (const inv of invs) {
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
    result.push(fmtInvoice(inv, items));
  }
  res.json(result);
});

// GET /api/invoices/:id
router.get("/invoices/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const inv = await db.select().from(invoicesTable).where(
    and(eq(invoicesTable.id, parseInt(req.params.id)), eq(invoicesTable.businessId, businessId))
  ).limit(1);

  if (!inv.length) { res.status(404).json({ error: "Invoice not found" }); return; }

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv[0].id));
  res.json(fmtInvoice(inv[0], items));
});

// POST /api/invoices
router.post("/invoices", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const {
    invoiceType = "sale", invoiceDate, dueDate, partyId, partyName, partyGstin, partyAddress,
    items: lineItems = [], notes, terms, isInterState = false,
  } = req.body;

  if (!lineItems.length) { res.status(400).json({ error: "Invoice must have at least one item" }); return; }

  const invoiceNumber = await getNextInvoiceNumber(businessId, invoiceType);

  let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;

  const processedItems = lineItems.map((item: { name: string; hsn?: string; unit?: string; qty: number; rate: number; gstRate?: number; itemId?: number }) => {
    const qty = parseFloat(String(item.qty || 1));
    const rate = parseFloat(String(item.rate || 0));
    const amount = qty * rate;
    const gstRate = parseFloat(String(item.gstRate ?? 18));
    const gstAmount = amount * gstRate / 100;
    const cgst = isInterState ? 0 : gstAmount / 2;
    const sgst = isInterState ? 0 : gstAmount / 2;
    const igst = isInterState ? gstAmount : 0;
    const lineTotal = amount + gstAmount;

    subtotal += amount;
    cgstTotal += cgst;
    sgstTotal += sgst;
    igstTotal += igst;

    return { name: item.name, hsn: item.hsn, unit: item.unit || "pcs", qty, rate, amount, gstRate, cgst, sgst, igst, lineTotal, itemId: item.itemId || null };
  });

  const total = subtotal + cgstTotal + sgstTotal + igstTotal;

  let resolvedPartyName = partyName;
  let resolvedPartyGstin = partyGstin;
  if (partyId && !partyName) {
    const party = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId)).limit(1);
    if (party.length) { resolvedPartyName = party[0].name; resolvedPartyGstin = party[0].gstin; }
  }

  const inv = await db.insert(invoicesTable).values({
    businessId, userId: req.userId!,
    invoiceNumber, invoiceType,
    invoiceDate: new Date(invoiceDate || Date.now()),
    dueDate: dueDate ? new Date(dueDate) : null,
    partyId: partyId || null,
    partyName: resolvedPartyName || null,
    partyGstin: resolvedPartyGstin || null,
    partyAddress: partyAddress || null,
    subtotal: subtotal.toString(),
    cgstTotal: cgstTotal.toString(),
    sgstTotal: sgstTotal.toString(),
    igstTotal: igstTotal.toString(),
    total: total.toString(),
    amountPaid: "0",
    balanceDue: total.toString(),
    status: "unpaid",
    notes: notes || null,
    terms: terms || null,
    isInterState,
  }).returning();

  const invId = inv[0].id;

  for (const it of processedItems) {
    await db.insert(invoiceItemsTable).values({
      invoiceId: invId,
      itemId: it.itemId,
      name: it.name,
      hsn: it.hsn || null,
      unit: it.unit,
      qty: it.qty.toString(),
      rate: it.rate.toString(),
      amount: it.amount.toString(),
      gstRate: it.gstRate.toString(),
      cgst: it.cgst.toString(),
      sgst: it.sgst.toString(),
      igst: it.igst.toString(),
      lineTotal: it.lineTotal.toString(),
    });

    // Update stock if item has inventory tracking
    if (it.itemId && invoiceType === "sale") {
      await db.update(itemsTable).set({
        stockQty: sql`${itemsTable.stockQty} - ${it.qty}`,
        updatedAt: new Date(),
      }).where(eq(itemsTable.id, it.itemId));
    } else if (it.itemId && invoiceType === "purchase") {
      await db.update(itemsTable).set({
        stockQty: sql`${itemsTable.stockQty} + ${it.qty}`,
        updatedAt: new Date(),
      }).where(eq(itemsTable.id, it.itemId));
    }
  }

  // Create ledger entry
  const direction = invoiceType === "sale" ? "outflow" : "inflow";
  const entryType = invoiceType === "sale" ? "sales_invoice" : invoiceType === "purchase" ? "purchase_invoice" : invoiceType === "credit_note" ? "credit_note" : "debit_note";

  const ledgerEntry = await db.insert(ledgerEntriesTable).values({
    userId: req.userId!,
    businessId,
    partyId: partyId || null,
    entryType,
    invoiceNumber,
    amount: total.toString(),
    debitAmount: direction === "outflow" ? null : total.toString(),
    creditAmount: direction === "outflow" ? total.toString() : null,
    entryDate: new Date(invoiceDate || Date.now()),
    dueDate: dueDate ? new Date(dueDate) : null,
    narration: `${invoiceType.toUpperCase()} - ${resolvedPartyName || "Unknown"} - ${invoiceNumber}`,
    status: "open",
    reconciliationStatus: "confirmed",
    sourceType: "invoice",
  }).returning();

  await db.update(invoicesTable).set({ ledgerEntryId: ledgerEntry[0].id }).where(eq(invoicesTable.id, invId));

  // Create outstanding for sale invoices
  if (invoiceType === "sale" && partyId) {
    await db.insert(outstandingsTable).values({
      userId: req.userId!,
      businessId,
      partyId,
      ledgerEntryId: ledgerEntry[0].id,
      originalAmount: total.toString(),
      amountDue: total.toString(),
      amountCollected: "0",
      dueDate: dueDate ? new Date(dueDate) : null,
      agingDays: 0,
      agingBucket: "not_due",
      status: "open",
      priority: "medium",
      direction: "receivable",
      invoiceNumber,
      sourceType: "invoice",
    });
  }

  // Audit log
  await db.insert(auditLogsTable).values({
    businessId, userId: req.userId!,
    action: "create", entityType: "invoice", entityId: String(invId),
    description: `Invoice ${invoiceNumber} created for ${resolvedPartyName || "unknown"} — ₹${total.toFixed(0)}`,
  }).catch(() => {});

  const items2 = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invId));
  res.status(201).json(fmtInvoice(inv[0], items2));
});

// PUT /api/invoices/:id/mark-paid
router.put("/invoices/:id/mark-paid", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { amountPaid } = req.body;
  const inv = await db.select().from(invoicesTable).where(
    and(eq(invoicesTable.id, parseInt(req.params.id)), eq(invoicesTable.businessId, businessId))
  ).limit(1);
  if (!inv.length) { res.status(404).json({ error: "Invoice not found" }); return; }

  const paid = parseFloat(amountPaid || String(inv[0].total));
  const total = parseFloat(inv[0].total);
  const newBalance = Math.max(0, total - paid);
  const newStatus = newBalance <= 0 ? "paid" : "partially_paid";

  await db.update(invoicesTable).set({
    amountPaid: paid.toString(), balanceDue: newBalance.toString(),
    status: newStatus, updatedAt: new Date(),
  }).where(eq(invoicesTable.id, parseInt(req.params.id)));

  res.json({ success: true, status: newStatus, balanceDue: newBalance });
});

// DELETE /api/invoices/:id
router.delete("/invoices/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  await db.update(invoicesTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(invoicesTable.id, parseInt(req.params.id)), eq(invoicesTable.businessId, businessId)));

  res.json({ success: true });
});

export default router;
