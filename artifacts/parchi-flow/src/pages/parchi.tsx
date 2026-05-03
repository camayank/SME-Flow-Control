import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiPost, apiUrl, formatCurrency, getAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mic, Sparkles, CheckCircle, ArrowUpRight, ArrowDownRight, AlertCircle, Plus, User, ReceiptText, IndianRupee, Tag, BadgeCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface ParseResult {
  partyName: string | null;
  amount: number | null;
  transactionType: string | null;
  direction: "inflow" | "outflow" | "neutral" | null;
  eventType: string | null;
  eventDate: string | null;
  promiseDate: string | null;
  note: string | null;
  confidence: number;
  confirmationMessage: string;
}

interface Party {
  id: number;
  name: string;
  mobile: string | null;
}

const TRANSACTION_TYPES = [
  { value: "payment_received", label: "Paisa Mila (Payment Received)", direction: "inflow" },
  { value: "payment_made", label: "Paisa Diya (Payment Made)", direction: "outflow" },
  { value: "credit_sale", label: "Udhaar Diya (Credit Sale)", direction: "neutral" },
  { value: "advance_received", label: "Advance Liya", direction: "inflow" },
  { value: "advance_paid", label: "Advance Diya", direction: "outflow" },
  { value: "expense", label: "Kharcha (Expense)", direction: "outflow" },
  { value: "promise_to_pay", label: "Payment Promise", direction: "neutral" },
  { value: "manual_parchi", label: "General Entry", direction: "neutral" },
];

