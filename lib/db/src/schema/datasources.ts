import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./business";

export const dataSourcesTable = pgTable("data_sources", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id),
  sourceType: text("source_type").notNull().default("manual"),
  sourceName: text("source_name").notNull(),
  connectionStatus: text("connection_status").notNull().default("not_connected"),
  configJson: text("config_json"),
  lastSyncAt: timestamp("last_sync_at"),
  recordsImported: integer("records_imported").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDataSourceSchema = createInsertSchema(dataSourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSourcesTable.$inferSelect;

export const importJobsTable = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull(),
  sourceId: integer("source_id"),
  importType: text("import_type").notNull().default("csv"),
  status: text("status").notNull().default("pending"),
  totalRecords: integer("total_records").notNull().default(0),
  successfulRecords: integer("successful_records").notNull().default(0),
  failedRecords: integer("failed_records").notNull().default(0),
  errorLogJson: text("error_log_json"),
  mappingJson: text("mapping_json"),
  fileData: text("file_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id").notNull(),
  sourceId: integer("source_id").notNull(),
  syncType: text("sync_type").notNull().default("import"),
  status: text("status").notNull().default("success"),
  message: text("message").notNull(),
  recordsSynced: integer("records_synced").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  businessId: integer("business_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
