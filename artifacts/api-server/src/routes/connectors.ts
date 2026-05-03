import { Router } from "express";
import { db } from "@workspace/db";
import { dataSourcesTable, syncLogsTable, moneyEventsTable, partiesTable, businessesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { normalizeTallyData, normalizeBusyData, normalizeMargData } from "../services/ledger-normalizer.js";
import { generateChecksum } from "../services/reconciliation-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

const MOCK_TALLY_DATA = [
  { type: "receipt", date: new Date().toISOString(), amount: "25000", partyName: "Sharma Traders", invoiceNumber: "INV-001", voucherNumber: "VR-101", narration: "Against invoice INV-001" },
  { type: "sales_invoice", date: new Date(Date.now() - 86400000).toISOString(), amount: "45000", partyName: "Gupta Electronics", invoiceNumber: "INV-002", voucherNumber: "VR-102", narration: "Electronics supply" },
  { type: "receipt", date: new Date(Date.now() - 2 * 86400000).toISOString(), amount: "12500", partyName: "Kumar Wholesale", invoiceNumber: "", voucherNumber: "VR-103", narration: "Advance payment" },
];

const MOCK_BUSY_DATA = [
  { transType: "payment", date: new Date().toISOString(), amount: "30000", customerName: "Ram Store", invoiceNo: "BUSY-001", narration: "Monthly payment" },
  { transType: "invoice", date: new Date(Date.now() - 86400000).toISOString(), amount: "15000", customerName: "Shyam Pharma", invoiceNo: "BUSY-002", narration: "Medicine supply" },
];

const MOCK_MARG_DATA = [
  { billType: "receipt", billDate: new Date().toISOString(), amount: "18000", partyName: "Verma Chemist", billNo: "MARG-001", remarks: "Stock payment" },
  { billType: "sales", billDate: new Date(Date.now() - 86400000).toISOString(), amount: "22000", partyName: "Singh Medical", billNo: "MARG-002", remarks: "Medicine bills" },
];

async function importMockData(
  userId: number,
  businessId: number,
  sourceId: number | null,
  sourceType: string,
  normalizedEvents: ReturnType<typeof normalizeTallyData>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const event of normalizedEvents) {
    try {
      const checksum = generateChecksum(event.amount, event.eventDate, null, event.referenceNumber || null);

      await db.insert(moneyEventsTable).values({
        userId,
        businessId,
        sourceId,
        sourceType: event.sourceType,
        eventType: event.eventType,
        amount: event.amount.toString(),
        direction: event.direction,
        eventDate: event.eventDate,
        partyId: null,
        narration: event.narration || null,
        invoiceNumber: event.invoiceNumber || null,
        voucherNumber: event.voucherNumber || null,
        rawPayloadJson: event.rawPayloadJson || null,
        checksum,
        confidenceScore: "70",
        reconciliationStatus: "pending_review",
      });
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

// POST /api/connectors/tally/test
router.post("/connectors/tally/test", authMiddleware, async (req: AuthRequest, res) => {
  res.json({ success: true, message: "Tally connector test successful (mock). Tally detected: TallyPrime 3.0", version: "TallyPrime 3.0", companyCount: 2 });
});

// POST /api/connectors/tally/sync
router.post("/connectors/tally/sync", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  let source = await db.select().from(dataSourcesTable)
    .where(and(eq(dataSourcesTable.businessId, businessId), eq(dataSourcesTable.sourceType, "tally"))).limit(1);

  if (!source.length) {
    const inserted = await db.insert(dataSourcesTable).values({
      userId: req.userId!,
      businessId,
      sourceType: "tally",
      sourceName: "Tally Prime",
      connectionStatus: "connected",
    }).returning();
    source = inserted;
  }

  const normalized = normalizeTallyData(MOCK_TALLY_DATA);
  const result = await importMockData(req.userId!, businessId, source[0].id, "tally", normalized);

  await db.update(dataSourcesTable).set({ lastSyncAt: new Date(), recordsImported: source[0].recordsImported + result.success })
    .where(eq(dataSourcesTable.id, source[0].id));

  await db.insert(syncLogsTable).values({
    userId: req.userId!,
    businessId,
    sourceId: source[0].id,
    syncType: "import",
    status: "success",
    message: `Tally sync complete. ${result.success} records imported.`,
    recordsSynced: result.success,
  });

  res.json({ success: true, ...result, message: `Tally sync complete. ${result.success} vouchers imported.` });
});

// POST /api/connectors/busy/test
router.post("/connectors/busy/test", authMiddleware, async (req: AuthRequest, res) => {
  res.json({ success: true, message: "BUSY connector test successful (mock). BUSY 21 detected.", version: "BUSY 21" });
});

// POST /api/connectors/busy/sync
router.post("/connectors/busy/sync", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  let source = await db.select().from(dataSourcesTable)
    .where(and(eq(dataSourcesTable.businessId, businessId), eq(dataSourcesTable.sourceType, "busy"))).limit(1);

  if (!source.length) {
    const inserted = await db.insert(dataSourcesTable).values({
      userId: req.userId!,
      businessId,
      sourceType: "busy",
      sourceName: "BUSY 21",
      connectionStatus: "connected",
    }).returning();
    source = inserted;
  }

  const normalized = normalizeBusyData(MOCK_BUSY_DATA);
  const result = await importMockData(req.userId!, businessId, source[0].id, "busy", normalized);

  await db.update(dataSourcesTable).set({ lastSyncAt: new Date(), recordsImported: source[0].recordsImported + result.success })
    .where(eq(dataSourcesTable.id, source[0].id));

  res.json({ success: true, ...result, message: `BUSY sync complete. ${result.success} transactions imported.` });
});

// POST /api/connectors/marg/test
router.post("/connectors/marg/test", authMiddleware, async (req: AuthRequest, res) => {
  res.json({ success: true, message: "Marg connector test successful (mock). Marg ERP 9+ detected.", version: "Marg ERP 9+" });
});

// POST /api/connectors/marg/sync
router.post("/connectors/marg/sync", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  let source = await db.select().from(dataSourcesTable)
    .where(and(eq(dataSourcesTable.businessId, businessId), eq(dataSourcesTable.sourceType, "marg"))).limit(1);

  if (!source.length) {
    const inserted = await db.insert(dataSourcesTable).values({
      userId: req.userId!,
      businessId,
      sourceType: "marg",
      sourceName: "Marg ERP 9+",
      connectionStatus: "connected",
    }).returning();
    source = inserted;
  }

  const normalized = normalizeMargData(MOCK_MARG_DATA);
  const result = await importMockData(req.userId!, businessId, source[0].id, "marg", normalized);

  await db.update(dataSourcesTable).set({ lastSyncAt: new Date(), recordsImported: source[0].recordsImported + result.success })
    .where(eq(dataSourcesTable.id, source[0].id));

  res.json({ success: true, ...result, message: `Marg sync complete. ${result.success} bills imported.` });
});

