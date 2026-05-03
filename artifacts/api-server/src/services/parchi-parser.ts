/**
 * Parchi Parser Service
 * Parses Hindi/Hinglish/English parchi text into structured money events
 */

export type ParsedParchiResult = {
  partyName: string | null;
  amount: number | null;
  transactionType: string | null;
  direction: "inflow" | "outflow" | "neutral" | null;
  eventType: string | null;
  eventDate: string | null;
  promiseDate: string | null;
  note: string | null;
  confidence: number;
  confirmationMessage: string;
};

const AMOUNT_REGEX = /(?:rs\.?|₹|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:rs\.?|₹|inr)?/gi;
const NUMBER_WORDS: Record<string, number> = {
  "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5,
  "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
  "hundred": 100, "thousand": 1000, "lakh": 100000, "crore": 10000000,
  "hazar": 1000, "hajar": 1000,
};

const PAYMENT_RECEIVED_KEYWORDS = [
  "mila", "mile", "mili", "received", "payment mila", "diye", "se liye", "paid by",
  "receive hua", "aaya", "aayi", "bheja", "bheje", "deposit", "jama",
  "se paisa", "se payment", "ne diya", "de diya", "de diye",
];

const PAYMENT_MADE_KEYWORDS = [
  "diya", "diye", "paid", "ko diya", "payment kiya", "transfer kiya",
  "bheja", "bheje", "ko payment", "vendor ko", "supplier ko", "send kiya",
  "bhejna hai", "dena tha",
];

const CREDIT_SALE_KEYWORDS = [
  "maal diya", "udhaar diya", "service di", "credit sale", "maal bheja",
  "udhaar pe diya", "udhar diya", "udhar pe", "udhaar pe",
  "invoice", "bill kiya", "bechha", "becha", "diya udhaar",
];

const ADVANCE_RECEIVED_KEYWORDS = [
  "advance liya", "booking amount liya", "advance received", "advance aaya",
  "advance mila", "token liya", "byana liya",
];

const ADVANCE_PAID_KEYWORDS = [
  "advance diya", "advance paid", "advance bheja", "token diya", "byana diya",
];

const EXPENSE_KEYWORDS = [
  "kharcha", "expense", "petrol", "rent", "salary", "labour", "transport",
  "diesel", "bijli", "bijlee", "electricity", "phone", "mobile bill",
  "maintenance", "repair",
];

const PROMISE_KEYWORDS = [
  "kal dunga", "kal dega", "promise", "payment date", "next week",
  "monday", "kal bhejunga", "de dunga", "de dega", "dene wala",
  "dene wali", "bhejna hai",
];

const DISPUTE_KEYWORDS = [
  "amount galat", "dispute", "nahi maana", "wrong amount", "disagreement",
  "galat hai", "sahi nahi", "mana nahi",
];

function extractAmount(text: string): number | null {
  const matches = text.match(AMOUNT_REGEX);
  if (matches && matches.length > 0) {
    const cleanedMatch = matches[0].replace(/[₹rs.,\s]/gi, "").replace(/,/g, "");
    const num = parseFloat(cleanedMatch);
    if (!isNaN(num) && num > 0) return num;
  }

  // Try raw number extraction
  const rawNumbers = text.match(/\b(\d+(?:,\d+)*(?:\.\d+)?)\b/g);
  if (rawNumbers) {
    for (const n of rawNumbers) {
      const cleaned = parseFloat(n.replace(/,/g, ""));
      if (!isNaN(cleaned) && cleaned > 10) return cleaned;
    }
  }

  return null;
}

function extractPartyName(text: string, keywords: string[]): string | null {
  const lowerText = text.toLowerCase();

  // Common patterns:
  // "Ramesh se 5000" -> Ramesh
  // "Ramesh ko 5000" -> Ramesh
  // "Ramesh Store ko" -> Ramesh Store
  const seKoPattern = /([a-zA-Z\s]{2,30})\s+(?:se|ko)\s+/gi;
  const match = seKoPattern.exec(text);
  if (match) {
    const candidate = match[1].trim();
    if (candidate.length >= 2 && candidate.length <= 30) {
      // Remove common prefixes
      return candidate.replace(/^(customer|vendor|party|supplier|buyer)\s+/i, "").trim();
    }
  }

  // Try "se {amount} {keyword}" pattern -> party is before "se"
  const seAmountPattern = /([a-zA-Z\s]{2,30})\s+se\s+\d/gi;
  const seMatch = seAmountPattern.exec(text);
  if (seMatch) {
    return seMatch[1].trim();
  }

  return null;
}

function detectPromiseDate(text: string): string | null {
  const lowerText = text.toLowerCase();
  const today = new Date();

  if (lowerText.includes("kal") || lowerText.includes("tomorrow")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }

  if (lowerText.includes("next week") || lowerText.includes("agle hafte") || lowerText.includes("agle week")) {
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    return nextWeek.toISOString().split("T")[0];
  }

  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "ravivar", "somvar", "mangalvar", "budhvar", "guruvar", "shukravar", "shanivar"];
  for (let i = 0; i < days.length; i++) {
    if (lowerText.includes(days[i])) {
      const targetDay = i % 7;
      const futureDate = new Date(today);
      const daysUntil = (targetDay - today.getDay() + 7) % 7 || 7;
      futureDate.setDate(today.getDate() + daysUntil);
      return futureDate.toISOString().split("T")[0];
    }
  }

  return null;
}

