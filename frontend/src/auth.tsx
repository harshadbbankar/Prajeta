import * as Linking from "expo-linking";
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api, getToken, setToken } from "@/src/api";
import { exchangeSession, extractSessionId } from "@/src/googleAuth";
import { registerForPush } from "@/src/push";
import { queryClient } from "@/src/query-client";

export type User = { id: string; phone: string | null; name: string; role: string; city_id?: string | null; email?: string; google?: boolean };

type AuthCtx = {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  authError: string;
  clearAuthError: () => void;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const ADMIN_ROLES = ["owner", "super_admin", "ops", "verification", "support", "finance"];

export function homeFor(role?: string) {
  if (!role) return "/";
  if (role === "driver") return "/driver";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/customer";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch (e: any) {
      if (e.status === 401 || e.status === 403) {
        await setToken(null);
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const handleUrl = async (url: string | null) => {
      const sid = extractSessionId(url);
      if (!sid) return false;
      try {
        const r = await exchangeSession(sid);
        if (r && alive) {
          await setToken(r.token);
          setUser(r.user);
        }
        if (Platform.OS === "web") {
          // clean only session_id from the URL after a successful exchange
          const u = new URL(window.location.href);
          u.searchParams.delete("session_id");
          const hash = u.hash.replace(/^#/, "").split("&").filter((p) => p && !p.startsWith("session_id=")).join("&");
          window.history.replaceState(window.history.state, "", u.pathname + u.search + (hash ? "#" + hash : ""));
        }
        return true;
      } catch (e: any) {
        setAuthError(e.message ?? "Google sign-in failed");
        if (Platform.OS === "web") {
          const u = new URL(window.location.href);
          u.searchParams.delete("session_id");
          window.history.replaceState(window.history.state, "", u.pathname + u.search);
        }
        return false;
      }
    };
    (async () => {
      // session_id from a Google redirect is processed FIRST, before checking a stored session
      const initial = Platform.OS === "web" ? window.location.href : await Linking.getInitialURL();
      if (!(await handleUrl(initial))) await refresh();
      if (alive) setReady(true);
    })();
    const sub = Platform.OS === "web" ? null : Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);

  const signIn = async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
  };
  const signOut = async () => {
    await setToken(null);
    queryClient.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh, authError, clearAuthError: () => setAuthError("") }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

const AREAS: Record<string, string[]> = {
  dispatch: ["owner", "super_admin", "ops", "support"],
  drivers: ["owner", "super_admin", "ops", "verification"],
  licences: ["owner", "super_admin", "ops", "verification"],
  owner: ["owner", "super_admin", "finance"],
  finance: ["owner", "super_admin", "finance"],
  support: ["owner", "super_admin", "ops", "support"],
  admin: ["owner", "super_admin"],
};

/** Which ERP areas a staff role may open (backend enforces the same rules). */
export const can = (role: string | undefined, area: keyof typeof AREAS | string) => !!role && (AREAS[area] ?? []).includes(role);
