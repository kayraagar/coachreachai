import Link from "next/link";
import { shiftWeek, weekRangeLabel } from "@/lib/agenda";

/**
 * Hafta gezinme çubuğu — sol/sağ oklarla hafta değiştirir.
 * Gezinme URL üzerinden yapılır (?hafta=yyyy-MM-dd), böylece her hafta
 * paylaşılabilir/yer imlenebilir bir adrese sahip olur.
 */
export function WeekNav({
  basePath,
  weekStart,
  thisWeekStart,
}: {
  basePath: string;
  weekStart: string;
  thisWeekStart: string;
}) {
  const prev = shiftWeek(weekStart, -1);
  const next = shiftWeek(weekStart, 1);
  const isThisWeek = weekStart === thisWeekStart;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`${basePath}?hafta=${prev}`}
        aria-label="Önceki hafta"
        className="btn btn-ghost !px-3"
      >
        ←
      </Link>

      <div className="min-w-0 flex-1 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {weekRangeLabel(weekStart)}
        </p>
        {!isThisWeek && (
          <Link
            href={basePath}
            className="link-underline text-xs"
            style={{ color: "var(--accent)" }}
          >
            Bu haftaya dön
          </Link>
        )}
      </div>

      <Link
        href={`${basePath}?hafta=${next}`}
        aria-label="Sonraki hafta"
        className="btn btn-ghost !px-3"
      >
        →
      </Link>
    </div>
  );
}
