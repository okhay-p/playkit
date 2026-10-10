import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const primary = "btn btn-primary";
export const secondary = "btn btn-secondary";
export const iconButton = "btn btn-secondary btn-icon";
export const field = "field";
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
  const [closing, setClosing] = useState(false);
  const dismissing = useRef(false);
  const latestClose = useRef(close);
  useEffect(() => {
    latestClose.current = close;
  }, [close]);
  const [motion] = useState(
    () => document.documentElement.dataset.input === "pointer",
  );
  function dismiss() {
    if (dismissing.current) return;
    dismissing.current = true;
    if (document.documentElement.dataset.input !== "pointer") {
      close();
      return;
    }
    setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    // A fallback covers an interrupted transition or a hidden tab.
    const timeout = window.setTimeout(() => latestClose.current(), 250);
    return () => window.clearTimeout(timeout);
  }, [closing]);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-motion={motion}
      data-closing={closing}
      onTransitionEnd={(event) => {
        if (
          closing &&
          event.target === event.currentTarget &&
          event.propertyName === "opacity"
        )
          close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
      className="sheet m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto p-6 text-play-ink max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2
          id={titleId}
          className="font-display text-2xl font-extrabold tracking-tight"
        >
          {title}
        </h2>
        <button
          className={iconButton}
          onClick={dismiss}
          aria-label="Close dialog"
        >
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
const tones = {
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100",
  green: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-100",
  yellow: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100",
  coral: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-100",
};
export function Tag({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
