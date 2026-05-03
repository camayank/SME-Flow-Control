import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { apiUrl, apiPost, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Phone, ArrowLeft, FileText, Printer,
  Plus, CheckCircle, Calendar, IndianRupee, ReceiptText,
  ArrowUpRight, ArrowDownRight, Clock, AlertTriangle, Copy, ExternalLink,
  Info,
} from "lucide-react";

interface LedgerEntry {
  id: string;
  date: string;
  narration: string;
  refNumber: string | null;
  rowType: "invoice" | "payment" | "entry";
  invoiceType?: string;
  debitAmount: number | null;
  creditAmount: number | null;
  amount: number;
  status: string;
  dueDate?: string | null;
  balanceDue?: number;
  runningBalance: number;
  sourceId: number;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber: string;
  invoiceType: string;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
}

interface FollowUpRecord {
  id: number;
  followUpType: string;
  status: string;
  note: string | null;
  promisedPaymentDate: string | null;
  promisedAmount: number | null;
  nextFollowUpAt: string | null;
  lastReminderAt: string | null;
  createdAt: string;
}

interface PartyLedger {
  party: {
    id: number; name: string; mobile: string | null; email: string | null;
    gstin: string | null; type: string; city: string | null;
    currentBalance: number; balanceType: string; riskScore: number | null;
    openingBalance: number; openingBalanceType: string;
  };
  summary: {
    totalInvoices: number; totalPaymentsReceived: number; totalPayable: number;
    totalOverdue: number; totalOutstanding: number;
    lastFollowUpAt: string | null; nextFollowUpAt: string | null; riskScore: number | null;
  };
  entries: LedgerEntry[];
  invoices: InvoiceSummary[];
  followUps: FollowUpRecord[];
  outstandings: { id: number; amountDue: number; dueDate: string | null; agingDays: number; status: string; invoiceNumber: string | null }[];
}

const FU_TYPE_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", call: "Call", visit: "Visit", email: "Email",
};
const FU_TYPE_COLOR: Record<string, string> = {
  whatsapp: "text-emerald-700 bg-emerald-50",
  call: "text-blue-700 bg-blue-50",
  visit: "text-purple-700 bg-purple-50",
  email: "text-amber-700 bg-amber-50",
};

const STATUS_BADGE: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-400",
};

