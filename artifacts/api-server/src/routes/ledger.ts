import { Router } from "express";
import { db } from "@workspace/db";
import { ledgerEntriesTable, moneyEventsTable, businessesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/ledger
router.get("/ledger", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { party_id, entry_type, from_date, to_date } = req.query;
  const conditions = [eq(ledgerEntriesTable.businessId, businessId)];
  if (party_id) conditions.push(eq(ledgerEntriesTable.partyId, parseInt(party_id as string)));
  if (entry_type) conditions.push(eq(ledgerEntriesTable.entryType, entry_type as string));

  const entries = await db.select().from(ledgerEntriesTable)
    .where(and(...conditions))
    .orderBy(ledgerEntriesTable.entryDate);

  res.json(entries.map(e => ({
    id: e.id,
    businessId: e.businessId,
    partyId: e.partyId,
    entryType: e.entryType,
    voucherNumber: e.voucherNumber,
    invoiceNumber: e.invoiceNumber,
    amount: parseFloat(e.amount),
    debitAmount: e.debitAmount ? parseFloat(e.debitAmount) : null,
    creditAmount: e.creditAmount ? parseFloat(e.creditAmount) : null,
    entryDate: e.entryDate,
    dueDate: e.dueDate,
    narration: e.narration,
    status: e.status,
    reconciliationStatus: e.reconciliationStatus,
    sourceType: e.sourceType,
    createdAt: e.createdAt,
  })));
});

// POST /api/ledger
router.post("/ledger", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, entryType, amount, entryDate, dueDate, narration, invoiceNumber, voucherNumber } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount required" }); return; }

  const inserted = await db.insert(ledgerEntriesTable).values({
    userId: req.userId!,
    businessId,
    partyId: partyId || null,
    entryType: entryType || "parchi_entry",
    amount: amount.toString(),
    entryDate: new Date(entryDate || Date.now()),
    dueDate: dueDate ? new Date(dueDate) : null,
    narration: narration || null,
    invoiceNumber: invoiceNumber || null,
    voucherNumber: voucherNumber || null,
    status: "open",
    reconciliationStatus: "confirmed",
    sourceType: "manual",
  }).returning();

  res.status(201).json(inserted[0]);
});

// GET /api/ledger/:id
router.get("/ledger/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const entry = await db.select().from(ledgerEntriesTable).where(
    and(eq(ledgerEntriesTable.id, parseInt(req.params.id)), eq(ledgerEntriesTable.businessId, businessId))
  ).limit(1);

  if (!entry.length) { res.status(404).json({ error: "Entry not found" }); return; }
  res.json(entry[0]);
});

// GET /api/money-events
router.get("/money-events", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { party_id, event_type, recon_status } = req.query;
  const conditions = [eq(moneyEventsTable.businessId, businessId)];
  if (party_id) conditions.push(eq(moneyEventsTable.partyId, parseInt(party_id as string)));
  if (event_type) conditions.push(eq(moneyEventsTable.eventType, event_type as string));
  if (recon_status) conditions.push(eq(moneyEventsTable.reconciliationStatus, recon_status as string));

  const events = await db.select().from(moneyEventsTable)
    .where(and(...conditions))
    .orderBy(moneyEventsTable.eventDate);

  res.json(events.map(e => ({
    id: e.id,
    businessId: e.businessId,
    partyId: e.partyId,
    eventType: e.eventType,
    amount: parseFloat(e.amount),
    direction: e.direction,
    eventDate: e.eventDate,
    referenceNumber: e.referenceNumber,
    utr: e.utr,
    invoiceNumber: e.invoiceNumber,
    narration: e.narration,
    confidenceScore: parseFloat(e.confidenceScore),
    reconciliationStatus: e.reconciliationStatus,
    sourceType: e.sourceType,
    createdAt: e.createdAt,
  })));
});

// POST /api/money-events
router.post("/money-events", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, eventType, amount, direction, eventDate, referenceNumber, utr, invoiceNumber, narration } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount required" }); return; }

  const inserted = await db.insert(moneyEventsTable).values({
    userId: req.userId!,
    businessId,
    sourceType: "manual",
    eventType: eventType || "manual_parchi",
    amount: amount.toString(),
    direction: direction || "inflow",
    eventDate: new Date(eventDate || Date.now()),
    partyId: partyId || null,
    referenceNumber: referenceNumber || null,
    utr: utr || null,
    invoiceNumber: invoiceNumber || null,
    narration: narration || null,
    confidenceScore: "100",
    reconciliationStatus: "confirmed",
  }).returning();

  res.status(201).json({ ...inserted[0], amount: parseFloat(inserted[0].amount) });
});

// GET /api/money-events/:id
router.get("/money-events/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const event = await db.select().from(moneyEventsTable).where(
    and(eq(moneyEventsTable.id, parseInt(req.params.id)), eq(moneyEventsTable.businessId, businessId))
  ).limit(1);

  if (!event.length) { res.status(404).json({ error: "Event not found" }); return; }
  res.json({ ...event[0], amount: parseFloat(event[0].amount) });
});

export default router;
