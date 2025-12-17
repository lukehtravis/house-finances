import { ReactNode } from "react";

type PageShellProps = {
  title: string;
  children?: ReactNode;
};

export function PageShell({ title, children }: PageShellProps) {
  return (
    <section className="w-full">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-50">
        {title}
      </h1>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
        {children}
      </div>
    </section>
  );
}


