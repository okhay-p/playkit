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
import { loadTool, useTool } from "./games/store";
import { useToolPhones } from "./games/phones";

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
  const undercover = useTool("undercover");
  const imposter = useTool("imposter");
  const scores = useTool("scorekeeper");
  const tournament = useTool("tournament");
  const pokerSync = useSync();
  const toolSync = useToolPhones();
  const syncState = toolSync.role ? toolSync : pokerSync;
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
    void loadTool("undercover");
    void loadTool("imposter");
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const safeUpdate =
    (!toolSync.view ||
      !("phase" in toolSync.view) ||
      toolSync.view.phase === "finished") &&
    chess.clock?.phase !== "running" &&
    (!undercover.game ||
      !("phase" in undercover.game) ||
      undercover.game.phase === "finished") &&
    (!imposter.game ||
      !("phase" in imposter.game) ||
      imposter.game.phase === "finished") &&
    (!state.current ||
      ["between", "settled"].includes(state.current.core.phase));
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5">
        <Link
          to="/"
          className="group flex items-center gap-2.5"
          aria-label="PlayKit home"
        >
          <img
            src="/mark.svg"
            alt=""
            className="h-10 w-10 rounded-xl shadow-card transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105"
          />
          <span className="font-display text-3xl font-black tracking-tight">
            Play<span className="text-play-blue">Kit</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Tag tone={syncState.role ? "blue" : "slate"}>
            {syncState.role === "guest"
              ? "Joined phone"
              : syncState.role === "host"
                ? "Host device"
                : "Shared device"}
          </Tag>
          <span className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${online ? "bg-play-green" : "bg-play-yellow-deep"}`}
            />
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
                  className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-900"
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
      <footer className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-slate-900/5 px-5 py-6 text-xs text-slate-500 sm:px-8">
        <span>Tools for real-world play. Keep the cards on the table.</span>
        <span role="status">
          {state.busy ||
          chess.busy ||
          undercover.busy ||
          imposter.busy ||
          scores.busy ||
          tournament.busy
            ? "Saving…"
            : state.current ||
                chess.clock ||
                undercover.game ||
                imposter.game ||
                scores.game ||
                tournament.game
              ? syncState.role === "guest" && state.current
                ? "Last table update saved on this phone"
                : "Saved on this device"
              : "No account needed"}
          {sw.endsWith(":true") ? " · Offline ready" : ""}
        </span>
      </footer>
      {updateReady && (
        <div className="update-prompt fixed bottom-4 left-4 right-4 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-lift backdrop-blur-md">
          <p className="text-sm">
            An update is ready.{" "}
            {safeUpdate
              ? "Your saved games will stay here."
              : "Finish any active hand or word game and pause the clock to update."}
          </p>
          <button
            className={primary}
            disabled={
              !safeUpdate ||
              state.busy ||
              chess.busy ||
              undercover.busy ||
              imposter.busy ||
              scores.busy ||
              tournament.busy
            }
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
const accents = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  yellow: "bg-amber-100 text-amber-700",
  coral: "bg-red-100 text-red-600",
} as const;
function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto hidden h-72 w-full max-w-md select-none lg:block"
    >
      <div className="hero-felt" />
      <span className="hero-sun" />
      <span className="hero-block" />
      <div className="hero-card hero-card-a">
        <span>A</span>
        <span>♠</span>
      </div>
      <div className="hero-card hero-card-b red">
        <span>K</span>
        <span>♥</span>
      </div>
      <div className="hero-chips">
        <span className="chip coral" />
        <span className="chip" />
        <span className="chip green" />
      </div>
    </div>
  );
}
const lift =
  "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift";
function Home() {
  const { current, recoveryPending } = useSession();
  return (
    <div className="py-6 sm:py-12">
      <div className="mb-10 grid items-center gap-8 lg:mb-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="max-w-2xl">
          <Tag tone="yellow">Less screen. More play.</Tag>
          <h1 className="mt-5 font-display text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Tools for
            <br />
            real-world{" "}
            <span className="underline-play text-play-blue">play.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-500">
            Gather your people. Deal the cards. We’ll keep track of the chips
            and whose turn it is.
          </p>
        </div>
        <HeroArt />
      </div>
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-12">
        <section
          className={`surface relative overflow-hidden border-green-100 bg-[linear-gradient(135deg,#f0fdf4_0%,#ffffff_58%)] p-6 sm:p-7 md:col-span-2 lg:col-span-7 ${lift}`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-3 -top-12 select-none font-display text-[12rem] font-black leading-none text-green-500/10"
          >
            ♠
          </span>
          <div className="relative">
            <div className={`tile mb-5 ${accents.green}`} aria-hidden="true">
              ♠
            </div>
            <Tag tone="green">No-limit Texas Hold’em</Tag>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
              A seat for everyone.
            </h2>
            <p className="mb-6 mt-3 max-w-sm text-slate-500">
              Track bets, settle side pots, and keep your cash game moving. One
              device for the whole table, with optional joined phones.
            </p>
            {current ? (
              <Link
                to="/poker"
                className={primary}
                onClick={() => {
                  if (recoveryPending) resumeSession();
                }}
              >
                Resume {current.core.name}
              </Link>
            ) : (
              <Link to="/poker/new" className={primary}>
                Set up a poker table →
              </Link>
            )}
          </div>
        </section>
        <section
          className={`surface relative overflow-hidden border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_58%)] p-6 sm:p-7 md:col-span-2 lg:col-span-5 ${lift}`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-10 select-none font-display text-[11rem] font-black leading-none text-blue-500/10"
          >
            ♞
          </span>
          <div className="relative">
            <div className={`tile mb-5 ${accents.blue}`} aria-hidden="true">
              ♞
            </div>
            <Tag tone="blue">Shared chess clock</Tag>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
              Every second counts.
            </h2>
            <p className="mt-3 max-w-sm text-slate-500">
              A shared chess clock with increments, pause, and quick time
              controls.
            </p>
            <Link to="/chess" className={`${primary} mt-6`}>
              Open chess clock →
            </Link>
          </div>
        </section>
        {(
          [
            [
              "Scorekeeper",
              "Keep player and team scores, round by round.",
              "▤",
              "/scorekeeper",
              "yellow",
            ],
            [
              "Tournament manager",
              "Organize matches and see who plays next.",
              "⚑",
              "/tournament",
              "coral",
            ],
            [
              "Undercover",
              "Similar words. Hidden sides. Find who doesn’t belong.",
              "◈",
              "/undercover",
              "blue",
            ],
            [
              "Imposter",
              "One secret word. Someone has to bluff without it.",
              "?",
              "/imposter",
              "green",
            ],
          ] as const
        ).map(([name, description, icon, path, accent]) => (
          <section
            key={name}
            className={`surface flex flex-col p-6 lg:col-span-3 ${lift}`}
          >
            <div className={`tile mb-5 ${accents[accent]}`} aria-hidden="true">
              {icon}
            </div>
            <div>
              <Tag>Shared device · offline</Tag>
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
              {name}
            </h2>
            <p className="mt-2 flex-1 text-slate-500">{description}</p>
            <div className="mt-6">
              <Link to={path} className={`${secondary} px-3.5 text-sm`}>
                Open {name} →
              </Link>
            </div>
          </section>
        ))}
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
const toolRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/tools/join",
    component: lazyRouteComponent(() => import("./ui/tool-phones"), "ToolJoin"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/scorekeeper",
    component: lazyRouteComponent(
      () => import("./ui/game-tools"),
      "Scorekeeper",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/tournament",
    component: lazyRouteComponent(
      () => import("./ui/game-tools"),
      "TournamentManager",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/undercover",
    component: lazyRouteComponent(
      () => import("./ui/game-tools"),
      "Undercover",
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/imposter",
    component: lazyRouteComponent(() => import("./ui/game-tools"), "Imposter"),
  }),
];
const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    setupRoute,
    tableRoute,
    joinRoute,
    chessRoute,
    ...toolRoutes,
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
