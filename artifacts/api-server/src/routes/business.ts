import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable, dataSourcesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

router.get("/business", authMiddleware, async (req: AuthRequest, res) => {
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, req.userId!));
  if (!businesses.length) {
    res.status(404).json({ business: null, businesses: [] });
    return;
  }
  res.json({ business: formatBusiness(businesses[0]), businesses: businesses.map(formatBusiness) });
});

router.get("/businesses", authMiddleware, async (req: AuthRequest, res) => {
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, req.userId!));
  res.json({ businesses: businesses.map(formatBusiness) });
});

router.post("/business", authMiddleware, async (req: AuthRequest, res) => {
  const existing = await db.select().from(businessesTable).where(eq(businessesTable.userId, req.userId!));
  const { businessName, businessType, city, state, gstin, upiId, preferredLanguage, existingSystem } = req.body;
  if (!businessName) {
    res.status(400).json({ error: "Business name is required" });
    return;
  }
  if (existing.length) {
    const updated = await db.update(businessesTable).set({
      businessName,
      businessType: businessType || existing[0].businessType,
      city: city !== undefined ? city : existing[0].city,
      state: state !== undefined ? state : existing[0].state,
      gstin: gstin !== undefined ? gstin : existing[0].gstin,
      upiId: upiId !== undefined ? upiId : existing[0].upiId,
      preferredLanguage: preferredLanguage || existing[0].preferredLanguage,
      existingSystem: existingSystem !== undefined ? existingSystem : existing[0].existingSystem,
      updatedAt: new Date(),
    }).where(eq(businessesTable.id, existing[0].id)).returning();
    res.json(formatBusiness(updated[0]));
    return;
  }
  const inserted = await db.insert(businessesTable).values({
    userId: req.userId!, businessName, businessType: businessType || "retail", city, state, gstin, upiId,
    preferredLanguage: preferredLanguage || "hinglish", existingSystem,
  }).returning();
  await db.insert(dataSourcesTable).values({
    userId: req.userId!, businessId: inserted[0].id, sourceType: "manual", sourceName: "Manual Parchi",
    connectionStatus: "connected", recordsImported: 0,
  });
  res.status(201).json(formatBusiness(inserted[0]));
});

router.put("/business", authMiddleware, async (req: AuthRequest, res) => {
  const existing = await db.select().from(businessesTable).where(eq(businessesTable.userId, req.userId!));
  if (!existing.length) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const { businessName, businessType, city, state, gstin, upiId, preferredLanguage, existingSystem } = req.body;
  const updated = await db.update(businessesTable).set({
    businessName: businessName || existing[0].businessName,
    businessType: businessType || existing[0].businessType,
    city: city !== undefined ? city : existing[0].city,
    state: state !== undefined ? state : existing[0].state,
    gstin: gstin !== undefined ? gstin : existing[0].gstin,
    upiId: upiId !== undefined ? upiId : existing[0].upiId,
    preferredLanguage: preferredLanguage || existing[0].preferredLanguage,
    existingSystem: existingSystem !== undefined ? existingSystem : existing[0].existingSystem,
    updatedAt: new Date(),
  }).where(eq(businessesTable.id, existing[0].id)).returning();
  res.json(formatBusiness(updated[0]));
});

function formatBusiness(b: typeof businessesTable.$inferSelect) {
  return {
    id: b.id,
    userId: b.userId,
    businessName: b.businessName,
    businessType: b.businessType,
    city: b.city,
    state: b.state,
    gstin: b.gstin,
    upiId: b.upiId,
    preferredLanguage: b.preferredLanguage,
    existingSystem: b.existingSystem,
    createdAt: b.createdAt,
  };
}

export default router;
