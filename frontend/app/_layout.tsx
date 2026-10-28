import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { LogBox, Modal, Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { Btn, Txt, ToastProvider } from "@/src/ui";
import { queryClient } from "@/src/query-client";
import { radius, space, useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Push: foreground display + Android channel — module scope, before any component
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

const openPushUrl = (router: ReturnType<typeof useRouter>, data: any) => {
  const url = data?.deeplink || data?.action_url;
  if (!url) return;
  if (String(url).startsWith("http")) Linking.openURL(url);
  else router.push(url);
};

export default function RootLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) =>
      openPushUrl(router, response.notification.request.content.data || {}),
    );
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openPushUrl(router, response.notification.request.content.data || {});
    });
    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
      if (lastNudge && Date.now() - Number(lastNudge) <= 7 * 24 * 60 * 60 * 1000) return;
      setNudge(true);
    })();
    return () => tapSub.remove();
  }, [router]);

  const closeNudge = async (openSettings: boolean) => {
    await AsyncStorage.setItem("pushNudgeAt", String(Date.now()));
    setNudge(false);
    if (openSettings) Linking.openSettings();
  };
  const [loaded, err] = useFonts({
    "PJS-Regular": require("../assets/fonts/PlusJakartaSans-400.ttf"),
    "PJS-Medium": require("../assets/fonts/PlusJakartaSans-500.ttf"),
    "PJS-SemiBold": require("../assets/fonts/PlusJakartaSans-600.ttf"),
    "PJS-Bold": require("../assets/fonts/PlusJakartaSans-700.ttf"),
    "PJS-ExtraBold": require("../assets/fonts/PlusJakartaSans-800.ttf"),
    "SG-Medium": require("../assets/fonts/SpaceGrotesk-500.ttf"),
    "SG-Bold": require("../assets/fonts/SpaceGrotesk-700.ttf"),
  });

  if (!loaded && !err) return null;

  // One app level ErrorBoundary; GestureHandlerRootView must wrap the whole tree.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AuthProvider>
              <ToastProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
                <Modal visible={nudge} transparent animationType="fade" onRequestClose={() => closeNudge(false)}>
                  <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "center", padding: space.lg }}>
                    <View testID="push-nudge" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }}>
                      <Txt v="h2">Turn on notifications</Txt>
                      <Txt v="body" color={colors.muted}>Get driver arrival, trip and SOS updates instantly, even when Prajeta is closed.</Txt>
                      <Btn title="Open Settings" onPress={() => closeNudge(true)} testID="push-nudge-settings" />
                      <Btn title="Later" variant="ghost" onPress={() => closeNudge(false)} testID="push-nudge-later" />
                    </View>
                  </View>
                </Modal>
              </ToastProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
