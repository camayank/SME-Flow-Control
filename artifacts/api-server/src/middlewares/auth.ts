import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "parchiflow-secret-key";

export interface AuthRequest extends Request {
  userId?: number;
  businessId?: number;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; sessionToken: string };

    // Verify session is still valid
    const session = await db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.token, payload.sessionToken),
          gt(sessionsTable.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session.length) {
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }

    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function generateToken(userId: number, sessionToken: string): string {
  return jwt.sign({ userId, sessionToken }, JWT_SECRET, { expiresIn: "30d" });
}
