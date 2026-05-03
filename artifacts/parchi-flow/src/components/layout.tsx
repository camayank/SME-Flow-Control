import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Users, Receipt, RefreshCw,
  MessageCircle, Database, BarChart3, Settings, LogOut,
  Menu, X, ChevronRight, Plus, Bell,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", labelHi: "Dashboard" },
  { href: "/parchi", icon: Plus, label: "Parchi Entry", labelHi: "Parchi Dalein", highlight: true },
  { href: "/parties", icon: Users, label: "Parties", labelHi: "Parties" },
  { href: "/outstandings", icon: Receipt, label: "Outstandings", labelHi: "Baki Amount" },
  { href: "/collections", icon: MessageCircle, label: "Collections", labelHi: "Collection CRM" },
  { href: "/reconciliation", icon: RefreshCw, label: "Reconciliation", labelHi: "Reconciliation" },
  { href: "/import", icon: Database, label: "Import / Sources", labelHi: "Import" },
  { href: "/reports", icon: BarChart3, label: "Reports", labelHi: "Reports" },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const { user, business, logout } = useAuth();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent shadow-sm flex-shrink-0">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground truncate">ParchiFlow</p>
            {business && (
              <p className="text-xs text-sidebar-foreground/60 truncate">{business.businessName}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  item.highlight && !isActive
                    ? "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm"
                    : isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground flex-shrink-0">
              {user?.mobile?.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.mobile}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{business?.city || "India"}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
              onClick={logout}
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b bg-background flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-sm">ParchiFlow</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/parchi">
                <Plus className="h-5 w-5 text-accent" />
              </Link>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
