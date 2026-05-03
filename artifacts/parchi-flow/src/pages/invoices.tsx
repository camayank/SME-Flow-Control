import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl, apiPost, apiPut, getAuthToken, formatCurrency, formatDate } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, ReceiptText, Printer, Search, X, CheckCircle,
  MessageCircle, ArrowRightCircle, Share2, IndianRupee,
} from "lucide-react";

interface Item {
  id: number; name: string; hsn: string | null; unit: string;
  salePrice: number; purchasePrice: number; gstRate: number;
}

interface LineItem {
  itemId?: number; name: string; hsn: string; unit: string; qty: number; rate: number;
  amount: number; gstRate: number; cgst: number; sgst: number; igst: number; lineTotal: number;
}

interface Invoice {
  id: number; invoiceNumber: string; invoiceType: string; invoiceDate: string;
  dueDate: string | null; partyId: number | null; partyName: string | null;
  partyGstin: string | null; partyAddress: string | null;
  subtotal: number; cgstTotal: number; sgstTotal: number; igstTotal: number;
  total: number; amountPaid: number; balanceDue: number; status: string;
  notes: string | null; terms: string | null; isInterState: boolean; items: LineItem[];
}

interface Party { id: number; name: string; gstin: string | null; mobile: string | null }

const STATUS_COLORS: Record<string, string> = {
  unpaid: "text-red-600 bg-red-50 border-red-200",
  paid: "text-emerald-600 bg-emerald-50 border-emerald-200",
  partially_paid: "text-amber-600 bg-amber-50 border-amber-200",
  cancelled: "text-slate-500 bg-slate-50 border-slate-200",
  draft: "text-blue-600 bg-blue-50 border-blue-200",
};

const DRAFT_KEY = "parchiflow_invoice_draft";

function calcLine(qty: number, rate: number, gstRate: number, isInterState: boolean) {
  const amount = qty * rate;
  const gstAmt = amount * gstRate / 100;
  return {
    qty, rate, amount, gstRate,
    cgst: isInterState ? 0 : gstAmt / 2,
    sgst: isInterState ? 0 : gstAmt / 2,
    igst: isInterState ? gstAmt : 0,
    lineTotal: amount + gstAmt,
  };
}

const emptyLine = (): LineItem => ({
  name: "", hsn: "", unit: "pcs", qty: 1, rate: 0,
  amount: 0, gstRate: 18, cgst: 0, sgst: 0, igst: 0, lineTotal: 0,
});

function getEmptyForm(type: string) {
  return {
    invoiceType: type,
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    partyId: null as number | null,
    partyName: "",
    partyGstin: "",
    partyAddress: "",
    isInterState: false,
    notes: "",
    terms: "Payment due within 30 days.",
    items: [emptyLine()],
  };
}

function whatsappText(inv: Invoice, businessName: string) {
  const lines = inv.items.map(it => `• ${it.name} × ${it.qty} = ₹${it.lineTotal.toFixed(0)}`).join("\n");
  return encodeURIComponent(
    `*${businessName}*\n${inv.invoiceType === "quotation" ? "Quotation" : "Invoice"}: ${inv.invoiceNumber}\nDate: ${new Date(inv.invoiceDate).toLocaleDateString("en-IN")}\n\n${lines}\n\n*Total: ₹${inv.total.toFixed(0)}*\n${inv.balanceDue > 0 ? `*Balance Due: ₹${inv.balanceDue.toFixed(0)}*` : "✅ Paid"}`
  );
}

