import { Router } from "express";
import { db } from "@workspace/db";
import { followUpsTable, reminderLogsTable, partiesTable, outstandingsTable, businessesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

async function getBusinessId(userId: number): Promise<number | null> {
  const biz = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
  return biz.length ? biz[0].id : null;
}

function buildWhatsAppMessage(
  partyName: string,
  businessName: string,
  amount: number,
  dueDate: Date | null | undefined,
  templateType: string,
  language: string
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
      hinglish: `${partyName} ji, ${businessName} ki taraf se. Aapka ${amountStr} ka payment abhi bhi pending hai. Kripya ${dueDateStr} tak payment karein. Payment ke liye call karein.`,
      hindi: `${partyName} जी, ${businessName} की तरफ से। आपका ${amountStr} भुगतान अभी भी लंबित है। कृपया ${dueDateStr} तक भुगतान करें।`,
      english: `Dear ${partyName}, this is a reminder from ${businessName}. Your payment of ${amountStr} is still pending. Please make the payment by ${dueDateStr}.`,
    },
    urgent: {
      hinglish: `URGENT: ${partyName} ji, ${businessName} se baar baar reminder ke baad bhi aapka ${amountStr} payment pending hai. Aaj hi payment karein warna aage action lena padega. Sampark karein.`,
      hindi: `URGENT: ${partyName} जी, आपका ${amountStr} बहुत समय से बकाया है। आज ही भुगतान करें।`,
      english: `URGENT: Dear ${partyName}, despite multiple reminders, your payment of ${amountStr} from ${businessName} is still overdue. Please pay immediately to avoid further action.`,
    },
  };

  return templates[templateType]?.[language] || templates["soft"]["hinglish"];
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

  const followUps = await db.select({
    followUp: followUpsTable,
    partyName: partiesTable.name,
    partyMobile: partiesTable.mobile,
  })
    .from(followUpsTable)
    .leftJoin(partiesTable, eq(followUpsTable.partyId, partiesTable.id))
    .where(and(...conditions))
    .orderBy(followUpsTable.nextFollowUpAt);

  res.json(followUps.map(({ followUp, partyName, partyMobile }) => ({
    id: followUp.id,
    businessId: followUp.businessId,
    partyId: followUp.partyId,
    partyName,
    partyMobile,
    outstandingId: followUp.outstandingId,
    followUpType: followUp.followUpType,
    status: followUp.status,
    note: followUp.note,
    promisedPaymentDate: followUp.promisedPaymentDate,
    promisedAmount: followUp.promisedAmount ? parseFloat(followUp.promisedAmount) : null,
    nextFollowUpAt: followUp.nextFollowUpAt,
    lastReminderAt: followUp.lastReminderAt,
    createdAt: followUp.createdAt,
  })));
});

// POST /api/follow-ups
router.post("/follow-ups", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const {
    partyId, outstandingId, followUpType, note,
    promisedPaymentDate, promisedAmount, nextFollowUpAt,
  } = req.body;

  if (!partyId) { res.status(400).json({ error: "Party ID required" }); return; }

  const inserted = await db.insert(followUpsTable).values({
    userId: req.userId!,
    businessId,
    partyId,
    outstandingId: outstandingId || null,
    followUpType: followUpType || "whatsapp",
    status: "in_progress",
    note: note || null,
    promisedPaymentDate: promisedPaymentDate ? new Date(promisedPaymentDate) : null,
    promisedAmount: promisedAmount ? promisedAmount.toString() : null,
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
  }).returning();

  res.status(201).json({ ...inserted[0], promisedAmount: inserted[0].promisedAmount ? parseFloat(inserted[0].promisedAmount) : null });
});

// PUT /api/follow-ups/:id
router.put("/follow-ups/:id", authMiddleware, async (req: AuthRequest, res) => {
  const businessId = await getBusinessId(req.userId!);
  if (!businessId) { res.status(404).json({ error: "Business not found" }); return; }

  const { status, note, promisedPaymentDate, promisedAmount, nextFollowUpAt } = req.body;

  const updated = await db.update(followUpsTable).set({
    status: status || undefined,
    note: note || undefined,
    promisedPaymentDate: promisedPaymentDate ? new Date(promisedPaymentDate) : undefined,
    promisedAmount: promisedAmount ? promisedAmount.toString() : undefined,
    nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
    updatedAt: new Date(),
  }).where(
    and(eq(followUpsTable.id, parseInt(req.params.id)), eq(followUpsTable.businessId, businessId))
  ).returning();

  if (!updated.length) { res.status(404).json({ error: "Follow-up not found" }); return; }
  res.json(updated[0]);
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
    party[0].name,
    biz[0]?.businessName || "Aapka Business",
    amount,
    dueDate,
    template,
    lang
  );

  const encodedMsg = encodeURIComponent(message);
  const whatsappUrl = party[0].mobile
    ? `https://wa.me/91${party[0].mobile.replace(/[^0-9]/g, "")}?text=${encodedMsg}`
    : null;

  // Log the reminder
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

  res.json({
    message,
    whatsappUrl,
    channel: "whatsapp_click_to_chat",
    templateType: template,
    language: lang,
    partyName: party[0].name,
    amount,
  });
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

  // Update follow-up last reminder time
  if (outstandingId) {
    await db.update(followUpsTable).set({ lastReminderAt: new Date() })
      .where(and(eq(followUpsTable.outstandingId, outstandingId), eq(followUpsTable.businessId, businessId)));
  }

  res.status(201).json(log[0]);
});

export default router;
