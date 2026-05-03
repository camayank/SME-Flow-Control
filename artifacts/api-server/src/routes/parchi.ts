import { Router } from "express";
import { db } from "@workspace/db";
import {
  partiesTable, moneyEventsTable, ledgerEntriesTable, outstandingsTable,
  reconciliationQueueTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { parseParchiText } from "../services/parchi-parser.js";
import { scoreReconciliation, generateChecksum } from "../services/reconciliation-engine.js";
import { calculateAging } from "../services/outstanding-engine.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

// POST /api/parchi/parse
router.post("/parchi/parse", authMiddleware, async (req: AuthRequest, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 3) {
    res.status(400).json({ error: "Parchi text too short. Kuch likhein." });
    return;
  }

  const result = parseParchiText(text.trim());
  res.json(result);
});

// POST /api/parchi/save
router.post("/parchi/save", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const {
    partyName, partyId: existingPartyId, amount, transactionType,
    direction, eventType, eventDate, promiseDate, note, rawText,
  } = req.body;

  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Amount daalna zaroori hai." });
    return;
  }

  let partyId = existingPartyId || null;

  // Auto-create party if name provided but no ID
  if (!partyId && partyName) {
    const normalizedName = partyName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const existing = await db.select().from(partiesTable).where(
      and(eq(partiesTable.businessId, businessId), eq(partiesTable.normalizedName, normalizedName))
    ).limit(1);

    if (existing.length) {
      partyId = existing[0].id;
    } else {
      const partyType = direction === "inflow" ? "customer" : "vendor";
      const newParty = await db.insert(partiesTable).values({
        userId: req.userId!,
        businessId,
        name: partyName,
        normalizedName,
        type: partyType,
        openingBalance: "0",
        openingBalanceType: "none",
        currentBalance: "0",
        balanceType: "settled",
        sourceType: "manual",
      }).returning();
      partyId = newParty[0].id;
    }
  }

  const eventDateObj = new Date(eventDate || Date.now());
  const checksum = generateChecksum(amount, eventDateObj, partyId, null);

  // Run reconciliation scoring
  const reconResult = scoreReconciliation({
    amount, direction, eventDate: eventDateObj,
    partyId, sourceType: "manual", eventType: eventType || "manual_parchi",
  });

  // Create money event
  const moneyEvent = await db.insert(moneyEventsTable).values({
    userId: req.userId!,
    businessId,
    sourceType: "manual",
    eventType: eventType || "manual_parchi",
    rawInput: rawText || note,
    amount: amount.toString(),
    direction,
    eventDate: eventDateObj,
    partyId,
    narration: note,
    checksum,
    confidenceScore: reconResult.confidenceScore.toString(),
    reconciliationStatus: reconResult.reconciliationStatus,
  }).returning();

  let ledgerEntry = null;

  // Create ledger entry only if confirmed
  if (!reconResult.sendToQueue || eventType === "manual_parchi") {
    const entryTypeMap: Record<string, string> = {
      "payment_received": "payment_received",
      "payment_made": "payment_made",
      "credit_sale": "sales_invoice",
      "advance_received": "advance_received",
      "advance_paid": "advance_paid",
      "expense": "expense",
      "promise_to_pay": "parchi_entry",
      "unknown": "parchi_entry",
      "manual_parchi": "parchi_entry",
    };

    const debitAmount = direction === "outflow" ? amount.toString() : null;
    const creditAmount = direction === "inflow" ? amount.toString() : null;
    const dueDate = promiseDate ? new Date(promiseDate) : null;
    const aging = calculateAging(dueDate);

    const le = await db.insert(ledgerEntriesTable).values({
      userId: req.userId!,
      businessId,
      moneyEventId: moneyEvent[0].id,
      partyId,
      entryType: entryTypeMap[eventType || "manual_parchi"] || "parchi_entry",
      amount: amount.toString(),
      debitAmount,
      creditAmount,
      entryDate: eventDateObj,
      dueDate,
      narration: note || rawText,
      status: "open",
      reconciliationStatus: "confirmed",
      sourceType: "manual",
    }).returning();

    ledgerEntry = le[0];

    // Update party balance
    if (partyId) {
      const party = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId)).limit(1);
      if (party.length) {
        let newBalance = parseFloat(party[0].currentBalance || "0");
        let balanceType = party[0].balanceType;

        if (direction === "outflow") {
          // We gave money / goods -> they owe us (receivable) if credit sale
          if (eventType === "credit_sale") {
            newBalance += amount;
            balanceType = "receivable";
          } else {
            // We paid them -> reduce payable
            newBalance = Math.max(0, newBalance - amount);
            if (newBalance === 0) balanceType = "settled";
          }
        } else if (direction === "inflow") {
          // They paid us -> reduce receivable
          newBalance = Math.max(0, newBalance - amount);
          if (newBalance === 0) balanceType = "settled";
        }

        await db.update(partiesTable).set({
          currentBalance: newBalance.toString(),
          balanceType,
          updatedAt: new Date(),
        }).where(eq(partiesTable.id, partyId));
      }
    }

    // Create outstanding for credit sales
    if (eventType === "credit_sale" && partyId) {
      await db.insert(outstandingsTable).values({
        userId: req.userId!,
        businessId,
        partyId,
        ledgerEntryId: ledgerEntry.id,
        originalAmount: amount.toString(),
        amountDue: amount.toString(),
        amountCollected: "0",
        dueDate: promiseDate ? new Date(promiseDate) : null,
        agingDays: aging.agingDays,
        agingBucket: aging.agingBucket,
        status: "open",
        priority: aging.priority,
        direction: "receivable",
        sourceType: "manual",
      });
    }
  }

  // Send to reconciliation queue if needed
  let reconItem = null;
  if (reconResult.sendToQueue && reconResult.issueType) {
    const rq = await db.insert(reconciliationQueueTable).values({
      userId: req.userId!,
      businessId,
      moneyEventId: moneyEvent[0].id,
      sourceType: "manual",
      issueType: reconResult.issueType,
      confidenceScore: reconResult.confidenceScore.toString(),
      suggestedPartyId: partyId,
      reason: reconResult.reason,
      suggestedAction: reconResult.suggestedAction,
      status: "pending",
      amount: amount.toString(),
      partyName: partyName || null,
      eventDate: eventDateObj,
    }).returning();
    reconItem = rq[0];
  }

  const message = reconResult.sendToQueue
    ? "Ye entry doubtful hai. Reconciliation mein bhej rahe hain."
    : "Parchi save ho gayi.";

  res.status(201).json({ moneyEvent: moneyEvent[0], ledgerEntry, reconciliationItem: reconItem, message });
});

export default router;
