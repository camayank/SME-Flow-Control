import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiUrl, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { apiPost } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Phone, ArrowLeft, FileText, ArrowUpRight, ArrowDownRight, ReceiptText, Clock3, IndianRupee, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface PartyLedger {
  party: {
    id: number; name: string; mobile: string | null; email: string | null;
    gstin: string | null; type: string; city: string | null;
    currentBalance: number; balanceType: string; riskScore: number | null;
  };
  summary: {
    totalInvoices: number; totalPaymentsReceived: number;
    totalPayable: number; totalOverdue: number;
    lastFollowUpAt: string | null; nextFollowUpAt: string | null; riskScore: number | null;
  };
  entries: {
    id: number; entryType: string; amount: number; debitAmount: number | null;
    creditAmount: number | null; entryDate: string; dueDate: string | null;
    narration: string | null; status: string; reconciliationStatus: string; sourceType: string | null;
  }[];
}

export default function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const token = getAuthToken();

  const { data, isLoading } = useQuery<PartyLedger>({
    queryKey: [apiUrl(`/parties/${id}/ledger`)],
    enabled: !!token && !!id,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/parties/${id}/ledger`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleSendReminder = async () => {
    if (!data) return;
    setIsGenerating(true);
    try {
      const result = await apiPost<{ message: string; whatsappUrl: string | null }>("/follow-ups/generate-reminder", {
        partyId: parseInt(id!),
        templateType: "soft",
        language: "hinglish",
      });
      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank");
      } else {
        await navigator.clipboard.writeText(result.message);
        toast({ title: "Message copied!", description: "Clipboard mein copy ho gaya" });
      }
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintStatement = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Party not found</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/parties")}>
          ← Back to Parties
        </Button>
      </div>
    );
  }

  const { party, summary, entries } = data;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/parties")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{party.name}</h1>
            <Badge variant="outline">{party.type}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {party.mobile && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />{party.mobile}
              </span>
            )}
            {party.city && <span className="text-sm text-muted-foreground">📍 {party.city}</span>}
            {party.gstin && <span className="text-xs text-muted-foreground">GST: {party.gstin}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {party.mobile && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200" onClick={handleSendReminder} disabled={isGenerating}>
              <MessageCircle className="h-4 w-4" />
              Remind
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handlePrintStatement}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={party.balanceType === "receivable" ? "border-red-200" : party.balanceType === "payable" ? "border-blue-200" : ""}>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className={`text-lg font-bold mt-0.5 ${party.balanceType === "receivable" ? "text-red-600" : party.balanceType === "payable" ? "text-blue-600" : "text-emerald-600"}`}>
              {formatCurrency(party.currentBalance)}
            </p>
            <p className="text-xs text-muted-foreground">{party.balanceType === "receivable" ? "Lena Hai" : party.balanceType === "payable" ? "Dena Hai" : "Settled"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total Overdue</p>
            <p className="text-lg font-bold mt-0.5 text-amber-600">{formatCurrency(summary.totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total Payments</p>
            <p className="text-lg font-bold mt-0.5 text-emerald-600">{formatCurrency(summary.totalPaymentsReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total Invoiced</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(summary.totalInvoices)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed border-primary/20 bg-primary/5">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><ReceiptText className="h-4 w-4" />Invoice-style statement</p>
            <p className="text-xs text-muted-foreground">Party ledger, due dates, and reminders in one screen.</p>
          </div>
          <Badge variant="secondary">{entries.length} rows</Badge>
        </CardContent>
      </Card>

      {/* Ledger entries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Ledger ({entries.length} entries)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!entries.length ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Koi entries nahi hain</p>
          ) : (
            <div className="divide-y">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    entry.creditAmount ? "bg-emerald-50" : "bg-red-50"
                  }`}>
                    {entry.creditAmount
                      ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                      : <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{entry.narration || entry.entryType.replace(/_/g, " ")}</p>
                      {entry.status === "open" && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">Open</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatDate(entry.entryDate)}</span>
                      {entry.dueDate && <span className="text-xs text-muted-foreground">Due: {formatDate(entry.dueDate)}</span>}
                      <span className="text-xs text-muted-foreground">{entry.entryType.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {entry.debitAmount && <p className="text-sm font-semibold text-red-600">-{formatCurrency(entry.debitAmount)}</p>}
                    {entry.creditAmount && <p className="text-sm font-semibold text-emerald-600">+{formatCurrency(entry.creditAmount)}</p>}
                    {!entry.debitAmount && !entry.creditAmount && <p className="text-sm font-semibold">{formatCurrency(entry.amount)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Opening</span><span className="font-medium">{formatCurrency(summary.totalInvoices - summary.totalPaymentsReceived)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Closing balance</span><span className="font-semibold">{formatCurrency(party.currentBalance)}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Risk score</span><span className="font-semibold">{summary.riskScore ?? "—"}</span></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" />Next follow-up</div>
              <p className="text-sm text-muted-foreground">{summary.nextFollowUpAt ? formatDate(summary.nextFollowUpAt) : "No follow-up scheduled"}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <style>{`
        @media print {
          button, nav, aside, .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}
