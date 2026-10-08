import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { registerSW } from "virtual:pwa-register";
import { clearSession, loadSession, resumeSession } from "./storage/session";
import { Modal, primary, secondary, Tag } from "./ui/primitives";
import { useWakeLock } from "./ui/use-wake-lock";
import { initializeSync, useSync } from "./sync/controller";
import { useSession } from "./ui/use-session";
import { useClock } from "./chess/store";

let requestUpdate: ((reload?: boolean) => Promise<void>) | undefined;
let updateReady = false;
let offlineReady = false;
const swListeners = new Set<() => void>();
function notifySW() {
  swListeners.forEach((fn) => fn());
}
requestUpdate = registerSW({
  onRegisteredSW(_url, registration) {
    // The initial install callback does not fire on later page loads.
    if (registration) {
      // Registration may finish before activation or control, especially after navigation.
      void navigator.serviceWorker.ready.then(() => {
        offlineReady = true;
        notifySW();
      });
    }
  },
  onNeedRefresh() {
    updateReady = true;
    notifySW();
  },
  onOfflineReady() {
    offlineReady = true;
    notifySW();
  },
});
function Root() {
  const state = useSession();
  const chess = useClock();
  const syncState = useSync();
  useWakeLock(syncState.role === "host");
  const [online, setOnline] = useState(navigator.onLine);
  const [clear, setClear] = useState(false);
  const sw = useSyncExternalStore(
    (fn) => {
      swListeners.add(fn);
      return () => {
        swListeners.delete(fn);
      };
    },
    () => `${updateReady}:${offlineReady}`,
  );
  useEffect(() => {
    void loadSession().then(initializeSync);
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const safeUpdate =
    chess.clock?.phase !== "running" &&
    (!state.current ||
      ["between", "settled"].includes(state.current.core.phase));
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          to="/"
          className="flex items-center gap-2"
          aria-label="PlayKit home"
        >
          <img src="/mark.svg" alt="" className="h-10 w-10" />
          <span className="font-display text-3xl font-black tracking-tight">
            Play<span className="text-play-blue">Kit</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Tag>
            {syncState.role === "guest"
              ? "Joined phone"
              : syncState.role === "host"
                ? "Host device"
                : "Shared device"}
          </Tag>
          <span className="hidden text-sm text-slate-500 sm:block">
            {online
              ? "Together at the table"
              : syncState.role === "guest"
                ? "Offline · waiting for host"
                : "Offline · keep playing"}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-8 sm:px-8">
        {!state.ready ? (
          <p role="status" className="py-16 text-center">
            Opening your table…
          </p>
        ) : (
          <>
            <div aria-live="polite">
              {state.failure && (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl bg-red-50 p-4 text-red-900"
                >
                  {state.failure}
                  {!state.current && (
                    <button
                      className={`${secondary} ml-3`}
                      onClick={() => setClear(true)}
                    >
                      Clear saved game
                    </button>
                  )}
                </div>
              )}
            </div>
            <Outlet />
          </>
        )}
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-slate-500 sm:px-8">
        <span>Tools for real-world play. Keep the cards on the table.</span>
        <span role="status">
          {state.busy || chess.busy
            ? "Saving…"
            : state.current || chess.clock
              ? syncState.role === "guest" && state.current
                ? "Last table update saved on this phone"
                : "Saved on this device"
              : "No account needed"}
          {sw.endsWith(":true") ? " · Offline ready" : ""}
        </span>
      </footer>
      {updateReady && (
        <div className="fixed bottom-4 left-4 right-4 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-lg">
          <p className="text-sm">
            An update is ready.{" "}
            {safeUpdate
              ? "Your saved games will stay here."
              : "Finish any active hand and pause the clock to update."}
          </p>
          <button
            className={primary}
            disabled={!safeUpdate || state.busy || chess.busy}
            onClick={() => void requestUpdate?.(true)}
          >
            Update
          </button>
        </div>
      )}
      {clear && (
        <Modal title="Clear the saved game?" close={() => setClear(false)}>
          <p className="mb-5">This deletes the game saved on this device.</p>
          <button
            className={primary}
            disabled={state.busy}
            onClick={async () => {
              try {
                await clearSession();
                setClear(false);
              } catch {
                /* Store exposes failure. */
              }
            }}
          >
            Clear game
          </button>
        </Modal>
      )}
    </>
  );
}
function Home() {
  const { current, recoveryPending } = useSession();
  return (
    <div className="py-8 sm:py-12">
      <div className="mb-10 max-w-2xl">
        <Tag>Less screen. More play.</Tag>
        <h1 className="mt-5 font-display text-5xl font-black leading-tight tracking-tight sm:text-6xl">
          Tools for
          <br />
          real-world{" "}
          <span className="underline-play text-play-blue">play.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-500">
          Gather your people. Deal the cards. We’ll keep track of the chips and
          whose turn it is.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="relative overflow-hidden rounded-3xl border border-green-100 bg-white p-7 shadow-sm">
          <div className="mb-5 text-5xl" aria-hidden="true">
            ♠
          </div>
          <Tag>No-limit Texas Hold’em</Tag>
          <h2 className="mt-3 font-display text-3xl font-extrabold">
            A seat for everyone.
          </h2>
          <p className="mb-6 mt-3 max-w-sm text-slate-500">
            Track bets, settle side pots, and keep your cash game moving. One
            device for the whole table, with optional joined phones.
          </p>
          {current ? (
            <Link
              to="/poker"
              className={`${primary} inline-block`}
              onClick={() => {
                if (recoveryPending) resumeSession();
              }}
            >
              Resume {current.core.name}
            </Link>
          ) : (
            <Link to="/poker/new" className={`${primary} inline-block`}>
              Set up a poker table →
            </Link>
          )}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-7">
          <div className="mb-5 text-5xl" aria-hidden="true">
            ♞
          </div>
          <Tag>Shared chess clock</Tag>
          <h2 className="mt-3 font-display text-3xl font-extrabold">
            Every second counts.
          </h2>
          <p className="mt-3 max-w-sm text-slate-500">
            A shared chess clock with increments, pause, and quick time
            controls.
          </p>
          <Link to="/chess" className={`${primary} mt-6 inline-block`}>
            Open chess clock →
          </Link>
        </section>
      </div>
    </div>
  );
}
const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <p>
      That page isn’t here.{" "}
      <Link to="/" className="text-play-blue">
        Go home
      </Link>
      .
    </p>
  ),
});
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poker/new",
  component: lazyRouteComponent(() => import("./ui/setup"), "Setup"),
});
const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/poker",
  component: lazyRouteComponent(() => import("./ui/poker"), "Table"),
});
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  component: lazyRouteComponent(() => import("./ui/join"), "Join"),
});
const chessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chess",
  component: lazyRouteComponent(() => import("./ui/chess"), "Chess"),
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    setupRoute,
    tableRoute,
    joinRoute,
    chessRoute,
  ]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
export default function App() {
  return <RouterProvider router={router} />;
}
