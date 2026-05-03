import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, BarChart3, FileText, ReceiptText,
  Wallet, AlarmClock, Download, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

interface ReceivablesReport {
  totalReceivables: number; totalCollected: number; netOutstanding: number;
  items: { id: number; partyName: string | null; amountDue: number; agingBucket: string; priority: string }[];
}
interface AgingReport { summary: { bucket: string; label: string; amount: number; count: number }[] }
interface CollectionsReport { period: string; totalCollected: number; eventCount: number; avgPerDay: number }
interface PLReport {
  revenue: { salesRevenue: number; otherIncome: number; total: number };
  costs: { purchaseCost: number; expenses: number; total: number };
  grossProfit: number; netProfit: number; margin: string;
  monthlyBreakdown: { month: string; sales: number; purchases: number; expenses: number }[];
}
interface RegisterReport {
  summary: { totalSales?: number; totalPurchase?: number; totalGst: number; count: number };
  items: { id: number; invoiceNumber: string; invoiceDate: string; partyName: string | null; partyGstin: string | null; subtotal: number; cgst: number; sgst: number; igst: number; total: number; status: string }[];
}
interface TrendsReport { months: { month: string; inflow: number; outflow: number; net: number }[] }

const AGING_COLORS: Record<string, string> = {
  "not_due": "#6366f1", "due_today": "#f59e0b", "overdue_1_7": "#fb923c",
  "overdue_8_15": "#f97316", "overdue_16_30": "#ef4444", "overdue_31_60": "#dc2626", "overdue_60_plus": "#991b1b",
};

