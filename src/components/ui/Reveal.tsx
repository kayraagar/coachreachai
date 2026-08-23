import type { CSSProperties } from "react";

/** İçeriği yumuşak bir yükselişle sahneye sokar; `delay` ile sıralanır. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "header";
}) {
  return (
    <Tag className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Sayfa başlığı bloğu. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Reveal as="header" className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        <span
          aria-hidden
          className="mt-2 block h-[3px] w-10 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--accent), var(--series-3))" }}
        />
        {subtitle && (
          <p className="mt-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </Reveal>
  );
}

/** Kart görünümlü bölüm; başlık + opsiyonel yan aksiyon. */
export function Panel({
  title,
  hint,
  actions,
  children,
  delay = 0,
  className = "",
  padded = true,
}: {
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  className?: string;
  padded?: boolean;
}) {
  return (
    <Reveal as="section" delay={delay} className={`card card-hover ${padded ? "p-5" : ""} ${className}`}>
      {(title || actions) && (
        <div className={`flex items-start justify-between gap-3 ${padded ? "mb-4" : "p-5 pb-3"}`}>
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {hint && (
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {hint}
              </p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Reveal>
  );
}

/** Boş durum kutusu. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {title}
      </p>
      {hint && (
        <p className="max-w-sm text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
