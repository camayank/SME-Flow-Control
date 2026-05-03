import { Router } from "express";
import { db } from "@workspace/db";
import {
  paymentsTable, outstandingsTable, paymentAllocationsTable,
  partiesTable, moneyEventsTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { scoreReconciliation } from "../services/reconciliation-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/payments
router.get("/payments", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { party_id, match_status } = req.query;
  const conditions = [eq(paymentsTable.businessId, businessId)];
  if (party_id) conditions.push(eq(paymentsTable.partyId, parseInt(party_id as string)));
  if (match_status) conditions.push(eq(paymentsTable.matchStatus, match_status as string));

  const payments = await db.select({
    payment: paymentsTable,
    partyName: partiesTable.name,
  })
    .from(paymentsTable)
    .leftJoin(partiesTable, eq(paymentsTable.partyId, partiesTable.id))
    .where(and(...conditions))
    .orderBy(paymentsTable.paymentDate);

  res.json(payments.map(({ payment, partyName }) => ({
    id: payment.id,
    businessId: payment.businessId,
    partyId: payment.partyId,
    partyName,
    amount: parseFloat(payment.amount),
    paymentDate: payment.paymentDate,
    paymentMode: payment.paymentMode,
    direction: payment.direction,
    referenceNumber: payment.referenceNumber,
    utr: payment.utr,
    note: payment.note,
    matchStatus: payment.matchStatus,
    createdAt: payment.createdAt,
  })));
});

// POST /api/payments
router.post("/payments", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const {
    partyId, outstandingId, amount, paymentDate, paymentMode,
    referenceNumber, utr, note, direction,
  } = req.body;

  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount required" }); return; }

  // Run matching engine
  const reconResult = scoreReconciliation({
    amount, direction: direction || "inflow",
    eventDate: new Date(paymentDate || Date.now()),
    partyId, utr, referenceNumber,
    sourceType: "manual", eventType: "payment_received",
  });

  // Create money event
  const moneyEvent = await db.insert(moneyEventsTable).values({
    userId: req.userId!,
    businessId,
    sourceType: "manual",
    eventType: direction === "outflow" ? "imported_payment" : "imported_payment",
    amount: amount.toString(),
    direction: direction || "inflow",
    eventDate: new Date(paymentDate || Date.now()),
    partyId: partyId || null,
    referenceNumber: referenceNumber || null,
    utr: utr || null,
    narration: note || null,
    confidenceScore: reconResult.confidenceScore.toString(),
    reconciliationStatus: reconResult.reconciliationStatus,
  }).returning();

  // Create payment
  const payment = await db.insert(paymentsTable).values({
    userId: req.userId!,
    businessId,
    partyId: partyId || null,
    moneyEventId: moneyEvent[0].id,
    outstandingId: outstandingId || null,
    amount: amount.toString(),
    paymentDate: new Date(paymentDate || Date.now()),
    paymentMode: paymentMode || "cash",
    direction: direction || "inflow",
    referenceNumber: referenceNumber || null,
    utr: utr || null,
    note: note || null,
    matchStatus: partyId ? "matched" : "unmatched",
  }).returning();

  // Auto-allocate to outstanding if specified
  if (outstandingId && partyId) {
    await db.insert(paymentAllocationsTable).values({
      businessId,
      paymentId: payment[0].id,
      outstandingId,
      allocatedAmount: amount.toString(),
    });

    const outstanding = await db.select().from(outstandingsTable).where(eq(outstandingsTable.id, outstandingId)).limit(1);
    if (outstanding.length) {
      const newCollected = parseFloat(outstanding[0].amountCollected) + amount;
      const newDue = Math.max(0, parseFloat(outstanding[0].amountDue) - amount);
      const newStatus = newDue <= 0 ? "collected" : "partially_collected";
      await db.update(outstandingsTable).set({
        amountCollected: newCollected.toString(),
        amountDue: newDue.toString(),
        status: newStatus,
        updatedAt: new Date(),
      }).where(eq(outstandingsTable.id, outstandingId));
    }

    // Update party balance
    if (partyId) {
      const party = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId)).limit(1);
      if (party.length) {
        const newBalance = Math.max(0, parseFloat(party[0].currentBalance || "0") - amount);
        await db.update(partiesTable).set({
          currentBalance: newBalance.toString(),
          balanceType: newBalance <= 0 ? "settled" : party[0].balanceType,
          updatedAt: new Date(),
        }).where(eq(partiesTable.id, partyId));
      }
    }
  }

  res.status(201).json({
    id: payment[0].id,
    businessId: payment[0].businessId,
    partyId: payment[0].partyId,
    amount: parseFloat(payment[0].amount),
    paymentDate: payment[0].paymentDate,
    paymentMode: payment[0].paymentMode,
    direction: payment[0].direction,
    referenceNumber: payment[0].referenceNumber,
    utr: payment[0].utr,
    note: payment[0].note,
    matchStatus: payment[0].matchStatus,
    createdAt: payment[0].createdAt,
  });
});

// POST /api/payments/:id/allocate
router.post("/payments/:id/allocate", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const paymentId = parseInt(req.params.id);
  const { allocations } = req.body;

  if (!allocations || !Array.isArray(allocations)) {
    res.status(400).json({ error: "Allocations array required" }); return;
  }

  for (const alloc of allocations) {
    await db.insert(paymentAllocationsTable).values({
      businessId,
      paymentId,
      outstandingId: alloc.outstandingId,
      allocatedAmount: alloc.amount.toString(),
    });

    const outstanding = await db.select().from(outstandingsTable).where(eq(outstandingsTable.id, alloc.outstandingId)).limit(1);
    if (outstanding.length) {
      const newCollected = parseFloat(outstanding[0].amountCollected) + alloc.amount;
      const newDue = Math.max(0, parseFloat(outstanding[0].amountDue) - alloc.amount);
      await db.update(outstandingsTable).set({
        amountCollected: newCollected.toString(),
        amountDue: newDue.toString(),
        status: newDue <= 0 ? "collected" : "partially_collected",
        updatedAt: new Date(),
      }).where(eq(outstandingsTable.id, alloc.outstandingId));
    }
  }

  await db.update(paymentsTable).set({ matchStatus: "matched" }).where(eq(paymentsTable.id, paymentId));

  res.json({ success: true, message: "Payment allocated successfully" });
});

export default router;
