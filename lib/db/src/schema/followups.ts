import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const followUpsTable = pgTable("follow_ups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  partyId: integer("party_id").notNull(),
  outstandingId: integer("outstanding_id"),
  assignedToUserId: integer("assigned_to_user_id"),
  followUpType: text("follow_up_type").notNull().default("whatsapp"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  promisedPaymentDate: timestamp("promised_payment_date"),
  promisedAmount: numeric("promised_amount", { precision: 15, scale: 2 }),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  lastReminderAt: timestamp("last_reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFollowUpSchema = createInsertSchema(followUpsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFollowUp = z.infer<typeof insertFollowUpSchema>;
export type FollowUp = typeof followUpsTable.$inferSelect;

export const reminderLogsTable = pgTable("reminder_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull(),
  partyId: integer("party_id").notNull(),
  outstandingId: integer("outstanding_id"),
  channel: text("channel").notNull().default("whatsapp_click_to_chat"),
  templateType: text("template_type").notNull().default("soft"),
  message: text("message").notNull(),
  sentStatus: text("sent_status").notNull().default("generated"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
