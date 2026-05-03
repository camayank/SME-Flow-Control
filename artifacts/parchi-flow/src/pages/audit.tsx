import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiUrl, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldAlert, Search, ChevronDown, ChevronUp,
  Plus, Pencil, Trash2, RefreshCw, CheckCircle,
  FileText, Users, IndianRupee, Package, Bell,
} from "lucide-react";

interface AuditRow {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  create: { label: "Created", color: "text-emerald-700", bg: "bg-emerald-100", icon: Plus },
  update: { label: "Updated", color: "text-blue-700", bg: "bg-blue-100", icon: Pencil },
  delete: { label: "Deleted", color: "text-red-700", bg: "bg-red-100", icon: Trash2 },
  reconcile: { label: "Reconciled", color: "text-purple-700", bg: "bg-purple-100", icon: RefreshCw },
  confirm: { label: "Confirmed", color: "text-teal-700", bg: "bg-teal-100", icon: CheckCircle },
  payment: { label: "Payment", color: "text-amber-700", bg: "bg-amber-100", icon: IndianRupee },
  invoice: { label: "Invoice", color: "text-primary", bg: "bg-primary/10", icon: FileText },
};

const ENTITY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  party: { label: "Party", icon: Users, color: "text-blue-600" },
  invoice: { label: "Invoice", icon: FileText, color: "text-primary" },
  parchi: { label: "Parchi", icon: IndianRupee, color: "text-emerald-600" },
  outstanding: { label: "Outstanding", icon: IndianRupee, color: "text-red-600" },
  follow_up: { label: "Follow-up", icon: Bell, color: "text-amber-600" },
  item: { label: "Item", icon: Package, color: "text-orange-600" },
  reconciliation: { label: "Reconciliation", icon: RefreshCw, color: "text-purple-600" },
};

function formatDiff(oldVal: string | null, newVal: string | null) {
  try {
    const oldObj = oldVal ? JSON.parse(oldVal) : null;
    const newObj = newVal ? JSON.parse(newVal) : null;
    if (!oldObj && !newObj) return null;
    if (!oldObj) return [{ key: "value", old: null, new: JSON.stringify(newObj) }];
    if (!newObj) return [{ key: "value", old: JSON.stringify(oldObj), new: null }];
    if (typeof oldObj === "object" && typeof newObj === "object") {
      const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
      return keys
        .filter(k => String(oldObj[k] ?? "") !== String(newObj[k] ?? ""))
        .slice(0, 8)
        .map(k => ({ key: k, old: String(oldObj[k] ?? ""), new: String(newObj[k] ?? "") }));
    }
    return [{ key: "value", old: String(oldObj), new: String(newObj) }];
  } catch {
    return null;
  }
}

function AuditRowCard({ row }: { row: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const actionKey = Object.keys(ACTION_CONFIG).find(k => row.action?.toLowerCase().includes(k)) || "update";
  const actionCfg = ACTION_CONFIG[actionKey] || ACTION_CONFIG.update;
  const ActionIcon = actionCfg.icon;

  const entityKey = row.entityType?.toLowerCase().replace(/\s/g, "_") || "";
  const entityCfg = ENTITY_CONFIG[entityKey];
  const EntityIcon = entityCfg?.icon;

  const diff = formatDiff(row.oldValue, row.newValue);
  const hasDiff = diff && diff.length > 0;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${actionCfg.bg}`}>
            <ActionIcon className={`h-3.5 w-3.5 ${actionCfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="text-sm font-medium leading-snug">{row.description}</p>
              <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(row.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${actionCfg.bg} ${actionCfg.color}`}>
                {actionCfg.label}
              </span>
              {entityCfg && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {EntityIcon && <EntityIcon className={`h-3 w-3 ${entityCfg.color}`} />}
                  {entityCfg.label}
                  {row.entityId ? ` #${row.entityId}` : ""}
                </span>
              )}
              {!entityCfg && row.entityType && (
                <Badge variant="outline" className="text-xs">{row.entityType}</Badge>
              )}
              {hasDiff && (
                <button
                  className="text-xs text-primary flex items-center gap-0.5 hover:underline ml-auto"
                  onClick={() => setExpanded(v => !v)}
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded ? "Hide changes" : `${diff!.length} change${diff!.length > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
            {expanded && hasDiff && (
              <div className="mt-2 rounded-lg border bg-muted/30 divide-y text-xs overflow-hidden">
                <div className="grid grid-cols-3 gap-2 px-3 py-1.5 font-medium text-muted-foreground bg-muted/50">
                  <span>Field</span>
                  <span>Before</span>
                  <span>After</span>
                </div>
                {diff!.map((d, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 px-3 py-1.5">
                    <span className="font-medium truncate">{d.key.replace(/_/g, " ")}</span>
                    <span className="text-red-600 truncate">{d.old || "—"}</span>
                    <span className="text-emerald-600 truncate">{d.new || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ENTITY_TYPES = ["all", "party", "invoice", "parchi", "outstanding", "follow_up", "item", "reconciliation"];

export default function AuditPage() {
  const token = getAuthToken();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const { data, isLoading } = useQuery<AuditRow[]>({
    queryKey: [apiUrl("/audit")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Failed to load audit logs");
      return res.json();
    },
  });

  const filtered = (data || []).filter(row => {
    if (search && !row.description?.toLowerCase().includes(search.toLowerCase()) && !row.entityType?.toLowerCase().includes(search.toLowerCase())) return false;
    if (entityFilter !== "all" && row.entityType?.toLowerCase().replace(/\s/g, "_") !== entityFilter) return false;
    if (actionFilter !== "all" && !row.action?.toLowerCase().includes(actionFilter)) return false;
    return true;
  });

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = {
    total: data?.length || 0,
    parties: data?.filter(r => r.entityType?.toLowerCase().includes("party")).length || 0,
    invoices: data?.filter(r => r.entityType?.toLowerCase().includes("invoice")).length || 0,
    followUps: data?.filter(r => r.entityType?.toLowerCase().includes("follow")).length || 0,
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground">Saare important changes ka complete tamper-proof record</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: counts.total, color: "text-primary" },
          { label: "Party Changes", value: counts.parties, color: "text-blue-600" },
          { label: "Invoice Events", value: counts.invoices, color: "text-primary" },
          { label: "Follow-up Logs", value: counts.followUps, color: "text-amber-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search audit logs..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={entityFilter} onValueChange={v => { setEntityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{t === "all" ? "All Types" : t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {Object.entries(ACTION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} event{filtered.length !== 1 ? "s" : ""}{data && filtered.length < data.length ? ` (filtered from ${data.length})` : ""}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!isLoading && !paged.length && (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {data?.length ? "No matching audit events found" : "Abhi koi audit activity nahi hai"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {paged.map(row => <AuditRowCard key={row.id} row={row} />)}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
