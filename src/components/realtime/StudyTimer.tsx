"use client";

import { useActionState, useState } from "react";
import { startStudySession, stopStudySession, cancelStudySession } from "@/lib/actions/study";
import type { FormResult } from "@/lib/actions/types";
import type { Subject, Topic } from "@/lib/database.types";
import { Elapsed } from "./Elapsed";
import { FormStatus } from "@/components/forms/FormStatus";

export type OpenSession = {
  id: string;
  started_at: string;
  subject_id: string | null;
  subjectName: string | null;
  topicName: string | null;
};

/**
 * Canlı çalışma kronometresi. Başlatıldığında veritabanına açık bir oturum
 * satırı yazılır (koç anında "çalışıyor" görür); bitirildiğinde süre ve
 * istenirse doğru/yanlış/boş sayıları tek seferde kaydedilir.
 */
export function StudyTimer({
  open,
  subjects,
  topics,
}: {
  open: OpenSession | null;
  subjects: Subject[];
  topics: Topic[];
}) {
  if (open) return <RunningTimer open={open} />;
  return <IdleTimer subjects={subjects} topics={topics} />;
}

function IdleTimer({ subjects, topics }: { subjects: Subject[]; topics: Topic[] }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    startStudySession,
    undefined
  );
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const filteredTopics = topics.filter((t) => t.subject_id === subjectId);

  return (
    <form action={formAction} className="card reveal flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--baseline)" }} />
        <h2 className="section-title">Çalışma kronometresi</h2>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Başlat dediğin anda koçun panelinde canlı görünürsün; bitirince süre ve çözdüğün
        sorular tek kayıtta işlenir.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Ders</span>
          <select
            name="subject_id"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="field"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {filteredTopics.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="label">Konu (opsiyonel)</span>
            <select name="topic_id" defaultValue="" className="field">
              <option value="">— Belirtilmedi —</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <FormStatus state={state} />

      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Başlatılıyor…" : "Çalışmayı başlat"}
      </button>
    </form>
  );
}

function RunningTimer({ open }: { open: OpenSession }) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    stopStudySession,
    undefined
  );
  const [showFields, setShowFields] = useState(false);

  return (
    <section className="card card-glow reveal flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="live-dot h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--status-good)" }}
          />
          <div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Şu an çalışıyorsun
              {open.subjectName ? ` · ${open.subjectName}` : ""}
              {open.topicName ? ` · ${open.topicName}` : ""}
            </p>
            <Elapsed
              since={open.started_at}
              className="text-3xl font-semibold tracking-tight"
            />
          </div>
        </div>

        <form action={cancelStudySession.bind(null, open.id)}>
          <button className="btn btn-danger-quiet">Oturumu iptal et</button>
        </form>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="session_id" value={open.id} />

        <button
          type="button"
          onClick={() => setShowFields((v) => !v)}
          className="btn btn-ghost self-start"
        >
          {showFields ? "Soru sayılarını gizle" : "Çözdüğüm soruları da gireyim"}
        </button>

        {showFields && (
          <div className="animate-slide-down grid grid-cols-3 gap-3">
            <NumberField label="Doğru" name="correct_count" />
            <NumberField label="Yanlış" name="wrong_count" />
            <NumberField label="Boş" name="blank_count" />
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="label">Not (opsiyonel)</span>
          <input name="note" placeholder="Neye çalıştın, nerede zorlandın?" className="field" />
        </label>

        <FormStatus state={state} okText="Çalışma kaydedildi." />

        <button type="submit" disabled={pending} className="btn btn-primary self-start">
          {pending ? "Kaydediliyor…" : "Bitir ve kaydet"}
        </button>
      </form>
    </section>
  );
}

function NumberField({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input type="number" name={name} min={0} defaultValue={0} className="field tabular" />
    </label>
  );
}
