"use client";

import { useActionState, useState } from "react";
import { saveWeeklySession } from "@/lib/actions/sessions";
import type { FormResult } from "@/lib/actions/types";
import type { SessionAction, WeeklySession } from "@/lib/database.types";
import { MOOD_OPTIONS, ROUTINE_OPTIONS, formatDuration } from "@/lib/labels";
import { trackConfig, type Track } from "@/lib/track";
import { WeeklyAgenda } from "@/components/plan/WeeklyAgenda";
import { weekRangeLabel } from "@/lib/agenda";
import type { AgendaItem } from "@/lib/queries";
import { IconCheck, IconSpark } from "@/components/ui/Icons";

export type Prefill = {
  /** Öğrencinin sınav kolu — 2. maddedeki net alanlarının etiketini belirler. */
  track: Track;
  /** 7. maddedeki haftalık ajandanın planladığı hafta (pazartesi). */
  planWeekStart: string;
  planItems: AgendaItem[];
  weekNo: number;
  start: string;
  end: string;
  totalQuestions: number;
  totalMinutes: number;
  adherencePct: number | null;
  activeDays: number;
  primaryNet: number | null;
  secondaryNet: number | null;
  weakTopics: string;
  routineNote: string;
};

export function SessionForm({
  studentId,
  studentName,
  session,
  actions,
  prefill,
}: {
  studentId: string;
  studentName: string;
  session?: WeeklySession | null;
  actions?: SessionAction[];
  prefill: Prefill;
}) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    saveWeeklySession,
    undefined
  );
  const [open, setOpen] = useState<number | null>(1);
  const config = trackConfig(prefill.track);

  const v = <K extends keyof WeeklySession>(key: K, fallback: string | number = "") =>
    session?.[key] !== undefined && session?.[key] !== null ? String(session[key]) : String(fallback);

  const toggle = (n: number) => setOpen((cur) => (cur === n ? null : n));

  return (
    <form action={formAction} className="flex flex-col gap-3 pb-24">
      {session && <input type="hidden" name="session_id" value={session.id} />}
      <input type="hidden" name="student_id" value={studentId} />

      {/* --- başlık --- */}
      <div className="card card-glow reveal p-5">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Haftalık Görüşme Ajandası
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {studentName}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Hafta no">
            <input
              type="number"
              name="week_no"
              min={1}
              required
              defaultValue={v("week_no", prefill.weekNo)}
              className="field tabular"
            />
          </Field>
          <Field label="Görüşme tarihi">
            <input
              type="date"
              name="meeting_date"
              required
              defaultValue={v("meeting_date", new Date().toISOString().slice(0, 10))}
              className="field"
            />
          </Field>
          <Field label="Görüşme süresi (dk)">
            <input
              type="number"
              name="duration_minutes"
              min={0}
              placeholder="45"
              defaultValue={v("duration_minutes")}
              className="field tabular"
            />
          </Field>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Otomatik veriler {prefill.start} – {prefill.end} aralığından geldi; hepsi elle
          düzeltilebilir.
        </p>
      </div>

      {/* 1 */}
      <Section n={1} title="Geçen Hafta Değerlendirmesi" open={open === 1} onToggle={toggle}>
        <AutoHint
          items={[
            `${prefill.totalQuestions} soru`,
            formatDuration(prefill.totalMinutes),
            prefill.adherencePct === null ? "plan verisi yok" : `%${prefill.adherencePct} uyum`,
            `${prefill.activeDays}/7 aktif gün`,
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Toplam çözülen soru">
            <input
              type="number"
              name="total_questions"
              min={0}
              defaultValue={v("total_questions", prefill.totalQuestions)}
              className="field tabular"
            />
          </Field>
          <Field label="Toplam çalışma süresi (dk)">
            <input
              type="number"
              name="total_study_minutes"
              min={0}
              defaultValue={v("total_study_minutes", prefill.totalMinutes)}
              className="field tabular"
            />
          </Field>
          <Field label="Programa uyum (%)">
            <input
              type="number"
              name="adherence_pct"
              min={0}
              max={100}
              defaultValue={v("adherence_pct", prefill.adherencePct ?? "")}
              className="field tabular"
            />
          </Field>
        </div>
        <Field label="Plan ile gerçekleşen arasındaki fark ve sebebi">
          <textarea
            name="adherence_note"
            rows={3}
            placeholder="Sapma varsa sebebi: yorgunluk, okul yoğunluğu, motivasyon…"
            defaultValue={v("adherence_note")}
            className="field"
          />
        </Field>
      </Section>

      {/* 2 */}
      <Section n={2} title="Net ve Performans Analizi" open={open === 2} onToggle={toggle}>
        <AutoHint
          items={[
            prefill.primaryNet === null
              ? `${config.primary.label} verisi yok`
              : `${config.primary.label} ${prefill.primaryNet}`,
            prefill.secondaryNet === null
              ? `${config.secondary.label} verisi yok`
              : `${config.secondary.label} ${prefill.secondaryNet}`,
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={config.primary.label}>
            <input
              type="number"
              step="0.25"
              name={config.primary.key}
              defaultValue={v(config.primary.key, prefill.primaryNet ?? "")}
              className="field tabular"
            />
          </Field>
          <Field label={config.secondary.label}>
            <input
              type="number"
              step="0.25"
              name={config.secondary.key}
              defaultValue={v(config.secondary.key, prefill.secondaryNet ?? "")}
              className="field tabular"
            />
          </Field>
        </div>
        <Field label={`Genel ${config.primary.label} / ${config.secondary.label} durumu`}>
          <textarea name="net_note" rows={2} defaultValue={v("net_note")} className="field" />
        </Field>
        <Field label="Ağırlıklı yanlış yapılan konular">
          <textarea
            name="weak_topics"
            rows={3}
            placeholder="Her satıra bir konu"
            defaultValue={v("weak_topics", prefill.weakTopics)}
            className="field"
          />
        </Field>
        <Field label="Belirli sürede çözülemeyen soru tipleri">
          <textarea
            name="slow_question_types"
            rows={2}
            placeholder="Örn. paragraf çıkarım soruları, üçgende alan…"
            defaultValue={v("slow_question_types")}
            className="field"
          />
        </Field>
      </Section>

      {/* 3 */}
      <Section n={3} title="Geçen Haftanın Artı / Eksi Değerlendirmesi" open={open === 3} onToggle={toggle}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Artılar">
            <textarea name="positives" rows={4} defaultValue={v("positives")} className="field" />
          </Field>
          <Field label="Eksiler">
            <textarea name="negatives" rows={4} defaultValue={v("negatives")} className="field" />
          </Field>
        </div>
      </Section>

      {/* 4 */}
      <Section n={4} title="Uzun Vadeli Planlama" open={open === 4} onToggle={toggle}>
        <Field label="Eksik olan alanlar">
          <textarea name="missing_areas" rows={3} defaultValue={v("missing_areas")} className="field" />
        </Field>
        <Field label="Yapılabilecekler / tavsiyeler">
          <textarea name="recommendations" rows={3} defaultValue={v("recommendations")} className="field" />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Hedeflenen sınav / dönem sonu net aralığı">
            <input
              name="target_net_range"
              placeholder={config.targetNetPlaceholder}
              defaultValue={v("target_net_range")}
              className="field"
            />
          </Field>
          <Field label="3–4 haftalık kaba yol haritası">
            <textarea name="roadmap" rows={3} defaultValue={v("roadmap")} className="field" />
          </Field>
        </div>
      </Section>

      {/* 5 */}
      <Section n={5} title="Okul ve Çalışma Ortamı Aksiyonları" open={open === 5} onToggle={toggle}>
        <Field label="Öğretmene soru sorma / ek kaynak isteme adımı">
          <input name="school_action" defaultValue={v("school_action")} className="field" />
        </Field>
        <Field label="Okul ile YKS çalışması arasındaki zaman çakışması önlemi">
          <input name="conflict_action" defaultValue={v("conflict_action")} className="field" />
        </Field>
        <Field label="Çalışma ortamı / dikkat dağıtıcılar aksiyonu">
          <input name="environment_action" defaultValue={v("environment_action")} className="field" />
        </Field>
        <Field label="Diğer">
          <input name="other_action" defaultValue={v("other_action")} className="field" />
        </Field>
      </Section>

      {/* 6 */}
      <Section n={6} title="Genel Rutinler" open={open === 6} onToggle={toggle}>
        <AutoHint items={[prefill.routineNote]} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatusSelect label="Uyku düzeni" name="sleep_status" value={v("sleep_status")} />
          <StatusSelect label="Ekran / telefon" name="screen_status" value={v("screen_status")} />
          <StatusSelect label="Beslenme" name="nutrition_status" value={v("nutrition_status")} />
          <StatusSelect label="Mola / nefes" name="break_status" value={v("break_status")} />
        </div>
        <Field label="Rutin notu">
          <textarea name="routines_note" rows={2} defaultValue={v("routines_note")} className="field" />
        </Field>
      </Section>

      {/* 7 */}
      <Section n={7} title="Sonraki Hafta Planı" open={open === 7} onToggle={toggle}>
        <Field label="Bu haftanın ana odağı">
          <input
            name="main_focus"
            placeholder="Örn. Paragraf + Fonksiyonlar konu kapanışı"
            defaultValue={v("main_focus")}
            className="field"
          />
        </Field>
        <Field label="Planlanan deneme(ler)">
          <input
            name="planned_exams"
            placeholder={config.plannedExamPlaceholder}
            defaultValue={v("planned_exams")}
            className="field"
          />
        </Field>
        <Field label="Aksiyon maddeleri (her satır bir madde — öğrenci panelinde işaretlenir)">
          <textarea
            name="actions_raw"
            rows={5}
            placeholder={"Matematik öğretmeninden limit soru kaynağı iste\nTelefonu çalışma masasından kaldır"}
            defaultValue={(actions ?? []).map((a) => a.title).join("\n")}
            className="field"
          />
        </Field>

        {/* Haftalık ajanda — öğrencinin Program sayfasıyla aynı veriyi yazar,
            görüşme kaydedildiğinde birlikte kaydedilir. */}
        <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: "var(--border-hairline)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="label">Haftalık ajanda</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {weekRangeLabel(prefill.planWeekStart)} · öğrencinin Ajanda sayfasında görünür
            </span>
          </div>
          <WeeklyAgenda
            weekStart={prefill.planWeekStart}
            items={prefill.planItems}
            canToggle={false}
          />
        </div>
      </Section>

      {/* 8 */}
      <Section n={8} title="Motivasyon ve Genel Notlar" open={open === 8} onToggle={toggle}>
        <Field label="Öğrencinin genel ruh hali / motivasyonu">
          <select name="mood" defaultValue={v("mood")} className="field">
            <option value="">— Belirtilmedi —</option>
            {MOOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Öne çıkarılacak takdir / geri bildirim">
          <textarea name="coach_feedback" rows={3} defaultValue={v("coach_feedback")} className="field" />
        </Field>
        <Field label="Bir sonraki görüşmeye taşınacak açık madde">
          <textarea name="open_item" rows={2} defaultValue={v("open_item")} className="field" />
        </Field>
      </Section>

      {state && "error" in state && (
        <p
          className="animate-slide-down rounded-xl px-3.5 py-2.5 text-sm"
          style={{ background: "var(--status-critical-soft)", color: "var(--status-critical)" }}
        >
          {state.error}
        </p>
      )}

      {/* --- yapışkan kaydetme çubuğu --- */}
      <div
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl lg:left-64"
        style={{
          borderColor: "var(--border-hairline)",
          background: "color-mix(in oklab, var(--surface-1) 85%, transparent)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {session?.status === "shared"
              ? "Bu görüşme öğrenciyle paylaşıldı."
              : "Taslak yalnızca sende görünür."}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              name="status"
              value="draft"
              disabled={pending}
              className="btn btn-ghost"
            >
              Taslağı kaydet
            </button>
            <button
              type="submit"
              name="status"
              value="shared"
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? "Kaydediliyor…" : (<><IconCheck className="h-4 w-4" /> Kaydet ve paylaş</>)}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({
  n,
  title,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  open: boolean;
  onToggle: (n: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="card reveal overflow-hidden" style={{ ["--d" as string]: `${n * 35}ms` }}>
      <button
        type="button"
        onClick={() => onToggle(n)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]"
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: open ? "var(--accent)" : "var(--accent-soft)",
            color: open ? "var(--accent-contrast)" : "var(--accent)",
          }}
        >
          {n}
        </span>
        <span className="section-title flex-1">{title}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3.5 px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function StatusSelect({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value} className="field">
        <option value="">—</option>
        {ROUTINE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AutoHint({ items }: { items: string[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip chip-accent">
        <IconSpark className="h-3 w-3" />
        Otomatik
      </span>
      {visible.map((t) => (
        <span key={t} className="chip">
          {t}
        </span>
      ))}
    </div>
  );
}