export default function InvoicesPage() {
  const token = getAuthToken();
  const { business } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState("sale");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNote, setPaymentNote] = useState("");
  const [partySearch, setPartySearch] = useState("");

  const [form, setForm] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") || getEmptyForm("sale"); }
    catch { return getEmptyForm("sale"); }
  });

  const saveDraft = (f: typeof form) => localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
  const updateForm = (update: Partial<typeof form>) => {
    const next = { ...form, ...update };
    setForm(next);
    saveDraft(next);
  };

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: [apiUrl(`/invoices?type=${tab}`)],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/invoices?type=${tab}`), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: items } = useQuery<{ items: Item[] }>({
    queryKey: [apiUrl("/items")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/items"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: [apiUrl("/parties")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/parties"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => apiPost<Invoice>("/invoices", {
      ...payload,
      items: payload.items.filter((i: LineItem) => i.name && i.qty > 0),
    }),
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: [apiUrl(`/invoices?type=${tab}`)] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/items")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/outstandings")] });
      toast({ title: `${inv.invoiceType === "quotation" ? "Quotation" : "Invoice"} ${inv.invoiceNumber} created!` });
      localStorage.removeItem(DRAFT_KEY);
      setNewOpen(false);
      setForm(getEmptyForm(tab));
      if (inv.invoiceType !== "quotation") setPrintInvoice(inv);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => apiPut(`/invoices/${id}/mark-paid`, { amountPaid: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl(`/invoices?type=${tab}`)] });
      toast({ title: "Invoice marked as paid!" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const res = await fetch(apiUrl(`/invoices/${id}/convert`), {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Conversion failed");
      return res.json() as Promise<Invoice>;
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: [apiUrl("/invoices?type=sale")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/invoices?type=quotation")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/items")] });
      toast({ title: `Converted to Invoice ${inv.invoiceNumber}!` });
      setPrintInvoice(inv);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!paymentInvoice) throw new Error("Select invoice");
      const res = await fetch(apiUrl(`/invoices/${paymentInvoice.id}/record-payment`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          paymentDate,
          note: paymentNote,
        }),
      });
      if (!res.ok) throw new Error("Failed to record payment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl(`/invoices?type=${tab}`)] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/outstandings")] });
      setPaymentOpen(false);
      setPaymentInvoice(null);
      setPaymentAmount("");
      setPaymentNote("");
      toast({ title: "Payment recorded!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredInvoices = (invoices || []).filter(inv =>
    !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.partyName && inv.partyName.toLowerCase().includes(search.toLowerCase()))
  );

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    const lines = [...form.items];
    const line = { ...lines[idx], [field]: value };
    if (["qty", "rate", "gstRate"].includes(field)) {
      const c = calcLine(
        field === "qty" ? Number(value) : line.qty,
        field === "rate" ? Number(value) : line.rate,
        field === "gstRate" ? Number(value) : line.gstRate,
        form.isInterState
      );
      lines[idx] = { ...line, ...c };
    } else {
      lines[idx] = line;
    }
    updateForm({ items: lines });
  };

  const addLineFromItem = (item: Item) => {
    const line = emptyLine();
    line.itemId = item.id;
    line.name = item.name;
    line.hsn = item.hsn || "";
    line.unit = item.unit;
    line.rate = tab === "purchase" ? item.purchasePrice : item.salePrice;
    line.gstRate = item.gstRate;
    const c = calcLine(1, line.rate, line.gstRate, form.isInterState);
    const lines = [...form.items.filter((i: LineItem) => i.name), { ...line, ...c }];
    updateForm({ items: lines });
  };

  const subtotal = form.items.reduce((s: number, i: LineItem) => s + i.amount, 0);
  const cgstTotal = form.items.reduce((s: number, i: LineItem) => s + i.cgst, 0);
  const sgstTotal = form.items.reduce((s: number, i: LineItem) => s + i.sgst, 0);
  const igstTotal = form.items.reduce((s: number, i: LineItem) => s + i.igst, 0);
  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal;

  const filteredParties = (parties || []).filter(p =>
    !partySearch || p.name.toLowerCase().includes(partySearch.toLowerCase())
  ).slice(0, 5);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ReceiptText className="h-5 w-5" />Invoices</h1>
          <p className="text-sm text-muted-foreground">GST invoices, quotations, credit/debit notes</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(getEmptyForm(tab)); setNewOpen(true); }}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sale">Sales</TabsTrigger>
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
          <TabsTrigger value="quotation">Quotations</TabsTrigger>
          <TabsTrigger value="credit_note">Credit Notes</TabsTrigger>
          <TabsTrigger value="debit_note">Debit Notes</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Invoice number ya party naam..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
          ) : !filteredInvoices.length ? (
            <Card className="border-dashed">
              <div className="py-12 text-center space-y-3">
                <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Koi {tab === "quotation" ? "quotation" : "invoice"} nahi hai</p>
                <Button size="sm" onClick={() => { setForm(getEmptyForm(tab)); setNewOpen(true); }}>
                  Pehla {tab === "quotation" ? "Quotation" : "Invoice"} Banao
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.map(inv => (
                <Card key={inv.id}>
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold font-mono">{inv.invoiceNumber}</span>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</Badge>
                        {inv.isInterState && <Badge variant="outline" className="text-xs">IGST</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{inv.partyName || "—"}</span>
                        <span>·</span>
                        <span>{formatDate(inv.invoiceDate)}</span>
                        {inv.partyGstin && <span>GST: {inv.partyGstin}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="text-right mr-1">
                        <p className="text-sm font-bold">{formatCurrency(inv.total)}</p>
                        {inv.balanceDue > 0 && <p className="text-xs text-red-500">Due: {formatCurrency(inv.balanceDue)}</p>}
                      </div>
                      {inv.invoiceType === "quotation" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Convert to Invoice"
                          disabled={convertMutation.isPending}
                          onClick={() => convertMutation.mutate({ id: inv.id })}>
                          <ArrowRightCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Print / Preview"
                        onClick={() => setPrintInvoice(inv)}>
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      {inv.partyId && (
                        <a
                          href={`https://wa.me/?text=${whatsappText(inv, business?.businessName || "")}`}
                          target="_blank" rel="noopener noreferrer"
                          title="Share on WhatsApp"
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-emerald-50 text-emerald-600">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600" title="Record Payment"
                        onClick={() => {
                          setPaymentInvoice(inv);
                          setPaymentAmount(String(inv.balanceDue > 0 ? inv.balanceDue : inv.total));
                          setPaymentDate(new Date().toISOString().split("T")[0]);
                          setPaymentNote("");
                          setPaymentOpen(true);
                        }}>
                        <IndianRupee className="h-3.5 w-3.5" />
                      </Button>
                      {inv.status === "unpaid" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" title="Mark Paid"
                          onClick={() => markPaidMutation.mutate({ id: inv.id })}>
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Invoice</Label>
              <Input className="mt-1" value={paymentInvoice?.invoiceNumber || ""} disabled />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input className="mt-1" type="number" min="1" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <Label>Date</Label>
                <Input className="mt-1" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea className="mt-1" rows={3} value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Cash / UPI / Bank transfer" />
            </div>
            <Button className="w-full" disabled={recordPaymentMutation.isPending || !paymentAmount} onClick={() => recordPaymentMutation.mutate()}>
              {recordPaymentMutation.isPending ? "Saving..." : "Save Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {tab === "sale" ? "New Sales Invoice" : tab === "purchase" ? "New Purchase Invoice" :
               tab === "quotation" ? "New Quotation" : tab === "credit_note" ? "Credit Note" : "Debit Note"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Party Name</Label>
              <Input className="mt-1" placeholder="Party ka naam..."
                value={form.partyName}
                onChange={e => { updateForm({ partyName: e.target.value, partyId: null }); setPartySearch(e.target.value); }} />
              {partySearch && filteredParties.length > 0 && (
                <div className="border rounded-md bg-background shadow-sm mt-1 max-h-36 overflow-y-auto z-10">
                  {filteredParties.map(p => (
                    <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => { updateForm({ partyName: p.name, partyId: p.id, partyGstin: p.gstin || "" }); setPartySearch(""); }}>
                      {p.name} {p.gstin ? <span className="text-xs text-muted-foreground ml-2">{p.gstin}</span> : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GSTIN (Party)</Label>
                <Input className="mt-1 font-mono text-sm" placeholder="22AAAAA0000A1Z5"
                  value={form.partyGstin} onChange={e => updateForm({ partyGstin: e.target.value })} />
              </div>
              <div>
                <Label>{tab === "quotation" ? "Quotation Date" : "Invoice Date"}</Label>
                <Input className="mt-1" type="date" value={form.invoiceDate}
                  onChange={e => updateForm({ invoiceDate: e.target.value })} />
              </div>
              <div>
                <Label>{tab === "quotation" ? "Valid Until" : "Due Date"}</Label>
                <Input className="mt-1" type="date" value={form.dueDate}
                  onChange={e => updateForm({ dueDate: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="interstate" checked={form.isInterState}
                  onChange={e => updateForm({ isInterState: e.target.checked })} />
                <Label htmlFor="interstate" className="cursor-pointer text-sm">Inter-State (IGST)</Label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Items</Label>
                <div className="flex gap-2 flex-wrap">
                  {items?.items.slice(0, 3).map(it => (
                    <Button key={it.id} variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => addLineFromItem(it)}>
                      + {it.name.slice(0, 12)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-muted text-xs font-medium text-muted-foreground">
                  <div className="col-span-4">Item</div><div className="col-span-1">Qty</div>
                  <div className="col-span-2">Rate</div><div className="col-span-1 text-center">GST%</div>
                  <div className="col-span-2 text-right">Total</div><div className="col-span-2" />
                </div>
                {form.items.map((line: LineItem, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 px-3 py-1.5 border-t items-center">
                    <div className="col-span-4">
                      <Input className="h-7 text-xs" placeholder="Item name" value={line.name}
                        onChange={e => updateLine(idx, "name", e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      <Input className="h-7 text-xs text-center" type="number" min="0" value={line.qty}
                        onChange={e => updateLine(idx, "qty", Number(e.target.value))} />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-7 text-xs" type="number" min="0" value={line.rate}
                        onChange={e => updateLine(idx, "rate", Number(e.target.value))} />
                    </div>
                    <div className="col-span-1">
                      <Select value={String(line.gstRate)} onValueChange={v => updateLine(idx, "gstRate", Number(v))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)} className="text-xs">{r}%</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 text-right text-xs font-medium">{formatCurrency(line.lineTotal)}</div>
                    <div className="col-span-2 flex justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        const lines = form.items.filter((_: LineItem, i: number) => i !== idx);
                        updateForm({ items: lines.length ? lines : [emptyLine()] });
                      }}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" className="mt-2 gap-1"
                onClick={() => updateForm({ items: [...form.items, emptyLine()] })}>
                <Plus className="h-3.5 w-3.5" /> Add Line
              </Button>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (taxable)</span><span>{formatCurrency(subtotal)}</span></div>
              {!form.isInterState ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{formatCurrency(cgstTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{formatCurrency(sgstTotal)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{formatCurrency(igstTotal)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-1.5">
                <span>Grand Total</span><span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div>
              <Label>Notes / Terms</Label>
              <Textarea className="mt-1" rows={2} placeholder="Terms, remarks..." value={form.notes}
                onChange={e => updateForm({ notes: e.target.value })} />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"
                onClick={() => { saveDraft(form); setNewOpen(false); toast({ title: "Draft saved!" }); }}>
                Save Draft
              </Button>
              <Button className="flex-1"
                disabled={createMutation.isPending || !form.items.some((i: LineItem) => i.name)}
                onClick={() => createMutation.mutate(form)}>
                {createMutation.isPending ? "Creating..." : tab === "quotation" ? "Create Quotation" : "Create Invoice"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printInvoice} onOpenChange={() => setPrintInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <DialogTitle>
                {printInvoice?.invoiceType === "quotation" ? "Quotation Preview" : "Invoice Preview"}
              </DialogTitle>
              <div className="flex gap-2">
                {printInvoice && (
                  <a
                    href={`https://wa.me/?text=${whatsappText(printInvoice, business?.businessName || "")}`}
                    target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                      <Share2 className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </div>
            </div>
          </DialogHeader>
          {printInvoice && (
            <div ref={printRef} className="border rounded-lg p-6 space-y-4 print:shadow-none print:border-none" id="invoice-print">
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <p className="text-lg font-bold">{business?.businessName}</p>
                  <p className="text-xs text-muted-foreground">{business?.city}{business?.state ? `, ${business.state}` : ""}</p>
                  {business?.gstin && <p className="text-xs font-mono text-muted-foreground">GSTIN: {business.gstin}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    {printInvoice.invoiceType === "sale" ? "Tax Invoice"
                      : printInvoice.invoiceType === "quotation" ? "Quotation"
                      : printInvoice.invoiceType === "purchase" ? "Purchase Invoice"
                      : printInvoice.invoiceType.replace(/_/g, " ")}
                  </p>
                  <p className="text-base font-bold font-mono mt-1">{printInvoice.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(printInvoice.invoiceDate)}</p>
                  {printInvoice.dueDate && (
                    <p className="text-xs text-muted-foreground">
                      {printInvoice.invoiceType === "quotation" ? "Valid till" : "Due"}: {formatDate(printInvoice.dueDate)}
                    </p>
                  )}
                </div>
              </div>

              {printInvoice.partyName && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">
                      {printInvoice.invoiceType === "purchase" ? "Supplier" : "Bill To"}
                    </p>
                    <p className="font-semibold">{printInvoice.partyName}</p>
                    {printInvoice.partyGstin && <p className="text-xs font-mono text-muted-foreground">GSTIN: {printInvoice.partyGstin}</p>}
                    {printInvoice.partyAddress && <p className="text-xs text-muted-foreground">{printInvoice.partyAddress}</p>}
                  </div>
                  <div>
                    {printInvoice.isInterState && (
                      <p className="text-xs text-muted-foreground mt-1">Supply Type: <span className="font-medium">Inter-State</span></p>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Item</th>
                      <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">HSN</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Qty</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Rate</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Taxable</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">GST</th>
                      <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printInvoice.items.map((it, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 px-2 font-medium">{it.name}<br /><span className="text-xs text-muted-foreground">{it.unit}</span></td>
                        <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{it.hsn || "—"}</td>
                        <td className="py-2 px-2 text-right">{it.qty}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(it.rate)}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(it.amount)}</td>
                        <td className="py-2 px-2 text-right text-xs">
                          {it.gstRate}%<br />
                          <span className="text-muted-foreground">{formatCurrency(it.cgst + it.sgst + it.igst)}</span>
                        </td>
                        <td className="py-2 px-2 text-right font-semibold">{formatCurrency(it.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-60 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxable Amount</span><span>{formatCurrency(printInvoice.subtotal)}</span></div>
                  {printInvoice.cgstTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>{formatCurrency(printInvoice.cgstTotal)}</span></div>}
                  {printInvoice.sgstTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>{formatCurrency(printInvoice.sgstTotal)}</span></div>}
                  {printInvoice.igstTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>{formatCurrency(printInvoice.igstTotal)}</span></div>}
                  <div className="flex justify-between font-bold text-base border-t pt-1.5">
                    <span>Total</span><span>{formatCurrency(printInvoice.total)}</span>
                  </div>
                  {printInvoice.balanceDue > 0 && (
                    <div className="flex justify-between text-red-600 font-medium">
                      <span>Balance Due</span><span>{formatCurrency(printInvoice.balanceDue)}</span>
                    </div>
                  )}
                  {printInvoice.status === "paid" && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Status</span><span>✅ PAID</span>
                    </div>
                  )}
                </div>
              </div>

                  {printInvoice.notes && (
                <div className="border-t pt-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Notes / Terms</p>
                  <p>{printInvoice.notes}</p>
                </div>
              )}
              {business && "upiId" in business && typeof business.upiId === "string" && business.upiId && (
                <div className="border-t pt-3 text-xs">
                  <p className="text-muted-foreground">UPI Payment: <span className="font-mono font-medium text-foreground">{business.upiId}</span></p>
                </div>
              )}
              {printInvoice.status !== "paid" && printInvoice.balanceDue > 0 && (
                <div className="border-t pt-3 flex gap-2">
                  <Button className="flex-1" onClick={() => {
                    setPrintInvoice(null);
                    setPaymentInvoice(printInvoice);
                    setPaymentAmount(String(printInvoice.balanceDue));
                    setPaymentDate(new Date().toISOString().split("T")[0]);
                    setPaymentNote("");
                    setPaymentOpen(true);
                  }}>
                    Record Payment
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
