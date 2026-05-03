import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiUrl, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Users, ArrowUpRight, ArrowDownRight, Plus, MessageCircle,
  Clock, BarChart3, ChevronRight, IndianRupee, Package, ReceiptText,
  Sparkles, Eye, Target, ArrowRight, ShieldCheck, FileText, Bell,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, Legend,
} from "recharts";

interface DashboardData {
  today?: { activityCount: number; entriesCreated: number; partiesTouched: number; followUpsCreated: number };
  cashFlow: { inflows: number; outflows: number; netCashFlow: number; period: string };
  outstandings: { totalReceivables: number; totalPayables: number; netPosition: number };
  overdue: { amount: number; count: number };
  parties: { total: number; customers: number; vendors: number };
  reconciliation: { pendingReview: number; possibleDuplicates: number; suspenseCredits: number; total: number };
  followUps: { pending: number; overdue: number };
  topDebtors: { partyId: number; partyName: string; mobile: string | null; amountDue: number }[];
  agingBuckets: Record<string, number>;
  recentActivity: { id: number; eventType: string; amount: number; direction: string; eventDate: string; narration: string | null; reconciliationStatus: string }[];
}

interface TrendsData { months: { month: string; inflow: number; outflow: number; net: number }[] }
interface ItemsData { items: { id: number; name: string; isLowStock: boolean; stockQty: number; salePrice: number }[]; lowStockCount: number }
interface BusinessesData { business: { id: number; businessName: string; city: string | null; state: string | null; gstin: string | null } | null; businesses: { id: number; businessName: string; city: string | null; state: string | null; gstin: string | null }[] }

const quickDrills = [
  { href: "/parties", title: "Party master", desc: "Search, open, and inspect ledger", icon: Users },
  { href: "/outstandings", title: "Collections", desc: "Check aging and follow-ups", icon: Clock },
  { href: "/follow-ups", title: "Follow-ups", desc: "See due, overdue, and next steps", icon: Bell },
  { href: "/reconciliation", title: "Reconciliation", desc: "Find mismatches and approve", icon: RefreshCw },
  { href: "/invoices", title: "Invoices", desc: "Drill into billing status", icon: FileText },
  { href: "/reports", title: "Reports", desc: "Understand trends and impact", icon: BarChart3 },
];

