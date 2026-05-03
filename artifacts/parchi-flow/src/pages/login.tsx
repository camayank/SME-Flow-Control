import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

type Step = "mobile" | "otp";

const VALUE_PROPS = [
  "Tally, Marg, BUSY se real-time sync",
  "Virtual CFO — on-demand business overview",
  "Collections aur follow-ups ek jagah",
  "GST invoice, ledger, aur aging report",
];

export default function LoginPage() {
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(mobile.replace(/\s/g, ""))) {
      toast({ title: "Invalid Mobile", description: "Please enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiPost("/auth/send-otp", { mobile });
      setStep("otp");
      toast({ title: "OTP Sent", description: "Use 123456 for demo" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to send OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await apiPost<{ token: string; user: { id: number; name: string | null; mobile: string; email: string | null }; hasBusiness: boolean }>(
        "/auth/verify-otp", { mobile, otp }
      );
      login(res.token, res.user, res.hasBusiness);
      navigate(res.hasBusiness ? "/" : "/onboarding");
    } catch (err: unknown) {
      toast({ title: "Invalid OTP", description: err instanceof Error ? err.message : "Wrong OTP", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-sidebar to-sidebar/80">
      <div className="hidden lg:flex flex-col justify-center px-12 w-1/2 text-white">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-lg">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">ParchiFlow</h2>
            <p className="text-white/60 text-sm">Virtual CFO for Indian SMEs</p>
          </div>
        </div>
        <h1 className="text-3xl font-bold leading-tight mb-4">
          Tally, Marg, BUSY ka<br />data — smart decisions mein badlein
        </h1>
        <p className="text-white/70 text-base mb-8 leading-relaxed">
          Complex BI tools ki zaroorat nahi. ParchiFlow aapke existing accounting data ko real syncing, clear overview, aur on-demand virtual CFO insights mein badalta hai.
        </p>
        <div className="space-y-3">
          {VALUE_PROPS.map(prop => (
            <div key={prop} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-accent/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-3.5 w-3.5 text-accent-foreground" />
              </div>
              <span className="text-white/80 text-sm">{prop}</span>
            </div>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-4 text-white/40 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Tally Prime
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
            BUSY Accounting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            Marg ERP 9+
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-center items-center w-full lg:w-1/2 p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6 lg:hidden">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent mb-3 shadow-lg">
              <span className="text-xl font-bold text-white">P</span>
            </div>
            <h1 className="text-2xl font-bold text-white">ParchiFlow</h1>
            <p className="text-white/60 text-sm mt-1">Virtual CFO for Indian SMEs</p>
          </div>

          <Card className="shadow-2xl border-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">
                {step === "mobile" ? "Login karein" : "OTP Enter Karein"}
              </CardTitle>
              <CardDescription>
                {step === "mobile"
                  ? "Mobile number se quick login — koi password nahi"
                  : `OTP ${mobile} pe bheja gaya hai`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Demo: Mobile <strong>9876543210</strong> · OTP <strong>123456</strong>
              </div>

              {step === "mobile" ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <Label htmlFor="mobile">Mobile Number</Label>
                    <div className="flex mt-1.5">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+91</span>
                      <Input
                        id="mobile"
                        type="tel"
                        placeholder="9876543210"
                        value={mobile}
                        onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="rounded-l-none"
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading || mobile.length < 10}>
                    {isLoading ? "Bhej rahe hain..." : "OTP Bhejein"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => { setMobile("9876543210"); setStep("otp"); setOtp("123456"); }}
                  >
                    Quick Demo Login
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <Label htmlFor="otp">6-Digit OTP</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      placeholder="123456"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="mt-1.5 text-center text-xl tracking-widest font-mono"
                      required
                      autoFocus
                      maxLength={6}
                    />
                  </div>
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOtp("123456")}>
                    Fill Demo OTP (123456)
                  </Button>
                  <Button type="submit" className="w-full" disabled={isLoading || otp.length < 6}>
                    {isLoading ? "Verify ho raha hai..." : "Login Karein"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("mobile"); setOtp(""); }}>
                    ← Wapas Jaein
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-center gap-3 mt-6 lg:hidden">
            {["Tally Sync", "BUSY Sync", "Marg Sync", "Virtual CFO"].map(tag => (
              <span key={tag} className="text-xs text-white/50 border border-white/20 rounded-full px-2.5 py-1">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
