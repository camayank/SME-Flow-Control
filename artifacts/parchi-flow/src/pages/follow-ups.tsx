import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiUrl, apiPost, formatCurrency, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Phone, Clock, CheckCircle, Calendar,
  Plus, Zap, ChevronRight, AlertTriangle, Bell, RefreshCw,
  IndianRupee, User, Copy, ExternalLink,
} from "lucide-react";

interface FollowUp {
  id: number;
  partyId: number;
  partyName: string | null;
  partyMobile: string | null;
  outstandingId: number | null;
  followUpType: string;
  status: string;
  note: string | null;
  promisedPaymentDate: string | null;
  promisedAmount: number | null;
  nextFollowUpAt: string | null;
  lastReminderAt: string | null;
  amountDue: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DueData {
  overdue: FollowUp[];
  dueToday: FollowUp[];
  upcoming: FollowUp[];
  noDate: FollowUp[];
  total: number;
}

interface Party {
  id: number;
  name: string;
  mobile: string | null;
  currentBalance: number;
  balanceType: string;
}

interface Outstanding {
  id: number;
  partyId: number;
  partyName: string | null;
  amountDue: number;
  agingDays: number;
  dueDate: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />,
  call: <Phone className="h-3.5 w-3.5 text-blue-600" />,
  visit: <User className="h-3.5 w-3.5 text-purple-600" />,
  email: <Bell className="h-3.5 w-3.5 text-amber-600" />,
};

const TYPE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", call: "Call", visit: "Visit", email: "Email",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
};

