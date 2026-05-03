import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type Step = "mobile" | "otp";

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar to-sidebar/80 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4 shadow-lg">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <h1 className="text-3xl font-bold text-white">ParchiFlow</h1>
          <p className="text-white/70 mt-1 text-sm">Smart Ledger for Indian SMEs</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {step === "mobile" ? "Apna Mobile Number Dalein" : "OTP Enter Karein"}
            </CardTitle>
            <CardDescription>
              {step === "mobile"
                ? "Login ya signup ke liye apna mobile number dalein"
                : `OTP ${mobile} pe bheja gaya hai`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary">Demo-ready</Badge>
              <Badge variant="secondary">Quick login</Badge>
              <Badge variant="secondary">Upgrade-safe auth</Badge>
            </div>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Demo login: Mobile <strong>9876543210</strong> · OTP <strong>123456</strong>
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
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setMobile("9876543210")}>
                      Fill demo mobile
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMobile("9876543210");
                        setStep("otp");
                        setOtp("123456");
                      }}
                    >
                      Quick demo login
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || mobile.length < 10}>
                  {isLoading ? "Bhej rahe hain..." : "OTP Bhejein"}
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
                  <p className="text-xs text-muted-foreground mt-1.5">Demo ke liye: 123456</p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => setOtp("123456")}>
                  Fill demo OTP
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

        <p className="text-center text-white/50 text-xs mt-6">
          Indian SMEs ka trusted ledger platform
        </p>
      </div>
    </div>
  );
}
