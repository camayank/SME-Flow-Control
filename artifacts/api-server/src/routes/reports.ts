import { Router } from "express";
import { db } from "@workspace/db";
import {
  partiesTable, outstandingsTable, moneyEventsTable, reconciliationQueueTable,
  followUpsTable, ledgerEntriesTable, dataSourcesTable, syncLogsTable, businessesTable,
  invoicesTable, invoiceItemsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { calculateAging, getAgingLabel } from "../services/outstanding-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/reports/receivables
router.get("/reports/receivables", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const outstandings = await db.select({
    outstanding: outstandingsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
  })
    .from(outstandingsTable)
    .leftJoin(partiesTable, eq(outstandingsTable.partyId, partiesTable.id))
    .where(and(eq(outstandingsTable.businessId, businessId), eq(outstandingsTable.direction, "receivable")));

  const total = outstandings.reduce((s, { outstanding }) => s + parseFloat(outstanding.amountDue), 0);
  const collected = outstandings.reduce((s, { outstanding }) => s + parseFloat(outstanding.amountCollected), 0);

  res.json({
    totalReceivables: total,
    totalCollected: collected,
    netOutstanding: total,
    items: outstandings.map(({ outstanding, partyName, partyMobile }) => {
      const aging = calculateAging(outstanding.dueDate);
      return {
        id: outstanding.id,
        partyId: outstanding.partyId,
        partyName,
        partyMobile,
        amountDue: parseFloat(outstanding.amountDue),
        amountCollected: parseFloat(outstanding.amountCollected),
        dueDate: outstanding.dueDate,
        agingDays: aging.agingDays,
        agingBucket: aging.agingBucket,
        priority: aging.priority,
        status: outstanding.status,
      };
    }),
  });
});

// GET /api/reports/payables
router.get("/reports/payables", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const outstandings = await db.select({
    outstanding: outstandingsTable,
    partyName: partiesTable.name,
  })
    .from(outstandingsTable)
    .leftJoin(partiesTable, eq(outstandingsTable.partyId, partiesTable.id))
    .where(and(eq(outstandingsTable.businessId, businessId), eq(outstandingsTable.direction, "payable")));

  const total = outstandings.reduce((s, { outstanding }) => s + parseFloat(outstanding.amountDue), 0);

  res.json({
    totalPayables: total,
    items: outstandings.map(({ outstanding, partyName }) => ({
      id: outstanding.id,
      partyId: outstanding.partyId,
      partyName,
      amountDue: parseFloat(outstanding.amountDue),
      dueDate: outstanding.dueDate,
      status: outstanding.status,
    })),
  });
});

// GET /api/reports/aging
router.get("/reports/aging", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const outstandings = await db.select({
    outstanding: outstandingsTable,
    partyName: partiesTable.name,
  })
    .from(outstandingsTable)
    .leftJoin(partiesTable, eq(outstandingsTable.partyId, partiesTable.id))
    .where(and(eq(outstandingsTable.businessId, businessId), eq(outstandingsTable.status, "open")));

  const buckets: Record<string, { label: string; amount: number; count: number; parties: { name: string | null; amount: number }[] }> = {
    "not_due": { label: "Abhi Due Nahi", amount: 0, count: 0, parties: [] },
    "due_today": { label: "Aaj Due Hai", amount: 0, count: 0, parties: [] },
    "overdue_1_7": { label: "1-7 Din", amount: 0, count: 0, parties: [] },
    "overdue_8_15": { label: "8-15 Din", amount: 0, count: 0, parties: [] },
    "overdue_16_30": { label: "16-30 Din", amount: 0, count: 0, parties: [] },
    "overdue_31_60": { label: "31-60 Din", amount: 0, count: 0, parties: [] },
    "overdue_60_plus": { label: "60+ Din", amount: 0, count: 0, parties: [] },
  };

  for (const { outstanding, partyName } of outstandings) {
    const aging = calculateAging(outstanding.dueDate);
    const bucket = buckets[aging.agingBucket];
    if (bucket) {
      const amount = parseFloat(outstanding.amountDue);
      bucket.amount += amount;
      bucket.count += 1;
      bucket.parties.push({ name: partyName, amount });
    }
  }

  res.json({
    summary: Object.entries(buckets).map(([key, val]) => ({
      bucket: key, label: val.label, amount: val.amount, count: val.count,
    })),
    details: buckets,
  });
});