function useReport<T>(path: string) {
  const token = getAuthToken();
  return useQuery<T>({
    queryKey: [apiUrl(path)],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${r[k] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [plFrom, setPlFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [plTo, setPlTo] = useState(new Date().toISOString().split("T")[0]);

  const { data: receivables } = useReport<ReceivablesReport>("/reports/receivables");
  const { data: aging } = useReport<AgingReport>("/reports/aging");
  const { data: collections } = useReport<CollectionsReport>("/reports/collections");
  const { data: sourceSync } = useReport<{ sources: { id: number; sourceName: string; connectionStatus: string; recordsImported: number }[] }>("/reports/source-sync");
  const { data: followUps } = useReport<{ total: number; statusCounts: Record<string, number> }>("/reports/follow-ups");
  const { data: pl } = useReport<PLReport>(`/reports/pl?from=${plFrom}&to=${plTo}`);
  const { data: salesReg } = useReport<RegisterReport>(`/reports/sales-register?from=${plFrom}&to=${plTo}`);
  const { data: purReg } = useReport<RegisterReport>(`/reports/purchase-register?from=${plFrom}&to=${plTo}`);
  const { data: trends } = useReport<TrendsReport>("/reports/monthly-trends");

  const agingChartData = aging?.summary.filter(s => s.amount > 0).map(s => ({
    name: s.label, amount: s.amount, count: s.count, color: AGING_COLORS[s.bucket] || "#6366f1",
  })) || [];

  const pieData = agingChartData.map(d => ({ name: d.name, value: d.amount, fill: d.color }));
  const topDebtors = receivables?.items.sort((a, b) => b.amountDue - a.amountDue).slice(0, 8) || [];
  const hasOps = !!(followUps?.total || sourceSync?.sources?.length);

  const plCards = pl ? [
    { label: "Gross Revenue", value: pl.revenue.total, color: "text-emerald-600", icon: ArrowUpRight },
    { label: "Total Costs", value: pl.costs.total, color: "text-red-600", icon: ArrowDownRight },
    { label: "Gross Profit", value: pl.grossProfit, color: pl.grossProfit >= 0 ? "text-emerald-600" : "text-red-600", icon: TrendingUp },
    { label: "Net Margin", value: null, extra: `${pl.margin}%`, color: pl.grossProfit >= 0 ? "text-primary" : "text-red-600", icon: BarChart3 },
  ] : [];

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5" />Reports</h1>
        <p className="text-sm text-muted-foreground">P&L, registers, aging, collections, aur ops analytics</p>
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

      <Tabs defaultValue="pl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pl">P&L</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="sales">Sales Register</TabsTrigger>
          <TabsTrigger value="purchase">Purchase Register</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="ops">Ops</TabsTrigger>
        </TabsList>

        {/* P&L */}
        <TabsContent value="pl" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-sm w-36" value={plFrom} onChange={e => setPlFrom(e.target.value)} />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" className="h-8 text-sm w-36" value={plTo} onChange={e => setPlTo(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {plCards.map(c => (
              <Card key={c.label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className={`text-xl font-bold mt-1 ${c.color}`}>
                    {c.value !== null ? formatCurrency(c.value) : c.extra}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {pl && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue vs Cost</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Sales Revenue</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(pl.revenue.salesRevenue)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Other Income</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(pl.revenue.otherIncome)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2 font-semibold">
                      <span>Total Revenue</span>
                      <span>{formatCurrency(pl.revenue.total)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Purchase Cost</span>
                      <span className="font-semibold text-red-500">{formatCurrency(pl.costs.purchaseCost)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Expenses</span>
                      <span className="font-semibold text-red-500">{formatCurrency(pl.costs.expenses)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2 font-semibold">
                      <span>Total Costs</span>
                      <span>{formatCurrency(pl.costs.total)}</span>
                    </div>
                    <div className={`flex justify-between font-bold text-base pt-1 ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      <span>Net Profit</span>
                      <span>{formatCurrency(pl.netProfit)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monthly Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {pl.monthlyBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={pl.monthlyBreakdown} barSize={18}>
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="sales" fill="#10b981" radius={[3, 3, 0, 0]} name="Sales" />
                        <Bar dataKey="purchases" fill="#f97316" radius={[3, 3, 0, 0]} name="Purchases" />
                        <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} name="Expenses" />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Trends */}
        <TabsContent value="trends" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">6-Month Cash Flow Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {trends?.months.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trends.months} barSize={22}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Outflow" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Net Cash Flow (Month-wise)</CardTitle>
            </CardHeader>
            <CardContent>
              {trends?.months.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trends.months}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="net" name="Net" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>}
            </CardContent>
          </Card>

          {trends?.months && (
            <div className="rounded-lg border divide-y overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground">
                <span>Month</span><span className="text-right text-emerald-600">Inflow</span><span className="text-right text-red-500">Outflow</span><span className="text-right">Net</span>
              </div>
              {trends.months.map(m => (
                <div key={m.month} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">{m.month}</span>
                  <span className="text-right text-emerald-600">{formatCurrency(m.inflow)}</span>
                  <span className="text-right text-red-500">{formatCurrency(m.outflow)}</span>
                  <span className={`text-right font-semibold ${m.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{m.net >= 0 ? "+" : ""}{formatCurrency(m.net)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sales Register */}
        <TabsContent value="sales" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-sm w-36" value={plFrom} onChange={e => setPlFrom(e.target.value)} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" className="h-8 text-sm w-36" value={plTo} onChange={e => setPlTo(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => exportCSV(salesReg?.items || [], "sales-register.csv")}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          {salesReg && (
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total Sales</p><p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(salesReg.summary.totalSales || 0)}</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total GST</p><p className="text-xl font-bold text-primary mt-1">{formatCurrency(salesReg.summary.totalGst)}</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Invoices</p><p className="text-xl font-bold mt-1">{salesReg.summary.count}</p></CardContent></Card>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted"><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Invoice #</th><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Date</th><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Party</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Taxable</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">CGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">SGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">IGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Total</th><th className="py-2 px-3 text-xs text-muted-foreground font-medium">Status</th></tr></thead>
              <tbody>
                {(salesReg?.items || []).map(row => (
                  <tr key={row.id} className="border-t hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{row.invoiceNumber}</td>
                    <td className="py-2 px-3 text-xs">{formatDate(row.invoiceDate)}</td>
                    <td className="py-2 px-3 max-w-[120px] truncate text-xs">{row.partyName || "—"}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.subtotal)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.cgst)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.sgst)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.igst)}</td>
                    <td className="py-2 px-3 text-right text-xs font-semibold">{formatCurrency(row.total)}</td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{row.status}</Badge></td>
                  </tr>
                ))}
                {!salesReg?.items.length && <tr><td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Koi sales invoice nahi is period mein</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Purchase Register */}
        <TabsContent value="purchase" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-sm w-36" value={plFrom} onChange={e => setPlFrom(e.target.value)} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" className="h-8 text-sm w-36" value={plTo} onChange={e => setPlTo(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => exportCSV(purReg?.items || [], "purchase-register.csv")}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          {purReg && (
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total Purchase</p><p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(purReg.summary.totalPurchase || 0)}</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total GST (ITC)</p><p className="text-xl font-bold text-primary mt-1">{formatCurrency(purReg.summary.totalGst)}</p></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Bills</p><p className="text-xl font-bold mt-1">{purReg.summary.count}</p></CardContent></Card>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted"><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Invoice #</th><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Date</th><th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Vendor</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Taxable</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">CGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">SGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">IGST</th><th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Total</th><th className="py-2 px-3 text-xs text-muted-foreground font-medium">Status</th></tr></thead>
              <tbody>
                {(purReg?.items || []).map(row => (
                  <tr key={row.id} className="border-t hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{row.invoiceNumber}</td>
                    <td className="py-2 px-3 text-xs">{formatDate(row.invoiceDate)}</td>
                    <td className="py-2 px-3 max-w-[120px] truncate text-xs">{row.partyName || "—"}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.subtotal)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.cgst)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.sgst)}</td>
                    <td className="py-2 px-3 text-right text-xs">{formatCurrency(row.igst)}</td>
                    <td className="py-2 px-3 text-right text-xs font-semibold">{formatCurrency(row.total)}</td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{row.status}</Badge></td>
                  </tr>
                ))}
                {!purReg?.items.length && <tr><td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Koi purchase invoice nahi is period mein</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Aging */}
        <TabsContent value="aging" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Aging Bar Chart</CardTitle></CardHeader>
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
                ) : <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Distribution (Pie)</CardTitle></CardHeader>
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
                ) : <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Aging Summary Table</CardTitle></CardHeader>
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
                {!aging?.summary.length && <p className="text-sm text-muted-foreground py-4 text-center">Koi aging data nahi</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Receivables */}
        <TabsContent value="receivables" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{topDebtors.length} parties with outstanding</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => exportCSV(topDebtors.map(i => ({ party: i.partyName, amount: i.amountDue, bucket: i.agingBucket, priority: i.priority })), "receivables.csv")}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          {!topDebtors.length ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Koi receivables nahi hain</CardContent></Card>
          ) : topDebtors.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.partyName || "Unknown"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${item.priority === "critical" ? "bg-red-100 text-red-700" : item.priority === "high" ? "bg-orange-100 text-orange-700" : item.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{item.priority}</span>
                  <span className="text-xs text-muted-foreground">{item.agingBucket.replace(/_/g, " ")}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-red-600 flex-shrink-0">{formatCurrency(item.amountDue)}</span>
            </div>
          ))}
        </TabsContent>

        {/* Ops */}
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
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Collections Follow-up Status</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(followUps?.statusCounts || {}).map(([status, count]) => (
                <Badge key={status} variant="secondary">{status}: {count}</Badge>
              ))}
              {!Object.keys(followUps?.statusCounts || {}).length && <p className="text-sm text-muted-foreground">Koi follow-ups nahi</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Connected Data Sources</CardTitle></CardHeader>
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
