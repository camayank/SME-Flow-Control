import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const partiesTable = pgTable("parties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  sourceId: integer("source_id"),
  externalPartyId: text("external_party_id"),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  mobile: text("mobile"),
  email: text("email"),
  gstin: text("gstin"),
  type: text("type").notNull().default("customer"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  openingBalanceType: text("opening_balance_type").notNull().default("none"),
  currentBalance: numeric("current_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceType: text("balance_type").notNull().default("settled"),
  creditLimit: numeric("credit_limit", { precision: 15, scale: 2 }),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }),
  duplicateGroupId: integer("duplicate_group_id"),
  sourceType: text("source_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPartySchema = createInsertSchema(partiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof partiesTable.$inferSelect;

export const partyMergeLogsTable = pgTable("party_merge_logs", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  primaryPartyId: integer("primary_party_id").notNull(),
  mergedPartyId: integer("merged_party_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
