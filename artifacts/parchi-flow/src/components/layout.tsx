import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { apiUrl, getAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Receipt, RefreshCw,
  MessageCircle, Database, BarChart3, LogOut,
  Menu, X, ChevronRight, Plus, Package, ReceiptText, ChevronDown,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/parchi", icon: Plus, label: "Parchi Entry", highlight: true },
  { href: "/invoices", icon: ReceiptText, label: "Invoices" },
  { href: "/items", icon: Package, label: "Item Master" },
  { href: "/parties", icon: Users, label: "Parties" },
  { href: "/outstandings", icon: Receipt, label: "Outstandings" },
  { href: "/collections", icon: MessageCircle, label: "Collections" },
  { href: "/reconciliation", icon: RefreshCw, label: "Reconciliation" },
  { href: "/import", icon: Database, label: "Import / Sources" },
  { href: "/reports", icon: BarChart3, label: "Reports" },
];

interface LayoutProps { children: React.ReactNode }

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user, business, logout, setBusiness, refreshBusiness } = useAuth();
  const token = getAuthToken();

  const { data: businessesData } = useQuery({
    queryKey: [apiUrl("/business")],
    enabled: !!token,
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return { business: null, businesses: [] };
      return res.json();
    },
  });

  const businesses = businessesData?.businesses || [];

  const handleSwitchBusiness = async (id: number) => {
    const selected = businesses.find((b: { id: number }) => b.id === id);
    if (!selected) return;
    setBusiness(selected);
    setSidebarOpen(false);
    await refreshBusiness();
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent shadow-sm flex-shrink-0">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground truncate">ParchiFlow</p>
            {business && <p className="text-xs text-sidebar-foreground/60 truncate">{business.businessName}</p>}
          </div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-3 py-3 border-b border-sidebar-border space-y-2">
          <div className="flex items-center justify-between text-xs text-sidebar-foreground/60 uppercase tracking-wide px-1">
            <span>Business</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
          <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2">
            <p className="text-sm font-medium truncate">{business?.businessName || "Current Business"}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{business?.city || "India"}</p>
          </div>
          {businesses.length > 0 && (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {businesses.map((b: { id: number; businessName: string; city: string | null; state: string | null }) => (
                <button key={b.id} onClick={() => handleSwitchBusiness(b.id)} className={cn("w-full text-left px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent", business?.id === b.id && "bg-sidebar-accent") }>
                  <span className="block truncate">{b.businessName}</span>
                  <span className="block text-xs text-sidebar-foreground/60 truncate">{b.city || b.state || "India"}</span>
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent">
            <Plus className="h-4 w-4" /> Add Business
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  item.highlight && !isActive
                    ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                    : isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}>
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground flex-shrink-0">
              {user?.mobile?.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.mobile}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{business?.city || "India"}</p>
            </div>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0" onClick={logout} title="Logout">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b bg-background flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-sm">ParchiFlow</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/invoices"><ReceiptText className="h-4.5 w-4.5 text-primary" /></Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/parchi"><Plus className="h-5 w-5 text-accent" /></Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
