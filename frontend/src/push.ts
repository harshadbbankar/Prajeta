import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/src/api";

/** Ask permission, then register this device's native push token for the signed-in user. Never throws. */
export async function registerForPush(userId: string) {
  if (Platform.OS === "web" || !Device.isDevice) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api("/register-push", { body: { user_id: userId, platform: Platform.OS, device_token: tokenResp.data } });
  } catch (e) {
    console.warn("[push] registration skipped", e);
  }
}
