import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWeeklySession, getStudentTrack } from "@/lib/queries";
import { SessionView } from "@/components/session/SessionView";
import { PageHeader } from "@/components/ui/Reveal";
import type { WeeklySession, SessionAction } from "@/lib/database.types";

export default async function OgrenciGorusmeDetayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ session, actions }, track] = await Promise.all([
    getWeeklySession(sessionId),
    getStudentTrack(user!.id),
  ]);

  // RLS zaten paylaşılmamış kayıtları gizler; yine de açıkça doğrula.
  if (!session || session.student_id !== user!.id || session.status !== "shared") notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${session.week_no}. hafta görüşmesi`}
        subtitle="Koçunla konuştuklarınızın kaydı — aksiyon maddelerini buradan işaretleyebilirsin"
        actions={
          <Link href="/ogrenci/gorusmeler" className="btn btn-ghost">
            ← Tüm görüşmeler
          </Link>
        }
      />
      <SessionView
        session={session as WeeklySession}
        actions={actions as SessionAction[]}
        track={track}
        canToggleActions
      />
    </div>
  );
}
