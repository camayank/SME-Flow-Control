const BASE_URL = import.meta.env.BASE_URL || "/";

export function apiUrl(path: string): string {
  return `/api${path}`;
}

export function getAuthToken(): string | null {
  return localStorage.getItem("parchiflow_token");
}

export function setAuthToken(token: string): void {
  localStorage.setItem("parchiflow_token", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("parchiflow_token");
}

export const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
  const url = queryKey[0] as string;
  const token = getAuthToken();
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
};

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
}

export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
}

export function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelativeDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aaj";
  if (diffDays === 1) return "Kal";
  if (diffDays < 7) return `${diffDays} din pehle`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafte pehle`;
  return formatDate(date);
}
