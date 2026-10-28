import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from "react";

import { api, getToken, setToken } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type User = { id: string; phone: string; name: string; role: string; city_id?: string | null; email?: string };

type AuthCtx = {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
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
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
  };
  const signOut = async () => {
    await setToken(null);
    queryClient.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
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
