"use client";

import { useActionState, type ReactNode } from "react";
import type { FormResult } from "@/lib/actions/types";
import { FormStatus } from "@/components/forms/FormStatus";

/** Server Action formu + durum mesajı (mevcut FormStatus ile). */
export function ActionForm({
  action, children, okText, className,
}: {
  action: (prev: FormResult, formData: FormData) => Promise<FormResult>;
  children: ReactNode;
  okText?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <FormStatus state={state} okText={okText} />
    </form>
  );
}
