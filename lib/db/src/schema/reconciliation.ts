import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const reconciliationQueueTable = pgTable("reconciliation_queue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  moneyEventId: integer("money_event_id"),
  ledgerEntryId: integer("ledger_entry_id"),
  paymentId: integer("payment_id"),
  sourceType: text("source_type").notNull().default("manual"),
  issueType: text("issue_type").notNull().default("unmatched_credit"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
  suggestedPartyId: integer("suggested_party_id"),
  suggestedLedgerEntryId: integer("suggested_ledger_entry_id"),
  suggestedOutstandingId: integer("suggested_outstanding_id"),
  duplicateTransactionId: integer("duplicate_transaction_id"),
  reason: text("reason").notNull(),
  suggestedAction: text("suggested_action").notNull().default("assign_party"),
  userAction: text("user_action"),
  status: text("status").notNull().default("pending"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  partyName: text("party_name"),
  referenceNumber: text("reference_number"),
  utr: text("utr"),
  eventDate: timestamp("event_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertReconciliationItemSchema = createInsertSchema(reconciliationQueueTable).omit({ id: true, createdAt: true });
export type InsertReconciliationItem = z.infer<typeof insertReconciliationItemSchema>;
export type ReconciliationItem = typeof reconciliationQueueTable.$inferSelect;
