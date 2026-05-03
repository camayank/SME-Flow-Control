import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiPost, apiUrl, formatCurrency, getAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Phone, MessageCircle, User, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface Party {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  gstin: string | null;
  type: string;
  city: string | null;
  currentBalance: number;
  balanceType: string;
  createdAt: string;
}

export default function PartiesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", mobile: "", email: "", gstin: "", type: "customer", city: "", openingBalance: "", openingBalanceType: "none" });
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: [apiUrl("/parties"), search, typeFilter],
    enabled: !!token,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`${apiUrl("/parties")}?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleAddParty = async () => {
    if (!addForm.name.trim()) { toast({ title: "Error", description: "Name required", variant: "destructive" }); return; }
    setIsSaving(true);
    try {
      await apiPost("/parties", {
        ...addForm,
        openingBalance: parseFloat(addForm.openingBalance) || 0,
      });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/parties")] });
      setShowAddDialog(false);
      setAddForm({ name: "", mobile: "", email: "", gstin: "", type: "customer", city: "", openingBalance: "", openingBalanceType: "none" });
      toast({ title: "Party add ho gayi!" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getBalanceBadge = (party: Party) => {
    if (party.currentBalance <= 0) return null;
    const isReceivable = party.balanceType === "receivable";
    return (
      <Badge variant={isReceivable ? "default" : "secondary"} className={isReceivable ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-blue-100 text-blue-700 hover:bg-blue-100"}>
        {isReceivable ? "Lena: " : "Dena: "}{formatCurrency(party.currentBalance)}
      </Badge>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Parties</h1>
          <p className="text-sm text-muted-foreground">{parties.length} parties registered</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/collections">Collections</Link></Button>
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Party
          </Button>
        </div>
      </div>

      <Card className="border-dashed border-primary/25 bg-primary/5">
        <CardContent className="py-3 text-sm">
          Future upgrade: party timeline, credit limits, KYC docs, and automated follow-up history can sit here cleanly.
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Party naam se search karein..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="vendor">Vendors</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Party list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : !parties.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Koi party nahi mili</p>
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1.5" />Pehli Party Add Karein
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {parties.map(party => (
            <Link key={party.id} href={`/parties/${party.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    party.type === "customer" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                  }`}>
                    {party.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{party.name}</p>
                      <Badge variant="outline" className="text-xs flex-shrink-0">{party.type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {party.mobile && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />{party.mobile}
                        </span>
                      )}
                      {party.city && <span className="text-xs text-muted-foreground">📍 {party.city}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getBalanceBadge(party)}
                    {party.mobile && (
                      <a
                        href={`https://wa.me/91${party.mobile.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-emerald-50 rounded-md text-emerald-600 transition-colors"
                        onClick={e => e.stopPropagation()}
                        title="WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Add Party Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Naya Party Add Karein</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Party Naam *</Label>
                <Input className="mt-1.5" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sharma Trading Co." autoFocus />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={addForm.type} onValueChange={v => setAddForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="vendor">Vendor / Supplier</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mobile</Label>
                <Input className="mt-1.5" value={addForm.mobile} onChange={e => setAddForm(f => ({ ...f, mobile: e.target.value }))} placeholder="9876543210" />
              </div>
              <div>
                <Label>City</Label>
                <Input className="mt-1.5" value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} placeholder="Delhi..." />
              </div>
              <div>
                <Label>GSTIN (optional)</Label>
                <Input className="mt-1.5" value={addForm.gstin} onChange={e => setAddForm(f => ({ ...f, gstin: e.target.value }))} placeholder="07AAAAA..." />
              </div>
              <div>
                <Label>Opening Balance</Label>
                <Input type="number" className="mt-1.5" value={addForm.openingBalance} onChange={e => setAddForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Balance Type</Label>
                <Select value={addForm.openingBalanceType} onValueChange={v => setAddForm(f => ({ ...f, openingBalanceType: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="receivable">Receivable (Lena Hai)</SelectItem>
                    <SelectItem value="payable">Payable (Dena Hai)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddParty} disabled={isSaving}>{isSaving ? "Saving..." : "Party Add Karein"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
