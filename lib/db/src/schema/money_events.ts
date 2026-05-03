import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const moneyEventsTable = pgTable("money_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  sourceId: integer("source_id"),
  sourceType: text("source_type").notNull().default("manual"),
  eventType: text("event_type").notNull().default("manual_parchi"),
  rawInput: text("raw_input"),
  rawPayloadJson: text("raw_payload_json"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  direction: text("direction").notNull().default("inflow"),
  eventDate: timestamp("event_date").notNull(),
  partyId: integer("party_id"),
  suggestedPartyId: integer("suggested_party_id"),
  referenceNumber: text("reference_number"),
  utr: text("utr"),
  invoiceNumber: text("invoice_number"),
  voucherNumber: text("voucher_number"),
  narration: text("narration"),
  checksum: text("checksum"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("100"),
  reconciliationStatus: text("reconciliation_status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMoneyEventSchema = createInsertSchema(moneyEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMoneyEvent = z.infer<typeof insertMoneyEventSchema>;
export type MoneyEvent = typeof moneyEventsTable.$inferSelect;
