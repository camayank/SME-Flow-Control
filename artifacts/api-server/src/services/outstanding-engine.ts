/**
 * Outstanding Engine
 * Calculates aging, buckets, and priorities for outstandings
 */

export type AgingResult = {
  agingDays: number;
  agingBucket: string;
  priority: string;
};

export function calculateAging(dueDate: Date | null | undefined): AgingResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!dueDate) {
    return {
      agingDays: 0,
      agingBucket: "not_due",
      priority: "low",
    };
  }

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - due.getTime();
  const agingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let agingBucket: string;
  let priority: string;

  if (agingDays < 0) {
    agingBucket = "not_due";
    priority = "low";
  } else if (agingDays === 0) {
    agingBucket = "due_today";
    priority = "medium";
  } else if (agingDays <= 7) {
    agingBucket = "overdue_1_7";
    priority = "medium";
  } else if (agingDays <= 15) {
    agingBucket = "overdue_8_15";
    priority = "high";
  } else if (agingDays <= 30) {
    agingBucket = "overdue_16_30";
    priority = "high";
  } else if (agingDays <= 60) {
    agingBucket = "overdue_31_60";
    priority = "critical";
  } else {
    agingBucket = "overdue_60_plus";
    priority = "critical";
  }

  return { agingDays, agingBucket, priority };
}

export function getAgingLabel(bucket: string): string {
  const labels: Record<string, string> = {
    "not_due": "Abhi Due Nahi",
    "due_today": "Aaj Due Hai",
    "overdue_1_7": "1-7 Din Overdue",
    "overdue_8_15": "8-15 Din Overdue",
    "overdue_16_30": "16-30 Din Overdue",
    "overdue_31_60": "31-60 Din Overdue",
    "overdue_60_plus": "60+ Din Overdue",
  };
  return labels[bucket] || bucket;
}
