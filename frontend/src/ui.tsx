import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { createContext, PropsWithChildren, ReactNode, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

export const money = (paise?: number | null) =>
  `₹${((paise ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const haptic = (kind: "light" | "medium" | "heavy" | "success" | "error" = "light") => {
  if (Platform.OS === "web") return;
  if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  else
    Haptics.impactAsync(
      kind === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy : kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
};

// ------------------------------------------------------------------ Text
type Variant = "display" | "title" | "h2" | "h3" | "body" | "bodyBold" | "caption" | "label" | "num" | "numLg";
export function Txt({
  children,
  v = "body",
  color,
  style,
  numberOfLines,
  testID,
  center,
}: PropsWithChildren<{ v?: Variant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; testID?: string; center?: boolean }>) {
  const { colors } = useTheme();
  const base: Record<Variant, TextStyle> = {
    display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, letterSpacing: -0.56, fontVariant: ["tabular-nums"] },
    title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.24 },
    h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
    h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
    body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
    bodyBold: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
    caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, letterSpacing: 0.12, color: colors.muted },
    label: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 14, letterSpacing: 0.4, textTransform: "uppercase", color: colors.muted },
    num: { fontFamily: fonts.numBold, fontSize: 18, lineHeight: 24, fontVariant: ["tabular-nums"] },
    numLg: { fontFamily: fonts.numBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.22, fontVariant: ["tabular-nums"] },
  };
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[{ color: colors.onSurface }, base[v], color ? { color } : null, center ? { textAlign: "center" } : null, style]}
    >
      {children}
    </Text>
  );
}

// ------------------------------------------------------------------ Button
export function Btn({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  testID,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "dark" | "outline" | "ghost" | "soft" | "success" | "danger";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const palette = {
    primary: [colors.brandPrimary, colors.onBrandPrimary, colors.brandPrimary],
    dark: [colors.surfaceInverse, colors.onSurfaceInverse, colors.surfaceInverse],
    outline: [colors.surface, colors.onSurface, colors.borderStrong],
    ghost: ["transparent", colors.onSurface, "transparent"],
    soft: [colors.brandTertiary, colors.onBrandTertiary, colors.brandTertiary],
    success: [colors.success, colors.onSuccess, colors.success],
    danger: [colors.error, colors.onError, colors.error],
  }[variant];
  const anim = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: Platform.OS !== "web", speed: 40, bounciness: 4 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        disabled={disabled || loading}
        onPressIn={() => anim(0.97)}
        onPressOut={() => anim(1)}
        onPress={() => {
          haptic(variant === "primary" ? "medium" : "light");
          onPress?.();
        }}
        style={{
          backgroundColor: palette[0],
          borderColor: palette[2],
          borderWidth: 1,
          borderRadius: radius.md,
          minHeight: small ? 40 : 52,
          paddingHorizontal: small ? space.md : space.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={palette[1]} />
        ) : (
          <>
            {icon ? <Ionicons name={icon as any} size={small ? 16 : 18} color={palette[1]} /> : null}
            <Text style={{ color: palette[1], fontFamily: fonts.bold, fontSize: small ? 13 : 15 }}>{title}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ------------------------------------------------------------------ Layout
export function Card({ children, style, onPress, testID, tone = "plain" }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; tone?: "plain" | "grey" | "dark" | "tint" }>) {
  const { colors } = useTheme();
  const bg = tone === "grey" ? colors.surfaceSecondary : tone === "dark" ? colors.surfaceInverse : tone === "tint" ? colors.tint : colors.surface;
  const st: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: tone === "plain" || tone === "tint" ? 1 : 0,
    borderColor: tone === "tint" ? colors.tintBorder : colors.border,
    ...(tone === "plain" ? { shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null),
  };
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [st, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  return (
    <View testID={testID} style={[st, style]}>
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.sm, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; gap?: number; testID?: string }>) {
  return <View testID={testID} style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Header({ title, subtitle, back = true, right, eyebrow }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; eyebrow?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + space.sm,
        paddingBottom: space.md,
        paddingHorizontal: space.lg,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
      }}
    >
      {back ? (
        <Pressable
          testID="header-back-button"
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {eyebrow ? <Txt v="label">{eyebrow}</Txt> : null}
        <Txt v="h2" numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 }}>
          {title}
        </Txt>
        {subtitle ? <Txt v="caption">{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

export function Field({
  label,
  testID,
  style,
  error,
  ...rest
}: TextInputProps & { label?: string; testID?: string; error?: string }) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Txt v="label">{label}</Txt> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...rest}
        style={[
          {
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: error || focus ? 1.5 : 1,
            borderColor: error ? colors.error : focus ? colors.onSurface : colors.border,
            paddingHorizontal: space.lg,
            minHeight: rest.multiline ? 96 : 52,
            paddingVertical: rest.multiline ? space.md : 0,
            fontFamily: fonts.medium,
            fontSize: 15,
            color: colors.onSurface,
            textAlignVertical: rest.multiline ? "top" : "center",
          },
          style as any,
        ]}
      />
      {error ? <Txt v="caption" color={colors.error}>{error}</Txt> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, testID, icon }: { label: string; selected?: boolean; onPress?: () => void; testID?: string; icon?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      hitSlop={5}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={{
        height: 38,
        flexShrink: 0,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderColor: selected ? colors.surfaceInverse : colors.border,
        backgroundColor: selected ? colors.surfaceInverse : colors.surface,
      }}
    >
      {icon ? <Ionicons name={icon as any} size={14} color={selected ? colors.onSurfaceInverse : colors.onSurface} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: selected ? colors.onSurfaceInverse : colors.muted }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, height: 56 }}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, alignItems: "center" }}
    >
      {children}
    </ScrollView>
  );
}

export const STATUS_LABELS: Record<string, string> = {
  QUOTE_REQUESTED: "Quote requested",
  QUOTED: "Quote ready",
  PAYMENT_PENDING: "Advance pending",
  AWAITING_ASSIGNMENT: "Confirmed · Assigning",
  ASSIGNED: "Driver offered",
  ACCEPTED: "Driver assigned",
  DRIVER_ARRIVED: "Driver arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
  PENDING: "Unpaid",
  ADVANCE_PAID: "Advance paid",
  PAID: "Paid",
  REFUNDED: "Refunded",
  paid: "Paid",
  created: "Awaiting payment",
  failed: "Failed",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  OFFERED: "Offered",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
  NEW: "New",
};

export function StatusBadge({ status, testID }: { status: string; testID?: string }) {
  const { colors } = useTheme();
  const done = ["COMPLETED", "APPROVED", "PAID", "paid", "resolved", "RESOLVED"];
  const active = ["ACCEPTED", "ADVANCE_PAID", "IN_PROGRESS", "DRIVER_ARRIVED", "AWAITING_ASSIGNMENT", "CONFIRMED", "ACKNOWLEDGED"];
  const bad = ["CANCELLED", "REJECTED", "SUSPENDED", "failed", "DECLINED", "EXPIRED", "OPEN"];
  const warn = ["PAYMENT_PENDING", "QUOTE_REQUESTED", "QUOTED", "PENDING", "SUBMITTED", "UNDER_REVIEW", "created", "open", "refund_pending", "ASSIGNED", "OFFERED", "NEW", "REQUESTED"];
  const [bg, fg, bd] = done.includes(status)
    ? [colors.successSoft, colors.successText, colors.successBorder]
    : bad.includes(status)
      ? [colors.errorSoft, colors.errorText, colors.errorBorder]
      : warn.includes(status)
        ? [colors.pendingSoft, colors.pendingText, colors.pendingBorder]
        : active.includes(status)
          ? [colors.infoSoft, colors.info, colors.infoBorder]
          : [colors.surfaceSecondary, colors.onSurfaceSecondary, colors.border];
  return (
    <View testID={testID} style={{ backgroundColor: bg, borderWidth: 1, borderColor: bd, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" }}>{STATUS_LABELS[status] ?? status.replace(/_/g, " ")}</Text>
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View testID="loading-state" style={{ padding: space.xxl, alignItems: "center", gap: space.md }}>
      <ActivityIndicator color={colors.brandPrimary} />
      {label ? <Txt v="caption">{label}</Txt> : null}
    </View>
  );
}

export function Empty({ icon = "car-outline", title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View testID="empty-state" style={{ padding: space.xxl, alignItems: "center", gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={28} color={colors.muted} />
      </View>
      <Txt v="h3" center>
        {title}
      </Txt>
      {body ? (
        <Txt v="body" color={colors.muted} center>
          {body}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Empty icon="cloud-offline-outline" title="Something went wrong" body={message} action={onRetry ? <Btn small title="Retry" variant="outline" onPress={onRetry} testID="retry-button" /> : null} />
  );
}

export function KV({ k, v, bold, testID }: { k: string; v: ReactNode; bold?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Row style={{ justifyContent: "space-between", paddingVertical: 6 }}>
      <Txt v="body" color={colors.muted} style={{ flexShrink: 1 }}>
        {k}
      </Txt>
      {typeof v === "string" || typeof v === "number" ? (
        <Txt testID={testID} v={bold ? "num" : "bodyBold"} style={{ textAlign: "right", flexShrink: 1, marginLeft: space.md }}>
          {v}
        </Txt>
      ) : (
        v
      )}
    </Row>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />;
}

// ------------------------------------------------------------------ Bottom sheet
export function Sheet({ visible, onClose, title, children, testID }: PropsWithChildren<{ visible: boolean; onClose: () => void; title: string; testID?: string }>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ ...absFill, backgroundColor: colors.scrim }} onPress={onClose} testID="sheet-backdrop" />
        <View
          testID={testID}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: space.lg,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.lg,
            maxHeight: "88%",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space.md }} />
          <Row style={{ justifyContent: "space-between", marginBottom: space.md }}>
            <Txt v="h2">{title}</Txt>
            <Pressable testID="sheet-close-button" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const absFill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

// ------------------------------------------------------------------ Toast
type ToastT = { msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: PropsWithChildren) {
  const [t, setT] = useState<ToastT | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback(
    (msg: string, kind: "ok" | "err" = "ok") => {
      setT({ msg, kind });
      haptic(kind === "ok" ? "success" : "error");
      clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
      timer.current = setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== "web" }).start(() => setT(null)), 3200);
    },
    [anim],
  );
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t ? (
        <Animated.View
          pointerEvents="none"
          testID="toast-message"
          style={{
            position: "absolute",
            left: space.lg,
            right: space.lg,
            top: insets.top + space.sm,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            backgroundColor: t.kind === "ok" ? colors.surfaceInverse : colors.error,
            borderRadius: radius.md,
            padding: space.lg,
            flexDirection: "row",
            gap: space.sm,
            alignItems: "center",
          }}
        >
          <Ionicons name={t.kind === "ok" ? "checkmark-circle" : "alert-circle"} size={20} color={colors.onSurfaceInverse} />
          <Text style={{ color: colors.onSurfaceInverse, fontFamily: fonts.semibold, fontSize: 14, flex: 1 }}>{t.msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------------ simple bar chart
export function Bars({ data, height = 120, color }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: height + 18, gap: 3 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <View style={{ width: "100%", height: Math.max(2, (d.value / max) * height), backgroundColor: color ?? colors.brandPrimary, borderRadius: 3 }} />
          <Text numberOfLines={1} style={{ fontSize: 8, color: colors.muted, marginTop: 4, fontFamily: fonts.medium }}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function HBar({ label, value, max, right, color }: { label: string; value: number; max: number; right: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: space.md }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt v="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Txt>
        <Txt v="caption" style={{ fontFamily: fonts.numBold, color: colors.onSurface }}>
          {right}
        </Txt>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceSecondary, overflow: "hidden" }}>
        <View style={{ height: 8, width: `${Math.max(2, (value / Math.max(max, 1)) * 100)}%`, backgroundColor: color ?? colors.brandPrimary, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export function Stat({ label, value, sub, testID, tone }: { label: string; value: string; sub?: string; testID?: string; tone?: "brand" | "dark" }) {
  const { colors } = useTheme();
  const dark = tone === "dark";
  return (
    <View
      testID={testID}
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        backgroundColor: dark ? colors.surfaceInverse : colors.surface,
        borderWidth: 1,
        borderColor: dark ? colors.surfaceInverse : colors.border,
        borderRadius: radius.lg,
        padding: space.md,
        gap: 4,
      }}
    >
      <Txt v="label" color={dark ? colors.onSurfaceInverse : undefined} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="num" color={dark ? colors.onSurfaceInverse : tone === "brand" ? colors.brandPrimary : undefined} numberOfLines={1}>
        {value}
      </Txt>
      {sub ? (
        <Txt v="caption" color={dark ? colors.surfaceTertiary : undefined} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

export const useScreenStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.canvas },
  rootGrey: { flex: 1, backgroundColor: c.canvas },
  pad: { padding: space.lg, gap: space.lg },
}));

// ------------------------------------------------------------------ Executive Chauffeur (Stitch) building blocks
type TagTone = "dark" | "success" | "warn" | "tint" | "brand" | "outline" | "info";
export function Tag({ label, tone = "tint", icon, testID }: { label: string; tone?: TagTone; icon?: string; testID?: string }) {
  const { colors } = useTheme();
  const [bg, fg, bd] = {
    dark: [colors.surfaceInverse, colors.onSurfaceInverse, colors.surfaceInverse],
    success: [colors.successSoft, colors.successText, colors.successBorder],
    warn: [colors.warningSoft, colors.warningText, colors.warningBorder],
    tint: [colors.tint, colors.onTint, colors.tintBorder],
    brand: [colors.brandTertiary, colors.brandPrimary, colors.errorBorder],
    outline: [colors.surface, colors.onSurface, colors.borderStrong],
    info: [colors.infoSoft, colors.info, colors.infoBorder],
  }[tone];
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: bg, borderColor: bd, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
      {icon ? <Ionicons name={icon as any} size={11} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

export function IconTile({ icon, size = 40, tone = "tint", color }: { icon: string; size?: number; tone?: "tint" | "dark" | "success" | "brand" | "plain"; color?: string }) {
  const { colors } = useTheme();
  const [bg, fg] = {
    tint: [colors.tint, colors.onSurface],
    dark: [colors.surfaceInverse, colors.onSurfaceInverse],
    success: [colors.successSoft, colors.successText],
    brand: [colors.brandTertiary, colors.brandPrimary],
    plain: [colors.surface, colors.onSurface],
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: tone === "plain" ? 1 : 0, borderColor: colors.border }}>
      <Ionicons name={icon as any} size={Math.round(size * 0.5)} color={color ?? fg} />
    </View>
  );
}

/** Section heading used between cards ("Driver Services", "Recent Settlements"). */
export function SectionHead({ title, sub, right, testID }: { title: string; sub?: string; right?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Row testID={testID} style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
      <View style={{ flex: 1 }}>
        <Txt v="h2" style={{ fontFamily: fonts.bold }}>{title}</Txt>
        {sub ? <Txt v="caption" color={colors.muted}>{sub}</Txt> : null}
      </View>
      {right}
    </Row>
  );
}

/** Icon + title row heading inside a card ("Trip Specifications"). */
export function CardTitle({ icon, title, sub, right }: { icon?: string; title: string; sub?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <Row style={{ flex: 1, alignItems: "flex-start" }}>
        {icon ? <Ionicons name={icon as any} size={20} color={colors.onSurface} style={{ marginTop: 2 }} /> : null}
        <View style={{ flex: 1 }}>
          <Txt v="h3" style={{ fontFamily: fonts.bold, fontSize: 17 }}>{title}</Txt>
          {sub ? <Txt v="caption">{sub}</Txt> : null}
        </View>
      </Row>
      {right}
    </Row>
  );
}

/** Bordered selectable box (Stitch segmented choice). Selected = solid dark. */
export function OptionBox({ title, sub, selected, onPress, testID, icon, badge, style }: { title: string; sub?: string; selected?: boolean; onPress?: () => void; testID?: string; icon?: string; badge?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const fg = selected ? colors.onSurfaceInverse : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          flexGrow: 1,
          flexBasis: 0,
          minHeight: 48,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: selected ? colors.surfaceInverse : colors.borderStrong,
          backgroundColor: selected ? colors.surfaceInverse : colors.surface,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {badge ? (
        <View style={{ position: "absolute", top: -9, right: 8, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: colors.surfaceInverse }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.4, color: colors.onSurface }}>{badge}</Text>
        </View>
      ) : null}
      <Row gap={6} style={{ justifyContent: sub ? "flex-start" : "center" }}>
        {icon ? <Ionicons name={(selected ? "checkmark-circle" : icon) as any} size={16} color={fg} /> : null}
        <Text numberOfLines={2} style={{ fontFamily: fonts.semibold, fontSize: 14, color: fg, textAlign: sub ? "left" : "center", flexShrink: 1 }}>{title}</Text>
      </Row>
      {sub ? <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: selected ? colors.surfaceTertiary : colors.muted, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  );
}

/** Red SOS pill used in every top bar. */
export function SosPill({ onPress, testID = "sos-pill" }: { onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic("heavy");
        onPress();
      }}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: pressed ? colors.brandPrimaryPressed : colors.brandPrimary, flexDirection: "row", alignItems: "center", gap: 6 })}
    >
      <Ionicons name="shield" size={14} color={colors.onBrandPrimary} />
      <Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.5 }}>SOS</Text>
    </Pressable>
  );
}

/** Round icon button for top bars (bell, share, settings). */
export function IconBtn({ icon, onPress, testID, dot, bordered }: { icon: string; onPress: () => void; testID?: string; dot?: boolean; bordered?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={6} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: bordered ? 1 : 0, borderColor: colors.borderStrong, backgroundColor: colors.surface }}>
      <Ionicons name={icon as any} size={21} color={colors.onSurface} />
      {dot ? <View style={{ position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary, borderWidth: 1.5, borderColor: colors.surface }} /> : null}
    </Pressable>
  );
}

/** App top bar: location eyebrow + title on the left, actions on the right. */
export function TopBar({ eyebrow, title, sub, right, leading, testID }: { eyebrow?: string; title: string; sub?: string; right?: ReactNode; leading?: ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingBottom: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {leading ?? <Ionicons name="location-outline" size={22} color={colors.onSurface} />}
      <View style={{ flex: 1 }}>
        {eyebrow ? <Txt v="label">{eyebrow}</Txt> : null}
        <Row gap={4}>
          <Txt v="h3" testID={testID} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 17, flexShrink: 1 }}>
            {title}
          </Txt>
          {sub ? <Txt v="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{sub}</Txt> : null}
        </Row>
      </View>
      <Row gap={space.sm}>{right}</Row>
    </View>
  );
}

/** Prajeta brand lockup: red shield mark + red wordmark. */
export function BrandLogo({ size = 34, sub = "Executive chauffeurs", name = "Prajeta", testID = "brand-name" }: { size?: number; sub?: string | null; name?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Row gap={space.sm}>
      <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="shield-checkmark" size={Math.round(size * 0.55)} color={colors.onBrandPrimary} />
      </View>
      <View>
        <Text testID={testID} style={{ fontFamily: fonts.extrabold, fontSize: Math.round(size * 0.5), letterSpacing: 0.8, color: colors.brandPrimary }}>
          {name.toUpperCase()}
        </Text>
        {sub ? <Txt v="label" style={{ fontSize: 9 }}>{sub}</Txt> : null}
      </View>
    </Row>
  );
}

/** Number-plate style registration chip. */
export function Plate({ reg }: { reg: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderWidth: 1.5, borderColor: colors.onSurface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.surface }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, color: colors.onSurface }}>{reg}</Text>
    </View>
  );
}

/** Thin bordered strip of trust badges. */
export function TrustStrip({ items, testID }: { items: { icon: string; label: string }[]; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: space.md }}>
      {items.map((it, i) => (
        <Row key={it.label} gap={6} style={{ flex: 1, paddingHorizontal: space.sm, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
          <Ionicons name={it.icon as any} size={16} color={colors.success} />
          <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.onSurface }}>{it.label}</Text>
        </Row>
      ))}
    </View>
  );
}

/** Vertical pickup → drop timeline with dots. */
export function RouteLine({ stops }: { stops: { label: string; title: string; sub?: string; right?: ReactNode }[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {stops.map((s, i) => (
        <Row key={i} gap={space.md} style={{ alignItems: "stretch" }}>
          <View style={{ width: 16, alignItems: "center" }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, marginTop: 3, backgroundColor: i === 0 ? colors.success : colors.brandPrimary, borderWidth: 3, borderColor: i === 0 ? colors.successSoft : colors.brandTertiary }} />
            {i < stops.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.borderStrong, marginVertical: 2 }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: i < stops.length - 1 ? space.md : 0 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="label" style={{ flex: 1 }}>{s.label}</Txt>
              {s.right}
            </Row>
            <Txt v="h3" style={{ fontFamily: fonts.bold }}>{s.title}</Txt>
            {s.sub ? <Txt v="caption">{s.sub}</Txt> : null}
          </View>
        </Row>
      ))}
    </View>
  );
}

/** Horizontal step progress (Assigned · Arriving · Started · Complete). */
export function StepBar({ steps, current, testID }: { steps: string[]; current: number; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 6 }}>
      {steps.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 6, alignItems: "center" }}>
          <View style={{ height: 5, alignSelf: "stretch", borderRadius: 3, backgroundColor: i < current ? colors.surfaceInverse : i === current ? colors.onSurfaceTertiary : colors.tintBorder }} />
          <Ionicons name={i < current ? "checkmark-circle-outline" : i === current ? "navigate-outline" : "ellipse-outline"} size={14} color={i <= current ? colors.onSurface : colors.muted} />
          <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 10, color: i <= current ? colors.onSurface : colors.muted }}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

/** Big PIN/OTP display boxed inside a tinted card. */
export function PinDisplay({ value, testID, label = "OTP" }: { value: string; testID?: string; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.surfaceInverse, borderRadius: radius.lg, paddingHorizontal: space.xl, paddingVertical: space.md }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.onSurface }}>{label}:</Text>
      <Text testID={testID} style={{ fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: 8, color: colors.onSurface, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

/** Four separate OTP boxes backed by one hidden input. */
export function OtpBoxes({ value, onChange, testID, length = 4 }: { value: string; onChange: (v: string) => void; testID?: string; length?: number }) {
  const { colors } = useTheme();
  const ref = useRef<any>(null);
  const [focus, setFocus] = useState(false);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ alignSelf: "center" }}>
      <Row gap={space.md}>
        {Array.from({ length }).map((_, i) => {
          const active = focus && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <View key={i} style={{ width: 56, height: 64, borderRadius: radius.lg, borderWidth: active ? 3 : 1.5, borderColor: active ? colors.surfaceInverse : colors.outline, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 26, color: colors.onSurface }}>{value[i] ?? ""}</Text>
            </View>
          );
        })}
      </Row>
      <TextInput
        ref={ref}
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: "transparent" }}
        caretHidden
      />
    </Pressable>
  );
}
