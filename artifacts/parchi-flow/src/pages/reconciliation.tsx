import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiPost, apiUrl, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RefreshCw, AlertTriangle, CheckCircle, Copy, Merge, User, X,
  HelpCircle, AlertOctagon, ArrowUpRight, ArrowDownRight, Shield,
} from "lucide-react";

interface ReconItem {
  id: number;
  sourceType: string;
  issueType: string;
  confidenceScore: number;
  reason: string;
  suggestedAction: string;
  status: string;
  amount: number | null;
  partyName: string | null;
  suggestedPartyId: number | null;
  referenceNumber: string | null;
  utr: string | null;
  eventDate: string | null;
  userAction: string | null;
  createdAt: string;
}

interface ReconSummary {
  pendingReview: number;
  possibleDuplicates: number;
  suspenseCredits: number;
  suspenseDebits: number;
  verificationPending: number;
  disputed: number;
  resolved: number;
  total: number;
}

const ISSUE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  "unmatched_credit": { label: "Bank Credit Without Party", color: "text-blue-700", icon: ArrowUpRight },
  "unmatched_debit": { label: "Unmatched Debit", color: "text-red-700", icon: ArrowDownRight },
  "possible_duplicate": { label: "Possible Duplicate", color: "text-amber-700", icon: Copy },
  "bank_credit_without_party": { label: "Suspense Credit", color: "text-purple-700", icon: HelpCircle },
  "screenshot_without_bank_credit": { label: "Unverified Payment", color: "text-orange-700", icon: AlertTriangle },
  "disputed_transaction": { label: "Dispute", color: "text-red-700", icon: AlertOctagon },
  "amount_mismatch": { label: "Amount Mismatch", color: "text-amber-700", icon: AlertTriangle },
};

export default function ReconciliationPage() {
  const [selectedItem, setSelectedItem] = useState<ReconItem | null>(null);
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: items = [], isLoading } = useQuery<ReconItem[]>({
    queryKey: [apiUrl("/reconciliation"), "pending"],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${apiUrl("/reconciliation")}?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery<ReconSummary>({
    queryKey: [apiUrl("/reconciliation/summary")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/reconciliation/summary"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleAction = async (action: string, item: ReconItem, extraData?: Record<string, unknown>) => {
    setIsProcessing(true);
    try {
      const actionEndpoints: Record<string, string> = {
        confirm: `/reconciliation/${item.id}/confirm`,
        merge: `/reconciliation/${item.id}/merge`,
        "assign-party": `/reconciliation/${item.id}/assign-party`,
        dispute: `/reconciliation/${item.id}/mark-dispute`,
        ignore: `/reconciliation/${item.id}/ignore`,
        "keep-separate": `/reconciliation/${item.id}/keep-separate`,
      };

      await apiPost(actionEndpoints[action], extraData || {});
      queryClient.invalidateQueries({ queryKey: [apiUrl("/reconciliation")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/reconciliation/summary")] });
      toast({ title: "Done!", description: "Reconciliation action taken" });
      setActionDialog(null);
      setSelectedItem(null);
      setNewPartyName("");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Action failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const openAction = (item: ReconItem, action: string) => {
    setSelectedItem(item);
    setActionDialog(action);
  };

  const pendingVisible = items.filter(item => item.status === "pending");

  const groupedItems = {
    duplicates: items.filter(i => i.issueType === "possible_duplicate"),
    suspense: items.filter(i => ["unmatched_credit", "unmatched_debit", "bank_credit_without_party"].includes(i.issueType)),
    verification: items.filter(i => i.issueType === "screenshot_without_bank_credit"),
    disputed: items.filter(i => i.issueType === "disputed_transaction"),
    other: items.filter(i => !["possible_duplicate", "unmatched_credit", "unmatched_debit", "bank_credit_without_party", "screenshot_without_bank_credit", "disputed_transaction"].includes(i.issueType)),
  };

  const ReconItemCard = ({ item }: { item: ReconItem }) => {
    const config = ISSUE_CONFIG[item.issueType] || { label: item.issueType, color: "text-slate-600", icon: HelpCircle };
    const Icon = config.icon;
    return (
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5">
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.reason}</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {item.amount && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">{formatCurrency(item.amount)}</span>
                  )}
                  {item.partyName && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">{item.partyName}</span>
                  )}
                  {item.utr && (
                    <span className="text-xs text-muted-foreground">UTR: {item.utr}</span>
                  )}
                  {item.eventDate && (
                    <span className="text-xs text-muted-foreground">{formatDate(item.eventDate)}</span>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {item.confidenceScore}% confident
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              {item.issueType === "possible_duplicate" ? (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction("merge", item)}>Merge</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleAction("keep-separate", item)}>Keep</Button>
                </>
              ) : item.issueType.includes("credit") || item.issueType.includes("debit") ? (
                <>
                  <Button size="sm" className="h-7 text-xs" onClick={() => openAction(item, "assign-party")}>Assign Party</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleAction("ignore", item)}>Ignore</Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleAction("confirm", item)}>Confirm</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleAction("ignore", item)}>Ignore</Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground">Unmatched aur suspicious transactions ko resolve karein</p>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total Pending", value: summary.total, color: "text-foreground" },
            { label: "Duplicates", value: summary.possibleDuplicates, color: "text-amber-600" },
            { label: "Suspense", value: summary.suspenseCredits + summary.suspenseDebits, color: "text-purple-600" },
            { label: "Resolved", value: summary.resolved, color: "text-emerald-600" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : !items.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-emerald-500/30 mb-3" />
            <p className="text-muted-foreground font-medium">Sab clear! Koi pending items nahi hain 🎉</p>
            <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/import">Import more data</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all" className="text-xs">All ({items.length})</TabsTrigger>
            {groupedItems.duplicates.length > 0 && <TabsTrigger value="duplicates" className="text-xs">Duplicates ({groupedItems.duplicates.length})</TabsTrigger>}
            {groupedItems.suspense.length > 0 && <TabsTrigger value="suspense" className="text-xs">Suspense ({groupedItems.suspense.length})</TabsTrigger>}
            {groupedItems.verification.length > 0 && <TabsTrigger value="verification" className="text-xs">Verify ({groupedItems.verification.length})</TabsTrigger>}
          </TabsList>
          {[
            { value: "all", list: items },
            { value: "duplicates", list: groupedItems.duplicates },
            { value: "suspense", list: groupedItems.suspense },
            { value: "verification", list: groupedItems.verification },
          ].map(tab => (
            <TabsContent key={tab.value} value={tab.value} className="mt-3 space-y-2">
              {(tab.value === "all" ? pendingVisible : tab.list).map(item => <ReconItemCard key={item.id} item={item} />)}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Assign party dialog */}
      <Dialog open={actionDialog === "assign-party"} onOpenChange={open => !open && setActionDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Party Assign Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selectedItem && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{selectedItem.amount ? formatCurrency(selectedItem.amount) : "Unknown amount"}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{selectedItem.reason}</p>
              </div>
            )}
            <div>
              <Label className="text-sm">New Party Name</Label>
              <Input
                className="mt-1.5"
                placeholder="Party ka naam..."
                value={newPartyName}
                onChange={e => setNewPartyName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              disabled={!newPartyName.trim() || isProcessing}
              onClick={() => selectedItem && handleAction("assign-party", selectedItem, {
                createNewParty: true,
                newPartyName: newPartyName.trim(),
              })}
            >
              {isProcessing ? "Saving..." : "Assign & Resolve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
