import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  userId: integer("user_id").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceType: text("invoice_type").notNull().default("sale"),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  partyId: integer("party_id"),
  partyName: text("party_name"),
  partyGstin: text("party_gstin"),
  partyAddress: text("party_address"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  cgstTotal: numeric("cgst_total", { precision: 15, scale: 2 }).notNull().default("0"),
  sgstTotal: numeric("sgst_total", { precision: 15, scale: 2 }).notNull().default("0"),
  igstTotal: numeric("igst_total", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("unpaid"),
  notes: text("notes"),
  terms: text("terms"),
  isInterState: boolean("is_inter_state").notNull().default(false),
  ledgerEntryId: integer("ledger_entry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id),
  itemId: integer("item_id"),
  name: text("name").notNull(),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("pcs"),
  qty: numeric("qty", { precision: 15, scale: 3 }).notNull().default("1"),
  rate: numeric("rate", { precision: 15, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  cgst: numeric("cgst", { precision: 15, scale: 2 }).notNull().default("0"),
  sgst: numeric("sgst", { precision: 15, scale: 2 }).notNull().default("0"),
  igst: numeric("igst", { precision: 15, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true, createdAt: true });
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