// POST /api/connectors/payment-gateway/webhook (mock)
router.post("/connectors/payment-gateway/webhook", async (req, res) => {
  const { amount, utr, payerName, payerMobile, businessId, paymentMode } = req.body;

  if (!amount || !businessId) {
    res.status(400).json({ error: "Amount and businessId required for mock webhook" });
    return;
  }

  const business = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1);
  if (!business.length) { res.status(404).json({ error: "Business not found" }); return; }

  const checksum = generateChecksum(amount, new Date(), null, utr || null);

  let partyId: number | null = null;
  if (payerMobile) {
    const party = await db.select().from(partiesTable)
      .where(and(eq(partiesTable.businessId, businessId), eq(partiesTable.mobile, payerMobile))).limit(1);
    if (party.length) partyId = party[0].id;
  }

  await db.insert(moneyEventsTable).values({
    userId: business[0].userId,
    businessId,
    sourceType: "payment_gateway",
    eventType: "payment_received",
    amount: amount.toString(),
    direction: "inflow",
    eventDate: new Date(),
    partyId,
    utr: utr || null,
    narration: payerName ? `Payment from ${payerName}` : "Payment gateway webhook",
    checksum,
    confidenceScore: "90",
    reconciliationStatus: partyId ? "auto_matched" : "suspense",
  });

  res.json({ success: true, message: "Webhook processed", utr: utr || `PG${Date.now()}` });
});

export default router;
