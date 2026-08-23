import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionPrefill } from "@/lib/queries";
import { SessionForm } from "@/components/session/SessionForm";
import { PageHeader } from "@/components/ui/Reveal";
import { buildPrefill } from "@/lib/session-prefill";

export default async function YeniGorusmePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) notFound();

  // Görüşme geçen haftayı değerlendirir → offset 1.
  const raw = await getSessionPrefill(studentId, 1);
  const prefill = buildPrefill(raw);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Yeni haftalık görüşme"
        subtitle="Sayısal alanlar geçen haftanın verisinden otomatik dolduruldu"
        actions={
          <Link href={`/koc/${studentId}/gorusmeler`} className="btn btn-ghost">
            ← Görüşmeler
          </Link>
        }
      />
      <SessionForm
        studentId={studentId}
        studentName={student.full_name || student.email}
        prefill={prefill}
      />
    </div>
  );
}
