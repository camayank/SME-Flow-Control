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
import { Upload, Database, Link, CheckCircle, AlertCircle, RefreshCw, FileText, Zap } from "lucide-react";

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
  { type: "tally", name: "Tally Prime", icon: "T", color: "bg-blue-600", description: "TallyPrime 2.0+ se sync karein" },
  { type: "busy", name: "BUSY Accounting", icon: "B", color: "bg-purple-600", description: "BUSY 21+ se sync karein" },
  { type: "marg", name: "Marg ERP 9+", icon: "M", color: "bg-orange-600", description: "Marg ERP 9+ se sync karein" },
];

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-emerald-100 text-emerald-700",
  not_connected: "bg-slate-100 text-slate-600",
  error: "bg-red-100 text-red-700",
  syncing: "bg-blue-100 text-blue-700",
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

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Invoice Upload / Import</h1>
        <p className="text-sm text-muted-foreground">Kacha / Pakka invoice, CSV/Excel, aur accounting sync</p>
      </div>

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload">📂 Invoice / CSV</TabsTrigger>
          <TabsTrigger value="connectors">🔌 Connectors</TabsTrigger>
          <TabsTrigger value="history">📋 History</TabsTrigger>
        </TabsList>

        {/* Upload tab */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          {!uploadResult ? (
            <Card>
              <CardContent className="py-8">
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="font-medium">Kacha / Pakka invoice ya CSV/Excel file upload karein</p>
                  <p className="text-sm text-muted-foreground mt-1">Invoices, bank statements, Excel ledgers, or party lists</p>
                  <div className="flex justify-center gap-2 mt-4">
                    {["KACHA", "PAKKA", "CSV", "XLSX", "XLS"].map(f => (
                      <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                <div className="flex items-center gap-3 mt-4">
                  <Label className="text-sm flex-shrink-0">Upload Type:</Label>
                  <Select value={uploadMode} onValueChange={v => setUploadMode(v as UploadMode)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="ledger">Ledger</SelectItem>
                      <SelectItem value="bank_statement">Bank Statement</SelectItem>
                      <SelectItem value="party_list">Party List</SelectItem>
                    </SelectContent>
                  </Select>
                  {uploadMode === "invoice" && (
                    <Select value={invoiceMode} onValueChange={v => setInvoiceMode(v as "kacha" | "pakka")}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kacha">Kacha</SelectItem>
                        <SelectItem value="pakka">Pakka</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {isUploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-xs text-muted-foreground">
                  <div className="rounded-lg bg-muted/40 px-3 py-2">Kacha = rough entry. Pakka = final invoice style upload.</div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2">Upload ke baad column mapping aur preview milega.</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setUploadMode("invoice")}>Invoice</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setUploadMode("ledger")}>Ledger</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setUploadMode("bank_statement")}>Bank Statement</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setUploadMode("party_list")}>Party List</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-800">
                      {uploadResult.fileName || "Uploaded file"} · {uploadResult.totalRows} rows detected
                    </p>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => setUploadResult(null)}>
                      Change File
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Column mapping */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Column Mapping</CardTitle>
                  <CardDescription className="text-xs">Apni file ke columns ko match karein</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {COLUMN_MAPPINGS.map(({ field, label }) => (
                    <div key={field} className="flex items-center gap-3">
                      <Label className="text-xs w-36 flex-shrink-0">{label}</Label>
                      <Select value={mapping[field] || ""} onValueChange={v => setMapping(m => ({ ...m, [field]: v }))}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Not mapped</SelectItem>
                          {uploadResult.headers.map(h => <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Preview (first 5 rows)</CardTitle>
                </CardHeader>
                <CardContent>
                  {uploadResult.preview.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {uploadResult.headers.slice(0, 5).map(h => (
                              <th key={h} className="text-left px-2 py-1 bg-muted font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {uploadResult.preview.map((row, i) => (
                            <tr key={i} className="border-t">
                              {uploadResult.headers.slice(0, 5).map(h => (
                                <td key={h} className="px-2 py-1 text-muted-foreground">{row[h] || "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">Preview unavailable for this file.</p>
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2">
                <Button onClick={handleConfirmImport} disabled={isImporting} className="w-full" size="lg">
                  {isImporting ? "Import ho raha hai..." : `✅ Import Confirm Karein (${uploadResult.totalRows} rows)`}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {uploadResult.invoiceMode ? `${uploadResult.invoiceMode.toUpperCase()} invoice mode selected` : "Invoice mode not set"}
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Connectors tab */}
        <TabsContent value="connectors" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Mock connectors — demo data import karein</p>
          <div className="space-y-3">
            {CONNECTOR_CONFIG.map(conn => {
              const source = sources.find(s => s.sourceType === conn.type);
              const syncRes = syncResult[conn.type];
              return (
                <Card key={conn.type}>
                  <CardContent className="flex items-center gap-4 py-4 px-4">
                    <div className={`w-10 h-10 rounded-xl ${conn.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                      {conn.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{conn.name}</p>
                      <p className="text-xs text-muted-foreground">{conn.description}</p>
                      {source && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[source.connectionStatus] || STATUS_COLORS.not_connected}`}>
                            {source.connectionStatus}
                          </span>
                          {source.recordsImported > 0 && (
                            <span className="text-xs text-muted-foreground">{source.recordsImported} records imported</span>
                          )}
                        </div>
                      )}
                      {syncRes && (
                        <p className="text-xs text-emerald-600 mt-0.5">{syncRes.message}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 gap-1.5"
                      onClick={() => handleSync(conn.type)}
                      disabled={isSyncing === conn.type}
                    >
                      {isSyncing === conn.type ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      {isSyncing === conn.type ? "Syncing..." : "Mock Sync"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {!jobs.length ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Koi import history nahi hai — upload karke shuru karein
              </CardContent>
            </Card>
          ) : jobs.map(job => (
            <Card key={job.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  job.status === "completed" ? "bg-emerald-100" :
                  job.status === "failed" ? "bg-red-100" : "bg-amber-100"
                }`}>
                  {job.status === "completed"
                    ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                    : <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{job.importType} import</p>
                  <p className="text-xs text-muted-foreground">
                    {job.successfulRecords}/{job.totalRecords} records • {new Date(job.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Badge variant={job.status === "completed" ? "default" : "secondary"} className="text-xs flex-shrink-0">
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
