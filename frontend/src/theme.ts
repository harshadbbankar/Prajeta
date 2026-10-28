// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// Executive Chauffeur Platform tokens (DESIGN.md) — Inter / Round 8
const light = {
  surface: "#FFFFFF",
  onSurface: "#151C27",
  // Stitch canvas (#f9f9ff) and soft blue containers (#f0f3ff / #dce2f3)
  canvas: "#F9F9FF",
  onCanvas: "#151C27",
  tint: "#F0F3FF",
  onTint: "#151C27",
  tintBorder: "#DCE2F3",
  outline: "#747878",
  surfaceSecondary: "#F3F4F6",
  onSurfaceSecondary: "#292929",
  surfaceTertiary: "#E5E7EB",
  onSurfaceTertiary: "#6B7280",
  surfaceInverse: "#171717",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6B7280",
  placeholder: "#9CA3AF",
  brand: "#E53935",
  onBrand: "#FFFFFF",
  brandPrimary: "#E53935",
  brandPrimaryPressed: "#C62828",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#292929",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FDE8E8",
  onBrandTertiary: "#E53935",
  success: "#059669",
  onSuccess: "#FFFFFF",
  successSoft: "#ECFDF5",
  successText: "#047857",
  successBorder: "#A7F3D0",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  warningSoft: "#FFFBEB",
  warningText: "#B45309",
  warningBorder: "#FDE68A",
  error: "#E53935",
  onError: "#FFFFFF",
  errorSoft: "#FEE2E2",
  errorText: "#991B1B",
  errorBorder: "#FCA5A5",
  info: "#1E40AF",
  onInfo: "#FFFFFF",
  infoSoft: "#DBEAFE",
  infoBorder: "#93C5FD",
  pendingSoft: "#FEF3C7",
  pendingText: "#92400E",
  pendingBorder: "#FCD34D",
  violetSoft: "#F5F3FF",
  violetText: "#6D28D9",
  violetBorder: "#DDD6FE",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#F3F4F6",
  scrim: "rgba(23,23,23,0.55)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}



export const fonts = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
  extrabold: "Inter-ExtraBold",
  num: "Inter-SemiBold",
  numBold: "Inter-Bold",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
// Executive Chauffeur Platform: "Round 8"
export const radius = { sm: 6, md: 8, lg: 12, pill: 999 };
