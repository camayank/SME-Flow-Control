import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable, businessesTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { authMiddleware, generateToken, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

// POST /api/auth/send-otp
router.post("/auth/send-otp", async (req, res) => {
  const { mobile } = req.body;

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile.replace(/\s/g, ""))) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required", mobile: mobile || "" });
    return;
  }

  const cleanMobile = mobile.replace(/\s/g, "");

  // Ensure user exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  if (!existing.length) {
    await db.insert(usersTable).values({ mobile: cleanMobile });
  }

  // MVP: OTP is always 123456
  req.log.info({ mobile: cleanMobile }, "OTP sent (mock: 123456)");
  res.json({ success: true, message: "OTP sent successfully. Use 123456 for demo.", mobile: cleanMobile });
});

// POST /api/auth/verify-otp
router.post("/auth/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    res.status(400).json({ error: "Mobile and OTP required" });
    return;
  }

  const cleanMobile = mobile.replace(/\s/g, "");

  // MVP: Accept 123456 as valid OTP
  if (otp !== "123456") {
    res.status(401).json({ error: "Invalid OTP. Use 123456 for demo." });
    return;
  }

  let user = await db.select().from(usersTable).where(eq(usersTable.mobile, cleanMobile)).limit(1);
  if (!user.length) {
    const inserted = await db.insert(usersTable).values({ mobile: cleanMobile }).returning();
    user = inserted;
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessionsTable).values({
    userId: user[0].id,
    token: sessionToken,
    expiresAt,
  });

  const jwtToken = generateToken(user[0].id, sessionToken);

  const business = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, user[0].id))
    .limit(1);

  res.json({
    token: jwtToken,
    user: {
      id: user[0].id,
      name: user[0].name,
      mobile: user[0].mobile,
      email: user[0].email,
      createdAt: user[0].createdAt,
    },
    hasBusiness: business.length > 0,
  });
});

// GET /api/auth/me
router.get("/auth/me", authMiddleware, async (req: AuthRequest, res) => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user[0].id,
    name: user[0].name,
    mobile: user[0].mobile,
    email: user[0].email,
    createdAt: user[0].createdAt,
  });
});

// POST /api/auth/logout
router.post("/auth/logout", authMiddleware, async (req: AuthRequest, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.token;

  if (token) {
    try {
      const jwt = await import("jsonwebtoken");
      const secret = process.env.SESSION_SECRET || "parchiflow-secret-key";
      const payload = jwt.default.verify(token, secret) as { sessionToken: string };
      await db.delete(sessionsTable).where(eq(sessionsTable.token, payload.sessionToken));
    } catch {}
  }

  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