function ReminderDialog({
  fu, open, onClose, onDone,
}: { fu: FollowUp | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [tone, setTone] = useState("soft");
  const [lang, setLang] = useState("hinglish");
  const [msg, setMsg] = useState<{ message: string; whatsappUrl: string | null } | null>(null);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generate = async () => {
    if (!fu) return;
    setGenerating(true);
    try {
      const r = await apiPost<{ message: string; whatsappUrl: string | null }>("/follow-ups/generate-reminder", {
        partyId: fu.partyId,
        outstandingId: fu.outstandingId,
        templateType: tone,
        language: lang,
      });
      setMsg(r);
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (msg?.message) {
      await navigator.clipboard.writeText(msg.message);
      toast({ title: "Copied!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp Reminder
          </DialogTitle>
        </DialogHeader>
        {fu && (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium">{fu.partyName}</p>
              {fu.amountDue && <p className="text-muted-foreground">Due: {formatCurrency(fu.amountDue)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
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
                <Select value={lang} onValueChange={setLang}>
                  <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={generate} disabled={generating}>
              {generating ? "Generating..." : "Generate Message"}
            </Button>
            {msg && (
              <div className="relative">
                <Textarea value={msg.message} readOnly className="text-sm bg-emerald-50/40 border-emerald-200 pr-9 min-h-20" />
                <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 h-6 w-6" onClick={copy}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={copy} disabled={!msg}>
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
          </Button>
          {msg?.whatsappUrl && (
            <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 flex-1">
              <a href={msg.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={onDone}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open WhatsApp
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFollowUpDialog({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    partyId: "",
    outstandingId: "",
    followUpType: "whatsapp",
    note: "",
    promisedPaymentDate: "",
    promisedAmount: "",
    nextFollowUpAt: "",
  });
  const { toast } = useToast();
  const token = getAuthToken();

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: [apiUrl("/parties")],
    enabled: !!token,
    queryFn: async () => {
      const r = await fetch(apiUrl("/parties"), { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
  });

  const { data: outstandings = [] } = useQuery<Outstanding[]>({
    queryKey: [apiUrl("/outstandings"), "open"],
    enabled: !!token,
    queryFn: async () => {
      const r = await fetch(`${apiUrl("/outstandings")}?status=open`, { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
  });

  const relevantOutstandings = form.partyId
    ? outstandings.filter(o => o.partyId === parseInt(form.partyId))
    : outstandings;

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.partyId) { toast({ title: "Please select a party", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiPost("/follow-ups", {
        partyId: parseInt(form.partyId),
        outstandingId: form.outstandingId ? parseInt(form.outstandingId) : null,
        followUpType: form.followUpType,
        note: form.note || null,
        promisedPaymentDate: form.promisedPaymentDate || null,
        promisedAmount: form.promisedAmount ? parseFloat(form.promisedAmount) : null,
        nextFollowUpAt: form.nextFollowUpAt || null,
      });
      toast({ title: "Follow-up added!" });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: "Error saving follow-up", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Follow-up</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Party *</Label>
            <Select value={form.partyId} onValueChange={v => upd("partyId", v)}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue placeholder="Select party..." />
              </SelectTrigger>
              <SelectContent>
                {parties.map(p => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                    {p.name} {p.currentBalance > 0 ? `— ${formatCurrency(p.currentBalance)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {relevantOutstandings.length > 0 && (
            <div>
              <Label className="text-xs">Link to Outstanding (optional)</Label>
              <Select value={form.outstandingId} onValueChange={v => upd("outstandingId", v)}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue placeholder="Select outstanding..." />
                </SelectTrigger>
                <SelectContent>
                  {relevantOutstandings.map(o => (
                    <SelectItem key={o.id} value={String(o.id)} className="text-xs">
                      {o.partyName || "Party"} — {formatCurrency(o.amountDue)} {o.agingDays > 0 ? `(${o.agingDays}d overdue)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Follow-up Type</Label>
              <Select value={form.followUpType} onValueChange={v => upd("followUpType", v)}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="visit">Personal Visit</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Next Follow-up Date</Label>
              <Input type="date" className="mt-1 h-8 text-xs" value={form.nextFollowUpAt}
                onChange={e => upd("nextFollowUpAt", e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Note</Label>
            <Textarea className="mt-1 text-xs" rows={2} placeholder="What needs to be discussed..."
              value={form.note} onChange={e => upd("note", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Promise Date</Label>
              <Input type="date" className="mt-1 h-8 text-xs" value={form.promisedPaymentDate}
                onChange={e => upd("promisedPaymentDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Promised Amount (₹)</Label>
              <Input type="number" className="mt-1 h-8 text-xs" placeholder="0" value={form.promisedAmount}
                onChange={e => upd("promisedAmount", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
          <Button onClick={save} size="sm" disabled={saving}>
            {saving ? "Saving..." : "Save Follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpCard({
  fu, onMarkDone, onRemind, onReschedule,
}: {
  fu: FollowUp;
  onMarkDone: (id: number) => void;
  onRemind: (fu: FollowUp) => void;
  onReschedule: (fu: FollowUp) => void;
}) {
  const isOverdue = fu.nextFollowUpAt && new Date(fu.nextFollowUpAt) < new Date();
  const status = STATUS_CONFIG[fu.status] || STATUS_CONFIG.pending;

  return (
    <Card className={`${isOverdue ? "border-l-4 border-l-red-500" : fu.nextFollowUpAt ? "border-l-4 border-l-amber-400" : ""}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/parties/${fu.partyId}`}>
                <span className="font-semibold text-sm hover:text-primary cursor-pointer">{fu.partyName || "Unknown Party"}</span>
              </Link>
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${status.cls}`}>
                {status.label}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {TYPE_ICONS[fu.followUpType]} {TYPE_LABELS[fu.followUpType]}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {fu.amountDue && fu.amountDue > 0 && (
                <span className="text-xs font-semibold text-red-600 flex items-center gap-0.5">
                  <IndianRupee className="h-3 w-3" />{fu.amountDue.toLocaleString("en-IN")} due
                </span>
              )}
              {fu.nextFollowUpAt && (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  <Calendar className="h-3 w-3" />
                  {isOverdue ? "Overdue: " : "Due: "}{formatDate(fu.nextFollowUpAt)}
                </span>
              )}
              {fu.promisedPaymentDate && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Promise: {formatDate(fu.promisedPaymentDate)}
                  {fu.promisedAmount ? ` (${formatCurrency(fu.promisedAmount)})` : ""}
                </span>
              )}
            </div>

            {fu.note && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{fu.note}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {fu.partyMobile && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => onRemind(fu)}>
                <MessageCircle className="h-3 w-3" /> Remind
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
              onClick={() => onReschedule(fu)}>
              <Calendar className="h-3 w-3" /> Reschedule
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-700 border-emerald-200"
              onClick={() => onMarkDone(fu.id)}>
              <CheckCircle className="h-3 w-3" /> Done
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RescheduleDialog({
  fu, open, onClose, onSaved,
}: { fu: FollowUp | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [nextDate, setNextDate] = useState(fu?.nextFollowUpAt?.split("T")[0] || "");
  const [note, setNote] = useState(fu?.note || "");
  const [promisedDate, setPromisedDate] = useState(fu?.promisedPaymentDate?.split("T")[0] || "");
  const [promisedAmt, setPromisedAmt] = useState(fu?.promisedAmount?.toString() || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const token = getAuthToken();

  const save = async () => {
    if (!fu) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/follow-ups/${fu.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nextFollowUpAt: nextDate || null,
          note: note || null,
          promisedPaymentDate: promisedDate || null,
          promisedAmount: promisedAmt ? parseFloat(promisedAmt) : null,
          status: "in_progress",
        }),
      });
      toast({ title: "Rescheduled!" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule Follow-up</DialogTitle>
        </DialogHeader>
        {fu && (
          <div className="space-y-3">
            <div className="p-2 bg-muted rounded text-xs font-medium">{fu.partyName}</div>
            <div>
              <Label className="text-xs">Next Follow-up Date</Label>
              <Input type="date" className="mt-1 h-8 text-xs" value={nextDate} onChange={e => setNextDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Promise Date</Label>
                <Input type="date" className="mt-1 h-8 text-xs" value={promisedDate} onChange={e => setPromisedDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Promise Amt (₹)</Label>
                <Input type="number" className="mt-1 h-8 text-xs" value={promisedAmt} onChange={e => setPromisedAmt(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea className="mt-1 text-xs" rows={2} value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FollowUpsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [reminderFu, setReminderFu] = useState<FollowUp | null>(null);
  const [rescheduleFu, setRescheduleFu] = useState<FollowUp | null>(null);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const { toast } = useToast();
  const token = getAuthToken();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<DueData>({
    queryKey: [apiUrl("/follow-ups/due")],
    enabled: !!token,
    queryFn: async () => {
      const r = await fetch(apiUrl("/follow-ups/due"), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: allFUs = [] } = useQuery<FollowUp[]>({
    queryKey: [apiUrl("/follow-ups")],
    enabled: !!token,
    queryFn: async () => {
      const r = await fetch(apiUrl("/follow-ups"), { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
  });

  const markDone = async (id: number) => {
    try {
      await fetch(apiUrl(`/follow-ups/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "done" }),
      });
      toast({ title: "Marked done!" });
      qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups/due")] });
      qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups")] });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const autoSchedule = async () => {
    setAutoScheduling(true);
    try {
      const r = await apiPost<{ created: number; message: string }>("/follow-ups/auto-schedule", {});
      toast({ title: `Auto-scheduled!`, description: r.message });
      qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups/due")] });
      qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups")] });
    } catch {
      toast({ title: "Error auto-scheduling", variant: "destructive" });
    } finally {
      setAutoScheduling(false);
    }
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups/due")] });
    qc.invalidateQueries({ queryKey: [apiUrl("/follow-ups")] });
  };

  const overdueCount = data?.overdue.length || 0;
  const todayCount = data?.dueToday.length || 0;
  const upcomingCount = data?.upcoming.length || 0;
  const totalPending = data?.total || 0;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">Track, remind, and collect payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={autoSchedule} disabled={autoScheduling}>
            <Zap className="h-3.5 w-3.5" />
            {autoScheduling ? "Scheduling..." : "Auto Schedule"}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Follow-up
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-red-100">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{todayCount}</p>
            <p className="text-xs text-muted-foreground">Due Today</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{upcomingCount}</p>
            <p className="text-xs text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-2xl font-bold">{totalPending}</p>
            <p className="text-xs text-muted-foreground">Total Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overdue">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="overdue" className="text-xs">
            Overdue {overdueCount > 0 && <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-xs">{overdueCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="today" className="text-xs">
            Today {todayCount > 0 && <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-xs">{todayCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">Upcoming</TabsTrigger>
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
        </TabsList>

        {(["overdue", "today", "upcoming"] as const).map(tab => {
          const items = tab === "overdue" ? (data?.overdue || [])
            : tab === "today" ? (data?.dueToday || [])
            : (data?.upcoming || []);

          return (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
              ) : items.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <CheckCircle className="h-10 w-10 mx-auto text-emerald-500/30 mb-2" />
                    <p className="text-muted-foreground text-sm">
                      {tab === "overdue" ? "No overdue follow-ups 🎉" : tab === "today" ? "Nothing due today" : "Nothing upcoming this week"}
                    </p>
                    {tab === "overdue" && (
                      <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={autoSchedule} disabled={autoScheduling}>
                        <Zap className="h-3.5 w-3.5" /> Auto-schedule for overdue invoices
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                items.map(fu => (
                  <FollowUpCard
                    key={fu.id}
                    fu={fu}
                    onMarkDone={markDone}
                    onRemind={setReminderFu}
                    onReschedule={setRescheduleFu}
                  />
                ))
              )}
            </TabsContent>
          );
        })}

        <TabsContent value="all" className="mt-4 space-y-2">
          {allFUs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Bell className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No follow-ups yet</p>
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>Add Manually</Button>
                  <Button variant="outline" size="sm" onClick={autoSchedule} disabled={autoScheduling}>
                    <Zap className="h-3.5 w-3.5 mr-1" /> Auto Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            allFUs.map(fu => (
              <FollowUpCard
                key={fu.id}
                fu={fu}
                onMarkDone={markDone}
                onRemind={setReminderFu}
                onReschedule={setRescheduleFu}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <AddFollowUpDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />
      <ReminderDialog fu={reminderFu} open={!!reminderFu} onClose={() => setReminderFu(null)} onDone={() => { invalidate(); setReminderFu(null); }} />
      <RescheduleDialog fu={rescheduleFu} open={!!rescheduleFu} onClose={() => setRescheduleFu(null)} onSaved={() => { invalidate(); setRescheduleFu(null); }} />
    </div>
  );
}
