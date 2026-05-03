/**
 * Reconciliation Engine
 * Assigns confidence scores and reconciliation status to money events
 */

export type ReconciliationInput = {
  amount: number;
  direction: string;
  eventDate: Date;
  partyId?: number | null;
  referenceNumber?: string | null;
  utr?: string | null;
  invoiceNumber?: string | null;
  narration?: string | null;
  sourceType: string;
  eventType: string;
};

export type ReconciliationResult = {
  confidenceScore: number;
  reconciliationStatus: string;
  issueType: string | null;
  reason: string;
  suggestedAction: string;
  sendToQueue: boolean;
};

export function scoreReconciliation(input: ReconciliationInput): ReconciliationResult {
  let score = 0;
  const issues: string[] = [];

  // Base scoring
  if (input.partyId) {
    score += 25;
  } else {
    issues.push("party not identified");
  }

  if (input.utr) {
    score += 30;
  }

  if (input.referenceNumber) {
    score += 20;
  }

  if (input.invoiceNumber) {
    score += 15;
  }

  if (input.amount > 0) {
    score += 10;
  }

  // Source type scoring
  if (input.sourceType === "manual") {
    score += 20; // Manual entries from owner are trusted
  } else if (input.sourceType === "bank_statement") {
    score += 15;
  } else if (input.sourceType === "payment_gateway") {
    score += 25;
  } else if (input.sourceType === "tally" || input.sourceType === "busy" || input.sourceType === "marg") {
    score += 20;
  }

  score = Math.min(score, 100);

  let reconciliationStatus: string;
  let sendToQueue = false;
  let issueType: string | null = null;
  let reason = "";
  let suggestedAction = "confirm_match";

  if (score >= 85) {
    reconciliationStatus = "auto_matched";
    reason = "High confidence auto-match based on available data";
    suggestedAction = "confirm_match";
  } else if (score >= 60) {
    reconciliationStatus = "pending_review";
    sendToQueue = true;
    issueType = issues.includes("party not identified") ? "bank_credit_without_party" : "amount_mismatch";
    reason = `Medium confidence match. Score: ${score}. ${issues.join(", ")}`;
    suggestedAction = "assign_party";
  } else if (score >= 30) {
    reconciliationStatus = "suspense";
    sendToQueue = true;
    issueType = input.direction === "inflow" ? "unmatched_credit" : "unmatched_debit";
    reason = `Low confidence. ${issues.join(", ")}. Score: ${score}`;
    suggestedAction = "assign_party";
  } else {
    reconciliationStatus = "suspense";
    sendToQueue = true;
    issueType = "bank_credit_without_party";
    reason = `Very low confidence. ${issues.join(", ")}. Score: ${score}`;
    suggestedAction = "assign_party";
  }

  // Special case: bank credit without party
  if (!input.partyId && input.sourceType === "bank_statement") {
    reconciliationStatus = "suspense";
    sendToQueue = true;
    issueType = "bank_credit_without_party";
    reason = "Bank credit received but party not identified";
    suggestedAction = "assign_party";
  }

  // WhatsApp payment claim
  if (input.eventType === "whatsapp_payment_claim") {
    reconciliationStatus = "verification_pending";
    sendToQueue = true;
    issueType = "screenshot_without_bank_credit";
    reason = "Payment claimed via WhatsApp - bank credit not confirmed";
    suggestedAction = "confirm_match";
  }

  return {
    confidenceScore: score,
    reconciliationStatus,
    issueType,
    reason,
    suggestedAction,
    sendToQueue,
  };
}

export function detectDuplicate(
  newChecksum: string,
  existingChecksums: string[]
): boolean {
  return existingChecksums.includes(newChecksum);
}

export function generateChecksum(
  amount: number,
  eventDate: Date,
  partyId: number | null | undefined,
  utr: string | null | undefined
): string {
  const parts = [
    amount.toFixed(2),
    eventDate.toISOString().split("T")[0],
    partyId?.toString() || "unknown",
    utr || "",
  ];
  return parts.join("|");
}
