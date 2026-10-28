import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { api } from "@/src/api";

export type Service = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  pricing_mode: "hourly" | "daily" | "quote";
  base_fare: number;
  base_hours: number;
  extra_hour_rate: number;
  night_surcharge: number;
  per_day: number;
  min_hours: number;
  max_hours: number;
  cancellation_fee: number;
  waiting_per_hour: number;
  terms: string[];
  tariff_version: number;
  active: boolean;
  effective_from?: string;
};
export type City = { id: string; name: string; state: string; areas: string[]; enabled: boolean; multiplier: number };
export type Config = {
  settings: Record<string, any>;
  cities: City[];
  services: Service[];
  faqs: { q: string; a: string }[];
  payments_enabled: boolean;
  otp_channel: string;
};

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/public/config"), staleTime: 5 * 60 * 1000 });
}

export function priceFrom(s: Service) {
  if (s.pricing_mode === "quote") return "Custom quote";
  if (s.pricing_mode === "daily") return `From ₹${Math.round(s.per_day / 100)}/day`;
  return `From ₹${Math.round(s.base_fare / 100)} · ${s.base_hours} hrs`;
}

/** Price split for service cards: big amount + small unit. */
export function priceParts(s: Service): { amount: string; unit: string } {
  if (s.pricing_mode === "quote") return { amount: "Enquire", unit: "custom quote" };
  if (s.pricing_mode === "daily") return { amount: `₹${Math.round(s.per_day / 100).toLocaleString("en-IN")}`, unit: "/day" };
  return { amount: `₹${Math.round(s.base_fare / 100).toLocaleString("en-IN")}`, unit: `for ${s.base_hours} hrs` };
}

/** Re-run callback while app is foregrounded (controlled polling). */
export function usePolling(cb: () => void, ms: number, enabled = true) {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !active) return;
    const t = setInterval(cb, ms);
    return () => clearInterval(t);
  }, [cb, ms, enabled, active]);
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const nextDays = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    return { iso, label };
  });

export const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