// GET /api/reports/collections
router.get("/reports/collections", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await db.select().from(moneyEventsTable).where(
    and(eq(moneyEventsTable.businessId, businessId), eq(moneyEventsTable.direction, "inflow"),
      gte(moneyEventsTable.eventDate, thirtyDaysAgo))
  );

  const totalCollected = events.reduce((s, e) => s + parseFloat(e.amount), 0);

  res.json({
    period: "last_30_days",
    totalCollected,
    eventCount: events.length,
    avgPerDay: totalCollected / 30,
    events: events.map(e => ({
      id: e.id, amount: parseFloat(e.amount), eventDate: e.eventDate,
      partyId: e.partyId, narration: e.narration,
    })),
  });
});

// GET /api/reports/follow-ups
router.get("/reports/follow-ups", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const followUps = await db.select({
    followUp: followUpsTable,
    partyName: partiesTable.name,
  })
    .from(followUpsTable)
    .leftJoin(partiesTable, eq(followUpsTable.partyId, partiesTable.id))
    .where(eq(followUpsTable.businessId, businessId));

  const statusCounts: Record<string, number> = {};
  for (const { followUp } of followUps) {
    statusCounts[followUp.status] = (statusCounts[followUp.status] || 0) + 1;
  }

  res.json({
    total: followUps.length,
    statusCounts,
    items: followUps.map(({ followUp, partyName }) => ({
      id: followUp.id, partyName, status: followUp.status,
      followUpType: followUp.followUpType, nextFollowUpAt: followUp.nextFollowUpAt,
    })),
  });
});

// GET /api/reports/reconciliation
router.get("/reports/reconciliation", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const items = await db.select().from(reconciliationQueueTable).where(eq(reconciliationQueueTable.businessId, businessId));

  const typeCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};

  for (const item of items) {
    typeCounts[item.issueType] = (typeCounts[item.issueType] || 0) + 1;
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }

  res.json({ total: items.length, typeCounts, statusCounts });
});

// GET /api/reports/source-sync
router.get("/reports/source-sync", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const sources = await db.select().from(dataSourcesTable).where(eq(dataSourcesTable.businessId, businessId));
  const logs = await db.select().from(syncLogsTable).where(eq(syncLogsTable.businessId, businessId));

  res.json({
    sources: sources.map(s => ({
      id: s.id, sourceType: s.sourceType, sourceName: s.sourceName,
      connectionStatus: s.connectionStatus, lastSyncAt: s.lastSyncAt,
      recordsImported: s.recordsImported,
    })),
    recentLogs: logs.slice(-20).map(l => ({
      id: l.id, sourceId: l.sourceId, syncType: l.syncType,
      status: l.status, message: l.message, recordsSynced: l.recordsSynced, createdAt: l.createdAt,
    })),
  });
});

