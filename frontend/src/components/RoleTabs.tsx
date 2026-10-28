import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

export type TabDef = { name: string; title: string; icon: string; sf: string; hidden?: boolean };

export function RoleTabs({ tabs }: { tabs: TabDef[] }) {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.onSurface}>
        {tabs.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name} hidden={t.hidden}>
            <NativeTabs.Trigger.Icon sf={t.sf as any} />
            <NativeTabs.Trigger.Label>{t.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenListeners={{ tabPress: () => Platform.OS !== "web" && Haptics.selectionAsync() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: t.hidden ? null : undefined,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={(focused ? t.icon : `${t.icon}-outline`) as any} size={size - 2} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
