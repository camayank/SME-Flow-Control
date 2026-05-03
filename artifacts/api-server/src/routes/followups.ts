import { Router } from "express";
import { db } from "@workspace/db";
import {
  followUpsTable, reminderLogsTable, partiesTable, outstandingsTable, businessesTable,
} from "@workspace/db/schema";
import { eq, and, lte, isNull, or, gt, lt, gte, desc, ne } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

function buildWhatsAppMessage(
  partyName: string, businessName: string, amount: number,
  dueDate: Date | null | undefined, templateType: string, language: string
): string {
  const amountStr = `₹${amount.toLocaleString("en-IN")}`;
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN") : "jaldi se jaldi";
  const templates: Record<string, Record<string, string>> = {
    soft: {
      hinglish: `Namaste ${partyName} ji, ${businessName} se ye reminder hai. Aapka ${amountStr} ka outstanding hai. Jab convenient ho payment kar dijiye. Shukriya 🙏`,
      hindi: `नमस्ते ${partyName} जी, ${businessName} से यह रिमाइंडर है। आपका ${amountStr} बकाया है। सुविधानुसार भुगतान करें। धन्यवाद।`,
      english: `Hello ${partyName}, this is a gentle reminder from ${businessName}. You have an outstanding amount of ${amountStr}. Please pay at your convenience. Thank you.`,
    },
    firm: {
      hinglish: `${partyName} ji, ${businessName} ki taraf se. Aapka ${amountStr} ka payment abhi bhi pending hai. Kripya ${dueDateStr} tak payment karein.`,
      hindi: `${partyName} जी, ${businessName} की तरफ से। आपका ${amountStr} भुगतान अभी भी लंबित है। कृपया ${dueDateStr} तक भुगतान करें।`,
      english: `Dear ${partyName}, your payment of ${amountStr} from ${businessName} is still pending. Please make the payment by ${dueDateStr}.`,
    },
    urgent: {
      hinglish: `URGENT: ${partyName} ji, ${businessName} se baar baar reminder ke baad bhi aapka ${amountStr} payment pending hai. Aaj hi payment karein. Sampark karein.`,
      hindi: `URGENT: ${partyName} जी, आपका ${amountStr} बहुत समय से बकाया है। आज ही भुगतान करें।`,
      english: `URGENT: Dear ${partyName}, despite multiple reminders, your payment of ${amountStr} from ${businessName} is overdue. Please pay immediately.`,
    },
  };
  return templates[templateType]?.[language] || templates["soft"]["hinglish"];
}

function formatFollowUp(fu: typeof followUpsTable.$inferSelect, partyName: string | null, partyMobile: string | null, amountDue?: number | null) {
  return {
    id: fu.id,
    businessId: fu.businessId,
    partyId: fu.partyId,
    partyName,
    partyMobile,
    outstandingId: fu.outstandingId,
    followUpType: fu.followUpType,
    status: fu.status,
    note: fu.note,
    promisedPaymentDate: fu.promisedPaymentDate,
    promisedAmount: fu.promisedAmount ? parseFloat(fu.promisedAmount) : null,
    nextFollowUpAt: fu.nextFollowUpAt,
    lastReminderAt: fu.lastReminderAt,
    amountDue: amountDue ?? null,
    createdAt: fu.createdAt,
    updatedAt: fu.updatedAt,
  };
}

// GET /api/follow-ups
router.get("/follow-ups", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { party_id, status, follow_up_type } = req.query;
  const conditions = [eq(followUpsTable.businessId, businessId)];
  if (party_id) conditions.push(eq(followUpsTable.partyId, parseInt(party_id as string)));
  if (status) conditions.push(eq(followUpsTable.status, status as string));
  if (follow_up_type) conditions.push(eq(followUpsTable.followUpType, follow_up_type as string));

  const rows = await db.select({
    followUp: followUpsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
    amountDue: outstandingsTable.amountDue,
  })
    .from(followUpsTable)
    .leftJoin(partiesTable, eq(followUpsTable.partyId, partiesTable.id))
    .leftJoin(outstandingsTable, eq(followUpsTable.outstandingId, outstandingsTable.id))
    .where(and(...conditions))
    .orderBy(desc(followUpsTable.createdAt));

  res.json(rows.map(({ followUp, partyName, partyMobile, amountDue }) =>
    formatFollowUp(followUp, partyName, partyMobile, amountDue ? parseFloat(amountDue) : null)
  ));
});

