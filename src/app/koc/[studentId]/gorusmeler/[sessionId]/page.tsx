import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWeeklySession, getSessionPrefill } from "@/lib/queries";
import { SessionForm } from "@/components/session/SessionForm";
import { SessionView } from "@/components/session/SessionView";
import { PageHeader } from "@/components/ui/Reveal";
import { buildPrefill } from "@/lib/session-prefill";
import { setSessionStatus, deleteWeeklySession } from "@/lib/actions/sessions";
import type { SessionAction, WeeklySession } from "@/lib/database.types";

export default async function KocGorusmeDetayPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; sessionId: string }>;
  searchParams: Promise<{ duzenle?: string }>;
}) {
  const { studentId, sessionId } = await params;
  const { duzenle } = await searchParams;
  const supabase = await createClient();

  const [{ data: student }, { session, actions }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("id", studentId).maybeSingle(),
    getWeeklySession(sessionId),
  ]);

  if (!student || !session || session.student_id !== studentId) notFound();

  const editing = duzenle === "1";
  const studentName = student.full_name || student.email;

  if (editing) {
    const raw = await getSessionPrefill(studentId, 1);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`${session.week_no}. hafta görüşmesi`}
          subtitle="Düzenleme modu"
          actions={
            <Link href={`/koc/${studentId}/gorusmeler/${sessionId}`} className="btn btn-ghost">
              Vazgeç
            </Link>
          }
        />
        <SessionForm
          studentId={studentId}
          studentName={studentName}
          session={session as WeeklySession}
          actions={actions as SessionAction[]}
          prefill={buildPrefill(raw)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${session.week_no}. hafta görüşmesi`}
        subtitle={studentName}
        actions={
          <>
            <Link href={`/koc/${studentId}/gorusmeler`} className="btn btn-ghost">
              ← Görüşmeler
            </Link>
            {session.status === "draft" ? (
              <form action={setSessionStatus.bind(null, sessionId, studentId, "shared")}>
                <button className="btn btn-primary">Öğrenciyle paylaş</button>
              </form>
            ) : (
              <form action={setSessionStatus.bind(null, sessionId, studentId, "draft")}>
                <button className="btn btn-ghost">Paylaşımı geri al</button>
              </form>
            )}
            <Link
              href={`/koc/${studentId}/gorusmeler/${sessionId}?duzenle=1`}
              className="btn btn-primary"
            >
              Düzenle
            </Link>
          </>
        }
      />

      <SessionView session={session as WeeklySession} actions={actions as SessionAction[]} />

      <form
        action={deleteWeeklySession.bind(null, sessionId, studentId)}
        className="no-print flex justify-end"
      >
        <button className="btn btn-danger-quiet">Bu görüşme kaydını sil</button>
      </form>
    </div>
  );
}
