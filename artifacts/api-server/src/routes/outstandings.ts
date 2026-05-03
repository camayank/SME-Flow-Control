import { Router } from "express";
import { db } from "@workspace/db";
import { outstandingsTable, partiesTable, businessesTable } from "@workspace/db/schema";
import { eq, and, sum, count } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { calculateAging, getAgingLabel } from "../services/outstanding-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/outstandings
router.get("/outstandings", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { party_id, status, aging_bucket, priority } = req.query;

  const conditions = [eq(outstandingsTable.businessId, businessId)];
  if (party_id) conditions.push(eq(outstandingsTable.partyId, parseInt(party_id as string)));
  if (status) conditions.push(eq(outstandingsTable.status, status as string));
  if (aging_bucket) conditions.push(eq(outstandingsTable.agingBucket, aging_bucket as string));
  if (priority) conditions.push(eq(outstandingsTable.priority, priority as string));

  const outstandings = await db.select({
    outstanding: outstandingsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
  })
    .from(outstandingsTable)
    .leftJoin(partiesTable, eq(outstandingsTable.partyId, partiesTable.id))
    .where(and(...conditions));

  // Recalculate aging on fetch
  const result = outstandings.map(({ outstanding, partyName, partyMobile }) => {
    const aging = calculateAging(outstanding.dueDate);
    return {
      id: outstanding.id,
      businessId: outstanding.businessId,
      partyId: outstanding.partyId,
      partyName,
      partyMobile,
      originalAmount: parseFloat(outstanding.originalAmount),
      amountDue: parseFloat(outstanding.amountDue),
      amountCollected: parseFloat(outstanding.amountCollected),
      dueDate: outstanding.dueDate,
      agingDays: aging.agingDays,
      agingBucket: aging.agingBucket,
      status: outstanding.status,
      priority: aging.priority,
      lastFollowUpAt: outstanding.lastFollowUpAt,
      nextFollowUpAt: outstanding.nextFollowUpAt,
      invoiceNumber: outstanding.invoiceNumber,
      sourceType: outstanding.sourceType,
      createdAt: outstanding.createdAt,
    };
  });

  res.json(result);
});

// GET /api/outstandings/aging
router.get("/outstandings/aging", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const outstandings = await db.select().from(outstandingsTable)
    .where(and(eq(outstandingsTable.businessId, businessId), eq(outstandingsTable.status, "open")));

  const buckets: Record<string, { amount: number; count: number }> = {
    "not_due": { amount: 0, count: 0 },
    "due_today": { amount: 0, count: 0 },
    "overdue_1_7": { amount: 0, count: 0 },
    "overdue_8_15": { amount: 0, count: 0 },
    "overdue_16_30": { amount: 0, count: 0 },
    "overdue_31_60": { amount: 0, count: 0 },
    "overdue_60_plus": { amount: 0, count: 0 },
  };

  let notDue = 0, dueToday = 0, overdue1to7 = 0, overdue8to15 = 0;
  let overdue16to30 = 0, overdue31to60 = 0, overdue60plus = 0;

  for (const o of outstandings) {
    const aging = calculateAging(o.dueDate);
    const amountDue = parseFloat(o.amountDue);
    buckets[aging.agingBucket].amount += amountDue;
    buckets[aging.agingBucket].count += 1;

    switch (aging.agingBucket) {
      case "not_due": notDue += amountDue; break;
      case "due_today": dueToday += amountDue; break;
      case "overdue_1_7": overdue1to7 += amountDue; break;
      case "overdue_8_15": overdue8to15 += amountDue; break;
      case "overdue_16_30": overdue16to30 += amountDue; break;
      case "overdue_31_60": overdue31to60 += amountDue; break;
      case "overdue_60_plus": overdue60plus += amountDue; break;
    }
  }

  res.json({
    notDue, dueToday, overdue1to7, overdue8to15, overdue16to30, overdue31to60, overdue60plus,
    buckets: Object.entries(buckets).map(([bucket, data]) => ({
      bucket,
      label: getAgingLabel(bucket),
      amount: data.amount,
      count: data.count,
    })),
  });
});

// POST /api/outstandings
router.post("/outstandings", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, originalAmount, direction, dueDate, invoiceNumber, narration } = req.body;
  if (!partyId || !originalAmount || originalAmount <= 0) {
    res.status(400).json({ error: "partyId and originalAmount required" });
    return;
  }

  const aging = calculateAging(dueDate ? new Date(dueDate) : null);
  const inserted = await db.insert(outstandingsTable).values({
    userId: req.userId!,
    businessId,
    partyId,
    originalAmount: originalAmount.toString(),
    amountDue: originalAmount.toString(),
    amountCollected: "0",
    direction: direction || "receivable",
    dueDate: dueDate ? new Date(dueDate) : null,
    status: "open",
    invoiceNumber: invoiceNumber || null,
    agingBucket: aging.agingBucket,
    priority: aging.priority,
    sourceType: "manual",
  }).returning();

  res.status(201).json({
    ...inserted[0],
    originalAmount: parseFloat(inserted[0].originalAmount),
    amountDue: parseFloat(inserted[0].amountDue),
    amountCollected: parseFloat(inserted[0].amountCollected),
  });
});

// PUT /api/outstandings/:id/status
router.put("/outstandings/:id/status", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { status } = req.body;
  const updated = await db.update(outstandingsTable).set({ status, updatedAt: new Date() })
    .where(and(eq(outstandingsTable.id, parseInt(req.params.id)), eq(outstandingsTable.businessId, businessId)))
    .returning();

  if (!updated.length) { res.status(404).json({ error: "Outstanding not found" }); return; }
  res.json({ id: updated[0].id, status: updated[0].status });
});

export default router;