// GET /api/follow-ups/due  — today's + overdue + upcoming (next 7 days)
router.get("/follow-ups/due", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekLater = new Date(now);
  weekLater.setDate(weekLater.getDate() + 7);

  const rows = await db.select({
    followUp: followUpsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
    amountDue: outstandingsTable.amountDue,
  })
    .from(followUpsTable)
    .leftJoin(partiesTable, eq(followUpsTable.partyId, partiesTable.id))
    .leftJoin(outstandingsTable, eq(followUpsTable.outstandingId, outstandingsTable.id))
    .where(and(
      eq(followUpsTable.businessId, businessId),
      ne(followUpsTable.status, "done"),
      ne(followUpsTable.status, "resolved"),
    ))
    .orderBy(followUpsTable.nextFollowUpAt);

  const formatted = rows.map(({ followUp, partyName, partyMobile, amountDue }) =>
    formatFollowUp(followUp, partyName, partyMobile, amountDue ? parseFloat(amountDue) : null)
  );

  const overdue = formatted.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) < now);
  const dueToday = formatted.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) >= now && new Date(f.nextFollowUpAt) <= todayEnd);
  const upcoming = formatted.filter(f => f.nextFollowUpAt && new Date(f.nextFollowUpAt) > todayEnd && new Date(f.nextFollowUpAt) <= weekLater);
  const noDate = formatted.filter(f => !f.nextFollowUpAt);

  res.json({ overdue, dueToday, upcoming, noDate, total: formatted.length });
});

// GET /api/follow-ups/stats
router.get("/follow-ups/stats", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const weekLater = new Date(now); weekLater.setDate(weekLater.getDate() + 7);

  const all = await db.select({ followUp: followUpsTable })
    .from(followUpsTable)
    .where(and(eq(followUpsTable.businessId, businessId), ne(followUpsTable.status, "done"), ne(followUpsTable.status, "resolved")));

  const overdueCount = all.filter(r => r.followUp.nextFollowUpAt && new Date(r.followUp.nextFollowUpAt) < now).length;
  const dueTodayCount = all.filter(r => r.followUp.nextFollowUpAt && new Date(r.followUp.nextFollowUpAt) >= now && new Date(r.followUp.nextFollowUpAt) <= todayEnd).length;
  const upcomingCount = all.filter(r => r.followUp.nextFollowUpAt && new Date(r.followUp.nextFollowUpAt) > todayEnd && new Date(r.followUp.nextFollowUpAt) <= weekLater).length;

  res.json({ total: all.length, overdueCount, dueTodayCount, upcomingCount });
});

// POST /api/follow-ups
router.post("/follow-ups", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, outstandingId, followUpType, note, promisedPaymentDate, promisedAmount, nextFollowUpAt, status } = req.body;
  if (!partyId) { res.status(400).json({ error: "Party ID required" }); return; }

  const inserted = await db.insert(followUpsTable).values({
    userId: req.userId!,
    businessId,
    partyId,
    outstandingId: outstandingId || null,
    followUpType: followUpType || "whatsapp",
    status: status || "in_progress",
    note: note || null,
    promisedPaymentDate: promisedPaymentDate ? new Date(promisedPaymentDate) : null,
    promisedAmount: promisedAmount ? promisedAmount.toString() : null,
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
  }).returning();

  // Update outstanding's next follow-up date
  if (outstandingId && nextFollowUpAt) {
    await db.update(outstandingsTable)
      .set({ nextFollowUpAt: new Date(nextFollowUpAt), lastFollowUpAt: new Date(), updatedAt: new Date() })
      .where(eq(outstandingsTable.id, outstandingId));
  }

  res.status(201).json(formatFollowUp(inserted[0], null, null, null));
});

// PUT /api/follow-ups/:id
router.put("/follow-ups/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { status, note, promisedPaymentDate, promisedAmount, nextFollowUpAt, followUpType } = req.body;

  const updated = await db.update(followUpsTable).set({
    status: status || undefined,
    note: note !== undefined ? note : undefined,
    followUpType: followUpType || undefined,
    promisedPaymentDate: promisedPaymentDate ? new Date(promisedPaymentDate) : undefined,
    promisedAmount: promisedAmount !== undefined ? promisedAmount?.toString() : undefined,
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : (nextFollowUpAt === null ? null : undefined),
    updatedAt: new Date(),
  }).where(
    and(eq(followUpsTable.id, parseInt(req.params.id)), eq(followUpsTable.businessId, businessId))
  ).returning();

  if (!updated.length) { res.status(404).json({ error: "Follow-up not found" }); return; }

  // Update outstanding next follow-up if rescheduling
  if (updated[0].outstandingId && nextFollowUpAt) {
    await db.update(outstandingsTable)
      .set({ nextFollowUpAt: new Date(nextFollowUpAt), updatedAt: new Date() })
      .where(eq(outstandingsTable.id, updated[0].outstandingId));
  }

  res.json(formatFollowUp(updated[0], null, null, null));
});

