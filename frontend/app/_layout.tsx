import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/ui";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const { colors } = useTheme();
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
