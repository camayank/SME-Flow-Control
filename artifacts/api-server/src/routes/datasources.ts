import { Router } from "express";
import { db } from "@workspace/db";
import { dataSourcesTable, importJobsTable, syncLogsTable, moneyEventsTable, partiesTable, businessesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import multer from "multer";
import { normalizeCsvRow } from "../services/ledger-normalizer.js";
import { generateChecksum } from "../services/reconciliation-engine.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/data-sources
router.get("/data-sources", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const sources = await db.select().from(dataSourcesTable).where(eq(dataSourcesTable.businessId, businessId));
  res.json(sources.map(s => ({
    id: s.id, businessId: s.businessId, sourceType: s.sourceType, sourceName: s.sourceName,
    connectionStatus: s.connectionStatus, lastSyncAt: s.lastSyncAt,
    recordsImported: s.recordsImported, createdAt: s.createdAt,
  })));
});

// POST /api/data-sources
router.post("/data-sources", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { sourceType, sourceName, configJson } = req.body;
  const inserted = await db.insert(dataSourcesTable).values({
    userId: req.userId!,
    businessId,
    sourceType: sourceType || "csv",
    sourceName: sourceName || sourceType || "New Source",
    connectionStatus: "not_connected",
    configJson: configJson ? JSON.stringify(configJson) : null,
  }).returning();

  res.status(201).json(inserted[0]);
});

// PUT /api/data-sources/:id
router.put("/data-sources/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { sourceName, connectionStatus, configJson } = req.body;
  const updated = await db.update(dataSourcesTable).set({
    sourceName: sourceName || undefined,
    connectionStatus: connectionStatus || undefined,
    configJson: configJson ? JSON.stringify(configJson) : undefined,
    updatedAt: new Date(),
  }).where(and(eq(dataSourcesTable.id, parseInt(req.params.id)), eq(dataSourcesTable.businessId, businessId))).returning();

  if (!updated.length) { res.status(404).json({ error: "Source not found" }); return; }
  res.json(updated[0]);
});

// POST /api/data-sources/:id/test
router.post("/data-sources/:id/test", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  await db.update(dataSourcesTable).set({ connectionStatus: "connected", updatedAt: new Date() })
    .where(and(eq(dataSourcesTable.id, parseInt(req.params.id)), eq(dataSourcesTable.businessId, businessId)));

  res.json({ success: true, message: "Connection test successful (mock)", latencyMs: 120 });
});

// POST /api/data-sources/:id/sync
router.post("/data-sources/:id/sync", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const sourceId = parseInt(req.params.id);

  await db.update(dataSourcesTable).set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(dataSourcesTable.id, sourceId), eq(dataSourcesTable.businessId, businessId)));

  await db.insert(syncLogsTable).values({
    userId: req.userId!,
    businessId,
    sourceId,
    syncType: "import",
    status: "success",
    message: "Sync completed (mock)",
    recordsSynced: 0,
  });

  res.json({ success: true, message: "Sync completed (mock)", recordsSynced: 0 });
});

// POST /api/import/upload
router.post("/import/upload", authMiddleware, upload.single("file"), async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  if (!req.file) { res.status(400).json({ error: "File required" }); return; }

  const fileContent = req.file.buffer.toString("utf-8");
  const importType = req.body.importType || "csv";

  // Parse CSV headers
  const lines = fileContent.split("\n").filter(l => l.trim());
  const headers = lines[0]?.split(",").map(h => h.trim().replace(/"/g, "")) || [];

  // Auto-detect column mapping
  const mapping: Record<string, string> = {};
  const headerLower = headers.map(h => h.toLowerCase());

  for (const h of headers) {
    const hl = h.toLowerCase();
    if (hl.includes("party") || hl.includes("name") || hl.includes("customer")) mapping["party_name"] = h;
    if (hl.includes("amount") && !hl.includes("credit") && !hl.includes("debit")) mapping["amount"] = h;
    if (hl.includes("credit")) mapping["credit"] = h;
    if (hl.includes("debit")) mapping["debit"] = h;
    if (hl.includes("date")) mapping["voucher_date"] = h;
    if (hl.includes("narration") || hl.includes("description") || hl.includes("particular")) mapping["narration"] = h;
    if (hl.includes("ref") || hl.includes("utr") || hl.includes("transaction id")) mapping["reference_number"] = h;
    if (hl.includes("invoice") || hl.includes("bill")) mapping["invoice_number"] = h;
    if (hl.includes("voucher") || hl.includes("voucher no")) mapping["voucher_number"] = h;
  }

  // Create import job
  const job = await db.insert(importJobsTable).values({
    userId: req.userId!,
    businessId,
    importType,
    status: "mapping_required",
    totalRecords: lines.length - 1,
    successfulRecords: 0,
    failedRecords: 0,
    mappingJson: JSON.stringify(mapping),
    fileData: fileContent.substring(0, 50000), // Store first 50KB
  }).returning();

  res.status(201).json({
    jobId: job[0].id,
    headers,
    suggestedMapping: mapping,
    totalRows: lines.length - 1,
    preview: lines.slice(1, 6).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] || ""; });
      return row;
    }),
  });
});

