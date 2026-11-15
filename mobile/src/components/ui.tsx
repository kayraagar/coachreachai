import type { ReactNode } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space, type } from "@/lib/theme";

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[{ flex: 1 }, padded && { paddingHorizontal: space(4), paddingTop: space(2) }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={[type.h1, { marginBottom: space(2) }]}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={[type.h2, { marginTop: space(4), marginBottom: space(2) }]}>{children}</Text>;
}
export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={muted ? type.small : type.body}>{children}</Text>;
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  return <View style={[styles.card, accent && { borderColor: colors.orange }, style]}>{children}</View>;
}

export function Button({
  title, onPress, kind = "primary", disabled, loading, small,
}: {
  title: string; onPress: () => void; kind?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; small?: boolean;
}) {
  const bg = kind === "primary" ? colors.orange : kind === "danger" ? colors.danger : kind === "secondary" ? colors.cardHi : "transparent";
  const fg = kind === "primary" ? colors.orangeInk : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && { paddingVertical: space(2), paddingHorizontal: space(3) },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === "ghost" && { borderWidth: 1, borderColor: colors.line },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }, small && { fontSize: 14 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { backgroundColor: colors.orange, borderColor: colors.orange }]}
    >
      <Text style={{ color: selected ? colors.orangeInk : colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space(3) }}>
      {label ? <Text style={[type.label, { marginBottom: space(1) }]}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" }, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={{ color: colors.danger, marginVertical: space(2) }}>{children}</Text>;
}

/** Test sağlayıcısından gelen içerik gerçek analiz gibi sunulmaz. */
export function TestBadge({ label = "TEST SAĞLAYICI" }: { label?: string }) {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.test, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 }}>
      <Text style={{ color: "#1B0B3A", fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.orange} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(3),
    borderWidth: 1,
    borderColor: colors.line,
  },
  button: {
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    paddingHorizontal: space(5),
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space(1),
  },
  buttonText: { fontSize: 16, fontWeight: "800" },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space(2),
    paddingHorizontal: space(3.5),
    backgroundColor: colors.card,
  },
  input: {
    backgroundColor: colors.bgDeep,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: 16,
  },
});
