import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const outstandingsTable = pgTable("outstandings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  partyId: integer("party_id").notNull(),
  ledgerEntryId: integer("ledger_entry_id"),
  originalAmount: numeric("original_amount", { precision: 15, scale: 2 }).notNull(),
  amountDue: numeric("amount_due", { precision: 15, scale: 2 }).notNull(),
  amountCollected: numeric("amount_collected", { precision: 15, scale: 2 }).notNull().default("0"),
  dueDate: timestamp("due_date"),
  agingDays: integer("aging_days").notNull().default(0),
  agingBucket: text("aging_bucket").notNull().default("not_due"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  direction: text("direction").notNull().default("receivable"),
  invoiceNumber: text("invoice_number"),
  sourceType: text("source_type"),
  lastFollowUpAt: timestamp("last_follow_up_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOutstandingSchema = createInsertSchema(outstandingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutstanding = z.infer<typeof insertOutstandingSchema>;
export type Outstanding = typeof outstandingsTable.$inferSelect;
