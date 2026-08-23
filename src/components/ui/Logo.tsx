/**
 * CoachReachAI marka işareti.
 *
 * Açık "C" koçu, ondan ayrılıp yukarı çıkmış düğüm ise erişilen öğrenciyi ve
 * ilerlemenin yönünü temsil eder. 24'lük ızgarada çizilir; 16 px'e kadar
 * okunaklı kalır. Geometri, public/icon-*.png dosyalarıyla birebir aynıdır.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 15.67 8.49 A 6.4 6.4 0 1 0 15.67 18.97"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="15.32" cy="4.61" r="1.85" fill="currentColor" />
    </svg>
  );
}

/** Gradyanlı marka karosu — kenar çubuğu ve giriş ekranlarında kullanılır. */
export function LogoTile({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[30%] ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(140deg, var(--accent), var(--series-3))",
        color: "var(--accent-contrast)",
        boxShadow: "var(--glow)",
      }}
    >
      {/* üstten gelen ince ışık — karoya derinlik verir */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)",
        }}
      />
      <LogoMark className="relative h-[76%] w-[76%]" />
    </span>
  );
}

/** Yazı markası: "CoachReach" nötr, "AI" gradyanlı. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className ?? ""}`}>
      <span style={{ color: "var(--text-primary)" }}>CoachReach</span>
      <span className="gradient-text">AI</span>
    </span>
  );
}

/** Karo + yazı bir arada. */
export function Logo({
  size = 34,
  textClass = "text-sm",
}: {
  size?: number;
  textClass?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoTile size={size} />
      <Wordmark className={textClass} />
    </div>
  );
}
