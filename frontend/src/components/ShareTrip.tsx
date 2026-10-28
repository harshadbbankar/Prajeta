import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Platform, Share } from "react-native";

import { BACKEND_URL, api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Row, Txt, useToast } from "@/src/ui";

/** Customer: share a no-login live trip link with family (WhatsApp first). */
export function ShareTrip({ booking, onChange }: { booking: any; onChange: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const shared = !!booking.share_token;
  const link = (token: string) => `${Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : BACKEND_URL}/live/${token}`;

  const message = (url: string) =>
    `I'm travelling with a verified Prajeta driver (${booking.service_name}, ${booking.ref}). Follow my trip live: ${url}`;

  const shareWhatsApp = async () => {
    setBusy("wa");
    try {
      const r = await api<any>(`/bookings/${booking.id}/share`, { body: {} });
      const url = link(r.token);
      const wa = `https://wa.me/?text=${encodeURIComponent(message(url))}`;
      if (Platform.OS === "web" && typeof window !== "undefined") window.open(wa, "_blank", "noopener");
      else await Linking.openURL(wa);
      if (!shared) onChange();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };
  const shareOther = async () => {
    setBusy("other");
    try {
      const r = await api<any>(`/bookings/${booking.id}/share`, { body: {} });
      const url = link(r.token);
      if (Platform.OS === "web") {
        await (navigator as any).clipboard?.writeText(url);
        toast("Trip link copied");
      } else {
        await Share.share({ message: message(url) });
      }
      if (!shared) onChange();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };
  const stop = async () => {
    setBusy("stop");
    try {
      await api(`/bookings/${booking.id}/share`, { method: "DELETE" });
      toast("Trip link turned off");
      onChange();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card testID="share-trip-card" style={{ gap: space.sm }}>
      <Row>
        <Ionicons name="shield-checkmark" size={20} color={colors.success} />
        <Txt v="h3" style={{ flex: 1 }}>Share trip with family</Txt>
        {shared ? <Txt v="label" color={colors.success} testID="share-active-label">Link active</Txt> : null}
      </Row>
      <Txt v="caption">
        They can follow your driver live and see the arrival time — no app or login needed. Phone numbers and your trip OTP are never shown. The link stops working when the trip ends.
      </Txt>
      <Btn title="Share on WhatsApp" icon="logo-whatsapp" variant="success" loading={busy === "wa"} onPress={shareWhatsApp} testID="share-trip-whatsapp" />
      <Row>
        <Btn small style={{ flex: 1 }} variant="outline" title={Platform.OS === "web" ? "Copy link" : "More options"} icon={Platform.OS === "web" ? "copy" : "share-social"} loading={busy === "other"} onPress={shareOther} testID="share-trip-other" />
        {shared ? <Btn small style={{ flex: 1 }} variant="ghost" title="Stop sharing" icon="close-circle" loading={busy === "stop"} onPress={stop} testID="share-trip-stop" /> : null}
      </Row>
    </Card>
  );
}
