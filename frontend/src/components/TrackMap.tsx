import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";

import { BACKEND_URL } from "@/src/api";
import { radius, useTheme } from "@/src/theme";
import { Txt } from "@/src/ui";

export type GeoPoint = { lat: number; lng: number };
export type Marker = GeoPoint & { kind: "driver" | "pickup" | "destination"; id?: string; label?: string; busy?: boolean; selected?: boolean; onPress?: () => void };

const TILE = 256;
const project = (p: GeoPoint, z: number) => {
  const n = TILE * 2 ** z;
  const s = Math.sin((p.lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

/** Lightweight cross-platform map: raster tiles + markers (works on iOS, Android, web and Expo Go). */
export function TrackMap({ markers, height = 240, testID }: { markers: Marker[]; height?: number; testID?: string }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const pts = markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));

  let z = 15;
  if (w && pts.length > 1) {
    for (z = 16; z > 4; z--) {
      const xy = pts.map((p) => project(p, z));
      const dx = Math.max(...xy.map((p) => p.x)) - Math.min(...xy.map((p) => p.x));
      const dy = Math.max(...xy.map((p) => p.y)) - Math.min(...xy.map((p) => p.y));
      if (dx <= w - 80 && dy <= height - 80) break;
    }
  }
  const xy = pts.map((p) => project(p, z));
  const cx = xy.length ? (Math.max(...xy.map((p) => p.x)) + Math.min(...xy.map((p) => p.x))) / 2 : 0;
  const cy = xy.length ? (Math.max(...xy.map((p) => p.y)) + Math.min(...xy.map((p) => p.y))) / 2 : 0;
  const ox = cx - w / 2;
  const oy = cy - height / 2;
  const tiles: { x: number; y: number }[] = [];
  if (w && pts.length) {
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++)
      for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + height) / TILE); ty++) tiles.push({ x: tx, y: ty });
  }

  return (
    <View testID={testID} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
      {tiles.map((t) => (
        <Image
          key={`${z}-${t.x}-${t.y}`}
          source={{ uri: `${BACKEND_URL}/api/tiles/${z}/${t.x}/${t.y}.png` }}
          style={{ position: "absolute", left: t.x * TILE - ox, top: t.y * TILE - oy, width: TILE, height: TILE }}
        />
      ))}
      {w
        ? pts.map((m, i) => {
            const p = xy[i];
            const isDriver = m.kind === "driver";
            const size = isDriver ? (m.selected ? 42 : 36) : 30;
            return (
              <Pressable
                key={m.id ?? m.kind}
                testID={`map-marker-${m.id ?? m.kind}`}
                onPress={m.onPress}
                disabled={!m.onPress}
                style={{
                  position: "absolute",
                  left: p.x - ox - size / 2,
                  top: p.y - oy - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 3,
                  borderColor: m.selected ? colors.brandPrimary : colors.surface,
                  backgroundColor: isDriver ? (m.busy ? colors.muted : colors.surfaceInverse) : m.kind === "pickup" ? colors.brandPrimary : colors.success,
                }}
              >
                {m.label ? (
                  <Txt v="caption" color={colors.onSurfaceInverse} style={{ fontSize: 12, fontWeight: "800" }}>{m.label}</Txt>
                ) : (
                  <Ionicons name={isDriver ? "car-sport" : m.kind === "pickup" ? "location" : "flag"} size={isDriver ? 18 : 14} color={colors.onSurfaceInverse} />
                )}
              </Pressable>
            );
          })
        : null}
      <View style={{ position: "absolute", right: 4, bottom: 2, backgroundColor: colors.surface, paddingHorizontal: 4, borderRadius: 4, opacity: 0.85 }}>
        <Txt v="caption" style={{ fontSize: 9, lineHeight: 12 }}>© OpenStreetMap contributors</Txt>
      </View>
    </View>
  );
}
