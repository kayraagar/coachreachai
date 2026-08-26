"use client";

import { useActionState, useState } from "react";
import { saveWeekPlan } from "@/lib/actions/plan";
import type { FormResult } from "@/lib/actions/types";
import type { AgendaItem } from "@/lib/queries";
import { WeeklyAgenda } from "./WeeklyAgenda";
import { FormStatus } from "@/components/forms/FormStatus";

/**
 * Öğrencinin Program sayfasındaki ajanda — kendi formunu açar ve
 * haftanın tamamını tek seferde kaydeder.
 */
export function AgendaEditor({
  weekStart,
  items,
}: {
  weekStart: string;
  items: AgendaItem[];
}) {
  const [state, formAction, pending] = useActionState<FormResult, FormData>(
    saveWeekPlan,
    undefined
  );
  const [dirty, setDirty] = useState(false);

  // Gönderim anında uyarı düşer; hata olursa FormStatus bunu bildirir ve
  // düzenlemeler istemcide durmaya devam eder. (Effect içinde setState
  // çağırmamak için bayrak burada, olay işleyicisinde sıfırlanıyor.)
  const submit = (formData: FormData) => {
    setDirty(false);
    formAction(formData);
  };

  return (
    <form action={submit} className="flex flex-col gap-4">
      <WeeklyAgenda
        key={weekStart}
        weekStart={weekStart}
        items={items}
        onDirtyChange={setDirty}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Kaydediliyor…" : "Haftayı kaydet"}
        </button>
        {dirty && !pending && (
          <span className="text-xs" style={{ color: "var(--status-warning)" }}>
            Kaydedilmemiş değişiklikler var.
          </span>
        )}
        <FormStatus state={state} okText="Ajanda kaydedildi." />
      </div>
    </form>
  );
}
