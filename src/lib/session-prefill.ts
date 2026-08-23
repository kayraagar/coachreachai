import type { getSessionPrefill } from "@/lib/queries";
import type { Prefill } from "@/components/session/SessionForm";
import { formatDuration } from "@/lib/labels";

type Raw = Awaited<ReturnType<typeof getSessionPrefill>>;

/** Sorgu çıktısını görüşme formunun beklediği düz yapıya çevirir. */
export function buildPrefill(raw: Raw): Prefill {
  const { week, nets, weak, routines } = raw;

  const routineNote =
    routines.count === 0
      ? "rutin kaydı yok"
      : [
          routines.avgSleep === null ? null : `uyku ort. ${routines.avgSleep} sa`,
          routines.avgScreen === null ? null : `ekran ort. ${formatDuration(routines.avgScreen)}`,
          `beslenme %${routines.nutritionPct}`,
          `mola %${routines.breaksPct}`,
        ]
          .filter(Boolean)
          .join(" · ");

  return {
    weekNo: week.weekNo,
    start: week.start,
    end: week.end,
    totalQuestions: week.totalQuestions,
    totalMinutes: week.totalMinutes,
    adherencePct: week.adherencePct,
    activeDays: week.activeDays,
    tytNet: nets.tyt,
    aytNet: nets.ayt,
    weakTopics: weak
      .map((w) => `${w.subject} · ${w.topic} (%${w.errorPct} hata)`)
      .join("\n"),
    routineNote,
  };
}
