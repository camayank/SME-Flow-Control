import { Router } from "express";
import { db } from "@workspace/db";
import {
  partiesTable, ledgerEntriesTable, moneyEventsTable, followUpsTable,
  businessesTable, invoicesTable, outstandingsTable,
} from "@workspace/db/schema";
import { eq, and, ilike, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

function normalizePartyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// GET /api/parties
router.get("/parties", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { search, type, balance_type } = req.query;

  const parties = await db.select().from(partiesTable)
    .where(
      and(
        eq(partiesTable.businessId, businessId),
        search ? ilike(partiesTable.name, `%${search}%`) : undefined,
        type ? eq(partiesTable.type, type as string) : undefined,
        balance_type ? eq(partiesTable.balanceType, balance_type as string) : undefined,
      )
    )
    .orderBy(partiesTable.name);

  res.json(parties.map(formatParty));
});

// POST /api/parties
router.post("/parties", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { name, mobile, email, gstin, type, address, city, openingBalance, openingBalanceType } = req.body;
  if (!name) { res.status(400).json({ error: "Party name is required" }); return; }

  const inserted = await db.insert(partiesTable).values({
    userId: req.userId!,
    businessId,
    name,
    normalizedName: normalizePartyName(name),
    mobile: mobile || null,
    email: email || null,
    gstin: gstin || null,
    type: type || "customer",
    address: address || null,
    city: city || null,
    openingBalance: (openingBalance || 0).toString(),
    openingBalanceType: openingBalanceType || "none",
    currentBalance: (openingBalance || 0).toString(),
    balanceType: openingBalanceType === "receivable" ? "receivable" : openingBalanceType === "payable" ? "payable" : "settled",
  }).returning();

  res.status(201).json(formatParty(inserted[0]));
});

// GET /api/parties/duplicates
router.get("/parties/duplicates", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const parties = await db.select().from(partiesTable).where(eq(partiesTable.businessId, businessId));

  const groups: { parties: typeof parties; reason: string }[] = [];
  const checked = new Set<number>();

  for (let i = 0; i < parties.length; i++) {
    if (checked.has(parties[i].id)) continue;
    const group = [parties[i]];

    for (let j = i + 1; j < parties.length; j++) {
      if (checked.has(parties[j].id)) continue;
      const a = parties[i];
      const b = parties[j];

      let isDuplicate = false;
      let reason = "";

      if (a.mobile && b.mobile && a.mobile === b.mobile) {
        isDuplicate = true; reason = "Same mobile number";
      } else if (a.gstin && b.gstin && a.gstin === b.gstin) {
        isDuplicate = true; reason = "Same GSTIN";
      } else {
        const simA = a.normalizedName.replace(/\s/g, "");
        const simB = b.normalizedName.replace(/\s/g, "");
        if (simA === simB || simA.startsWith(simB) || simB.startsWith(simA)) {
          isDuplicate = true; reason = "Similar name";
        }
      }

      if (isDuplicate) {
        group.push(b);
        checked.add(b.id);
        if (group.length === 1) {
          checked.add(a.id);
          groups.push({ parties: group, reason });
        }
      }
    }

    if (group.length > 1) checked.add(parties[i].id);
  }

  res.json(groups.map(g => ({ parties: g.parties.map(formatParty), reason: g.reason })));
});

// POST /api/parties/merge
router.post("/parties/merge", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { primaryPartyId, mergePartyId, reason } = req.body;
  if (!primaryPartyId || !mergePartyId) { res.status(400).json({ error: "Both party IDs required" }); return; }

  await db.update(ledgerEntriesTable).set({ partyId: primaryPartyId }).where(eq(ledgerEntriesTable.partyId, mergePartyId));
  await db.update(moneyEventsTable).set({ partyId: primaryPartyId }).where(eq(moneyEventsTable.partyId, mergePartyId));
  await db.update(followUpsTable).set({ partyId: primaryPartyId }).where(eq(followUpsTable.partyId, mergePartyId));

  await db.update(partiesTable).set({ duplicateGroupId: primaryPartyId }).where(eq(partiesTable.id, mergePartyId));

  const primary = await db.select().from(partiesTable).where(eq(partiesTable.id, primaryPartyId)).limit(1);
  res.json(formatParty(primary[0]));
});

// GET /api/parties/:id
router.get("/parties/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const party = await db.select().from(partiesTable).where(
    and(eq(partiesTable.id, parseInt(req.params.id)), eq(partiesTable.businessId, businessId))
  ).limit(1);

  if (!party.length) { res.status(404).json({ error: "Party not found" }); return; }
  res.json(formatParty(party[0]));
});

