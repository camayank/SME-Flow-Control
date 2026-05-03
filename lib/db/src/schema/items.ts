import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  hsn: text("hsn"),
  unit: text("unit").notNull().default("pcs"),
  salePrice: numeric("sale_price", { precision: 15, scale: 2 }).notNull().default("0"),
  purchasePrice: numeric("purchase_price", { precision: 15, scale: 2 }).default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  stockQty: numeric("stock_qty", { precision: 15, scale: 3 }).notNull().default("0"),
  reorderLevel: numeric("reorder_level", { precision: 15, scale: 3 }).default("0"),
  trackInventory: boolean("track_inventory").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  barcode: text("barcode"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
