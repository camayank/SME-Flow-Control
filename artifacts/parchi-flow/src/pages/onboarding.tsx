import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

const EXISTING_SYSTEMS = [
  { value: "none", label: "Koi nahi / Manual" },
  { value: "tally", label: "Tally" },
  { value: "busy", label: "BUSY" },
  { value: "marg", label: "Marg ERP" },
  { value: "excel", label: "Excel / CSV" },
  { value: "other", label: "Other Software" },
];

export default function OnboardingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessType: "retail",
    city: "",
    state: "",
    gstin: "",
    upiId: "",
    preferredLanguage: "hinglish",
    existingSystem: "none",
  });

  const { setBusiness } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName.trim()) {
      toast({ title: "Error", description: "Business name required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const biz = await apiPost<{
        id: number; businessName: string; businessType: string;
        city: string | null; state: string | null; preferredLanguage: string;
      }>("/business", form);
      setBusiness(biz as Parameters<typeof setBusiness>[0]);
      toast({ title: "Business setup ho gaya!", description: "ParchiFlow shuru karte hain" });
      navigate("/");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Setup failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar to-sidebar/80 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Business Setup</h1>
          <p className="text-white/70 text-sm mt-1">Apna business setup karein — sirf 1 baar!</p>
        </div>
        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle>Business ki Jaankari</CardTitle>
            <CardDescription>Ye jaankari aapke ledger aur reminders ke liye use hogi</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Business ka Naam *</Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. Sharma Trading Co."
                  value={form.businessName}
                  onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Business Type</Label>
                  <Select value={form.businessType} onValueChange={v => setForm(f => ({ ...f, businessType: v }))}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Language</Label>
                  <Select value={form.preferredLanguage} onValueChange={v => setForm(f => ({ ...f, preferredLanguage: v }))}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hinglish">Hinglish</SelectItem>
                      <SelectItem value="hindi">Hindi</SelectItem>
                      <SelectItem value="english">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>City</Label>
                  <Input className="mt-1.5" placeholder="Delhi, Mumbai..." value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input className="mt-1.5" placeholder="UP, Maharashtra..." value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>GSTIN (optional)</Label>
                  <Input className="mt-1.5" placeholder="07AAAAA0000A1Z5" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
                </div>
                <div>
                  <Label>UPI ID (optional)</Label>
                  <Input className="mt-1.5" placeholder="business@upi" value={form.upiId} onChange={e => setForm(f => ({ ...f, upiId: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Current Accounting System</Label>
                <Select value={form.existingSystem} onValueChange={v => setForm(f => ({ ...f, existingSystem: v }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXISTING_SYSTEMS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? "Setup ho raha hai..." : "ParchiFlow Shuru Karein →"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
