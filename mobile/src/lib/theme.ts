/** Çita tasarım dili: koyu lacivert zemin, sıcak turuncu vurgu. */
export const colors = {
  bg: "#0E1B33",
  bgDeep: "#08122A",
  card: "#172A4D",
  cardHi: "#1F3762",
  line: "#2A4373",
  text: "#F7F1E8",
  muted: "#9AA7BD",
  orange: "#FF7A1A",
  orangeSoft: "#FFB547",
  orangeInk: "#2B1300",
  success: "#3CC98B",
  danger: "#FF5A5F",
  warning: "#FFC145",
  test: "#B388FF",
};

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const type = {
  h1: { fontSize: 28, fontWeight: "800" as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: "800" as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "700" as const, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase" as const },
};