// POST /api/import/map
router.post("/import/map", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { jobId, mapping } = req.body;
  if (!jobId || !mapping) { res.status(400).json({ error: "jobId and mapping required" }); return; }

  await db.update(importJobsTable).set({ mappingJson: JSON.stringify(mapping), status: "ready_to_confirm" })
    .where(eq(importJobsTable.id, jobId));

  // Preview normalized rows
  const job = await db.select().from(importJobsTable).where(eq(importJobsTable.id, jobId)).limit(1);
  if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }

  const lines = (job[0].fileData || "").split("\n").filter(l => l.trim());
  const headers = lines[0]?.split(",").map(h => h.trim().replace(/"/g, "")) || [];

  const preview = lines.slice(1, 6).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ""; });
    return normalizeCsvRow(row, mapping, "csv");
  }).filter(Boolean);

  res.json({ jobId, status: "ready_to_confirm", preview, totalRows: lines.length - 1 });
});

// POST /api/import/confirm
router.post("/import/confirm", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { jobId } = req.body;
  if (!jobId) { res.status(400).json({ error: "jobId required" }); return; }

  const job = await db.select().from(importJobsTable).where(eq(importJobsTable.id, jobId)).limit(1);
  if (!job.length) { res.status(404).json({ error: "Import job not found" }); return; }

  const mapping = JSON.parse(job[0].mappingJson || "{}");
  const lines = (job[0].fileData || "").split("\n").filter(l => l.trim());
  const headers = lines[0]?.split(",").map(h => h.trim().replace(/"/g, "")) || [];

  let successCount = 0;
  let failCount = 0;

  for (const line of lines.slice(1)) {
    try {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] || ""; });

      const event = normalizeCsvRow(row, mapping, "csv");
      if (!event) { failCount++; continue; }

      const checksum = generateChecksum(event.amount, event.eventDate, null, null);

      await db.insert(moneyEventsTable).values({
        userId: req.userId!,
        businessId,
        sourceType: "csv",
        eventType: event.eventType,
        amount: event.amount.toString(),
        direction: event.direction,
        eventDate: event.eventDate,
        narration: event.narration || null,
        referenceNumber: event.referenceNumber || null,
        invoiceNumber: event.invoiceNumber || null,
        voucherNumber: event.voucherNumber || null,
        rawInput: line,
        rawPayloadJson: event.rawPayloadJson,
        checksum,
        confidenceScore: "50",
        reconciliationStatus: "suspense",
      });

      successCount++;
    } catch {
      failCount++;
    }
  }

  await db.update(importJobsTable).set({
    status: "completed",
    successfulRecords: successCount,
    failedRecords: failCount,
    updatedAt: new Date(),
  }).where(eq(importJobsTable.id, jobId));

  res.json({ success: true, jobId, successCount, failCount, message: `${successCount} records imported, ${failCount} failed.` });
});

// GET /api/import/jobs
router.get("/import/jobs", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const jobs = await db.select().from(importJobsTable).where(eq(importJobsTable.businessId, businessId))
    .orderBy(importJobsTable.createdAt);

  res.json(jobs.map(j => ({
    id: j.id, importType: j.importType, status: j.status,
    totalRecords: j.totalRecords, successfulRecords: j.successfulRecords,
    failedRecords: j.failedRecords, createdAt: j.createdAt,
  })));
});

// POST /api/import/jobs/:id/rollback
router.post("/import/jobs/:id/rollback", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const jobId = parseInt(req.params.id);
  const job = await db.select().from(importJobsTable).where(eq(importJobsTable.id, jobId)).limit(1);
  if (!job.length) { res.status(404).json({ error: "Job not found" }); return; }

  await db.update(importJobsTable).set({ status: "rolled_back" }).where(eq(importJobsTable.id, jobId));
  res.json({ success: true, message: "Import job rolled back (mock - manual cleanup required)" });
});

export default router;
