import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api } from "@/src/api";
import type { User } from "@/src/auth";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

const ROLE_KEY = "google_signup_role";
const AUTH_HOST = "https://auth.emergentagent.com/";
const sent = new Set<string>();

export const extractSessionId = (url?: string | null) => {
  const m = url?.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

/** Exchange the one-time session_id with OUR backend (never Emergent directly). Returns null if already sent. */
export async function exchangeSession(sessionId: string): Promise<{ token: string; user: User } | null> {
  if (sent.has(sessionId)) return null;
  sent.add(sessionId);
  const role = (await storage.getItem<string>(ROLE_KEY, "customer")) || "customer";
  const r = await api<{ session_token: string; user: User }>("/auth/session", { body: { session_id: sessionId, role } });
  await storage.removeItem(ROLE_KEY);
  return { token: r.session_token, user: r.user };
}

/**
 * Start Google sign-in. Web: full-page redirect (AuthProvider picks up session_id on return).
 * Native: auth session; returns the session_id from result URL / deep-link listener / initial URL.
 */
export async function startGoogleLogin(role: "customer" | "driver"): Promise<string | null> {
  await storage.setItem(ROLE_KEY, role);
  if (Platform.OS === "web") {
    const redirect = window.location.origin + "/login";
    window.location.href = `${AUTH_HOST}?redirect=${encodeURIComponent(redirect)}`;
    return null;
  }
  const redirect = Linking.createURL("");
  let captured: string | null = null;
  const sub = Linking.addEventListener("url", ({ url }) => {
    captured = extractSessionId(url) ?? captured;
  });
  try {
    const res = await WebBrowser.openAuthSessionAsync(`${AUTH_HOST}?redirect=${encodeURIComponent(redirect)}`, redirect);
    const fromResult = res.type === "success" ? extractSessionId(res.url) : null;
    return fromResult ?? captured ?? extractSessionId(await Linking.getInitialURL());
  } finally {
    sub.remove();
  }
}