// GET /api/reports/party-statement/:partyId
router.get("/reports/party-statement/:partyId", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const partyId = parseInt(req.params.partyId);
  const party = await db.select().from(partiesTable).where(
    and(eq(partiesTable.id, partyId), eq(partiesTable.businessId, businessId))
  ).limit(1);

  if (!party.length) { res.status(404).json({ error: "Party not found" }); return; }

  const entries = await db.select().from(ledgerEntriesTable).where(
    and(eq(ledgerEntriesTable.partyId, partyId), eq(ledgerEntriesTable.businessId, businessId))
  ).orderBy(ledgerEntriesTable.entryDate);

  const openings = parseFloat(party[0].openingBalance || "0");
  let runningBalance = openings;
  const statement = entries.map(e => {
    const debit = e.debitAmount ? parseFloat(e.debitAmount) : 0;
    const credit = e.creditAmount ? parseFloat(e.creditAmount) : 0;
    runningBalance += debit - credit;
    return {
      id: e.id,
      entryDate: e.entryDate,
      entryType: e.entryType,
      narration: e.narration,
      invoiceNumber: e.invoiceNumber,
      voucherNumber: e.voucherNumber,
      debit: debit || null,
      credit: credit || null,
      balance: runningBalance,
    };
  });

  res.json({
    party: { id: party[0].id, name: party[0].name, mobile: party[0].mobile, gstin: party[0].gstin },
    openingBalance: openings,
    closingBalance: runningBalance,
    statement,
  });
});

// GET /api/reports/pl — Profit & Loss Summary
router.get("/reports/pl", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { from, to } = req.query;
  const fromDate = from ? new Date(from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to as string) : new Date();

  const conditions = [
    eq(moneyEventsTable.businessId, businessId),
    gte(moneyEventsTable.eventDate, fromDate),
    lte(moneyEventsTable.eventDate, toDate),
  ];

  const events = await db.select().from(moneyEventsTable).where(and(...conditions));

  const salesRevenue = events.filter(e => e.direction === "inflow" && ["payment_received", "credit_sale", "advance_received"].includes(e.eventType))
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  const purchaseCost = events.filter(e => e.direction === "outflow" && ["payment_made", "advance_paid"].includes(e.eventType))
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  const expenses = events.filter(e => e.direction === "outflow" && e.eventType === "expense")
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  const otherIncome = events.filter(e => e.direction === "inflow" && !["payment_received", "credit_sale", "advance_received"].includes(e.eventType))
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  // Invoice-based totals
  const invConditions = [
    eq(invoicesTable.businessId, businessId),
    gte(invoicesTable.invoiceDate, fromDate),
    lte(invoicesTable.invoiceDate, toDate),
  ];
  const invoices = await db.select().from(invoicesTable).where(and(...invConditions));

  const salesInvoiceTotal = invoices.filter(i => i.invoiceType === "sale").reduce((s, i) => s + parseFloat(i.total), 0);
  const purchaseInvoiceTotal = invoices.filter(i => i.invoiceType === "purchase").reduce((s, i) => s + parseFloat(i.total), 0);

  const grossProfit = salesRevenue - purchaseCost;
  const netProfit = grossProfit - expenses + otherIncome;

  const monthlyBreakdown: Record<string, { sales: number; purchases: number; expenses: number }> = {};
  for (const e of events) {
    const month = new Date(e.eventDate).toLocaleString("en-IN", { month: "short", year: "2-digit" });
    if (!monthlyBreakdown[month]) monthlyBreakdown[month] = { sales: 0, purchases: 0, expenses: 0 };
    if (e.direction === "inflow") monthlyBreakdown[month].sales += parseFloat(e.amount);
    else if (e.eventType === "expense") monthlyBreakdown[month].expenses += parseFloat(e.amount);
    else monthlyBreakdown[month].purchases += parseFloat(e.amount);
  }

  res.json({
    period: { from: fromDate, to: toDate },
    revenue: { salesRevenue, otherIncome, total: salesRevenue + otherIncome },
    costs: { purchaseCost, expenses, total: purchaseCost + expenses },
    grossProfit,
    netProfit,
    margin: salesRevenue > 0 ? ((netProfit / salesRevenue) * 100).toFixed(1) : "0",
    invoiceSummary: { salesInvoiceTotal, purchaseInvoiceTotal },
    monthlyBreakdown: Object.entries(monthlyBreakdown).map(([month, v]) => ({ month, ...v })),
  });
});

