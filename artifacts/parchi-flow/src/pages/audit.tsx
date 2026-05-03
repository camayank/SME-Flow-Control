import { useQuery } from "@tanstack/react-query";
import { apiUrl, formatDate, getAuthToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";

interface AuditRow {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const token = getAuthToken();
  const { data, isLoading } = useQuery<AuditRow[]>({
    queryKey: [apiUrl("/audit")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Failed to load audit logs");
      return res.json();
    },
  });

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Saare important changes ka record</p>
      </div>

      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : null}

      {!isLoading && (!data || !data.length) && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Abhi koi audit activity nahi hai</CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map(row => (
          <Card key={row.id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">{row.description}</CardTitle>
              <Badge variant="outline" className="text-xs">{row.entityType}</Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p><span className="font-medium text-foreground">Action:</span> {row.action}</p>
              <p><span className="font-medium text-foreground">Entity ID:</span> {row.entityId ?? "—"}</p>
              <p><span className="font-medium text-foreground">Time:</span> {formatDate(row.createdAt)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