// POST /api/follow-ups/auto-schedule  — auto-create follow-ups for all overdue outstandings without recent follow-up
router.post("/follow-ups/auto-schedule", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 3);

  // Get all open outstandings for this business
  const openOutstandings = await db.select({
    outstanding: outstandingsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
  })
    .from(outstandingsTable)
    .leftJoin(partiesTable, eq(outstandingsTable.partyId, partiesTable.id))
    .where(and(
      eq(outstandingsTable.businessId, businessId),
      eq(outstandingsTable.status, "open"),
    ));

  // Get existing non-done follow-ups
  const existingFUs = await db.select().from(followUpsTable)
    .where(and(
      eq(followUpsTable.businessId, businessId),
      ne(followUpsTable.status, "done"),
      ne(followUpsTable.status, "resolved"),
      gte(followUpsTable.createdAt, sevenDaysAgo),
    ));

  const recentlyFollowedUpOutstandingIds = new Set(existingFUs.map(f => f.outstandingId).filter(Boolean));

  let created = 0;
  const toCreate = [];

  for (const { outstanding, partyName } of openOutstandings) {
    if (recentlyFollowedUpOutstandingIds.has(outstanding.id)) continue;
    const agingDays = outstanding.dueDate
      ? Math.floor((now.getTime() - new Date(outstanding.dueDate).getTime()) / 86400000)
      : 0;
    if (agingDays < 1) continue; // only overdue

    const templateType = agingDays >= 30 ? "urgent" : agingDays >= 15 ? "firm" : "soft";
    toCreate.push({
      userId: req.userId!,
      businessId,
      partyId: outstanding.partyId,
      outstandingId: outstanding.id,
      followUpType: "whatsapp" as const,
      status: "pending" as const,
      note: `Auto-scheduled: ${partyName || "Party"} — ₹${parseFloat(outstanding.amountDue).toLocaleString("en-IN")} overdue by ${agingDays} days`,
      nextFollowUpAt: tomorrow,
    });
    created++;
  }

  if (toCreate.length > 0) {
    await db.insert(followUpsTable).values(toCreate);
    // Update outstandings last follow-up
    for (const item of toCreate) {
      if (item.outstandingId) {
        await db.update(outstandingsTable)
          .set({ lastFollowUpAt: now, nextFollowUpAt: tomorrow, updatedAt: new Date() })
          .where(eq(outstandingsTable.id, item.outstandingId));
      }
    }
  }

  res.json({ created, message: `${created} follow-up${created !== 1 ? "s" : ""} scheduled` });
});

// POST /api/follow-ups/generate-reminder
router.post("/follow-ups/generate-reminder", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, outstandingId, templateType, language } = req.body;
  if (!partyId) { res.status(400).json({ error: "Party ID required" }); return; }

  const party = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId)).limit(1);
  if (!party.length) { res.status(404).json({ error: "Party not found" }); return; }

  const biz = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId)).limit(1);

  let amount = 0;
  let dueDate: Date | null = null;

  if (outstandingId) {
    const outstanding = await db.select().from(outstandingsTable).where(eq(outstandingsTable.id, outstandingId)).limit(1);
    if (outstanding.length) {
      amount = parseFloat(outstanding[0].amountDue);
      dueDate = outstanding[0].dueDate;
    }
  } else {
    amount = parseFloat(party[0].currentBalance || "0");
  }

  const lang = language || biz[0]?.preferredLanguage || "hinglish";
  const template = templateType || "soft";

  const message = buildWhatsAppMessage(
    party[0].name, biz[0]?.businessName || "Aapka Business",
    amount, dueDate, template, lang
  );

  const encodedMsg = encodeURIComponent(message);
  const whatsappUrl = party[0].mobile
    ? `https://wa.me/91${party[0].mobile.replace(/[^0-9]/g, "")}?text=${encodedMsg}`
    : null;

  await db.insert(reminderLogsTable).values({
    userId: req.userId!,
    businessId,
    partyId,
    outstandingId: outstandingId || null,
    channel: "whatsapp_click_to_chat",
    templateType: template,
    message,
    sentStatus: "generated",
  });

  res.json({ message, whatsappUrl, channel: "whatsapp_click_to_chat", templateType: template, language: lang, partyName: party[0].name, amount });
});

// POST /api/follow-ups/log-reminder
router.post("/follow-ups/log-reminder", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { partyId, outstandingId, channel, message, sentStatus } = req.body;

  const log = await db.insert(reminderLogsTable).values({
    userId: req.userId!,
    businessId,
    partyId,
    outstandingId: outstandingId || null,
    channel: channel || "whatsapp_click_to_chat",
    templateType: "soft",
    message: message || "Reminder sent",
    sentStatus: sentStatus || "sent",
    sentAt: new Date(),
  }).returning();

  if (outstandingId) {
    await db.update(followUpsTable).set({ lastReminderAt: new Date() })
      .where(and(eq(followUpsTable.outstandingId, outstandingId), eq(followUpsTable.businessId, businessId)));
    await db.update(outstandingsTable).set({ lastFollowUpAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outstandingsTable.id, outstandingId), eq(outstandingsTable.businessId, businessId)));
  }

  res.status(201).json(log[0]);
});

export default router;
