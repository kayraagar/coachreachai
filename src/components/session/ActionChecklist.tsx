import type { SessionAction } from "@/lib/database.types";
import { toggleAction } from "@/lib/actions/sessions";
import { IconCheck } from "@/components/ui/Icons";

/** Görüşmeden çıkan aksiyon maddeleri. Öğrenci tarafında işaretlenebilir. */
export function ActionChecklist({
  actions,
  interactive = false,
}: {
  actions: SessionAction[];
  interactive?: boolean;
}) {
  if (actions.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {actions.map((a, i) => {
        const box = (
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all duration-200"
            style={{
              borderColor: a.done ? "var(--status-good)" : "var(--border-strong)",
              background: a.done ? "var(--status-good)" : "transparent",
              color: "var(--accent-contrast)",
            }}
          >
            {a.done && <IconCheck className="h-3 w-3 animate-pop" />}
          </span>
        );

        const text = (
          <span
            className="text-sm transition-colors"
            style={{
              color: a.done ? "var(--text-muted)" : "var(--text-primary)",
              textDecoration: a.done ? "line-through" : "none",
            }}
          >
            {a.title}
          </span>
        );

        return (
          <li
            key={a.id}
            className="animate-pop row-hover flex items-center gap-2.5 rounded-lg px-2 py-1.5"
            style={{ ["--d" as string]: `${i * 50}ms` }}
          >
            {interactive ? (
              <form action={toggleAction.bind(null, a.id, !a.done)} className="contents">
                <button
                  type="submit"
                  className="flex flex-1 items-center gap-2.5 text-left"
                  aria-pressed={a.done}
                >
                  {box}
                  {text}
                </button>
              </form>
            ) : (
              <>
                {box}
                {text}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