export default function ParchiPage() {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    partyName: "",
    partyId: null as number | null,
    amount: "",
    eventType: "payment_received",
    direction: "inflow",
    eventDate: new Date().toISOString().split("T")[0],
    promiseDate: "",
    note: "",
  });
  const [mode, setMode] = useState<"text" | "form">("text");
  const [partySearch, setPartySearch] = useState("");
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: parties } = useQuery<Party[]>({
    queryKey: [apiUrl("/parties")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/parties"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleParse = async () => {
    if (!rawText.trim() || rawText.length < 3) return;
    setIsParsing(true);
    try {
      const result = await apiPost<ParseResult>("/parchi/parse", { text: rawText });
      setParsed(result);
      setForm(f => ({
        ...f,
        partyName: result.partyName || f.partyName,
        amount: result.amount?.toString() || f.amount,
        eventType: result.eventType || f.eventType,
        direction: result.direction || "inflow",
        eventDate: result.eventDate || f.eventDate,
        promiseDate: result.promiseDate || f.promiseDate,
        note: rawText,
      }));
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to parse", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ title: "Amount zaroori hai!", description: "Koi bhi amount daalo", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        partyName: form.partyName || null,
        partyId: form.partyId || null,
        amount: parseFloat(form.amount),
        transactionType: form.eventType,
        direction: form.direction,
        eventType: form.eventType,
        eventDate: form.eventDate,
        promiseDate: form.promiseDate || null,
        note: form.note || rawText || null,
        rawText: rawText || null,
      };
      await apiPost("/parchi/save", payload);
      toast({ title: "Parchi Save Ho Gayi! ✅", description: "Transaction record ho gaya" });

      // Reset
      setRawText("");
      setParsed(null);
      setForm({
        partyName: "", partyId: null, amount: "", eventType: "payment_received",
        direction: "inflow", eventDate: new Date().toISOString().split("T")[0],
        promiseDate: "", note: "",
      });
      setPartySearch("");

      // Invalidate dashboard
      queryClient.invalidateQueries({ queryKey: [apiUrl("/dashboard")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/outstandings")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/parties")] });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredParties = parties?.filter(p =>
    partySearch ? p.name.toLowerCase().includes(partySearch.toLowerCase()) : true
  ).slice(0, 6) || [];

  const selectedTxType = TRANSACTION_TYPES.find(t => t.value === form.eventType);
  const isInvoiceLike = form.eventType === "credit_sale" || form.eventType === "payment_received" || form.eventType === "manual_parchi";
  const invoiceTitle = form.eventType === "credit_sale" ? "Sales Invoice Draft" : "Ledger Draft";

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Parchi Entry</h1>
        <p className="text-sm text-muted-foreground">Transaction likhein ya type karein</p>
      </div>

      <Card className="border-dashed border-primary/25 bg-primary/5">
        <CardContent className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Invoice-first booking</p>
            <p className="text-xs text-muted-foreground">Vyapar-style next step: draft invoice, party ledger, and due tracking from one entry.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setInvoicePreviewOpen(true)}>
            <ReceiptText className="h-4 w-4 mr-1.5" />
            Preview Draft
          </Button>
        </CardContent>
      </Card>

      {/* Mode switch */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setMode("text")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "text" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          ✏️ Text / Voice
        </button>
        <button
          onClick={() => setMode("form")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "form" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          📋 Manual Form
        </button>
      </div>

      {mode === "text" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Smart Parchi Parser
            </CardTitle>
            <CardDescription>
              Hindi/English mein likhein — e.g. "Ramesh se 5000 mila", "Sharma ko 12000 udhaar diya"
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Textarea
                placeholder={`Yahan likhein, jaise:\n• Ramesh se 5000 mila\n• Gupta Electronics ko 15000 ka maal diya udhaar\n• Kumar ne 2000 advance diya kal dunga`}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                className="min-h-28 text-base resize-none"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2"><IndianRupee className="h-3.5 w-3.5" /> Simple bookkeeping</div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2"><Tag className="h-3.5 w-3.5" /> Party-linked entry</div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5" /> Due / reminder ready</div>
            </div>
            <Button
              onClick={handleParse}
              disabled={!rawText.trim() || isParsing}
              variant="outline"
              className="w-full"
            >
              {isParsing ? "Samajh rahe hain..." : "🧠 Samjhao (Parse)"}
            </Button>

            {/* Parse result preview */}
            {parsed && (
              <div className={`rounded-lg border p-4 space-y-3 ${parsed.confidence > 70 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-start gap-2">
                  {parsed.confidence > 70
                    ? <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className="text-sm font-medium">
                      {parsed.confirmationMessage}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{parsed.confidence}% confident</Badge>
                      {parsed.transactionType && <Badge variant="outline" className="text-xs">{parsed.transactionType}</Badge>}
                    </div>
                  </div>
                </div>

                {/* Editable fields */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label className="text-xs">Party</Label>
                    <Input
                      value={form.partyName}
                      onChange={e => { setForm(f => ({ ...f, partyName: e.target.value, partyId: null })); setPartySearch(e.target.value); }}
                      placeholder="Party name"
                      className="mt-1 text-sm h-8"
                    />
                    {partySearch && filteredParties.length > 0 && (
                      <div className="border rounded-md bg-background shadow-sm mt-1 max-h-32 overflow-y-auto">
                        {filteredParties.map(p => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2"
                            onClick={() => { setForm(f => ({ ...f, partyName: p.name, partyId: p.id })); setPartySearch(""); }}
                          >
                            <User className="h-3 w-3 text-muted-foreground" />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Amount (₹)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="mt-1 text-sm h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Transaction Type</Label>
                    <Select value={form.eventType} onValueChange={v => {
                      const t = TRANSACTION_TYPES.find(t => t.value === v);
                      setForm(f => ({ ...f, eventType: v, direction: t?.direction || "inflow" }));
                    }}>
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      value={form.eventDate}
                      onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
                      className="mt-1 text-sm h-8"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={!form.amount || isSaving}
              className="w-full"
              size="lg"
            >
              {isSaving ? "Save ho raha hai..." : "✅ Parchi Save Karein"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Manual Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Party Name</Label>
              <Input
                className="mt-1.5"
                placeholder="Party ka naam..."
                value={form.partyName}
                onChange={e => { setForm(f => ({ ...f, partyName: e.target.value, partyId: null })); setPartySearch(e.target.value); }}
              />
              {partySearch && filteredParties.length > 0 && (
                <div className="border rounded-md bg-background shadow-sm mt-1 max-h-32 overflow-y-auto">
                  {filteredParties.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => { setForm(f => ({ ...f, partyName: p.name, partyId: p.id })); setPartySearch(""); }}
                    >
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  placeholder="0"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.eventDate}
                  onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label>Transaction Type</Label>
              <Select value={form.eventType} onValueChange={v => {
                const t = TRANSACTION_TYPES.find(t => t.value === v);
                setForm(f => ({ ...f, eventType: v, direction: t?.direction || "inflow" }));
              }}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Note (optional)</Label>
              <Textarea
                className="mt-1.5"
                placeholder="Koi additional jaankari..."
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={3}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={!form.amount || isSaving}
              className="w-full"
              size="lg"
            >
              {isSaving ? "Save ho raha hai..." : "✅ Entry Save Karein"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={invoicePreviewOpen} onOpenChange={setInvoicePreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5" />
              {invoiceTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">{form.partyName || "Party pending"}</p>
              <p className="text-xs text-muted-foreground">{form.eventDate}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-semibold">{form.amount ? formatCurrency(Number(form.amount)) : "—"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-semibold">{selectedTxType?.label || "—"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Step one is simple accounting. Step two can add GST invoice number, print/share, and PDF export.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent parchi tips */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-primary mb-2">💡 Tips — Kuch examples:</p>
          <div className="space-y-1">
            {[
              "Ramesh se 5000 mila",
              "Sharma Traders ko 25000 maal diya udhaar",
              "Kumar advance 3000 diya",
              "Petrol kharcha 500",
            ].map(tip => (
              <button
                key={tip}
                className="block w-full text-left text-sm text-muted-foreground hover:text-foreground hover:bg-background rounded px-2 py-1 transition-colors"
                onClick={() => { setRawText(tip); setMode("text"); }}
              >
                → "{tip}"
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
