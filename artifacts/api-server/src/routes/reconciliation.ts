import { Router } from "express";
import { db } from "@workspace/db";
import {
  reconciliationQueueTable, moneyEventsTable, ledgerEntriesTable,
  partiesTable, outstandingsTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/reconciliation
router.get("/reconciliation", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { status, issue_type } = req.query;
  const conditions = [eq(reconciliationQueueTable.businessId, businessId)];
  if (status) conditions.push(eq(reconciliationQueueTable.status, status as string));
  if (issue_type) conditions.push(eq(reconciliationQueueTable.issueType, issue_type as string));

  const items = await db.select().from(reconciliationQueueTable)
    .where(and(...conditions))
    .orderBy(reconciliationQueueTable.createdAt);

  res.json(items.map(formatReconItem));
});

// GET /api/reconciliation/summary
router.get("/reconciliation/summary", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const items = await db.select().from(reconciliationQueueTable)
    .where(eq(reconciliationQueueTable.businessId, businessId));

  const summary = {
    pendingReview: items.filter(i => i.status === "pending" && !["possible_duplicate", "unmatched_credit", "unmatched_debit"].includes(i.issueType)).length,
    possibleDuplicates: items.filter(i => i.issueType === "possible_duplicate" && i.status === "pending").length,
    suspenseCredits: items.filter(i => i.issueType === "unmatched_credit" && i.status === "pending").length,
    suspenseDebits: items.filter(i => i.issueType === "unmatched_debit" && i.status === "pending").length,
    verificationPending: items.filter(i => i.issueType === "screenshot_without_bank_credit" && i.status === "pending").length,
    disputed: items.filter(i => i.issueType === "disputed_transaction" && i.status === "pending").length,
    reversals: items.filter(i => ["reversal_detected", "refund_detected"].includes(i.issueType) && i.status === "pending").length,
    resolved: items.filter(i => i.status === "resolved").length,
    total: items.filter(i => i.status === "pending").length,
  };

  res.json(summary);
});

async function resolveItem(id: number, businessId: number, userAction: string, note?: string): Promise<boolean> {
  const updated = await db.update(reconciliationQueueTable).set({
    status: "resolved",
    userAction,
    resolvedAt: new Date(),
  }).where(and(eq(reconciliationQueueTable.id, id), eq(reconciliationQueueTable.businessId, businessId))).returning();
  return updated.length > 0;
}

// POST /api/reconciliation/:id/confirm
router.post("/reconciliation/:id/confirm", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const id = parseInt(req.params.id);
  const item = await db.select().from(reconciliationQueueTable)
    .where(and(eq(reconciliationQueueTable.id, id), eq(reconciliationQueueTable.businessId, businessId))).limit(1);

  if (!item.length) { res.status(404).json({ error: "Item not found" }); return; }

  // Confirm: create ledger entry from money event
  if (item[0].moneyEventId) {
    const me = await db.select().from(moneyEventsTable).where(eq(moneyEventsTable.id, item[0].moneyEventId)).limit(1);
    if (me.length) {
      await db.update(moneyEventsTable).set({ reconciliationStatus: "confirmed" })
        .where(eq(moneyEventsTable.id, item[0].moneyEventId));

      await db.insert(ledgerEntriesTable).values({
        userId: item[0].userId,
        businessId,
        moneyEventId: me[0].id,
        partyId: item[0].suggestedPartyId || null,
        entryType: me[0].direction === "inflow" ? "payment_received" : "payment_made",
        amount: me[0].amount,
        entryDate: me[0].eventDate,
        narration: me[0].narration,
        status: "open",
        reconciliationStatus: "confirmed",
        sourceType: me[0].sourceType,
      });
    }
  }

  await resolveItem(id, businessId, "confirm_match", req.body.note);
  res.json({ success: true, message: "Transaction confirmed" });
});

// POST /api/reconciliation/:id/merge
router.post("/reconciliation/:id/merge", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }
  await resolveItem(parseInt(req.params.id), businessId, "merge_duplicate");
  res.json({ success: true, message: "Duplicate merged" });
});

// POST /api/reconciliation/:id/assign-party
router.post("/reconciliation/:id/assign-party", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, createNewParty, newPartyName } = req.body;
  const id = parseInt(req.params.id);

  let assignedPartyId = partyId;
  if (createNewParty && newPartyName) {
    const newParty = await db.insert(partiesTable).values({
      userId: req.userId!,
      businessId,
      name: newPartyName,
      normalizedName: newPartyName.toLowerCase().trim(),
      type: "unknown",
      openingBalance: "0",
      openingBalanceType: "none",
      currentBalance: "0",
      balanceType: "settled",
    }).returning();
    assignedPartyId = newParty[0].id;
  }

  if (assignedPartyId) {
    const item = await db.select().from(reconciliationQueueTable).where(eq(reconciliationQueueTable.id, id)).limit(1);
    if (item.length && item[0].moneyEventId) {
      await db.update(moneyEventsTable).set({ partyId: assignedPartyId, reconciliationStatus: "confirmed" })
        .where(eq(moneyEventsTable.id, item[0].moneyEventId));
    }
  }

  await resolveItem(id, businessId, "assign_party");
  res.json({ success: true, message: "Party assigned" });
});

// POST /api/reconciliation/:id/mark-dispute
router.post("/reconciliation/:id/mark-dispute", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }
  await db.update(reconciliationQueueTable).set({ status: "pending", issueType: "disputed_transaction", userAction: "mark_disputed" })
    .where(and(eq(reconciliationQueueTable.id, parseInt(req.params.id)), eq(reconciliationQueueTable.businessId, businessId)));
  res.json({ success: true, message: "Marked as disputed" });
});

// POST /api/reconciliation/:id/ignore
router.post("/reconciliation/:id/ignore", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }
  await resolveItem(parseInt(req.params.id), businessId, "ignore_transaction");
  res.json({ success: true, message: "Transaction ignored" });
});

// POST /api/reconciliation/:id/keep-separate
router.post("/reconciliation/:id/keep-separate", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }
  await resolveItem(parseInt(req.params.id), businessId, "keep_separate");
  res.json({ success: true, message: "Kept as separate entries" });
});

function formatReconItem(item: typeof reconciliationQueueTable.$inferSelect) {
  return {
    id: item.id,
    businessId: item.businessId,
    sourceType: item.sourceType,
    issueType: item.issueType,
    confidenceScore: parseFloat(item.confidenceScore),
    reason: item.reason,
    suggestedAction: item.suggestedAction,
    status: item.status,
    amount: item.amount ? parseFloat(item.amount) : null,
    partyName: item.partyName,
    suggestedPartyId: item.suggestedPartyId,
    referenceNumber: item.referenceNumber,
    utr: item.utr,
    eventDate: item.eventDate,
    userAction: item.userAction,
    moneyEventId: item.moneyEventId,
    createdAt: item.createdAt,
  };
}

export default router;
