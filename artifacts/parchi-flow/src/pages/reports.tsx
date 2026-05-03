import { useQuery } from "@tanstack/react-query";
import { apiUrl, formatCurrency, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { TrendingUp, TrendingDown, BarChart3, FileText, ReceiptText, Wallet, AlarmClock } from "lucide-react";

interface ReceivablesReport {
  totalReceivables: number;
  totalCollected: number;
  netOutstanding: number;
  items: { id: number; partyName: string | null; amountDue: number; agingBucket: string; priority: string }[];
}

interface AgingReport {
  summary: { bucket: string; label: string; amount: number; count: number }[];
}

interface CollectionsReport {
  period: string;
  totalCollected: number;
  eventCount: number;
  avgPerDay: number;
}

interface PartyStatementSummary {
  party: { id: number; name: string; mobile: string | null; gstin: string | null };
  openingBalance: number;
  closingBalance: number;
  statement: { id: number; entryDate: string; entryType: string; narration: string | null; invoiceNumber: string | null; voucherNumber: string | null; debit: number | null; credit: number | null; balance: number }[];
}

const AGING_COLORS: Record<string, string> = {
  "not_due": "#6366f1",
  "due_today": "#f59e0b",
  "overdue_1_7": "#fb923c",
  "overdue_8_15": "#f97316",
  "overdue_16_30": "#ef4444",
  "overdue_31_60": "#dc2626",
  "overdue_60_plus": "#991b1b",
};

export default function ReportsPage() {
  const token = getAuthToken();

  const { data: receivables } = useQuery<ReceivablesReport>({
    queryKey: [apiUrl("/reports/receivables")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reports/receivables"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: aging } = useQuery<AgingReport>({
    queryKey: [apiUrl("/reports/aging")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reports/aging"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: collections } = useQuery<CollectionsReport>({
    queryKey: [apiUrl("/reports/collections")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reports/collections"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: sourceSync } = useQuery<{ sources: { id: number; sourceName: string; connectionStatus: string; recordsImported: number }[] }>({
    queryKey: [apiUrl("/reports/source-sync")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reports/source-sync"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: followUps } = useQuery<{ total: number; statusCounts: Record<string, number> }>({
    queryKey: [apiUrl("/reports/follow-ups")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reports/follow-ups"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const agingChartData = aging?.summary.filter(s => s.amount > 0).map(s => ({
    name: s.label,
    amount: s.amount,
    count: s.count,
    color: AGING_COLORS[s.bucket] || "#6366f1",
  })) || [];

  const topDebtors = receivables?.items
    .sort((a, b) => b.amountDue - a.amountDue)
    .slice(0, 8) || [];

  const pieData = agingChartData.map(d => ({ name: d.name, value: d.amount, fill: d.color }));

  const hasOps = !!(followUps?.total || sourceSync?.sources?.length);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Reports
        </h1>
        <p className="text-sm text-muted-foreground">Business analytics, collection ops, aur statement views</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Receivables", value: formatCurrency(receivables?.totalReceivables || 0), color: "text-red-600", icon: TrendingUp },
          { label: "Collected", value: formatCurrency(receivables?.totalCollected || 0), color: "text-emerald-600", icon: TrendingDown },
          { label: "Collections (30d)", value: formatCurrency(collections?.totalCollected || 0), color: "text-primary", icon: BarChart3 },
          { label: "Avg/Day (30d)", value: formatCurrency(collections?.avgPerDay || 0), color: "text-amber-600", icon: FileText },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
              <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2"><ReceiptText className="h-3.5 w-3.5" />Statements Ready</p>
            <p className="text-xl font-bold mt-1">{receivables?.items.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2"><AlarmClock className="h-3.5 w-3.5" />Follow-ups</p>
            <p className="text-xl font-bold mt-1">{followUps?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Wallet className="h-3.5 w-3.5" />Connected Sources</p>
            <p className="text-xl font-bold mt-1">{sourceSync?.sources.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="aging">
        <TabsList>
          <TabsTrigger value="aging">Aging Analysis</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="ops">Ops</TabsTrigger>
        </TabsList>

        {/* Aging */}
        <TabsContent value="aging" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Aging Bar Chart</CardTitle>
              </CardHeader>
              <CardContent>
                {agingChartData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={agingChartData} barSize={24}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {agingChartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Distribution (Pie)</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                        {pieData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Aging Summary Table</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {aging?.summary.map(s => (
                  <div key={s.bucket} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: AGING_COLORS[s.bucket] || "#6366f1" }} />
                      <span className="text-sm">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{s.count} parties</span>
                      <span className="font-semibold">{formatCurrency(s.amount)}</span>
                    </div>
                  </div>
                ))}
                {!aging?.summary.length && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Koi aging data nahi</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receivables */}
        <TabsContent value="receivables" className="mt-4 space-y-3">
          {!topDebtors.length ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Koi receivables nahi hain
              </CardContent>
            </Card>
          ) : topDebtors.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.partyName || "Unknown"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    item.priority === "critical" ? "bg-red-100 text-red-700" :
                    item.priority === "high" ? "bg-orange-100 text-orange-700" :
                    item.priority === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{item.priority}</span>
                  <span className="text-xs text-muted-foreground">{item.agingBucket.replace(/_/g, " ")}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-red-600 flex-shrink-0">{formatCurrency(item.amountDue)}</span>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ops" className="mt-4 space-y-4">
          {!hasOps && (
            <Card className="border-dashed border-primary/25 bg-primary/5">
              <CardContent className="py-4">
                <p className="text-sm font-medium">Ops layer ready hai</p>
                <p className="text-xs text-muted-foreground mt-1">Follow-ups ya connected sources aate hi yahan live tracking dikhega.</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Collections Follow-up Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(followUps?.statusCounts || {}).map(([status, count]) => (
                <Badge key={status} variant="secondary">{status}: {count}</Badge>
              ))}
              {!Object.keys(followUps?.statusCounts || {}).length && <p className="text-sm text-muted-foreground">Koi follow-ups nahi</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Connected Data Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sourceSync?.sources?.length ? sourceSync.sources.map(source => (
                <div key={source.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{source.sourceName}</p>
                    <p className="text-xs text-muted-foreground">{source.connectionStatus}</p>
                  </div>
                  <Badge variant="outline">{source.recordsImported} imported</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground py-4 text-center">Koi source connected nahi</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
