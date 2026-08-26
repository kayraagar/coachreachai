import type { SessionAction, WeeklySession } from "@/lib/database.types";
import { MOOD_LABEL, MOOD_TONE, ROUTINE_LABEL, ROUTINE_TONE, formatDate, formatDuration } from "@/lib/labels";
import { Reveal } from "@/components/ui/Reveal";
import { ActionChecklist } from "./ActionChecklist";
import { trackConfig, type Track } from "@/lib/track";

/** Haftalık Görüşme Ajandası — 8 maddelik okuma görünümü.
 *  Koç detayında ve öğrenci panelinde aynı bileşen kullanılır. */
export function SessionView({
  session,
  actions,
  track,
  canToggleActions = false,
}: {
  session: WeeklySession;
  actions: SessionAction[];
  /** Net alanlarının etiketi öğrencinin sınav koluna göre değişir. */
  track: Track;
  canToggleActions?: boolean;
}) {
  const config = trackConfig(track);

  return (
    <div className="flex flex-col gap-4">
      <Reveal as="section" className="card card-glow p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Haftalık Görüşme Ajandası
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {session.week_no}. hafta · {formatDate(session.meeting_date)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{formatDuration(session.duration_minutes)} görüşme</span>
            <span className={session.status === "shared" ? "chip chip-good" : "chip chip-warn"}>
              {session.status === "shared" ? "Öğrenciyle paylaşıldı" : "Taslak"}
            </span>
          </div>
        </div>
        {session.main_focus && (
          <div
            className="mt-4 rounded-xl border-l-[3px] p-3.5"
            style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>
              Bu haftanın ana odağı
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
              {session.main_focus}
            </p>
          </div>
        )}
      </Reveal>

      {/* 1 — Geçen hafta değerlendirmesi */}
      <Block no={1} title="Geçen Hafta Değerlendirmesi" delay={40}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Toplam çözülen soru" value={session.total_questions ?? "—"} />
          <Metric label="Toplam çalışma süresi" value={formatDuration(session.total_study_minutes)} />
          <Metric
            label="Programa uyum"
            value={session.adherence_pct === null ? "—" : `%${session.adherence_pct}`}
            tone={
              session.adherence_pct === null
                ? undefined
                : session.adherence_pct >= 70
                ? "var(--status-good)"
                : "var(--status-warning)"
            }
          />
        </div>
        <Text label="Plan–gerçekleşme farkı ve sebepleri" value={session.adherence_note} />
      </Block>

      {/* 2 — Net ve performans analizi */}
      <Block no={2} title="Net ve Performans Analizi" delay={80}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label={config.primary.label} value={session[config.primary.key] ?? "—"} />
          <Metric label={config.secondary.label} value={session[config.secondary.key] ?? "—"} />
        </div>
        <Text label="Genel net durumu" value={session.net_note} />
        <Text label="Ağırlıklı yanlış yapılan konular" value={session.weak_topics} />
        <Text label="Belirli sürede çözülemeyen soru tipleri" value={session.slow_question_types} />
      </Block>

      {/* 3 — Artı / eksi */}
      <Block no={3} title="Geçen Haftanın Artı / Eksi Değerlendirmesi" delay={120}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ToneBox tone="good" title="Artılar" value={session.positives} />
          <ToneBox tone="bad" title="Eksiler" value={session.negatives} />
        </div>
      </Block>

      {/* 4 — Uzun vadeli planlama */}
      <Block no={4} title="Uzun Vadeli Planlama" delay={160}>
        <Text label="Eksik olan alanlar" value={session.missing_areas} />
        <Text label="Yapılabilecekler / tavsiyeler" value={session.recommendations} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Text label="Hedeflenen net aralığı" value={session.target_net_range} />
          <Text label="3–4 haftalık yol haritası" value={session.roadmap} />
        </div>
      </Block>

      {/* 5 — Okul ve çalışma ortamı */}
      <Block no={5} title="Okul ve Çalışma Ortamı Aksiyonları" delay={200}>
        <Text label="Öğretmene soru sorma / ek kaynak adımı" value={session.school_action} />
        <Text label="Okul–YKS zaman çakışması önlemi" value={session.conflict_action} />
        <Text label="Çalışma ortamı / dikkat dağıtıcılar" value={session.environment_action} />
        <Text label="Diğer" value={session.other_action} />
      </Block>

      {/* 6 — Genel rutinler */}
      <Block no={6} title="Genel Rutinler" delay={240}>
        <div className="flex flex-wrap gap-2">
          <RoutineChip label="Uyku düzeni" value={session.sleep_status} />
          <RoutineChip label="Ekran/telefon" value={session.screen_status} />
          <RoutineChip label="Beslenme" value={session.nutrition_status} />
          <RoutineChip label="Mola / nefes" value={session.break_status} />
        </div>
        <Text label="Rutin notu" value={session.routines_note} />
      </Block>

      {/* 7 — Sonraki hafta planı */}
      <Block no={7} title="Sonraki Hafta Planı" delay={280}>
        <Text label="Bu haftanın ana odağı" value={session.main_focus} />
        <Text label="Planlanan deneme(ler)" value={session.planned_exams} />
        {actions.length > 0 && (
          <div className="mt-1">
            <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Aksiyon maddeleri
            </p>
            <ActionChecklist actions={actions} interactive={canToggleActions} />
          </div>
        )}
      </Block>

      {/* 8 — Motivasyon ve genel notlar */}
      <Block no={8} title="Motivasyon ve Genel Notlar" delay={320}>
        {session.mood && (
          <span className={`chip chip-${MOOD_TONE[session.mood] === "neutral" ? "accent" : MOOD_TONE[session.mood]}`}>
            Ruh hali: {MOOD_LABEL[session.mood]}
          </span>
        )}
        <Text label="Koçun takdiri / geri bildirimi" value={session.coach_feedback} />
        <Text label="Bir sonraki görüşmeye taşınan açık madde" value={session.open_item} />
      </Block>
    </div>
  );
}

function Block({
  no,
  title,
  children,
  delay,
}: {
  no: number;
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Reveal as="section" delay={delay} className="card card-hover p-5">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {no}
        </span>
        <h3 className="section-title">{title}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </Reveal>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="surface-inset px-3.5 py-3">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="tabular mt-0.5 text-xl font-semibold" style={{ color: tone ?? "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function Text({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function ToneBox({ tone, title, value }: { tone: "good" | "bad"; title: string; value: string }) {
  return (
    <div
      className="rounded-xl border-l-[3px] p-3.5"
      style={{
        background: tone === "good" ? "var(--status-good-soft)" : "var(--status-critical-soft)",
        borderColor: tone === "good" ? "var(--status-good)" : "var(--status-critical)",
      }}
    >
      <p
        className="text-xs font-semibold"
        style={{ color: tone === "good" ? "var(--status-good)" : "var(--status-critical)" }}
      >
        {title}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--text-primary)" }}>
        {value?.trim() || "—"}
      </p>
    </div>
  );
}

function RoutineChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return <span className="chip">{label}: —</span>;
  const tone = ROUTINE_TONE[value as keyof typeof ROUTINE_TONE];
  return (
    <span className={`chip chip-${tone}`}>
      {label}: {ROUTINE_LABEL[value as keyof typeof ROUTINE_LABEL]}
    </span>
  );
}
