"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, isAbortError } from "./api-client";
import type { SafeUser, Usage } from "./api-types";

type AuthStatus = "loading" | "authenticated" | "anonymous";
type UsageStatus = "idle" | "loading" | "ready" | "error";

interface AuthContextValue {
  status: AuthStatus;
  user: SafeUser | null;
  usage: Usage | null;
  usageStatus: UsageStatus;
  login(email: string, password: string): Promise<SafeUser>;
  register(email: string, password: string): Promise<SafeUser>;
  logout(): Promise<void>;
  refreshUsage(): Promise<void>;
  /** Call when any request answers 401: the session cookie is gone or expired. */
  expireSession(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SafeUser | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus>("idle");

  const expireSession = useCallback(() => {
    setUser(null);
    setUsage(null);
    setUsageStatus("idle");
    setStatus("anonymous");
  }, []);

  // Startup: who am I? Any failure leaves the visitor anonymous; the public pages still work.
  useEffect(() => {
    const controller = new AbortController();
    api
      .me(controller.signal)
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (!isAbortError(error)) setStatus("anonymous");
      });
    return () => controller.abort();
  }, []);

  const refreshUsage = useCallback(async () => {
    setUsageStatus((s) => (s === "ready" ? s : "loading"));
    try {
      setUsage(await api.usage());
      setUsageStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expireSession();
      else setUsageStatus("error");
    }
  }, [expireSession]);

  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading usage is the effect's purpose
    void refreshUsage();
  }, [userId, refreshUsage]);

  const login = useCallback(async (email: string, password: string) => {
    const me = await api.login(email, password);
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const me = await api.register(email, password);
    setUser(me);
    setStatus("authenticated");
    return me;
  }, []);

  const logout = useCallback(async () => {
    await api.logout(); // idempotent on the server; on failure the caller shows the error and state stays
    expireSession();
  }, [expireSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, usage, usageStatus, login, register, logout, refreshUsage, expireSession }),
    [status, user, usage, usageStatus, login, register, logout, refreshUsage, expireSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
