import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  partyId: integer("party_id"),
  moneyEventId: integer("money_event_id"),
  outstandingId: integer("outstanding_id"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentMode: text("payment_mode").notNull().default("cash"),
  direction: text("direction").notNull().default("inflow"),
  referenceNumber: text("reference_number"),
  utr: text("utr"),
  note: text("note"),
  matchStatus: text("match_status").notNull().default("unmatched"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;

export const paymentAllocationsTable = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  paymentId: integer("payment_id").notNull(),
  outstandingId: integer("outstanding_id").notNull(),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
