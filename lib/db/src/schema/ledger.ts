import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  sourceId: integer("source_id"),
  moneyEventId: integer("money_event_id"),
  partyId: integer("party_id"),
  externalEntryId: text("external_entry_id"),
  entryType: text("entry_type").notNull().default("parchi_entry"),
  voucherNumber: text("voucher_number"),
  invoiceNumber: text("invoice_number"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  debitAmount: numeric("debit_amount", { precision: 15, scale: 2 }),
  creditAmount: numeric("credit_amount", { precision: 15, scale: 2 }),
  entryDate: timestamp("entry_date").notNull(),
  dueDate: timestamp("due_date"),
  narration: text("narration"),
  rawInput: text("raw_input"),
  rawPayloadJson: text("raw_payload_json"),
  status: text("status").notNull().default("open"),
  reconciliationStatus: text("reconciliation_status").notNull().default("confirmed"),
  checksum: text("checksum"),
  sourceType: text("source_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
