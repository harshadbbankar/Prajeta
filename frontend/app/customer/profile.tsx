import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { TrustedContacts } from "@/src/components/TrustedContacts";
import { AddPhone } from "@/src/components/AddPhone";
import { ReferralCard } from "@/src/components/ReferralCard";
import { Garage, GstBilling } from "@/src/components/Garage";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Field, IconBtn, Row, Tag, TopBar, Txt, useToast } from "@/src/ui";

/** Shared profile for customers & drivers. */
export function ProfileScreen({ extra }: { extra?: React.ReactNode }) {
  const { user, signOut, refresh } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.name, user?.email]);
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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar eyebrow="My account" title="Profile" leading={<Ionicons name="person-circle-outline" size={24} color={colors.onSurface} />} right={<IconBtn icon="settings-outline" onPress={() => router.push("/notifications")} testID="profile-settings-button" />} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
        <Card style={{ gap: space.md }} testID="profile-card">
          <Row gap={space.md}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.tint, borderWidth: 2, borderColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" }}>
              <Txt v="h2" style={{ fontFamily: fonts.bold }}>{(user?.name ?? "P").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</Txt>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Row gap={6} style={{ flexWrap: "wrap" }}>
                <Txt v="h2" style={{ fontFamily: fonts.bold }}>{user?.name || "Your name"}</Txt>
                {user?.phone ? <Tag tone="success" icon="checkmark-circle-outline" label="Verified" /> : null}
              </Row>
              <Tag tone="dark" label={`${user?.role ?? ""} member`} />
            </View>
          </Row>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Row style={{ justifyContent: "space-between" }}>
            <Row gap={6} style={{ flex: 1 }}>
              <Ionicons name="call-outline" size={16} color={colors.muted} />
              <Txt v="body" testID="profile-phone">{user?.phone ?? "No mobile number yet"}</Txt>
            </Row>
            {user?.phone ? <Txt v="caption" color={colors.successText}>Primary</Txt> : null}
          </Row>
          {user?.email ? (
            <Row gap={6}>
              <Ionicons name="mail-outline" size={16} color={colors.muted} />
              <Txt v="body" testID="profile-email">{user.email}{user.google ? " · Google" : ""}</Txt>
            </Row>
          ) : null}
          <Row gap={space.md} style={{ backgroundColor: colors.surfaceInverse, borderRadius: radius.md, padding: space.md }}>
            <Ionicons name="shield-checkmark" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Txt v="bodyBold" color={colors.onSurfaceInverse}>Prajeta Safety Shield</Txt>
              <Txt v="caption" color={colors.surfaceTertiary}>Trip OTP · handover PIN · live tracking · SOS</Txt>
            </View>
          </Row>
        </Card>
        <AddPhone />
        {extra}
        <Card style={{ gap: space.md }}>
          <Txt v="h3" style={{ fontFamily: fonts.bold }}>Account details</Txt>
          <Field label="Name" value={name} onChangeText={setName} testID="profile-name-input" />
          <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} editable={!user?.google} testID="profile-email-input" />
          <Btn title="Save" variant="dark" loading={busy} onPress={save} testID="profile-save-button" />
        </Card>
        <Card style={{ paddingVertical: 0 }}>
          {links.map(([icon, label, href], i) => (
            <Pressable key={href} testID={`profile-link-${href.replace(/\//g, "-")}`} onPress={() => router.push(href as any)} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Ionicons name={`${icon}-outline` as any} size={20} color={colors.onSurface} />
              <Txt v="bodyBold" style={{ flex: 1 }}>{label}</Txt>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Card>
        <Row>
          <Btn style={{ flex: 1 }} variant="outline" title="Log out" icon="log-out" testID="logout-button" onPress={async () => { await signOut(); router.replace("/"); }} />
        </Row>
      </KeyboardAwareScrollView>
    </View>
  );
}

export default function CustomerProfile() {
  return <ProfileScreen extra={<><Garage /><GstBilling /><ReferralCard /><TrustedContacts /></>} />;
}
