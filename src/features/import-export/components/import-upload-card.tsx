"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ImportUploadCardProps = {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: string;
  buttonLabel: string;
  pendingLabel: string;
  children: ReactNode;
};

function ImportFormBody({
  children,
  buttonLabel,
  pendingLabel,
}: {
  children: ReactNode;
  buttonLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <fieldset disabled={pending} className="space-y-4 disabled:cursor-wait">
        {children}

        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
              />
              {pendingLabel}
            </>
          ) : (
            buttonLabel
          )}
        </button>
      </fieldset>

      {pending ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/85 px-6 text-center backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-950" />
            <p className="mt-4 text-sm font-semibold text-slate-950">
              Upload in progress
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Please keep this page open. The button is locked until the Excel
              file finishes processing, so the same import cannot be submitted
              repeatedly from this form.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ImportUploadCard({
  action,
  title,
  description,
  buttonLabel,
  pendingLabel,
  children,
}: ImportUploadCardProps) {
  return (
    <form
      action={action}
      className="relative space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>

      <ImportFormBody
        buttonLabel={buttonLabel}
        pendingLabel={pendingLabel}
      >
        {children}
      </ImportFormBody>
    </form>
  );
}
