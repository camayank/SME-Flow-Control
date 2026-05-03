import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { apiUrl, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Building2, Plus, CheckCircle } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "retail", label: "Retail Shop" },
  { value: "wholesale", label: "Wholesale" },
  { value: "pharma", label: "Medical / Pharma" },
  { value: "textile", label: "Textile / Kapda" },
  { value: "electronics", label: "Electronics" },
  { value: "grocery", label: "Kirana / Grocery" },
  { value: "manufacturer", label: "Manufacturing" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
];

interface Business {
  id: number;
  businessName: string;
  businessType: string;
  city: string | null;
  state: string | null;
  gstin: string | null;
  upiId: string | null;
  preferredLanguage: string;
  existingSystem: string | null;
  createdAt: string;
}

const emptyForm = () => ({
  businessName: "", businessType: "retail", city: "", state: "",
  gstin: "", upiId: "", preferredLanguage: "hinglish", existingSystem: "none",
});

function BusinessForm({
  initial, onSubmit, isLoading, submitLabel = "Save Changes",
}: {
  initial: ReturnType<typeof emptyForm>;
  onSubmit: (data: ReturnType<typeof emptyForm>) => void;
  isLoading: boolean;
  submitLabel?: string;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <Label>Business Name *</Label>
        <Input className="mt-1" placeholder="e.g. Sharma Trading Co." value={form.businessName} onChange={e => set("businessName", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Business Type</Label>
          <Select value={form.businessType} onValueChange={v => set("businessType", v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{BUSINESS_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Language</Label>
          <Select value={form.preferredLanguage} onValueChange={v => set("preferredLanguage", v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hinglish">Hinglish</SelectItem>
              <SelectItem value="hindi">Hindi</SelectItem>
              <SelectItem value="english">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>City</Label><Input className="mt-1" placeholder="Delhi, Mumbai..." value={form.city} onChange={e => set("city", e.target.value)} /></div>
        <div><Label>State</Label><Input className="mt-1" placeholder="UP, Maharashtra..." value={form.state} onChange={e => set("state", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>GSTIN</Label><Input className="mt-1 font-mono text-sm" placeholder="07AAAAA0000A1Z5" value={form.gstin} onChange={e => set("gstin", e.target.value.toUpperCase())} /></div>
        <div><Label>UPI ID</Label><Input className="mt-1" placeholder="business@upi" value={form.upiId} onChange={e => set("upiId", e.target.value)} /></div>
      </div>
      <Button className="w-full" disabled={isLoading || !form.businessName.trim()} onClick={() => onSubmit(form)}>
        {isLoading ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const token = getAuthToken();
  const { business, setBusiness } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: bizData, isLoading } = useQuery<{ business: Business; businesses: Business[] }>({
    queryKey: [apiUrl("/business")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyForm> & { businessId?: number }) => {
      const res = await fetch(apiUrl("/business"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (biz) => {
      setBusiness(biz);
      qc.invalidateQueries({ queryKey: [apiUrl("/business")] });
      toast({ title: "Business updated!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof emptyForm>) => {
      const res = await fetch(apiUrl("/business/new"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: (biz) => {
      qc.invalidateQueries({ queryKey: [apiUrl("/business")] });
      toast({ title: `${biz.businessName} added!`, description: "Switch to it from the sidebar." });
      setAddOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const currentBiz = bizData?.business;
  const allBusinesses = bizData?.businesses || [];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Settings className="h-5 w-5" />Settings</h1>
          <p className="text-sm text-muted-foreground">Business profile aur app settings</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Business
        </Button>
      </div>

      {allBusinesses.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />All Businesses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {allBusinesses.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.businessName}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.city || "India"} · {b.businessType}</p>
                  </div>
                  {b.gstin && <Badge variant="outline" className="font-mono text-xs">{b.gstin}</Badge>}
                  {business?.id === b.id && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />Edit Business Profile</CardTitle>
          <CardDescription>GST number, city, UPI — sab update kar sakte hain</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : currentBiz ? (
            <BusinessForm
              initial={{
                businessName: currentBiz.businessName,
                businessType: currentBiz.businessType,
                city: currentBiz.city || "",
                state: currentBiz.state || "",
                gstin: currentBiz.gstin || "",
                upiId: currentBiz.upiId || "",
                preferredLanguage: currentBiz.preferredLanguage,
                existingSystem: currentBiz.existingSystem || "none",
              }}
              onSubmit={(data) => editMutation.mutate({ ...data, businessId: currentBiz.id })}
              isLoading={editMutation.isPending}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Business Add Karein</DialogTitle></DialogHeader>
          <BusinessForm
            initial={emptyForm()}
            onSubmit={(data) => addMutation.mutate(data)}
            isLoading={addMutation.isPending}
            submitLabel="Create Business"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
