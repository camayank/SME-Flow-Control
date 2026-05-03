import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPost, apiUrl, apiUpload, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link as RouterLink } from "wouter";
import {
  Upload, Database, CheckCircle, AlertCircle, RefreshCw,
  FileText, Zap, ArrowRight, Wifi, WifiOff, Clock,
} from "lucide-react";

type UploadMode = "invoice" | "kacha" | "pakka" | "ledger" | "bank_statement" | "party_list";

interface DataSource {
  id: number;
  sourceType: string;
  sourceName: string;
  connectionStatus: string;
  lastSyncAt: string | null;
  recordsImported: number;
}

interface ImportJob {
  id: number;
  importType: string;
  status: string;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  createdAt: string;
}

interface UploadResult {
  jobId: number;
  headers: string[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  preview: Record<string, string>[];
  fileName?: string;
  importType?: string;
  invoiceMode?: string | null;
}

const CONNECTOR_CONFIG = [
  {
    type: "tally",
    name: "Tally Prime",
    shortName: "T",
    color: "bg-blue-600",
    border: "border-blue-200",
    bg: "bg-blue-50",
    description: "TallyPrime 2.0+ se auto-sync. Party ledger, vouchers, aur balances real-time.",
    badge: "Most Popular",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    type: "busy",
    name: "BUSY Accounting",
    shortName: "B",
    color: "bg-purple-600",
    border: "border-purple-200",
    bg: "bg-purple-50",
    description: "BUSY 21+ se sync. Inventory, GST, aur party data ek click mein.",
    badge: "GST Ready",
    badgeColor: "bg-purple-100 text-purple-700",
  },
  {
    type: "marg",
    name: "Marg ERP 9+",
    shortName: "M",
    color: "bg-orange-600",
    border: "border-orange-200",
    bg: "bg-orange-50",
    description: "Marg ERP 9+ se sync. Pharma, FMCG, aur distribution ke liye ideal.",
    badge: "Pharma Friendly",
    badgeColor: "bg-orange-100 text-orange-700",
  },
];

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  connected: { label: "Connected", icon: Wifi, cls: "text-emerald-600" },
  not_connected: { label: "Not Connected", icon: WifiOff, cls: "text-slate-400" },
  error: { label: "Error", icon: AlertCircle, cls: "text-red-500" },
  syncing: { label: "Syncing...", icon: RefreshCw, cls: "text-blue-500" },
};

const COLUMN_MAPPINGS = [
  { field: "party_name", label: "Party Name" },
  { field: "amount", label: "Amount" },
  { field: "credit", label: "Credit Amount" },
  { field: "debit", label: "Debit Amount" },
  { field: "voucher_date", label: "Date" },
  { field: "narration", label: "Narration / Description" },
  { field: "reference_number", label: "Reference / UTR" },
  { field: "invoice_number", label: "Invoice Number" },
  { field: "voucher_number", label: "Voucher Number" },
];

