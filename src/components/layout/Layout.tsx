import { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type LayoutProps = {
  children: ReactNode;
};

const navLinkClass =
  "px-3 py-1 rounded-md text-sm font-medium transition-colors hover:bg-slate-800";

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
            Co-op House Finances
          </div>
          <nav className="flex gap-2 text-slate-200">
            <NavLink to="/" className={navLinkClass}>
              House Finances
            </NavLink>
            <NavLink to="/rent" className={navLinkClass}>
              Rent
            </NavLink>
            <NavLink to="/receipts" className={navLinkClass}>
              Receipts
            </NavLink>
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}


