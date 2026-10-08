import { useEffect, useId, useRef, type ReactNode } from "react";

export const primary =
  "rounded-2xl bg-play-blue px-5 py-3 font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export const secondary =
  "rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base outline-none focus:border-play-blue focus:ring-2 focus:ring-blue-100";
export const number = (n: number) => n.toLocaleString();
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border-0 bg-white p-6 text-play-ink shadow-xl backdrop:bg-slate-900/30"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={titleId} className="font-display text-2xl font-extrabold">
          {title}
        </h2>
        <button className={secondary} onClick={close} aria-label="Close dialog">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
      {children}
    </span>
  );
}
