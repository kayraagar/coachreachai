"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  /** Dinlenecek tablolar. */
  tables: string[];
  /** Yalnızca bu öğrenciye ait satırları dinle (koç panelinde boş bırakılır;
   *  RLS zaten koçun göremeyeceği satırların olayını göndermez). */
  studentId?: string;
  /** Kanal adı — aynı sayfada birden fazla abonelik çakışmasın diye. */
  channel: string;
};

/**
 * Postgres değişikliklerini dinler ve sunucu bileşenlerini tazeler.
 * Böylece bir cihazda girilen kayıt, diğer cihazda (ve koçun ekranında)
 * sayfa yenilemeye gerek kalmadan belirir.
 */
export function RealtimeRefresh({ tables, studentId, channel }: Props) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(channel);

    const onChange = () => {
      setFlash(true);
      if (timer.current) clearTimeout(timer.current);
      // Kısa bir bekleme, art arda gelen olaylarda tek bir tazeleme yapar.
      timer.current = setTimeout(() => {
        router.refresh();
        setTimeout(() => setFlash(false), 1200);
      }, 400);
    };

    tables.forEach((table) => {
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(studentId ? { filter: `student_id=eq.${studentId}` } : {}),
        },
        onChange
      );
    });

    ch.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [channel, router, studentId, tables]);

  if (!flash) return null;

  return (
    <div
      className="no-print animate-slide-down pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg"
      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      role="status"
      aria-live="polite"
    >
      Veriler güncellendi
    </div>
  );
}
