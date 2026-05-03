import { Router } from "express";
import { db } from "@workspace/db";
import { itemsTable, businessesTable } from "@workspace/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

function fmtItem(i: typeof itemsTable.$inferSelect) {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    hsn: i.hsn,
    unit: i.unit,
    salePrice: parseFloat(i.salePrice || "0"),
    purchasePrice: parseFloat(i.purchasePrice || "0"),
    gstRate: parseFloat(i.gstRate || "18"),
    stockQty: parseFloat(i.stockQty || "0"),
    reorderLevel: parseFloat(i.reorderLevel || "0"),
    trackInventory: i.trackInventory,
    isActive: i.isActive,
    barcode: i.barcode,
    category: i.category,
    isLowStock: i.trackInventory && parseFloat(i.stockQty || "0") <= parseFloat(i.reorderLevel || "0"),
    createdAt: i.createdAt,
  };
}

// GET /api/items
router.get("/items", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const items = await db.select().from(itemsTable)
    .where(and(eq(itemsTable.businessId, businessId), eq(itemsTable.isActive, true)))
    .orderBy(itemsTable.name);

  const formatted = items.map(fmtItem);
  const lowStockItems = formatted.filter(i => i.isLowStock);

  res.json({ items: formatted, lowStockCount: lowStockItems.length });
});

// POST /api/items
router.post("/items", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { name, description, hsn, unit, salePrice, purchasePrice, gstRate, stockQty, reorderLevel, trackInventory, barcode, category } = req.body;
  if (!name) { res.status(400).json({ error: "Item name required" }); return; }

  const inserted = await db.insert(itemsTable).values({
    businessId,
    userId: req.userId!,
    name,
    description: description || null,
    hsn: hsn || null,
    unit: unit || "pcs",
    salePrice: (salePrice || 0).toString(),
    purchasePrice: (purchasePrice || 0).toString(),
    gstRate: (gstRate ?? 18).toString(),
    stockQty: (stockQty || 0).toString(),
    reorderLevel: (reorderLevel || 0).toString(),
    trackInventory: !!trackInventory,
    barcode: barcode || null,
    category: category || null,
  }).returning();

  res.status(201).json(fmtItem(inserted[0]));
});

// PUT /api/items/:id
router.put("/items/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { name, description, hsn, unit, salePrice, purchasePrice, gstRate, stockQty, reorderLevel, trackInventory, barcode, category } = req.body;

  const updated = await db.update(itemsTable).set({
    name, description, hsn, unit,
    salePrice: salePrice?.toString(),
    purchasePrice: purchasePrice?.toString(),
    gstRate: gstRate?.toString(),
    stockQty: stockQty?.toString(),
    reorderLevel: reorderLevel?.toString(),
    trackInventory: !!trackInventory,
    barcode, category,
    updatedAt: new Date(),
  }).where(and(eq(itemsTable.id, parseInt(req.params.id)), eq(itemsTable.businessId, businessId))).returning();

  if (!updated.length) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(fmtItem(updated[0]));
});

// DELETE /api/items/:id
router.delete("/items/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  await db.update(itemsTable).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(itemsTable.id, parseInt(req.params.id)), eq(itemsTable.businessId, businessId)));

  res.json({ success: true });
});

// POST /api/items/:id/adjust-stock
router.post("/items/:id/adjust-stock", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { adjustment, reason } = req.body;
  const item = await db.select().from(itemsTable).where(
    and(eq(itemsTable.id, parseInt(req.params.id)), eq(itemsTable.businessId, businessId))
  ).limit(1);

  if (!item.length) { res.status(404).json({ error: "Item not found" }); return; }

  const newQty = parseFloat(item[0].stockQty || "0") + parseFloat(adjustment);
  await db.update(itemsTable).set({ stockQty: Math.max(0, newQty).toString(), updatedAt: new Date() })
    .where(eq(itemsTable.id, parseInt(req.params.id)));

  res.json({ newQty: Math.max(0, newQty), message: `Stock adjusted by ${adjustment}. Reason: ${reason || "manual"}` });
});

export default router;
