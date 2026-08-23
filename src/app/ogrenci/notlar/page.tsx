import { createClient } from "@/lib/supabase/server";
import { rel } from "@/lib/rel";
import { NoteForm } from "@/components/forms/NoteForm";
import { PageHeader, Reveal, EmptyState } from "@/components/ui/Reveal";
import { MOOD_LABEL, MOOD_TONE, formatDate } from "@/lib/labels";
import type { Mood } from "@/lib/database.types";

export default async function NotlarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: notes } = await supabase
    .from("notes")
    .select("id, note_date, content, mood, author_id, profiles!notes_author_id_fkey(full_name, role)")
    .eq("student_id", user!.id)
    .order("note_date", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notlar"
        subtitle="Senin ve koçunun karşılıklı notları — görüşmenin 8. maddesinin günlük hali"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <NoteForm />
        </Reveal>

        <section className="flex flex-col gap-3">
          {(notes ?? []).map((n, i) => {
            const tone = n.mood ? MOOD_TONE[n.mood as Mood] : null;
            return (
              <Reveal key={n.id} delay={i * 60} className="card card-hover p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>
                    {formatDate(n.note_date)} · {rel(n.profiles)?.full_name}{" "}
                    <span className="chip ml-1">
                      {rel(n.profiles)?.role === "coach" ? "Koç" : "Sen"}
                    </span>
                  </span>
                  {n.mood && (
                    <span className={`chip ${tone === "neutral" ? "" : `chip-${tone}`}`}>
                      {MOOD_LABEL[n.mood as Mood]}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {n.content}
                </p>
              </Reveal>
            );
          })}
          {(notes ?? []).length === 0 && (
            <div className="card">
              <EmptyState title="Henüz not yok" hint="İlk notunu soldaki formdan ekleyebilirsin." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
