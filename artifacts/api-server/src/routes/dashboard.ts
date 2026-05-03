import { Router } from "express";
import { db } from "@workspace/db";
import {
  partiesTable, outstandingsTable, moneyEventsTable, reconciliationQueueTable,
  followUpsTable, ledgerEntriesTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { calculateAging } from "../services/outstanding-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/dashboard
router.get("/dashboard", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const [parties, outstandings, moneyEvents, reconQueue, followUps] = await Promise.all([
    db.select().from(partiesTable).where(eq(partiesTable.businessId, businessId)),
    db.select().from(outstandingsTable).where(and(eq(outstandingsTable.businessId, businessId), eq(outstandingsTable.status, "open"))),
    db.select().from(moneyEventsTable).where(
      and(eq(moneyEventsTable.businessId, businessId), gte(moneyEventsTable.eventDate, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    ),
    db.select().from(reconciliationQueueTable).where(
      and(eq(reconciliationQueueTable.businessId, businessId), eq(reconciliationQueueTable.status, "pending"))
    ),
    db.select().from(followUpsTable).where(
      and(eq(followUpsTable.businessId, businessId), eq(followUpsTable.status, "pending"))
    ),
  ]);

  // Cash flow calculations (last 30 days)
  const inflows = moneyEvents.filter(e => e.direction === "inflow").reduce((s, e) => s + parseFloat(e.amount), 0);
  const outflows = moneyEvents.filter(e => e.direction === "outflow").reduce((s, e) => s + parseFloat(e.amount), 0);
  const netCashFlow = inflows - outflows;

  // Outstandings summary
  const totalReceivables = outstandings.filter(o => o.direction === "receivable").reduce((s, o) => s + parseFloat(o.amountDue), 0);
  const totalPayables = outstandings.filter(o => o.direction === "payable").reduce((s, o) => s + parseFloat(o.amountDue), 0);

  // Overdue calculation
  const overdueItems = outstandings.filter(o => {
    const aging = calculateAging(o.dueDate);
    return aging.agingDays > 0;
  });
  const overdueAmount = overdueItems.reduce((s, o) => s + parseFloat(o.amountDue), 0);
  const overdueCount = overdueItems.length;

  // Top debtors
  const partyReceivables: Record<number, number> = {};
  for (const o of outstandings.filter(o => o.direction === "receivable")) {
    partyReceivables[o.partyId] = (partyReceivables[o.partyId] || 0) + parseFloat(o.amountDue);
  }

  const topDebtors = parties
    .filter(p => partyReceivables[p.id])
    .sort((a, b) => (partyReceivables[b.id] || 0) - (partyReceivables[a.id] || 0))
    .slice(0, 5)
    .map(p => ({
      partyId: p.id,
      partyName: p.name,
      mobile: p.mobile,
      amountDue: partyReceivables[p.id] || 0,
    }));

  // Recent activity (last 10 events)
  const recentActivity = await db.select().from(moneyEventsTable)
    .where(eq(moneyEventsTable.businessId, businessId))
    .orderBy(sql`${moneyEventsTable.eventDate} DESC`)
    .limit(10);

  // Reconciliation summary
  const reconSummary = {
    pendingReview: reconQueue.filter(i => !["possible_duplicate", "unmatched_credit", "unmatched_debit"].includes(i.issueType)).length,
    possibleDuplicates: reconQueue.filter(i => i.issueType === "possible_duplicate").length,
    suspenseCredits: reconQueue.filter(i => i.issueType === "unmatched_credit").length,
    total: reconQueue.length,
  };

  // Aging buckets
  const agingBuckets: Record<string, number> = {};
  for (const o of outstandings.filter(o => o.direction === "receivable")) {
    const aging = calculateAging(o.dueDate);
    agingBuckets[aging.agingBucket] = (agingBuckets[aging.agingBucket] || 0) + parseFloat(o.amountDue);
  }

  res.json({
    cashFlow: {
      inflows,
      outflows,
      netCashFlow,
      period: "last_30_days",
    },
    outstandings: {
      totalReceivables,
      totalPayables,
      netPosition: totalReceivables - totalPayables,
    },
    overdue: {
      amount: overdueAmount,
      count: overdueCount,
    },
    parties: {
      total: parties.length,
      customers: parties.filter(p => p.type === "customer").length,
      vendors: parties.filter(p => p.type === "vendor").length,
    },
    reconciliation: reconSummary,
    followUps: {
      pending: followUps.length,
      overdue: followUps.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) < new Date()).length,
    },
    topDebtors,
    agingBuckets,
    recentActivity: recentActivity.map(e => ({
      id: e.id,
      eventType: e.eventType,
      amount: parseFloat(e.amount),
      direction: e.direction,
      eventDate: e.eventDate,
      narration: e.narration,
      reconciliationStatus: e.reconciliationStatus,
    })),
  });
});

export default router;
