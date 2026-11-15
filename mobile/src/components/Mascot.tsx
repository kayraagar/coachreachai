/**
 * Çita maskotu: sportif, kararlı bir çita başı. Küçük boyutta (24px) da
 * okunabilsin diye az sayıda büyük şekil: turuncu yüz, beyaz ağız bölgesi,
 * çitanın imzası olan siyah "gözyaşı" çizgileri ve lacivert ter bandı.
 */
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

export type MascotMood = "normal" | "happy" | "focus";

export function Mascot({ size = 64, mood = "normal" }: { size?: number; mood?: MascotMood }) {
  const eyeY = mood === "focus" ? 47 : 46;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Çita">
      {/* kulaklar */}
      <Path d="M18 30 L26 8 L40 24 Z" fill="#E86410" />
      <Path d="M82 30 L74 8 L60 24 Z" fill="#E86410" />
      <Path d="M24 26 L27 15 L34 23 Z" fill="#2B1300" />
      <Path d="M76 26 L73 15 L66 23 Z" fill="#2B1300" />
      {/* yüz */}
      <Ellipse cx="50" cy="54" rx="38" ry="36" fill="#FF7A1A" />
      {/* benekler */}
      <G fill="#2B1300">
        <Circle cx="30" cy="34" r="2.6" />
        <Circle cx="70" cy="34" r="2.6" />
        <Circle cx="22" cy="52" r="2.4" />
        <Circle cx="78" cy="52" r="2.4" />
        <Circle cx="50" cy="28" r="2.2" />
      </G>
      {/* ter bandı (sportif) */}
      <Rect x="14" y="36" width="72" height="8" rx="4" fill="#13294B" />
      <Rect x="44" y="36" width="12" height="8" fill="#FFB547" />
      {/* ağız bölgesi */}
      <Ellipse cx="50" cy="70" rx="20" ry="15" fill="#FFF4E6" />
      {/* gözler */}
      {mood === "happy" ? (
        <G stroke="#0E1B33" strokeWidth={3.5} strokeLinecap="round" fill="none">
          <Path d={`M30 ${eyeY + 2} Q36 ${eyeY - 4} 42 ${eyeY + 2}`} />
          <Path d={`M58 ${eyeY + 2} Q64 ${eyeY - 4} 70 ${eyeY + 2}`} />
        </G>
      ) : (
        <G>
          <Ellipse cx="36" cy={eyeY + 2} rx="5.5" ry={mood === "focus" ? 3.6 : 5.5} fill="#0E1B33" />
          <Ellipse cx="64" cy={eyeY + 2} rx="5.5" ry={mood === "focus" ? 3.6 : 5.5} fill="#0E1B33" />
          <Circle cx="37.6" cy={eyeY} r="1.6" fill="#FFFFFF" />
          <Circle cx="65.6" cy={eyeY} r="1.6" fill="#FFFFFF" />
        </G>
      )}
      {/* gözyaşı çizgileri */}
      <Path d="M33 52 Q31 62 37 72" stroke="#2B1300" strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <Path d="M67 52 Q69 62 63 72" stroke="#2B1300" strokeWidth={3.2} fill="none" strokeLinecap="round" />
      {/* burun ve ağız */}
      <Path d="M44 62 L56 62 L50 69 Z" fill="#2B1300" />
      <Path
        d={mood === "happy" ? "M42 74 Q50 82 58 74" : "M44 75 Q50 78 56 75"}
        stroke="#2B1300"
        strokeWidth={2.6}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}
