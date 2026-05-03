import { Router } from "express";
import { db } from "@workspace/db";
import { partiesTable, ledgerEntriesTable, moneyEventsTable, followUpsTable, businessesTable } from "@workspace/db/schema";
import { eq, and, or, ilike, sql } from "drizzle-orm";
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

  let query = db.select().from(partiesTable).where(eq(partiesTable.businessId, businessId));

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
        isDuplicate = true;
        reason = "Same mobile number";
      } else if (a.gstin && b.gstin && a.gstin === b.gstin) {
        isDuplicate = true;
        reason = "Same GSTIN";
      } else {
        const simA = a.normalizedName.replace(/\s/g, "");
        const simB = b.normalizedName.replace(/\s/g, "");
        if (simA === simB || simA.startsWith(simB) || simB.startsWith(simA)) {
          isDuplicate = true;
          reason = "Similar name";
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

    if (group.length > 1) {
      checked.add(parties[i].id);
    }
  }

  res.json(groups.map(g => ({ parties: g.parties.map(formatParty), reason: g.reason })));
});

// POST /api/parties/merge
router.post("/parties/merge", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { primaryPartyId, mergePartyId, reason } = req.body;
  if (!primaryPartyId || !mergePartyId) { res.status(400).json({ error: "Both party IDs required" }); return; }

  // Move all ledger entries to primary party
  await db.update(ledgerEntriesTable).set({ partyId: primaryPartyId }).where(eq(ledgerEntriesTable.partyId, mergePartyId));
  await db.update(moneyEventsTable).set({ partyId: primaryPartyId }).where(eq(moneyEventsTable.partyId, mergePartyId));
  await db.update(followUpsTable).set({ partyId: primaryPartyId }).where(eq(followUpsTable.partyId, mergePartyId));

  // Update merged party status
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

// GET /api/parties/:id/ledger
router.get("/parties/:id/ledger", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const partyId = parseInt(req.params.id);
  const party = await db.select().from(partiesTable).where(
    and(eq(partiesTable.id, partyId), eq(partiesTable.businessId, businessId))
  ).limit(1);

  if (!party.length) { res.status(404).json({ error: "Party not found" }); return; }

  const entries = await db.select().from(ledgerEntriesTable).where(
    and(eq(ledgerEntriesTable.partyId, partyId), eq(ledgerEntriesTable.businessId, businessId))
  ).orderBy(ledgerEntriesTable.entryDate);

  const totalInvoices = entries.filter(e => e.entryType === "sales_invoice").reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalPaymentsReceived = entries.filter(e => e.entryType === "payment_received").reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalPayable = entries.filter(e => ["purchase_invoice", "advance_paid"].includes(e.entryType)).reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalOverdue = entries.filter(e => e.status === "open" && e.dueDate && new Date(e.dueDate) < new Date()).reduce((s, e) => s + parseFloat(e.amount), 0);

  const followUps = await db.select().from(followUpsTable).where(
    and(eq(followUpsTable.partyId, partyId), eq(followUpsTable.businessId, businessId))
  ).orderBy(followUpsTable.createdAt);

  res.json({
    party: formatParty(party[0]),
    summary: {
      totalInvoices,
      totalPaymentsReceived,
      totalPayable,
      totalOverdue,
      lastFollowUpAt: followUps.length ? followUps[followUps.length - 1].createdAt : null,
      nextFollowUpAt: followUps.find(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) > new Date())?.nextFollowUpAt || null,
      riskScore: party[0].riskScore ? parseFloat(party[0].riskScore) : null,
    },
    entries: entries.map(formatLedgerEntry),
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

function formatLedgerEntry(e: typeof ledgerEntriesTable.$inferSelect) {
  return {
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
  };
}

export default router;
