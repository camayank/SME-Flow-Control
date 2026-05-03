import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiUrl, formatCurrency, formatDate } from "@/lib/api";
import { getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Users, ArrowUpRight, ArrowDownRight, Plus, MessageCircle,
  Clock, BarChart3, ChevronRight, IndianRupee,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface DashboardData {
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

function StatCard({
  title, value, sub, icon: Icon, trend, color = "default", href
}: {
  title: string; value: string; sub?: string; icon: React.ElementType;
  trend?: "up" | "down"; color?: "default" | "success" | "warning" | "danger"; href?: string;
}) {
  const colorClass = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  }[color];

  const bgClass = {
    default: "bg-primary/10",
    success: "bg-emerald-50",
    warning: "bg-amber-50",
    danger: "bg-red-50",
  }[color];

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
      const res = await fetch(queryKey[0] as string, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    refetchInterval: 30000,
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

  const isEmpty = !!data && !data.parties.total && !data.outstandings.totalReceivables && !data.outstandings.totalPayables && !data.recentActivity.length;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            Namaste 🙏 {business?.businessName}
          </h1>
          <p className="text-sm text-muted-foreground">Aaj ka overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/import">Import</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/parchi">
              <Plus className="h-4 w-4" />
              New Parchi
            </Link>
          </Button>
        </div>
      </div>

      {isEmpty && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Start here</p>
              <p className="text-sm text-muted-foreground">Pehli entry, import, ya party add karke dashboard bhar dein.</p>
              <p className="text-xs text-muted-foreground mt-1">Upgrade path: AI suggestions, forecast, and task nudges can live here next.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/parties">Add Party</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/import">Import Data</Link></Button>
              <Button asChild size="sm"><Link href="/parchi">New Parchi</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert banner */}
      {data && (data.reconciliation.total > 0 || data.overdue.count > 0) && (
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
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Receivables"
          value={formatCurrency(data?.outstandings.totalReceivables || 0)}
          sub="Aapko milna hai"
          icon={IndianRupee}
          color="success"
          href="/outstandings"
        />
        <StatCard
          title="Total Payables"
          value={formatCurrency(data?.outstandings.totalPayables || 0)}
          sub="Aapko dena hai"
          icon={TrendingDown}
          color="warning"
          href="/outstandings"
        />
        <StatCard
          title="Overdue Amount"
          value={formatCurrency(data?.overdue.amount || 0)}
          sub={`${data?.overdue.count || 0} parties`}
          icon={AlertTriangle}
          color="danger"
          href="/collections"
        />
        <StatCard
          title="Parties"
          value={(data?.parties.total || 0).toString()}
          sub={`${data?.parties.customers || 0} customers, ${data?.parties.vendors || 0} vendors`}
          icon={Users}
          href="/parties"
        />
      </div>

      {/* Cash flow (30 days) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Cash Flow (30 Din)
              <span className="text-xs bg-muted rounded px-2 py-0.5">Last 30 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                  <ArrowUpRight className="h-4 w-4" />
                  <span>Inflows</span>
                </div>
                <span className="font-semibold text-emerald-600">{formatCurrency(data?.cashFlow.inflows || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-red-500 text-sm">
                  <ArrowDownRight className="h-4 w-4" />
                  <span>Outflows</span>
                </div>
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

        {/* Aging chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Aging Breakdown (Receivables)
              <Link href="/reports" className="text-xs text-primary flex items-center gap-1">
                Full Report <ChevronRight className="h-3 w-3" />
              </Link>
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
                    {agingChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
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

      {/* Top debtors + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top debtors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Top Debtors
              <Link href="/outstandings" className="text-xs text-primary flex items-center gap-1">
                Sab Dekho <ChevronRight className="h-3 w-3" />
              </Link>
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
                  <div key={debtor.partyId} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{debtor.partyName}</p>
                        {debtor.mobile && <p className="text-xs text-muted-foreground">{debtor.mobile}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(debtor.amountDue)}</span>
                      {debtor.mobile && (
                        <a
                          href={`https://wa.me/91${debtor.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(`Namaste, please pay your outstanding amount of ₹${debtor.amountDue.toLocaleString("en-IN")}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600"
                          title="WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Recent Activity
              <Link href="/parchi" className="text-xs text-primary flex items-center gap-1">
                <Plus className="h-3 w-3" /> New Entry
              </Link>
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
                  <div key={event.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${event.direction === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                        {event.direction === "inflow"
                          ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                          : <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{event.narration || event.eventType.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(event.eventDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-semibold ${event.direction === "inflow" ? "text-emerald-600" : "text-red-500"}`}>
                        {event.direction === "inflow" ? "+" : "-"}{formatCurrency(event.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { href: "/parchi", icon: Plus, label: "Add Parchi", color: "bg-primary/10 text-primary" },
          { href: "/collections", icon: MessageCircle, label: "Send Reminder", color: "bg-emerald-50 text-emerald-600" },
          { href: "/reconciliation", icon: RefreshCw, label: "Reconcile", color: "bg-amber-50 text-amber-600" },
          { href: "/import", icon: BarChart3, label: "Import Data", color: "bg-purple-50 text-purple-600" },
        ].map(action => (
          <Link key={action.href} href={action.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className={`p-2 rounded-lg ${action.color}`}>
                  <action.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{action.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
