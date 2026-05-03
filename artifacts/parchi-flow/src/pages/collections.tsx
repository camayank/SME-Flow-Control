import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiPost, apiUrl, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Phone, Copy, ExternalLink, Clock, CheckCircle,
  Plus, AlertTriangle, TrendingUp, IndianRupee, Zap,
} from "lucide-react";

interface Outstanding {
  id: number;
  partyId: number;
  partyName: string | null;
  partyMobile: string | null;
  amountDue: number;
  agingDays: number;
  agingBucket: string;
  priority: string;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
}

interface ReminderResult {
  message: string;
  whatsappUrl: string | null;
  channel: string;
  templateType: string;
  partyName: string;
  amount: number;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-l-red-600",
  high: "border-l-orange-500",
  medium: "border-l-amber-500",
  low: "border-l-slate-300",
};
const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function CollectionsPage() {
  const [, navigate] = useLocation();
  const [selectedOutstanding, setSelectedOutstanding] = useState<Outstanding | null>(null);
  const [reminderDialog, setReminderDialog] = useState(false);
  const [templateType, setTemplateType] = useState("soft");
  const [language, setLanguage] = useState("hinglish");
  const [generatedReminder, setGeneratedReminder] = useState<ReminderResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: outstandings = [] } = useQuery<Outstanding[]>({
    queryKey: [apiUrl("/outstandings"), "open"],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${apiUrl("/outstandings")}?status=open`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sorted = [...outstandings].sort((a, b) =>
    (PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 3) -
    (PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 3)
  );

  const totalDue = sorted.reduce((s, o) => s + o.amountDue, 0);
  const criticalCount = sorted.filter(o => o.priority === "critical" || o.priority === "high").length;
  const neverFollowedUp = sorted.filter(o => !o.lastFollowUpAt).length;
  const overdueCount = sorted.filter(o => o.agingDays > 0).length;

  const topParty = sorted[0];
  const top3Amount = sorted.slice(0, 3).reduce((s, o) => s + o.amountDue, 0);
  const top3Pct = totalDue > 0 ? Math.round((top3Amount / totalDue) * 100) : 0;

  const handleGenerateReminder = async (o: Outstanding) => {
    setSelectedOutstanding(o);
    setGeneratedReminder(null);
    setReminderDialog(true);
    setIsGenerating(true);
    try {
      const result = await apiPost<ReminderResult>("/follow-ups/generate-reminder", {
        partyId: o.partyId,
        outstandingId: o.id,
        templateType,
        language,
      });
      setGeneratedReminder(result);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendAndLog = async () => {
    if (!selectedOutstanding) return;
    try {
      await apiPost("/follow-ups", {
        partyId: selectedOutstanding.partyId,
        outstandingId: selectedOutstanding.id,
        followUpType: "whatsapp",
        note: followUpNote || generatedReminder?.message,
      });
      if (generatedReminder?.message) {
        await apiPost("/follow-ups/log-reminder", {
          partyId: selectedOutstanding.partyId,
          outstandingId: selectedOutstanding.id,
          channel: "whatsapp_click_to_chat",
          message: generatedReminder.message,
          sentStatus: "sent",
        });
      }
      queryClient.invalidateQueries({ queryKey: [apiUrl("/outstandings")] });
      toast({ title: "Follow-up logged!", description: "Collection CRM mein add ho gaya" });
      setReminderDialog(false);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const copyMessage = async () => {
    if (generatedReminder?.message) {
      await navigator.clipboard.writeText(generatedReminder.message);
      toast({ title: "Copied!", description: "Message clipboard mein copy ho gaya" });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Collection CRM</h1>
          <p className="text-sm text-muted-foreground">Priority-wise follow-up, WhatsApp reminder, aur collection tracking</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/follow-ups">Follow-up Hub</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-red-100">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Critical / High</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{sorted.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Pending</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{neverFollowedUp}</p>
            <p className="text-xs text-muted-foreground mt-0.5">No Follow-up Yet</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-100">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalDue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Due</p>
          </CardContent>
        </Card>
      </div>

      {sorted.length > 0 && (
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">CFO View</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 text-xs text-muted-foreground">
              {top3Pct > 0 && (
                <span>📊 Top 3 parties = <strong className="text-foreground">{top3Pct}%</strong> of total due ({formatCurrency(top3Amount)})</span>
              )}
              {topParty && (
                <span>🎯 Highest: <strong className="text-foreground">{topParty.partyName}</strong> — {formatCurrency(topParty.amountDue)}</span>
              )}
              {overdueCount > 0 && (
                <span>⏰ <strong className="text-foreground">{overdueCount}</strong> parties overdue — call first, WhatsApp second</span>
              )}
              {neverFollowedUp > 0 && (
                <span>💡 <strong className="text-foreground">{neverFollowedUp}</strong> parties never followed up — start there</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!sorted.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-emerald-500/30 mb-3" />
            <p className="text-muted-foreground">Sab clear! Koi outstanding nahi hai 🎉</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/parchi">Add Parchi</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/parties">Add Party</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(o => (
            <Card key={o.id} className={`border-l-4 ${PRIORITY_COLORS[o.priority] || "border-l-slate-300"}`}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="font-medium text-sm hover:text-primary hover:underline text-left"
                      onClick={() => navigate(`/parties/${o.partyId}`)}
                    >
                      {o.partyName || "Unknown"}
                    </button>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[o.priority] || "bg-slate-100 text-slate-600"}`}>
                      {o.priority}
                    </span>
                    {o.agingDays > 0 && (
                      <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                        {o.agingDays}d overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {o.partyMobile && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />{o.partyMobile}
                      </span>
                    )}
                    {o.lastFollowUpAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />Last: {formatDate(o.lastFollowUpAt)}
                      </span>
                    )}
                    {!o.lastFollowUpAt && (
                      <span className="text-xs text-amber-600 font-medium">No follow-up yet</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-sm font-bold text-red-600">{formatCurrency(o.amountDue)}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => handleGenerateReminder(o)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Remind
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reminderDialog} onOpenChange={setReminderDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              WhatsApp Reminder
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">{selectedOutstanding?.partyName}</p>
                <p className="text-xs text-muted-foreground">
                  Due: {selectedOutstanding && formatCurrency(selectedOutstanding.amountDue)}
                  {selectedOutstanding?.agingDays ? ` · ${selectedOutstanding.agingDays}d overdue` : ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tone</Label>
                <Select value={templateType} onValueChange={setTemplateType}>
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Soft (Polite)</SelectItem>
                    <SelectItem value="firm">Firm</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-1 h-8">
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

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => selectedOutstanding && handleGenerateReminder(selectedOutstanding)}
              disabled={isGenerating}
            >
              {isGenerating ? "Generate ho raha hai..." : "🔄 Regenerate Message"}
            </Button>

            {generatedReminder && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Generated Message:</Label>
                <div className="relative">
                  <Textarea
                    value={generatedReminder.message}
                    readOnly
                    className="min-h-24 text-sm bg-emerald-50/50 border-emerald-200 pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={copyMessage}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Follow-up Note (optional)</Label>
              <Input
                className="mt-1 h-8 text-sm"
                placeholder="Koi additional note..."
                value={followUpNote}
                onChange={e => setFollowUpNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={copyMessage} disabled={!generatedReminder?.message} className="gap-1.5">
              <Copy className="h-4 w-4" />Copy
            </Button>
            {generatedReminder?.whatsappUrl && (
              <Button asChild variant="default" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 flex-1">
                <a href={generatedReminder.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={handleSendAndLog}>
                  <ExternalLink className="h-4 w-4" />WhatsApp Kholo
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={handleSendAndLog} className="gap-1.5">
              <CheckCircle className="h-4 w-4" />Log Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
