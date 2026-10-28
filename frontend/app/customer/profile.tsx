import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TrustedContacts } from "@/src/components/TrustedContacts";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Row, Txt, useToast } from "@/src/ui";

/** Shared profile for customers & drivers. */
export function ProfileScreen({ extra }: { extra?: React.ReactNode }) {
  const { user, signOut, refresh } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/auth/me", { method: "PUT", body: { name, email } });
      await refresh();
      toast("Profile saved");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const links: [string, string, string][] = [
    ["notifications", "Notifications", "/notifications"],
    ["shield-checkmark", "Safety & verification", "/page/safety"],
    ["document-text", "Terms & Conditions", "/page/terms"],
    ["lock-closed", "Privacy Policy", "/page/privacy"],
    ["refresh-circle", "Cancellation & Refunds", "/page/cancellation"],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title">Profile</Txt>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
        <Card tone="grey">
          <Txt v="h3" testID="profile-phone">{user?.phone}</Txt>
          <Txt v="caption">Role: {user?.role}</Txt>
        </Card>
        {extra}
        <Field label="Name" value={name} onChangeText={setName} testID="profile-name-input" />
        <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} testID="profile-email-input" />
        <Btn title="Save" variant="dark" loading={busy} onPress={save} testID="profile-save-button" />
        <View>
          {links.map(([icon, label, href]) => (
            <Pressable key={href} testID={`profile-link-${href.replace(/\//g, "-")}`} onPress={() => router.push(href as any)} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Ionicons name={icon as any} size={20} color={colors.onSurface} />
              <Txt v="bodyBold" style={{ flex: 1 }}>{label}</Txt>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
        <Row>
          <Btn style={{ flex: 1 }} variant="outline" title="Log out" icon="log-out" testID="logout-button" onPress={async () => { await signOut(); router.replace("/"); }} />
        </Row>
      </KeyboardAwareScrollView>
    </View>
  );
}

export default function CustomerProfile() {
  return <ProfileScreen extra={<TrustedContacts />} />;
}
