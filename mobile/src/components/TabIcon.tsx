import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

export function TabIcon({ name, color, size = 24 }: { name: "koc" | "program" | "gelisim" | "birebir"; color: ColorValue; size?: number }) {
  const s = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "koc" && <Path d="M4 5h16v10H9l-5 4z" {...s} />}
      {name === "program" && (
        <>
          <Rect x="3.5" y="5" width="17" height="15" rx="2" {...s} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...s} />
        </>
      )}
      {name === "gelisim" && <Path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6" {...s} />}
      {name === "birebir" && (
        <>
          <Circle cx="8.5" cy="9" r="3" {...s} />
          <Circle cx="16" cy="9" r="3" {...s} />
          <Path d="M3 19c.8-3 3-4.5 5.5-4.5S13.2 16 14 19M13 15.2c.9-.5 1.9-.7 3-.7 2.5 0 4.7 1.5 5.5 4.5" {...s} />
        </>
      )}
    </Svg>
  );
}
