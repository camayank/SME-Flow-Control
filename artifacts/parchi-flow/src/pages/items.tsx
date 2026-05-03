import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl, apiPost, apiPut, apiDelete, getAuthToken, formatCurrency } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Package, AlertTriangle, Search, Pencil, Trash2, ArrowUpDown, BarChart2 } from "lucide-react";

interface Item {
  id: number;
  name: string;
  description: string | null;
  hsn: string | null;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  gstRate: number;
  stockQty: number;
  reorderLevel: number;
  trackInventory: boolean;
  isActive: boolean;
  barcode: string | null;
  category: string | null;
  isLowStock: boolean;
}

const UNITS = ["pcs", "kg", "g", "litre", "ml", "meter", "feet", "box", "bag", "dozen", "set"];
const GST_RATES = [0, 5, 12, 18, 28];

const emptyForm = {
  name: "", description: "", hsn: "", unit: "pcs",
  salePrice: "", purchasePrice: "", gstRate: "18",
  stockQty: "0", reorderLevel: "0", trackInventory: false,
  barcode: "", category: "",
};

export default function ItemsPage() {
  const token = getAuthToken();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const { data, isLoading } = useQuery<{ items: Item[]; lowStockCount: number }>({
    queryKey: [apiUrl("/items")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/items"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const body = {
        ...payload,
        salePrice: parseFloat(payload.salePrice) || 0,
        purchasePrice: parseFloat(payload.purchasePrice) || 0,
        gstRate: parseFloat(payload.gstRate) || 18,
        stockQty: parseFloat(payload.stockQty) || 0,
        reorderLevel: parseFloat(payload.reorderLevel) || 0,
      };
      if (editItem) return apiPut(`/items/${editItem.id}`, body);
      return apiPost("/items", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl("/items")] });
      toast({ title: editItem ? "Item updated!" : "Item added!" });
      setDialogOpen(false);
      setEditItem(null);
      setForm({ ...emptyForm });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl("/items")] });
      toast({ title: "Item removed" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, adj, reason }: { id: number; adj: string; reason: string }) =>
      apiPost(`/items/${id}/adjust-stock`, { adjustment: parseFloat(adj), reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiUrl("/items")] });
      toast({ title: "Stock adjusted!" });
      setAdjustId(null);
      setAdjustment("");
      setAdjustReason("");
    },
  });

  const openAdd = () => { setEditItem(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: Item) => {
    setEditItem(item);
    setForm({
      name: item.name, description: item.description || "", hsn: item.hsn || "",
      unit: item.unit, salePrice: item.salePrice.toString(), purchasePrice: item.purchasePrice.toString(),
      gstRate: item.gstRate.toString(), stockQty: item.stockQty.toString(),
      reorderLevel: item.reorderLevel.toString(), trackInventory: item.trackInventory,
      barcode: item.barcode || "", category: item.category || "",
    });
    setDialogOpen(true);
  };

  const filtered = (data?.items || []).filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.hsn && i.hsn.includes(search)) || (i.barcode && i.barcode.includes(search))
  );

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5" /> Item Master
          </h1>
          <p className="text-sm text-muted-foreground">Products, services, HSN codes, aur stock</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold mt-1">{data?.items.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Low Stock</p>
            <p className={`text-2xl font-bold mt-1 ${(data?.lowStockCount || 0) > 0 ? "text-amber-600" : ""}`}>{data?.lowStockCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Inventory Value</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency((data?.items || []).reduce((s, i) => s + i.stockQty * i.salePrice, 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Item naam, HSN, ya barcode search karein..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Low stock alert */}
      {(data?.lowStockCount || 0) > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span><strong>{data!.lowStockCount}</strong> items have low stock — reorder level crossed</span>
        </div>
      )}

      {/* Item list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
      ) : !filtered.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{search ? "Koi item nahi mila" : "Abhi koi item nahi hai"}</p>
            {!search && <Button onClick={openAdd} size="sm">Pehla Item Add Karein</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className={item.isLowStock ? "border-amber-200" : ""}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{item.name}</p>
                    {item.hsn && <Badge variant="outline" className="text-xs font-mono">HSN {item.hsn}</Badge>}
                    {item.isLowStock && <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50"><AlertTriangle className="h-3 w-3 mr-1" />Low Stock</Badge>}
                    {item.category && <Badge variant="secondary" className="text-xs">{item.category}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Sell: <span className="font-medium text-foreground">{formatCurrency(item.salePrice)}</span></span>
                    <span>Buy: <span className="font-medium">{formatCurrency(item.purchasePrice)}</span></span>
                    <span>GST: <span className="font-medium">{item.gstRate}%</span></span>
                    <span>Unit: {item.unit}</span>
                    {item.trackInventory && <span>Stock: <span className={`font-medium ${item.isLowStock ? "text-amber-600" : "text-foreground"}`}>{item.stockQty}</span> / {item.reorderLevel} reorder</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.trackInventory && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Adjust Stock" onClick={() => setAdjustId(item.id)}>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Item" : "Naya Item Add Karein"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Item Name *</Label>
                <Input className="mt-1" placeholder="e.g. Rice Basmati 5kg" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>HSN Code</Label>
                <Input className="mt-1 font-mono" placeholder="e.g. 1006" value={form.hsn} onChange={e => setForm(f => ({ ...f, hsn: e.target.value }))} />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sale Price (₹)</Label>
                <Input className="mt-1" type="number" placeholder="0" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} />
              </div>
              <div>
                <Label>Purchase Price (₹)</Label>
                <Input className="mt-1" type="number" placeholder="0" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
              </div>
              <div>
                <Label>GST Rate (%)</Label>
                <Select value={form.gstRate} onValueChange={v => setForm(f => ({ ...f, gstRate: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Input className="mt-1" placeholder="e.g. Grocery" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
              <div>
                <Label>Barcode</Label>
                <Input className="mt-1 font-mono" placeholder="Scan or type" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="trackInv" checked={form.trackInventory}
                  onChange={e => setForm(f => ({ ...f, trackInventory: e.target.checked }))} className="rounded" />
                <Label htmlFor="trackInv" className="cursor-pointer">Track Inventory</Label>
              </div>
              {form.trackInventory && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Current Stock</Label>
                    <Input className="mt-1" type="number" placeholder="0" value={form.stockQty} onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Reorder Level</Label>
                    <Input className="mt-1" type="number" placeholder="0" value={form.reorderLevel} onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" disabled={saveMutation.isPending || !form.name} onClick={() => saveMutation.mutate(form)}>
                {saveMutation.isPending ? "Saving..." : editItem ? "Update" : "Add Item"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Adjust Dialog */}
      <Dialog open={adjustId !== null} onOpenChange={() => setAdjustId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Adjustment (+/-)</Label>
              <Input className="mt-1" type="number" placeholder="e.g. +10 ya -5" value={adjustment} onChange={e => setAdjustment(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Positive for addition, negative for removal</p>
            </div>
            <div>
              <Label>Reason</Label>
              <Input className="mt-1" placeholder="e.g. Purchase received" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAdjustId(null)}>Cancel</Button>
              <Button className="flex-1" disabled={!adjustment || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate({ id: adjustId!, adj: adjustment, reason: adjustReason })}>
                {adjustMutation.isPending ? "Saving..." : "Adjust"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
