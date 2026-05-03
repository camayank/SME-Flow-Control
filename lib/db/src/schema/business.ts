import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull().default("retail"),
  city: text("city"),
  state: text("state"),
  gstin: text("gstin"),
  upiId: text("upi_id"),
  preferredLanguage: text("preferred_language").notNull().default("hinglish"),
  existingSystem: text("existing_system"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