function StatCard({ title, value, sub, icon: Icon, trend, color = "default", href }: {
  title: string; value: string; sub?: string; icon: React.ElementType;
  trend?: "up" | "down"; color?: "default" | "success" | "warning" | "danger"; href?: string;
}) {
  const colorClass = { default: "text-primary", success: "text-emerald-600", warning: "text-amber-600", danger: "text-red-600" }[color];
  const bgClass = { default: "bg-primary/10", success: "bg-emerald-50", warning: "bg-amber-50", danger: "bg-red-50" }[color];
  const card = (
    <Card className="hover:shadow-md transition-shadow cursor-default">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`${bgClass} p-2.5 rounded-xl flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${colorClass}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

export default function DashboardPage() {
  const { business } = useAuth();
  const token = getAuthToken();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: [apiUrl("/dashboard")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: trends } = useQuery<TrendsData>({
    queryKey: [apiUrl("/reports/monthly-trends")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return { months: [] };
      return res.json();
    },
  });

  const { data: itemsData } = useQuery<ItemsData>({
    queryKey: [apiUrl("/items")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return { items: [], lowStockCount: 0 };
      return res.json();
    },
  });

  const { data: businessesData } = useQuery<BusinessesData>({
    queryKey: [apiUrl("/business")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return { business: null, businesses: [] };
      return res.json();
    },
  });

  const agingChartData = data ? [
    { name: "Not Due", value: data.agingBuckets["not_due"] || 0, color: "#6366f1" },
    { name: "1-7d", value: data.agingBuckets["overdue_1_7"] || 0, color: "#f59e0b" },
    { name: "8-15d", value: data.agingBuckets["overdue_8_15"] || 0, color: "#f97316" },
    { name: "16-30d", value: data.agingBuckets["overdue_16_30"] || 0, color: "#ef4444" },
    { name: "30-60d", value: data.agingBuckets["overdue_31_60"] || 0, color: "#dc2626" },
    { name: "60d+", value: data.agingBuckets["overdue_60_plus"] || 0, color: "#991b1b" },
  ] : [];

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const isEmpty = !!data && !data.parties.total && !data.outstandings.totalReceivables && !data.recentActivity.length;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Namaste 🙏 {business?.businessName}</h1>
          <p className="text-sm text-muted-foreground">Aaj ka overview</p>
          {businessesData?.businesses?.length ? <p className="text-xs text-muted-foreground mt-1">{businessesData.businesses.length} business connected</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/invoices">New Invoice</Link></Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/parchi"><Plus className="h-4 w-4" />New Parchi</Link>
          </Button>
        </div>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-emerald-900">What changed today</p>
              <p className="text-xs text-emerald-900/75 mt-1">Tally, Marg, Busy aur similar users ko complex BI nahi chahiye — real syncing, clear overview, and decision support chahiye.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1 border border-emerald-200">Actions: {data?.today?.activityCount || 0}</span>
              <span className="rounded-full bg-white px-2.5 py-1 border border-emerald-200">Entries: {data?.today?.entriesCreated || 0}</span>
              <span className="rounded-full bg-white px-2.5 py-1 border border-emerald-200">Parties: {data?.today?.partiesTouched || 0}</span>
              <span className="rounded-full bg-white px-2.5 py-1 border border-emerald-200">Follow-ups: {data?.today?.followUpsCreated || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/15 bg-primary/5">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="font-semibold">Your daily guidance</p>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4 text-primary" />Where am I?</div>
              <p className="text-xs text-muted-foreground mt-1">You’re on the business overview. Check overdue, cash flow, and inventory first.</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4 text-emerald-600" />What next?</div>
              <p className="text-xs text-muted-foreground mt-1">Open Outstandings, Follow-ups, or Reconciliation to fix today’s action items.</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-amber-600" />Why it matters</div>
              <p className="text-xs text-muted-foreground mt-1">Every completed follow-up and reconciliation improves collection speed and score visibility.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Drill-down shortcuts</p>
              <p className="text-xs text-muted-foreground">One-tap access to syncing, overview, and action screens.</p>
            </div>
            <span className="text-xs text-muted-foreground">Fewer taps</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {quickDrills.map(d => (
              <Link key={d.href} href={d.href}>
                <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <d.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {isEmpty && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Start here</p>
              <p className="text-sm text-muted-foreground">Pehli entry, import, ya party add karke dashboard bhar dein.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/parties">Add Party</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/invoices">New Invoice</Link></Button>
              <Button asChild size="sm"><Link href="/parchi">New Parchi</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (data.reconciliation.total > 0 || data.overdue.count > 0 || (itemsData?.lowStockCount || 0) > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.reconciliation.total > 0 && (
            <Link href="/reconciliation">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 cursor-pointer hover:bg-amber-100 transition-colors">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span><strong>{data.reconciliation.total}</strong> items need reconciliation</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          )}
          {data.overdue.count > 0 && (
            <Link href="/outstandings">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800 cursor-pointer hover:bg-red-100 transition-colors">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span><strong>{data.overdue.count}</strong> overdue — {formatCurrency(data.overdue.amount)}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          )}
          {(itemsData?.lowStockCount || 0) > 0 && (
            <Link href="/items">
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-800 cursor-pointer hover:bg-orange-100 transition-colors">
                <Package className="h-4 w-4 flex-shrink-0" />
                <span><strong>{itemsData!.lowStockCount}</strong> items low stock</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Receivables" value={formatCurrency(data?.outstandings.totalReceivables || 0)} sub="Aapko milna hai" icon={IndianRupee} color="success" href="/outstandings" />
        <StatCard title="Total Payables" value={formatCurrency(data?.outstandings.totalPayables || 0)} sub="Aapko dena hai" icon={TrendingDown} color="warning" href="/outstandings" />
        <StatCard title="Overdue Amount" value={formatCurrency(data?.overdue.amount || 0)} sub={`${data?.overdue.count || 0} parties`} icon={AlertTriangle} color="danger" href="/collections" />
        <StatCard title="Parties" value={(data?.parties.total || 0).toString()} sub={`${data?.parties.customers || 0} customers`} icon={Users} href="/parties" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Cash In (30d)</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{formatCurrency(data?.cashFlow.inflows || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-white border-red-100">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Cash Out (30d)</p>
            <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(data?.cashFlow.outflows || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/5 to-white border-primary/10">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-primary font-medium uppercase tracking-wide">Net Position</p>
            <p className={`text-xl font-bold mt-1 ${(data?.outstandings.netPosition || 0) >= 0 ? "text-primary" : "text-red-600"}`}>{formatCurrency(data?.outstandings.netPosition || 0)}</p>
          </CardContent>
        </Card>
        <Link href="/items">
          <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-100 cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-orange-600 font-medium uppercase tracking-wide flex items-center gap-1"><Package className="h-3 w-3" />Item Inventory</p>
              <p className="text-xl font-bold text-orange-600 mt-1">{itemsData?.items.length || 0} items</p>
              {(itemsData?.lowStockCount || 0) > 0 && <p className="text-xs text-orange-500 mt-0.5">{itemsData!.lowStockCount} low stock</p>}
            </CardContent>
          </Card>
        </Link>
      </div>

      {trends?.months && trends.months.some(m => m.inflow > 0 || m.outflow > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              6-Month Cash Flow Trend
              <Link href="/reports" className="text-xs text-primary flex items-center gap-1">Full Report <ChevronRight className="h-3 w-3" /></Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trends.months} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f4" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Flow (30 Din)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm"><ArrowUpRight className="h-4 w-4" /><span>Inflows</span></div>
                <span className="font-semibold text-emerald-600">{formatCurrency(data?.cashFlow.inflows || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-red-500 text-sm"><ArrowDownRight className="h-4 w-4" /><span>Outflows</span></div>
                <span className="font-semibold text-red-500">{formatCurrency(data?.cashFlow.outflows || 0)}</span>
              </div>
              <div className="border-t pt-2 flex items-center justify-between">
                <span className="text-sm font-medium">Net</span>
                <span className={`font-bold ${(data?.cashFlow.netCashFlow || 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {(data?.cashFlow.netCashFlow || 0) >= 0 ? "+" : ""}{formatCurrency(data?.cashFlow.netCashFlow || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Aging Breakdown (Receivables)
              <Link href="/reports" className="text-xs text-primary flex items-center gap-1">Full Report <ChevronRight className="h-3 w-3" /></Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agingChartData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={agingChartData} barSize={28}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {agingChartData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-24 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <span>Koi outstanding nahi hai 🎉</span>
                <Button asChild variant="outline" size="sm"><Link href="/parchi">Add first entry</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Top Debtors
              <Link href="/outstandings" className="text-xs text-primary flex items-center gap-1">Sab Dekho <ChevronRight className="h-3 w-3" /></Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.topDebtors.length ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground space-y-2">
                <p>Koi outstanding nahi hai</p>
                <Button asChild variant="outline" size="sm"><Link href="/collections">Open Collections</Link></Button>
              </div>
            ) : (
              <div className="divide-y">
                {data.topDebtors.map((debtor, i) => (
                  <Link key={debtor.partyId} href={`/parties/${debtor.partyId}`}>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{i + 1}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{debtor.partyName}</p>
                        {debtor.mobile && <p className="text-xs text-muted-foreground">{debtor.mobile}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(debtor.amountDue)}</span>
                      {debtor.mobile && (
                        <a href={`https://wa.me/91${debtor.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(`Namaste, please pay your outstanding amount of ₹${debtor.amountDue.toLocaleString("en-IN")}`)}`}
                          target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600" title="WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Recent Activity
              <Link href="/parchi" className="text-xs text-primary flex items-center gap-1"><Plus className="h-3 w-3" /> New Entry</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.recentActivity.length ? (
              <div className="px-4 pb-4 text-center py-8">
                <p className="text-sm text-muted-foreground">Koi transactions nahi hain</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm"><Link href="/parchi">Pehli Parchi Dalein</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href="/import">Import file</Link></Button>
                </div>
              </div>
            ) : (
              <div className="divide-y">
                {data.recentActivity.slice(0, 7).map(event => (
                  <Link key={event.id} href="/audit">
                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${event.direction === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                          {event.direction === "inflow" ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{event.narration || event.eventType.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(event.eventDate)}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ${event.direction === "inflow" ? "text-emerald-600" : "text-red-500"}`}>
                        {event.direction === "inflow" ? "+" : "-"}{formatCurrency(event.amount)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed border-emerald-300 bg-emerald-50/40">
        <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-emerald-900">Launch-ready drill-down flow</p>
            <p className="text-sm text-emerald-900/75">One tap from dashboard to parties, collections, follow-ups, audit trail, and reports.</p>
          </div>
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/follow-ups"><ShieldCheck className="h-4 w-4 mr-1.5" />Open follow-up hub</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { href: "/invoices", icon: ReceiptText, label: "New Invoice", color: "bg-primary/10 text-primary" },
          { href: "/parchi", icon: Plus, label: "Add Parchi", color: "bg-emerald-50 text-emerald-600" },
          { href: "/collections", icon: MessageCircle, label: "Send Reminder", color: "bg-amber-50 text-amber-600" },
          { href: "/items", icon: Package, label: "Item Master", color: "bg-orange-50 text-orange-600" },
        ].map(action => (
          <Link key={action.href} href={action.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className={`p-2 rounded-lg ${action.color}`}><action.icon className="h-4 w-4" /></div>
                <span className="text-sm font-medium">{action.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
