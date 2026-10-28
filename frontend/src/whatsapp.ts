import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { BACKEND_URL } from "@/src/api";

/** Open WhatsApp with a pre-filled message, optionally to a specific +91 number. */
export async function openWhatsApp(text: string, phone?: string) {
  const to = phone ? phone.replace(/\D/g, "") : "";
  const url = `https://api.whatsapp.com/send?${to ? `phone=${to}&` : ""}text=${encodeURIComponent(text)}`;
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank", "noopener");
  else await Linking.openURL(url);
}

export const liveLink = (token: string) =>
  `${Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : BACKEND_URL}/live/${token}`;