export default function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = getAuthToken();
  const qc = useQueryClient();

  const [addFUOpen, setAddFUOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderTone, setReminderTone] = useState("soft");
  const [reminderLang, setReminderLang] = useState("hinglish");
  const [reminderMsg, setReminderMsg] = useState<{ message: string; whatsappUrl: string | null } | null>(null);
  const [generatingReminder, setGeneratingReminder] = useState(false);
  const [fuForm, setFuForm] = useState({ followUpType: "whatsapp", note: "", nextFollowUpAt: "", promisedPaymentDate: "", promisedAmount: "" });
  const [savingFU, setSavingFU] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: "", to: "" });

  const { data, isLoading, refetch } = useQuery<PartyLedger>({
    queryKey: [apiUrl(`/parties/${id}/ledger`)],
    enabled: !!token && !!id,
    queryFn: async () => {
      const r = await fetch(apiUrl(`/parties/${id}/ledger`), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const generateReminder = async () => {
    if (!data) return;
    setGeneratingReminder(true);
    try {
      const result = await apiPost<{ message: string; whatsappUrl: string | null }>("/follow-ups/generate-reminder", {
        partyId: parseInt(id!),
        templateType: reminderTone,
        language: reminderLang,
      });
      setReminderMsg(result);
    } catch {
      toast({ title: "Error generating reminder", variant: "destructive" });
    } finally {
      setGeneratingReminder(false);
    }
  };

  const saveFU = async () => {
    setSavingFU(true);
    try {
      const firstOutstanding = data?.outstandings?.[0];
      await apiPost("/follow-ups", {
        partyId: parseInt(id!),
        outstandingId: firstOutstanding?.id || null,
        followUpType: fuForm.followUpType,
        note: fuForm.note || null,
        nextFollowUpAt: fuForm.nextFollowUpAt || null,
        promisedPaymentDate: fuForm.promisedPaymentDate || null,
        promisedAmount: fuForm.promisedAmount ? parseFloat(fuForm.promisedAmount) : null,
      });
      toast({ title: "Follow-up added!" });
      refetch();
      qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups/due")] });
      setAddFUOpen(false);
      setFuForm({ followUpType: "whatsapp", note: "", nextFollowUpAt: "", promisedPaymentDate: "", promisedAmount: "" });
    } catch {
      toast({ title: "Error adding follow-up", variant: "destructive" });
    } finally {
      setSavingFU(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Party not found</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/parties")}>← Back</Button>
      </div>
    );
  }

  const { party, summary, entries, invoices, followUps } = data;

  const filteredEntries = entries.filter(e => {
    if (dateFilter.from && new Date(e.date) < new Date(dateFilter.from)) return false;
    if (dateFilter.to && new Date(e.date) > new Date(dateFilter.to + "T23:59:59")) return false;
    return true;
  });

  const closingBalance = filteredEntries.length > 0 ? filteredEntries[filteredEntries.length - 1].runningBalance : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl mx-auto">
      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-700 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Party view guide</p>
              <p className="text-sm text-blue-900/80 mt-1">Use Ledger to verify entries, Invoices to check billing status, and Follow-ups to see collections progress and next actions.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/parties")} className="mt-0.5 flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{party.name}</h1>
            <Badge variant="outline" className="text-xs">{party.type}</Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              party.balanceType === "receivable" ? "bg-red-100 text-red-700"
              : party.balanceType === "payable" ? "bg-blue-100 text-blue-700"
              : "bg-emerald-100 text-emerald-700"
            }`}>
              {party.balanceType === "receivable" ? "Lena Hai" : party.balanceType === "payable" ? "Dena Hai" : "Settled"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {party.mobile && <span className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{party.mobile}</span>}
            {party.email && <span className="text-sm text-muted-foreground">{party.email}</span>}
            {party.city && <span className="text-sm text-muted-foreground">📍 {party.city}</span>}
            {party.gstin && <span className="text-xs font-mono text-muted-foreground">GSTIN: {party.gstin}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          {party.mobile && (
            <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200"
              onClick={() => { setReminderOpen(true); generateReminder(); }}>
              <MessageCircle className="h-3.5 w-3.5" /> Remind
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5"
            onClick={() => setAddFUOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Follow-up
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={party.balanceType === "receivable" ? "border-red-200" : party.balanceType === "payable" ? "border-blue-200" : "border-emerald-200"}>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Current Balance</p>
            <p className={`text-lg font-bold mt-0.5 ${party.balanceType === "receivable" ? "text-red-600" : party.balanceType === "payable" ? "text-blue-600" : "text-emerald-600"}`}>
              {formatCurrency(Math.abs(party.currentBalance))}
            </p>
            <p className="text-xs text-muted-foreground">{party.balanceType === "receivable" ? "Lena Hai" : party.balanceType === "payable" ? "Dena Hai" : "Settled"}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-lg font-bold mt-0.5 text-amber-600">{formatCurrency(summary.totalOverdue)}</p>
            <p className="text-xs text-muted-foreground">{summary.totalOverdue > 0 ? "Past due date" : "No overdue"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total Invoiced</p>
            <p className="text-lg font-bold mt-0.5">{formatCurrency(summary.totalInvoices)}</p>
            <p className="text-xs text-muted-foreground">{invoices.filter(i => i.invoiceType === "sale").length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-100">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-muted-foreground">Total Collected</p>
            <p className="text-lg font-bold mt-0.5 text-emerald-600">{formatCurrency(summary.totalPaymentsReceived)}</p>
            <p className="text-xs text-muted-foreground">
              {summary.nextFollowUpAt ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />FU: {formatDate(summary.nextFollowUpAt)}</span> : "No follow-up set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue alert */}
      {summary.totalOverdue > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800">
            <strong>{formatCurrency(summary.totalOverdue)}</strong> is overdue from {party.name}.
            {party.mobile && (
              <button className="ml-2 text-emerald-700 underline" onClick={() => { setReminderOpen(true); generateReminder(); }}>
                Send reminder →
              </button>
            )}
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="ledger">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="ledger" className="text-xs">Ledger ({entries.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="followups" className="text-xs">
            Follow-ups
            {followUps.filter(f => f.status !== "done" && f.status !== "resolved").length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 text-xs">
                {followUps.filter(f => f.status !== "done" && f.status !== "resolved").length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Ledger Tab */}
        <TabsContent value="ledger" className="mt-4">
          {/* Date filter */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Filter:</span>
            <Input type="date" className="h-7 text-xs w-36" value={dateFilter.from}
              onChange={e => setDateFilter(f => ({ ...f, from: e.target.value }))} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-7 text-xs w-36" value={dateFilter.to}
              onChange={e => setDateFilter(f => ({ ...f, to: e.target.value }))} />
            {(dateFilter.from || dateFilter.to) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDateFilter({ from: "", to: "" })}>Clear</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredEntries.length} rows</span>
          </div>

          {/* Account statement table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Particulars</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Ref No</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Debit (Dr)</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Credit (Cr)</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No entries</td></tr>
                  ) : (
                    filteredEntries.map(entry => (
                      <tr key={entry.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatDate(entry.date)}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            {entry.rowType === "invoice"
                              ? <ReceiptText className="h-3 w-3 text-blue-500 flex-shrink-0" />
                              : entry.rowType === "payment"
                              ? <ArrowUpRight className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                              : <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                            <span className="truncate max-w-40">{entry.narration}</span>
                            {entry.status && entry.rowType === "invoice" && (
                              <span className={`text-xs px-1 py-0.5 rounded ${STATUS_BADGE[entry.status] || "bg-slate-100 text-slate-600"}`}>
                                {entry.status}
                              </span>
                            )}
                          </div>
                          {entry.dueDate && entry.rowType === "invoice" && (
                            <p className={`text-xs mt-0.5 ${new Date(entry.dueDate) < new Date() && entry.status !== "paid" ? "text-red-500" : "text-muted-foreground"}`}>
                              Due: {formatDate(entry.dueDate)}
                            </p>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">{entry.refNumber || "—"}</td>
                        <td className="py-2 px-3 text-right font-medium text-red-600">
                          {entry.debitAmount != null ? formatCurrency(entry.debitAmount) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-emerald-600">
                          {entry.creditAmount != null ? formatCurrency(entry.creditAmount) : "—"}
                        </td>
                        <td className={`py-2 px-3 text-right font-bold ${entry.runningBalance > 0 ? "text-red-600" : entry.runningBalance < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {entry.runningBalance === 0 ? "0.00" : formatCurrency(Math.abs(entry.runningBalance))}
                          {entry.runningBalance !== 0 && (
                            <span className="text-xs font-normal ml-0.5 text-muted-foreground">
                              {entry.runningBalance > 0 ? " Dr" : " Cr"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {filteredEntries.length > 0 && (
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="py-2 px-3 text-right font-bold text-sm">Closing Balance</td>
                      <td className={`py-2 px-3 text-right font-bold text-sm ${closingBalance > 0 ? "text-red-600" : closingBalance < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {formatCurrency(Math.abs(closingBalance))}
                        {closingBalance !== 0 && <span className="text-xs font-normal ml-0.5">{closingBalance > 0 ? " Dr" : " Cr"}</span>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4 space-y-2">
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No invoices for this party</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map(inv => (
              <div key={inv.id} className="border rounded-lg px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {inv.status}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{inv.invoiceType.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span>{formatDate(inv.invoiceDate)}</span>
                      {inv.dueDate && (
                        <span className={new Date(inv.dueDate) < new Date() && inv.status !== "paid" ? "text-red-500 font-medium" : ""}>
                          Due: {formatDate(inv.dueDate)}
                          {new Date(inv.dueDate) < new Date() && inv.status !== "paid" && " ⚠️"}
                        </span>
                      )}
                      {inv.amountPaid > 0 && (
                        <span className="text-emerald-600">Paid: {formatCurrency(inv.amountPaid)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm">{formatCurrency(inv.total)}</p>
                    {inv.balanceDue > 0 && (
                      <p className="text-xs text-red-600">Due: {formatCurrency(inv.balanceDue)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* Follow-ups Tab */}
        <TabsContent value="followups" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{followUps.length} follow-up{followUps.length !== 1 ? "s" : ""}</p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
              onClick={() => setAddFUOpen(true)}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>

          {followUps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No follow-ups yet</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setAddFUOpen(true)}>
                  Add Follow-up
                </Button>
              </CardContent>
            </Card>
          ) : (
            followUps.map(fu => (
              <div key={fu.id} className={`border rounded-lg p-3 ${fu.status === "done" || fu.status === "resolved" ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 ${FU_TYPE_COLOR[fu.followUpType] || "bg-slate-100 text-slate-600"}`}>
                    {FU_TYPE_LABEL[fu.followUpType] || fu.followUpType}
                  </span>
                  <div className="flex-1 min-w-0">
                    {fu.note && <p className="text-sm text-foreground">{fu.note}</p>}
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span>{formatDate(fu.createdAt)}</span>
                      {fu.nextFollowUpAt && (
                        <span className={`flex items-center gap-1 ${new Date(fu.nextFollowUpAt) < new Date() && fu.status !== "done" ? "text-red-600 font-medium" : ""}`}>
                          <Calendar className="h-3 w-3" /> Next: {formatDate(fu.nextFollowUpAt)}
                        </span>
                      )}
                      {fu.promisedPaymentDate && (
                        <span className="text-emerald-600">
                          Promised: {formatDate(fu.promisedPaymentDate)}
                          {fu.promisedAmount ? ` (${formatCurrency(fu.promisedAmount)})` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                    fu.status === "done" || fu.status === "resolved" ? "bg-emerald-100 text-emerald-700"
                    : fu.status === "in_progress" ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                  }`}>
                    {fu.status === "in_progress" ? "In Progress" : fu.status === "done" ? "Done" : fu.status === "resolved" ? "Resolved" : "Pending"}
                  </span>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Add Follow-up Dialog */}
      <Dialog open={addFUOpen} onOpenChange={setAddFUOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Follow-up for {party.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={fuForm.followUpType} onValueChange={v => setFuForm(f => ({ ...f, followUpType: v }))}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="call">Phone Call</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Next Follow-up</Label>
                <Input type="date" className="mt-1 h-8 text-xs" value={fuForm.nextFollowUpAt}
                  onChange={e => setFuForm(f => ({ ...f, nextFollowUpAt: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea className="mt-1 text-xs" rows={2} value={fuForm.note}
                onChange={e => setFuForm(f => ({ ...f, note: e.target.value }))} placeholder="What was discussed..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Promise Date</Label>
                <Input type="date" className="mt-1 h-8 text-xs" value={fuForm.promisedPaymentDate}
                  onChange={e => setFuForm(f => ({ ...f, promisedPaymentDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Promise Amt (₹)</Label>
                <Input type="number" className="mt-1 h-8 text-xs" value={fuForm.promisedAmount}
                  onChange={e => setFuForm(f => ({ ...f, promisedAmount: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddFUOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveFU} disabled={savingFU}>{savingFU ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reminder Dialog */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp Reminder — {party.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tone</Label>
                <Select value={reminderTone} onValueChange={v => { setReminderTone(v); setReminderMsg(null); }}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft / Polite</SelectItem>
                    <SelectItem value="firm">Firm</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Select value={reminderLang} onValueChange={v => { setReminderLang(v); setReminderMsg(null); }}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={generateReminder} disabled={generatingReminder}>
              {generatingReminder ? "Generating..." : "Generate Message"}
            </Button>
            {reminderMsg && (
              <div className="relative">
                <Textarea value={reminderMsg.message} readOnly className="text-sm bg-emerald-50/40 border-emerald-200 pr-9 min-h-20" />
                <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 h-6 w-6"
                  onClick={async () => { await navigator.clipboard.writeText(reminderMsg.message); toast({ title: "Copied!" }); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {reminderMsg?.whatsappUrl && (
              <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 flex-1">
                <a href={reminderMsg.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open WhatsApp
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`@media print { button, nav, aside, .no-print { display: none !important; } body { background: white !important; } }`}</style>
    </div>
  );
}
