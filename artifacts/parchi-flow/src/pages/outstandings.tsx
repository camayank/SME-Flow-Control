import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiUrl, apiPost, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, AlertTriangle, Clock, IndianRupee, ChevronRight, TrendingUp, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Lightbulb, ArrowRight, ShieldCheck, Copy, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Outstanding {
  id: number;
  partyId: number;
  partyName: string | null;
  partyMobile: string | null;
  originalAmount: number;
  amountDue: number;
  amountCollected: number;
  dueDate: string | null;
  agingDays: number;
  agingBucket: string;
  status: string;
  priority: string;
  direction: string;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
}

interface AgingData {
  notDue: number;
  dueToday: number;
  overdue1to7: number;
  overdue8to15: number;
  overdue16to30: number;
  overdue31to60: number;
  overdue60plus: number;
  buckets: { bucket: string; label: string; amount: number; count: number }[];
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "text-slate-600", bg: "bg-slate-100" },
  medium: { label: "Medium", color: "text-amber-700", bg: "bg-amber-100" },
  high: { label: "High", color: "text-orange-700", bg: "bg-orange-100" },
  critical: { label: "URGENT", color: "text-red-700", bg: "bg-red-100" },
};

const AGING_COLORS: Record<string, string> = {
  "not_due": "#6366f1",
  "due_today": "#f59e0b",
  "overdue_1_7": "#fb923c",
  "overdue_8_15": "#f97316",
  "overdue_16_30": "#ef4444",
  "overdue_31_60": "#dc2626",
  "overdue_60_plus": "#991b1b",
};

export default function OutstandingsPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<Outstanding | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const token = getAuthToken();
  const { toast } = useToast();

  const { data: outstandings = [], isLoading } = useQuery<Outstanding[]>({
    queryKey: [apiUrl("/outstandings"), filter, priorityFilter],
    enabled: !!token,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      const res = await fetch(`${apiUrl("/outstandings")}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: aging } = useQuery<AgingData>({
    queryKey: [apiUrl("/outstandings/aging")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/outstandings/aging"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const receivables = outstandings.filter(o => o.direction !== "payable");
  const payables = outstandings.filter(o => o.direction === "payable");
  const totalReceivable = receivables.reduce((s, o) => s + o.amountDue, 0);
  const totalPayable = payables.reduce((s, o) => s + o.amountDue, 0);
  const overdueCount = outstandings.filter(o => o.agingDays > 0 && o.status === "open").length;

  const chartData = aging?.buckets.filter(b => b.amount > 0).map(b => ({
    name: b.label.replace("Abhi Due Nahi", "Not Due").replace("Aaj Due Hai", "Due Today"),
    amount: b.amount,
    count: b.count,
    color: AGING_COLORS[b.bucket] || "#6366f1",
  })) || [];

  const OutstandingCard = ({ o }: { o: Outstanding }) => {
    const priority = PRIORITY_CONFIG[o.priority] || PRIORITY_CONFIG.medium;
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button className="font-medium text-sm truncate hover:text-primary hover:underline text-left" onClick={() => navigate(`/parties/${o.partyId}`)}>
              {o.partyName || "Unknown Party"}
            </button>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priority.bg} ${priority.color}`}>
              {priority.label}
            </span>
            {o.agingDays > 0 && (
              <span className="text-xs text-muted-foreground">{o.agingDays}d overdue</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {o.dueDate && (
              <span className="text-xs text-muted-foreground">Due: {formatDate(o.dueDate)}</span>
            )}
            {o.lastFollowUpAt && (
              <span className="text-xs text-muted-foreground">Last FU: {formatDate(o.lastFollowUpAt)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-red-600">{formatCurrency(o.amountDue)}</p>
            {o.amountCollected > 0 && (
              <p className="text-xs text-emerald-600">+{formatCurrency(o.amountCollected)} paid</p>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-blue-700 border-blue-200" onClick={() => { setPaymentItem(o); setPaymentAmount(String(o.amountDue)); setPaymentDate(new Date().toISOString().split("T")[0]); setPaymentNote(""); setPaymentOpen(true); }}>
            <IndianRupee className="h-3.5 w-3.5" /> Pay
          </Button>
          {o.partyMobile && (
            <a
              href={`https://wa.me/91${o.partyMobile.replace(/\D/g, "")}?text=${encodeURIComponent(`Namaste, ₹${o.amountDue.toLocaleString("en-IN")} payment reminder`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-emerald-50 rounded-md text-emerald-600"
              onClick={e => e.stopPropagation()}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Outstandings</h1>
        <p className="text-sm text-muted-foreground">Lena aur dena — sab yahan</p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-emerald-700" />
            <p className="font-semibold text-emerald-900">How to use this page</p>
          </div>
          <p className="text-sm text-emerald-900/80">Check overdue first, then tap WhatsApp on a party card to collect faster. This page shows what is pending, how old it is, and what to do next.</p>
          <div className="flex flex-wrap gap-2 text-xs text-emerald-800">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-emerald-200"><ShieldCheck className="h-3.5 w-3.5" />Audit trail ready</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-emerald-200"><ArrowRight className="h-3.5 w-3.5" />One tap reminders</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-100">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Lena Hai</p>
            <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totalReceivable)}</p>
            <p className="text-xs text-muted-foreground">{receivables.length} entries</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Dena Hai</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totalPayable)}</p>
            <p className="text-xs text-muted-foreground">{payables.length} entries</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Overdue</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{overdueCount}</p>
            <p className="text-xs text-muted-foreground">parties</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Aging Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={chartData} barSize={30}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="partially_collected">Partial</SelectItem>
            <SelectItem value="collected">Collected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <Tabs defaultValue="receivables">
        <TabsList>
          <TabsTrigger value="receivables">Lena Hai ({receivables.length})</TabsTrigger>
          <TabsTrigger value="payables">Dena Hai ({payables.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="receivables" className="mt-3 space-y-2">
          {!receivables.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Koi outstanding nahi hai 🎉</CardContent></Card>
          ) : receivables.sort((a, b) => b.agingDays - a.agingDays).map(o => <OutstandingCard key={o.id} o={o} />)}
        </TabsContent>
        <TabsContent value="payables" className="mt-3 space-y-2">
          {!payables.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Koi payables nahi hain</CardContent></Card>
          ) : payables.map(o => <OutstandingCard key={o.id} o={o} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-blue-600" />Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Party</Label>
              <Input className="mt-1 h-8 text-sm" value={paymentItem?.partyName || ""} disabled />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" className="mt-1 h-8 text-sm" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" className="mt-1 h-8 text-sm" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea className="mt-1 text-sm" rows={3} value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Cash / UPI / Bank transfer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={savingPayment || !paymentItem || !paymentAmount}
              onClick={async () => {
                if (!paymentItem) return;
                setSavingPayment(true);
                try {
                  await apiPost(`/outstandings/${paymentItem.id}/status`, {
                    status: "collected",
                    amountCollected: Number(paymentAmount),
                    paymentDate,
                    note: paymentNote || null,
                  });
                  toast({ title: "Payment recorded!" });
                  setPaymentOpen(false);
                } catch (err: unknown) {
                  toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
                } finally {
                  setSavingPayment(false);
                }
              }}
            >
              {savingPayment ? "Saving..." : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
