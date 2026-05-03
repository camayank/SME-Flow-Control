import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiPost, getAuthToken, setAuthToken, clearAuthToken } from "@/lib/api";

interface User {
  id: number;
  name: string | null;
  mobile: string;
  email: string | null;
}

interface Business {
  id: number;
  businessName: string;
  businessType: string;
  city: string | null;
  state: string | null;
  gstin: string | null;
  preferredLanguage: string;
}

interface AuthContextType {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasBusiness: boolean;
  login: (token: string, user: User, hasBusiness: boolean) => void;
  logout: () => void;
  setBusiness: (b: Business) => void;
  refreshBusiness: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshBusiness = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await fetch("/api/business", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const biz = await res.json();
        setBusiness(biz.business || biz);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const init = async () => {
      const token = getAuthToken();
      if (!token) { setIsLoading(false); return; }
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const u = await res.json();
          setUser(u);
          await refreshBusiness();
        } else {
          clearAuthToken();
        }
      } catch {
        clearAuthToken();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshBusiness]);

  const login = (token: string, u: User, hasBiz: boolean) => {
    setAuthToken(token);
    setUser(u);
    if (!hasBiz) setBusiness(null);
  };

  const logout = async () => {
    try { await apiPost("/auth/logout"); } catch {}
    clearAuthToken();
    setUser(null);
    setBusiness(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      business,
      isLoading,
      isAuthenticated: !!user,
      hasBusiness: !!business,
      login,
      logout,
      setBusiness,
      refreshBusiness,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