export default function ImportPage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [uploadMode, setUploadMode] = useState<UploadMode>("invoice");
  const [invoiceMode, setInvoiceMode] = useState<"kacha" | "pakka">("kacha");
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [syncResult, setSyncResult] = useState<Record<string, { success: number; message: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = getAuthToken();

  const { data: sources = [] } = useQuery<DataSource[]>({
    queryKey: [apiUrl("/data-sources")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/data-sources"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: jobs = [] } = useQuery<ImportJob[]>({
    queryKey: [apiUrl("/import/jobs")],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(apiUrl("/import/jobs"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload a file under 10MB.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importType", uploadMode === "invoice" ? "invoice" : uploadMode);
      if (uploadMode === "invoice") formData.append("invoiceMode", invoiceMode);
      const result = await apiUpload<UploadResult>("/import/upload", formData);
      setUploadResult(result);
      setMapping(result.suggestedMapping);
      toast({ title: "File uploaded!", description: `${result.totalRows} rows detected` });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadResult) return;
    setIsImporting(true);
    try {
      await apiPost("/import/map", { jobId: uploadResult.jobId, mapping });
      const result = await apiPost<{ successCount: number; failCount: number; message: string }>("/import/confirm", { jobId: uploadResult.jobId });
      toast({ title: "Import complete!", description: result.message });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/import/jobs")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/dashboard")] });
      setUploadResult(null);
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSync = async (connectorType: string) => {
    setIsSyncing(connectorType);
    try {
      const result = await apiPost<{ successCount?: number; message: string }>(`/connectors/${connectorType}/sync`);
      setSyncResult(prev => ({ ...prev, [connectorType]: { success: result.successCount || 0, message: result.message } }));
      queryClient.invalidateQueries({ queryKey: [apiUrl("/data-sources")] });
      queryClient.invalidateQueries({ queryKey: [apiUrl("/dashboard")] });
      toast({ title: "Sync complete!", description: result.message });
    } catch (err: unknown) {
      toast({ title: "Sync failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setIsSyncing(null);
    }
  };

  const getSourceStatus = (connectorType: string) => {
    return sources.find(s => s.sourceType === connectorType);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Database className="h-5 w-5" />Data Sources & Import</h1>
          <p className="text-sm text-muted-foreground">Tally, Marg, BUSY sync — ya CSV/Excel se manual import</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <RouterLink href="/">← Dashboard</RouterLink>
        </Button>
      </div>

      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/2">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Tally/Marg/BUSY already use karte hain?</p>
              <p className="text-xs text-muted-foreground mt-1">
                ParchiFlow aapke existing accounting system ka data sync karta hai aur uski jaroorat se zyada kuch bhi replace nahi karta.
                Real-time syncing se aapko collections, outstanding aur cash flow ka clear overview milega — bina complex BI ke.
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {["Tally Prime", "BUSY 21+", "Marg ERP 9+"].map(s => (
                  <span key={s} className="text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">{s}</span>
                ))}
                <span className="text-xs bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full">CSV / Excel bhi</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="connectors">
        <TabsList>
          <TabsTrigger value="connectors">🔌 Sync Connectors</TabsTrigger>
          <TabsTrigger value="upload">📂 CSV / Excel</TabsTrigger>
          <TabsTrigger value="history">📋 Import History</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="mt-4 space-y-4">
          <div className="space-y-3">
            {CONNECTOR_CONFIG.map(conn => {
              const source = getSourceStatus(conn.type);
              const statusCfg = STATUS_CONFIG[source?.connectionStatus || "not_connected"];
              const StatusIcon = statusCfg.icon;
              const result = syncResult[conn.type];
              const syncing = isSyncing === conn.type;

              return (
                <Card key={conn.type} className={`border ${conn.border}`}>
                  <CardContent className="py-4 px-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-11 h-11 rounded-xl ${conn.color} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                        {conn.shortName}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{conn.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conn.badgeColor}`}>{conn.badge}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{conn.description}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs ${statusCfg.cls}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </span>
                          {source?.lastSyncAt && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />Last: {new Date(source.lastSyncAt).toLocaleDateString("en-IN")}
                            </span>
                          )}
                          {source?.recordsImported ? (
                            <span className="text-xs text-muted-foreground">{source.recordsImported.toLocaleString()} records</span>
                          ) : null}
                          {result && (
                            <span className="text-xs text-emerald-600 font-medium">✓ {result.message}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={source?.connectionStatus === "connected" ? "default" : "outline"}
                        className="flex-shrink-0 gap-1.5"
                        onClick={() => handleSync(conn.type)}
                        disabled={!!isSyncing}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                        {syncing ? "Syncing..." : source?.connectionStatus === "connected" ? "Sync Now" : "Connect"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-dashed border-slate-300 bg-slate-50/50">
            <CardContent className="py-4 px-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                <ArrowRight className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Bank Statement Import</p>
                <p className="text-xs text-muted-foreground">CSV/Excel se bank entries import karein for reconciliation</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto flex-shrink-0" onClick={() => {
                const el = document.querySelector('[data-tab="upload"]') as HTMLButtonElement;
                if (el) el.click();
              }}>Import CSV</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-4 space-y-4" data-tab="upload">
          {!uploadResult ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">File Upload</CardTitle>
                <CardDescription>CSV, Excel (.xlsx), ya PDF invoice upload karein</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Import Type</Label>
                    <Select value={uploadMode} onValueChange={v => setUploadMode(v as UploadMode)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">Invoice (Kacha/Pakka)</SelectItem>
                        <SelectItem value="ledger">Party Ledger</SelectItem>
                        <SelectItem value="bank_statement">Bank Statement</SelectItem>
                        <SelectItem value="party_list">Party List</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {uploadMode === "invoice" && (
                    <div>
                      <Label className="text-xs">Invoice Mode</Label>
                      <Select value={invoiceMode} onValueChange={v => setInvoiceMode(v as "kacha" | "pakka")}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kacha">Kacha (Draft)</SelectItem>
                          <SelectItem value="pakka">Pakka (Confirmed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div
                  className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="font-medium">Yahan drop karein ya click karein</p>
                  <p className="text-xs text-muted-foreground mt-1">CSV, Excel, PDF · Max 10MB</p>
                  {isUploading && <p className="text-sm text-primary mt-2 animate-pulse">Uploading...</p>}
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileUpload} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Column Mapping</CardTitle>
                  <Badge variant="secondary">{uploadResult.totalRows} rows</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {uploadResult.headers.map(header => (
                    <div key={header} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-40 flex-shrink-0 truncate">{header}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Select value={mapping[header] || "skip"} onValueChange={v => setMapping(m => ({ ...m, [header]: v }))}>
                        <SelectTrigger className="flex-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">— Skip —</SelectItem>
                          {COLUMN_MAPPINGS.map(c => <SelectItem key={c.field} value={c.field}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setUploadResult(null)}>Cancel</Button>
                  <Button className="flex-1" disabled={isImporting} onClick={handleConfirmImport}>
                    {isImporting ? "Importing..." : `Import ${uploadResult.totalRows} Rows`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {!jobs.length ? (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Abhi koi import history nahi hai</p>
              </CardContent>
            </Card>
          ) : jobs.map(job => (
            <Card key={job.id}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${job.status === "completed" ? "bg-emerald-50" : job.status === "failed" ? "bg-red-50" : "bg-amber-50"}`}>
                  {job.status === "completed"
                    ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                    : job.status === "failed"
                    ? <AlertCircle className="h-4 w-4 text-red-500" />
                    : <RefreshCw className="h-4 w-4 text-amber-600 animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{job.importType.replace(/_/g, " ")} import</p>
                  <p className="text-xs text-muted-foreground">
                    {job.successfulRecords}/{job.totalRecords} records · {new Date(job.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Badge variant="outline" className={`text-xs ${
                  job.status === "completed" ? "text-emerald-600 border-emerald-300" :
                  job.status === "failed" ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"
                }`}>
                  {job.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
