import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { View } from "react-native";

import { api } from "@/src/api";
import { useConfig } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Sheet, SosPill, Txt } from "@/src/ui";

// Most urgent first: an in-progress trip beats an arrived one, which beats an accepted (future) one
const LIVE = ["IN_PROGRESS", "DRIVER_ARRIVED", "ACCEPTED"];

/** Top-bar SOS: jumps to the live trip's SOS card, or offers emergency calls when no trip is live. */
export function SosQuick({ role }: { role: "customer" | "driver" }) {
  const { colors } = useTheme();
  const cfg = useConfig();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: [role === "customer" ? "my-bookings" : "driver-jobs"],
    queryFn: () => api<any[]>(role === "customer" ? "/bookings" : "/driver/jobs"),
  });
  const live = LIVE.map((st) => (list.data ?? []).find((b) => b.status === st)).find(Boolean);
  const support = (cfg.data?.settings?.support_phone ?? "").replace(/\s/g, "");
  return (
    <>
      <SosPill
        testID="topbar-sos-button"
        onPress={() => (live ? router.push((role === "customer" ? `/booking/${live.id}` : `/trip/${live.id}`) as any) : setOpen(true))}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Emergency help" testID="sos-quick-sheet">
        <View style={{ gap: space.md }}>
          <View style={{ backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <Txt v="bodyBold" color={colors.brandPrimary}>No live trip right now</Txt>
            <Txt v="caption">During a live trip, SOS alerts the Prajeta safety team with your trip and location. In danger now? Call 112.</Txt>
          </View>
          <Btn title="Call 112 (Emergency)" icon="call" variant="danger" onPress={() => Linking.openURL("tel:112")} testID="sos-quick-112" />
          {support ? <Btn title="Call Prajeta support" icon="headset" variant="outline" onPress={() => Linking.openURL(`tel:${support}`)} testID="sos-quick-support" /> : null}
        </View>
      </Sheet>
    </>
  );
}