function containsAny(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some((kw) => lowerText.includes(kw.toLowerCase()));
}

function buildConfirmationMessage(result: ParsedParchiResult): string {
  if (!result.amount && !result.partyName) {
    return "Kuch samajh nahi aaya. Kripya dobara likhein. (Could not understand. Please try again.)";
  }

  const amountStr = result.amount ? `₹${result.amount.toLocaleString("en-IN")}` : "unknown amount";
  const partyStr = result.partyName || "unknown party";

  const typeMessages: Record<string, string> = {
    payment_received: `${partyStr} se ${amountStr} payment mila. Iska matlab ${amountStr} aapke account mein aaya.`,
    payment_made: `${partyStr} ko ${amountStr} diya. Iska matlab ${amountStr} aapke account se gaya.`,
    credit_sale: `${partyStr} ko ${amountStr} ka maal/service udhaar diya. Iska matlab ${amountStr} lena hai.`,
    advance_received: `${partyStr} se ${amountStr} advance liya. Iska matlab ${amountStr} advance aapke paas hai.`,
    advance_paid: `${partyStr} ko ${amountStr} advance diya. Iska matlab ${amountStr} advance dena hai.`,
    expense: `${amountStr} ka kharcha hua${result.partyName ? ` (${partyStr})` : ""}.`,
    promise_to_pay: `${partyStr} ne ${amountStr} dene ka promise kiya.`,
    dispute: `${partyStr} ke saath ${amountStr} ka dispute hai.`,
    unknown: `${partyStr} - ${amountStr} ka transaction.`,
  };

  return typeMessages[result.eventType || "unknown"] || typeMessages["unknown"];
}

export function parseParchiText(text: string): ParsedParchiResult {
  const lowerText = text.toLowerCase();
  const amount = extractAmount(text);
  const today = new Date().toISOString().split("T")[0];

  let eventType: string | null = null;
  let direction: "inflow" | "outflow" | "neutral" | null = null;
  let transactionType: string | null = null;
  let confidence = 50;

  // Determine event type
  if (containsAny(lowerText, DISPUTE_KEYWORDS)) {
    eventType = "dispute";
    direction = "neutral";
    transactionType = "Dispute";
    confidence = 80;
  } else if (containsAny(lowerText, PROMISE_KEYWORDS)) {
    eventType = "promise_to_pay";
    direction = "neutral";
    transactionType = "Promise to Pay";
    confidence = 80;
  } else if (containsAny(lowerText, ADVANCE_RECEIVED_KEYWORDS)) {
    eventType = "advance_received";
    direction = "inflow";
    transactionType = "Advance Received";
    confidence = 90;
  } else if (containsAny(lowerText, ADVANCE_PAID_KEYWORDS)) {
    eventType = "advance_paid";
    direction = "outflow";
    transactionType = "Advance Paid";
    confidence = 90;
  } else if (containsAny(lowerText, EXPENSE_KEYWORDS)) {
    eventType = "expense";
    direction = "outflow";
    transactionType = "Kharcha (Expense)";
    confidence = 85;
  } else if (containsAny(lowerText, CREDIT_SALE_KEYWORDS)) {
    eventType = "credit_sale";
    direction = "neutral";
    transactionType = "Udhaar Diya (Credit Sale)";
    confidence = 90;
  } else if (containsAny(lowerText, PAYMENT_RECEIVED_KEYWORDS) &&
    !containsAny(lowerText, PAYMENT_MADE_KEYWORDS)) {
    eventType = "payment_received";
    direction = "inflow";
    transactionType = "Paisa Mila (Payment Received)";
    confidence = 85;
  } else if (containsAny(lowerText, PAYMENT_MADE_KEYWORDS)) {
    eventType = "payment_made";
    direction = "outflow";
    transactionType = "Paisa Diya (Payment Made)";
    confidence = 85;
  } else if (lowerText.includes(" se ") && amount) {
    // "X se amount" -> payment received from X
    eventType = "payment_received";
    direction = "inflow";
    transactionType = "Paisa Mila (Payment Received)";
    confidence = 65;
  } else if (lowerText.includes(" ko ") && amount) {
    // "X ko amount" -> payment made to X or credit sale
    eventType = "payment_made";
    direction = "outflow";
    transactionType = "Paisa Diya (Payment Made)";
    confidence = 60;
  } else {
    eventType = "unknown";
    direction = "neutral";
    transactionType = "Unknown";
    confidence = 30;
  }

  // Extract party name
  const partyName = extractPartyName(text, []);

  // Extract promise date if applicable
  const promiseDate = containsAny(lowerText, PROMISE_KEYWORDS) ? detectPromiseDate(text) : null;

  if (amount) confidence = Math.min(confidence + 15, 100);
  if (partyName) confidence = Math.min(confidence + 10, 100);

  const result: ParsedParchiResult = {
    partyName,
    amount,
    transactionType,
    direction,
    eventType,
    eventDate: today,
    promiseDate,
    note: text,
    confidence,
    confirmationMessage: "",
  };

  result.confirmationMessage = buildConfirmationMessage(result);
  return result;
}