// PUT /api/parties/:id
router.put("/parties/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { name, mobile, email, gstin, type, address, city, openingBalance, openingBalanceType } = req.body;

  const updated = await db.update(partiesTable).set({
    name: name,
    normalizedName: normalizePartyName(name),
    mobile, email, gstin, type, address, city,
    openingBalance: openingBalance?.toString(),
    openingBalanceType,
    updatedAt: new Date(),
  }).where(
    and(eq(partiesTable.id, parseInt(req.params.id)), eq(partiesTable.businessId, businessId))
  ).returning();

  if (!updated.length) { res.status(404).json({ error: "Party not found" }); return; }
  res.json(formatParty(updated[0]));
});

// GET /api/parties/:id/ledger  — enhanced with invoices, payments, running balance, follow-up history
router.get("/parties/:id/ledger", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const partyId = parseInt(req.params.id);
  const party = await db.select().from(partiesTable).where(
    and(eq(partiesTable.id, partyId), eq(partiesTable.businessId, businessId))
  ).limit(1);

  if (!party.length) { res.status(404).json({ error: "Party not found" }); return; }

  const [invoices, payments, followUps, outstandings] = await Promise.all([
    db.select().from(invoicesTable).where(
      and(eq(invoicesTable.partyId, partyId), eq(invoicesTable.businessId, businessId))
    ).orderBy(invoicesTable.invoiceDate),

    db.select().from(moneyEventsTable).where(
      and(eq(moneyEventsTable.partyId, partyId), eq(moneyEventsTable.businessId, businessId))
    ).orderBy(moneyEventsTable.eventDate),

    db.select().from(followUpsTable).where(
      and(eq(followUpsTable.partyId, partyId), eq(followUpsTable.businessId, businessId))
    ).orderBy(desc(followUpsTable.createdAt)),

    db.select().from(outstandingsTable).where(
      and(eq(outstandingsTable.partyId, partyId), eq(outstandingsTable.businessId, businessId))
    ).orderBy(desc(outstandingsTable.createdAt)),
  ]);

  // Build unified ledger rows
  type LedgerRow = {
    id: string;
    date: Date | string;
    narration: string;
    refNumber: string | null;
    rowType: "invoice" | "payment" | "entry";
    invoiceType?: string;
    debitAmount: number | null;
    creditAmount: number | null;
    amount: number;
    status: string;
    dueDate?: Date | null;
    balanceDue?: number;
    runningBalance?: number;
    sourceId: number;
  };

  const rows: LedgerRow[] = [];

  // Opening balance row if any
  const openingBal = parseFloat(party[0].openingBalance || "0");
  if (openingBal > 0) {
    rows.push({
      id: "opening",
      date: party[0].createdAt,
      narration: "Opening Balance",
      refNumber: null,
      rowType: "entry",
      debitAmount: party[0].openingBalanceType === "receivable" ? openingBal : null,
      creditAmount: party[0].openingBalanceType === "payable" ? openingBal : null,
      amount: openingBal,
      status: "settled",
      sourceId: 0,
    });
  }

  // Add invoices as debit rows
  const invoiceIds = new Set<number>();
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const total = parseFloat(inv.total);
    const amountPaid = parseFloat(inv.amountPaid);
    const balanceDue = parseFloat(inv.balanceDue);
    const isSale = inv.invoiceType === "sale";
    const isPurchase = inv.invoiceType === "purchase";
    rows.push({
      id: `inv-${inv.id}`,
      date: inv.invoiceDate,
      narration: `${inv.invoiceType === "quotation" ? "Quotation" : inv.invoiceType === "purchase" ? "Purchase Invoice" : "Sales Invoice"}: ${inv.partyName || ""}`,
      refNumber: inv.invoiceNumber,
      rowType: "invoice",
      invoiceType: inv.invoiceType,
      debitAmount: isSale ? total : null,
      creditAmount: isPurchase ? total : null,
      amount: total,
      status: inv.status,
      dueDate: inv.dueDate,
      balanceDue,
      sourceId: inv.id,
    });
    invoiceIds.add(inv.id);

    // Partial/full payment recorded on invoice
    if (amountPaid > 0) {
      rows.push({
        id: `inv-pay-${inv.id}`,
        date: inv.updatedAt,
        narration: `Payment received — ${inv.invoiceNumber}`,
        refNumber: inv.invoiceNumber,
        rowType: "payment",
        debitAmount: isPurchase ? amountPaid : null,
        creditAmount: isSale ? amountPaid : null,
        amount: amountPaid,
        status: "settled",
        sourceId: inv.id,
      });
    }
  }

  // Add standalone money events (payments not linked to an invoice already counted)
  for (const pay of payments) {
    rows.push({
      id: `pay-${pay.id}`,
      date: pay.eventDate,
      narration: pay.narration || pay.eventType.replace(/_/g, " "),
      refNumber: pay.referenceNumber || pay.utr || null,
      rowType: "payment",
      debitAmount: pay.direction === "outflow" ? parseFloat(pay.amount) : null,
      creditAmount: pay.direction === "inflow" ? parseFloat(pay.amount) : null,
      amount: parseFloat(pay.amount),
      status: "settled",
      sourceId: pay.id,
    });
  }

  // Sort by date ascending
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute running balance
  let balance = 0;
  const rowsWithBalance = rows.map(row => {
    if (row.debitAmount != null) balance += row.debitAmount;
    if (row.creditAmount != null) balance -= row.creditAmount;
    return { ...row, runningBalance: Math.round(balance * 100) / 100 };
  });

  // Summary
  const saleInvoices = invoices.filter(i => i.invoiceType === "sale" && i.status !== "cancelled");
  const totalInvoiced = saleInvoices.reduce((s, i) => s + parseFloat(i.total), 0);
  const totalPaid = saleInvoices.reduce((s, i) => s + parseFloat(i.amountPaid), 0);
  const totalOverdue = saleInvoices.filter(i => i.status !== "paid" && i.dueDate && new Date(i.dueDate) < new Date()).reduce((s, i) => s + parseFloat(i.balanceDue), 0);
  const totalPurchase = invoices.filter(i => i.invoiceType === "purchase" && i.status !== "cancelled").reduce((s, i) => s + parseFloat(i.total), 0);

  const pendingOutstandings = outstandings.filter(o => o.status === "open");
  const totalOutstanding = pendingOutstandings.reduce((s, o) => s + parseFloat(o.amountDue), 0);

  res.json({
    party: formatParty(party[0]),
    summary: {
      totalInvoices: totalInvoiced,
      totalPaymentsReceived: totalPaid,
      totalPayable: totalPurchase,
      totalOverdue,
      totalOutstanding,
      lastFollowUpAt: followUps.length ? followUps[0].createdAt : null,
      nextFollowUpAt: followUps.find(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) > new Date())?.nextFollowUpAt || null,
      riskScore: party[0].riskScore ? parseFloat(party[0].riskScore) : null,
    },
    entries: rowsWithBalance,
    invoices: invoices.filter(i => i.status !== "cancelled").map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      total: parseFloat(inv.total),
      amountPaid: parseFloat(inv.amountPaid),
      balanceDue: parseFloat(inv.balanceDue),
      status: inv.status,
      subtotal: parseFloat(inv.subtotal),
    })),
    followUps: followUps.map(fu => ({
      id: fu.id,
      followUpType: fu.followUpType,
      status: fu.status,
      note: fu.note,
      promisedPaymentDate: fu.promisedPaymentDate,
      promisedAmount: fu.promisedAmount ? parseFloat(fu.promisedAmount) : null,
      nextFollowUpAt: fu.nextFollowUpAt,
      lastReminderAt: fu.lastReminderAt,
      createdAt: fu.createdAt,
    })),
    outstandings: pendingOutstandings.map(o => ({
      id: o.id,
      amountDue: parseFloat(o.amountDue),
      dueDate: o.dueDate,
      agingDays: Math.max(0, o.dueDate ? Math.floor((Date.now() - new Date(o.dueDate).getTime()) / 86400000) : 0),
      status: o.status,
      invoiceNumber: o.invoiceNumber,
    })),
  });
});

function formatParty(p: typeof partiesTable.$inferSelect) {
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    normalizedName: p.normalizedName,
    mobile: p.mobile,
    email: p.email,
    gstin: p.gstin,
    type: p.type,
    address: p.address,
    city: p.city,
    currentBalance: parseFloat(p.currentBalance || "0"),
    balanceType: p.balanceType,
    openingBalance: parseFloat(p.openingBalance || "0"),
    openingBalanceType: p.openingBalanceType,
    riskScore: p.riskScore ? parseFloat(p.riskScore) : null,
    sourceType: p.sourceType,
    createdAt: p.createdAt,
  };
}

export default router;
