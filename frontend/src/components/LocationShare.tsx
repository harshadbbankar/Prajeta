import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Row, Txt } from "@/src/ui";

type State = "checking" | "ask" | "denied" | "blocked" | "sharing" | "error";

/** Driver side: shares foreground GPS — with the customer during a trip, or with dispatch while online. */
export function LocationShare({ bookingId, presence }: { bookingId?: string; presence?: boolean }) {
  const path = presence ? "/driver/location" : `/driver/jobs/${bookingId}/location`;
  const { colors } = useTheme();
  const [state, setState] = useState<State>("checking");
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const lastPost = useRef(0);
  const asked = useRef(0);

  const send = useCallback(
    async (l: Location.LocationObject) => {
      if (Date.now() - lastPost.current < 8000) return;
      lastPost.current = Date.now();
      try {
        await api(path, {
          body: { lat: l.coords.latitude, lng: l.coords.longitude, heading: l.coords.heading, speed: l.coords.speed, accuracy: l.coords.accuracy },
        });
        setLastSent(new Date());
      } catch {
        // transient network issue — next fix retries
      }
    },
    [path],
  );

  const start = useCallback(async () => {
    try {
      sub.current?.remove();
      lastPost.current = 0;
      sub.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 20 }, send);
      setState("sharing");
      const cur = await Location.getLastKnownPositionAsync();
      if (cur) send(cur);
    } catch {
      setState("error");
    }
  }, [send]);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? start() : setState(p.canAskAgain ? "ask" : "blocked")))
      .catch(() => setState("ask"));
    return () => sub.current?.remove();
  }, [start]);

  const request = async () => {
    asked.current += 1;
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) return start();
    setState(p.canAskAgain && asked.current < 2 ? "denied" : "blocked");
  };

  if (state === "checking") return null;
  if (state === "sharing")
    return (
      <Card testID="location-sharing-card" tone="grey" style={{ gap: 4 }}>
        <Row>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
          <Txt v="bodyBold">{presence ? "Dispatch can see you're nearby" : "Sharing live location with customer"}</Txt>
        </Row>
        <Txt v="caption">{lastSent ? `Last update ${lastSent.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Getting your position…"} · keep the app open</Txt>
      </Card>
    );

  return (
    <Card testID="location-permission-card" style={{ gap: space.sm, borderColor: colors.warning, borderWidth: 1.5 }}>
      <Row>
        <Ionicons name="navigate-circle" size={22} color={colors.warning} />
        <Txt v="h3" style={{ flex: 1 }}>{presence ? "Get nearby jobs faster" : "Share your live location"}</Txt>
      </Row>
      <Txt v="body" color={colors.muted}>
        {state === "blocked"
          ? "Location access is turned off for Prajeta. Turn it on in settings so your customer can see you arriving."
          : state === "denied"
            ? "Without location, your customer can't see your arrival time and may call you repeatedly."
            : state === "error"
              ? "We couldn't read your location. Check that location/GPS is on and try again."
              : presence
                ? "Share your location while online so our team can send you the closest bookings. Stops when you go offline."
                : "Your customer sees where you are and when you'll arrive. Shared only during this trip."}
      </Txt>
      {state === "blocked" ? (
        Platform.OS === "web" ? (
          <Txt v="caption">Allow location for this site in your browser settings, then reload.</Txt>
        ) : (
          <Btn title="Open Settings" icon="settings" variant="dark" onPress={() => Linking.openSettings()} testID="location-open-settings" />
        )
      ) : (
        <Btn title={state === "ask" ? "Share live location" : "Try again"} icon="navigate" onPress={state === "error" ? start : request} testID="location-share-button" />
      )}
    </Card>
  );
}
