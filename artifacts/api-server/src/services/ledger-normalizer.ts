/**
 * Ledger Normalizer Service
 * Converts data from various sources into universal money events
 */

export type UniversalParty = {
  name: string;
  mobile?: string | null;
  gstin?: string | null;
  type: "customer" | "vendor" | "both" | "unknown";
  externalPartyId?: string | null;
  sourceType: string;
};

export type UniversalMoneyEvent = {
  eventType: string;
  amount: number;
  direction: "inflow" | "outflow" | "neutral";
  eventDate: Date;
  partyName?: string | null;
  referenceNumber?: string | null;
  utr?: string | null;
  invoiceNumber?: string | null;
  voucherNumber?: string | null;
  narration?: string | null;
  sourceType: string;
  rawPayloadJson?: string | null;
};

export type UniversalLedgerEntry = {
  partyId?: number | null;
  entryType: string;
  amount: number;
  debitAmount?: number | null;
  creditAmount?: number | null;
  entryDate: Date;
  dueDate?: Date | null;
  voucherNumber?: string | null;
  invoiceNumber?: string | null;
  narration?: string | null;
  sourceType: string;
  externalEntryId?: string | null;
};

// Normalize CSV/Excel row to universal money event
export function normalizeCsvRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
  sourceType: string
): UniversalMoneyEvent | null {
  const getValue = (field: string): string | null => {
    const colName = mapping[field];
    if (!colName) return null;
    return row[colName]?.trim() || null;
  };

  const amountStr = getValue("amount") || getValue("credit") || getValue("debit");
  if (!amountStr) return null;

  const amount = parseFloat(amountStr.replace(/[₹,\s]/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const dateStr = getValue("voucher_date") || getValue("date");
  const eventDate = dateStr ? new Date(dateStr) : new Date();

  const creditStr = getValue("credit");
  const debitStr = getValue("debit");
  let direction: "inflow" | "outflow" | "neutral" = "neutral";
  let eventType = "imported_payment";

  if (creditStr && parseFloat(creditStr.replace(/[₹,\s]/g, "")) > 0) {
    direction = "inflow";
    eventType = "bank_credit";
  } else if (debitStr && parseFloat(debitStr.replace(/[₹,\s]/g, "")) > 0) {
    direction = "outflow";
    eventType = "bank_debit";
  } else {
    direction = "inflow";
    eventType = "imported_payment";
  }

  return {
    eventType,
    amount: Math.abs(amount),
    direction,
    eventDate,
    partyName: getValue("party_name"),
    referenceNumber: getValue("reference_number") || getValue("bank_narration"),
    utr: getValue("utr"),
    invoiceNumber: getValue("invoice_number"),
    voucherNumber: getValue("voucher_number"),
    narration: getValue("narration") || getValue("bank_narration"),
    sourceType,
    rawPayloadJson: JSON.stringify(row),
  };
}

// Normalize Tally XML data (mock)
export function normalizeTallyData(mockData: Record<string, unknown>[]): UniversalMoneyEvent[] {
  return mockData.map((item) => ({
    eventType: (item.type as string) === "receipt" ? "imported_payment" : "imported_invoice",
    amount: parseFloat(item.amount as string) || 0,
    direction: (item.type as string) === "receipt" ? "inflow" : "neutral",
    eventDate: new Date((item.date as string) || Date.now()),
    partyName: item.partyName as string,
    invoiceNumber: item.invoiceNumber as string,
    voucherNumber: item.voucherNumber as string,
    narration: item.narration as string,
    sourceType: "tally",
    rawPayloadJson: JSON.stringify(item),
  }));
}

// Normalize BUSY data (mock)
export function normalizeBusyData(mockData: Record<string, unknown>[]): UniversalMoneyEvent[] {
  return mockData.map((item) => ({
    eventType: (item.transType as string) === "payment" ? "imported_payment" : "imported_invoice",
    amount: parseFloat(item.amount as string) || 0,
    direction: (item.transType as string) === "payment" ? "inflow" : "neutral",
    eventDate: new Date((item.date as string) || Date.now()),
    partyName: item.customerName as string,
    invoiceNumber: item.invoiceNo as string,
    narration: item.narration as string,
    sourceType: "busy",
    rawPayloadJson: JSON.stringify(item),
  }));
}

// Normalize Marg data (mock)
export function normalizeMargData(mockData: Record<string, unknown>[]): UniversalMoneyEvent[] {
  return mockData.map((item) => ({
    eventType: (item.billType as string) === "receipt" ? "imported_payment" : "imported_invoice",
    amount: parseFloat(item.amount as string) || 0,
    direction: (item.billType as string) === "receipt" ? "inflow" : "neutral",
    eventDate: new Date((item.billDate as string) || Date.now()),
    partyName: item.partyName as string,
    invoiceNumber: item.billNo as string,
    narration: item.remarks as string,
    sourceType: "marg",
    rawPayloadJson: JSON.stringify(item),
  }));
}