// GET /api/reports/sales-register
router.get("/reports/sales-register", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { from, to } = req.query;
  const fromDate = from ? new Date(from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to as string) : new Date();

  const invs = await db.select({
    invoice: invoicesTable,
    partyName: partiesTable.name,
  }).from(invoicesTable)
    .leftJoin(partiesTable, eq(invoicesTable.partyId, partiesTable.id))
    .where(and(
      eq(invoicesTable.businessId, businessId),
      eq(invoicesTable.invoiceType, "sale"),
      gte(invoicesTable.invoiceDate, fromDate),
      lte(invoicesTable.invoiceDate, toDate),
    ))
    .orderBy(desc(invoicesTable.invoiceDate));

  const totalSales = invs.reduce((s, { invoice }) => s + parseFloat(invoice.total), 0);
  const totalGst = invs.reduce((s, { invoice }) => s + parseFloat(invoice.cgstTotal) + parseFloat(invoice.sgstTotal) + parseFloat(invoice.igstTotal), 0);
  const totalTaxable = invs.reduce((s, { invoice }) => s + parseFloat(invoice.subtotal), 0);

  res.json({
    period: { from: fromDate, to: toDate },
    summary: { totalSales, totalGst, totalTaxable, count: invs.length },
    items: invs.map(({ invoice, partyName }) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      partyName: invoice.partyName || partyName,
      partyGstin: invoice.partyGstin,
      subtotal: parseFloat(invoice.subtotal),
      cgst: parseFloat(invoice.cgstTotal),
      sgst: parseFloat(invoice.sgstTotal),
      igst: parseFloat(invoice.igstTotal),
      total: parseFloat(invoice.total),
      status: invoice.status,
    })),
  });
});

// GET /api/reports/purchase-register
router.get("/reports/purchase-register", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { from, to } = req.query;
  const fromDate = from ? new Date(from as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to as string) : new Date();

  const invs = await db.select({
    invoice: invoicesTable,
    partyName: partiesTable.name,
  }).from(invoicesTable)
    .leftJoin(partiesTable, eq(invoicesTable.partyId, partiesTable.id))
    .where(and(
      eq(invoicesTable.businessId, businessId),
      eq(invoicesTable.invoiceType, "purchase"),
      gte(invoicesTable.invoiceDate, fromDate),
      lte(invoicesTable.invoiceDate, toDate),
    ))
    .orderBy(desc(invoicesTable.invoiceDate));

  const totalPurchase = invs.reduce((s, { invoice }) => s + parseFloat(invoice.total), 0);
  const totalGst = invs.reduce((s, { invoice }) => s + parseFloat(invoice.cgstTotal) + parseFloat(invoice.sgstTotal) + parseFloat(invoice.igstTotal), 0);

  res.json({
    period: { from: fromDate, to: toDate },
    summary: { totalPurchase, totalGst, count: invs.length },
    items: invs.map(({ invoice, partyName }) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      partyName: invoice.partyName || partyName,
      partyGstin: invoice.partyGstin,
      subtotal: parseFloat(invoice.subtotal),
      cgst: parseFloat(invoice.cgstTotal),
      sgst: parseFloat(invoice.sgstTotal),
      igst: parseFloat(invoice.igstTotal),
      total: parseFloat(invoice.total),
      status: invoice.status,
    })),
  });
});

// GET /api/reports/monthly-trends
router.get("/reports/monthly-trends", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const events = await db.select().from(moneyEventsTable).where(
    and(eq(moneyEventsTable.businessId, businessId), gte(moneyEventsTable.eventDate, sixMonthsAgo))
  );

  const monthMap: Record<string, { month: string; inflow: number; outflow: number; net: number }> = {};

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    monthMap[key] = { month: label, inflow: 0, outflow: 0, net: 0 };
  }

  for (const e of events) {
    const d = new Date(e.eventDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthMap[key]) {
      const amt = parseFloat(e.amount);
      if (e.direction === "inflow") monthMap[key].inflow += amt;
      else monthMap[key].outflow += amt;
      monthMap[key].net = monthMap[key].inflow - monthMap[key].outflow;
    }
  }

  res.json({ months: Object.values(monthMap) });
});

export default router;
