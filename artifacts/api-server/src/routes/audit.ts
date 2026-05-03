import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, businessesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// GET /api/audit
router.get("/audit", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { entity_type, limit = "50" } = req.query;
  const conditions = [eq(auditLogsTable.businessId, businessId)];
  if (entity_type) conditions.push(eq(auditLogsTable.entityType, entity_type as string));

  const logs = await db.select().from(auditLogsTable)
    .where(and(...conditions))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(parseInt(limit as string));

  res.json(logs.map(l => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId ? parseInt(l.entityId) : null,
    description: l.description,
    oldValue: l.oldValue,
    newValue: l.newValue,
    createdAt: l.createdAt,
  })));
});

export default router;
