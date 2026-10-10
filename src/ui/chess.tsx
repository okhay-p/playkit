import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  act,
  loadClock,
  pauseClock,
  setupClock,
  useClock,
} from "../chess/store";
import { at, configSchema, type Config } from "../chess/engine";
import { field, Modal, primary, secondary, Tag } from "./primitives";
import { useWakeLock } from "./use-wake-lock";
const defaults: Config = {
  names: ["White", "Black"],
  seconds: [300, 300],
  increment: 0,
  first: 0,
};
function time(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function Chess() {
  const state = useClock();
  const [editing, setEditing] = useState(false);
  const [reset, setReset] = useState(false);
  const [now, setNow] = useState(performance.now());
  const [draft, setDraft] = useState<Config>(state.clock?.config ?? defaults);
  const [invalid, setInvalid] = useState<string | null>(null);
  const running = state.clock?.phase === "running";
  useWakeLock(running);
  useEffect(() => {
    void loadClock();
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "visible") void pauseClock();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pauseClock);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pauseClock);
      void pauseClock();
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(performance.now());
    tick();
    const timer = window.setInterval(tick, 50);
    const checkpoint = window.setInterval(() => {
      void act({ type: "checkpoint" });
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(checkpoint);
    };
  }, [running]);
  const clock = state.clock ? at(state.clock, now) : null;
  useEffect(() => {
    if (running && clock?.phase === "finished")
      void act({ type: "checkpoint" });
  }, [running, clock?.phase]);
  if (!state.ready) return <p role="status">Opening your clock…</p>;
  const setup = !clock || editing;
  return (
    <div className="mx-auto max-w-4xl py-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Tag>Shared chess clock</Tag>
          <h1 className="mt-3 font-display text-3xl font-black">
            Every second counts.
          </h1>
        </div>
        <Link to="/" className={secondary}>
          Back to toolkit
        </Link>
      </div>
      {state.error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-red-900">
          {state.error}
        </p>
      )}
      {setup ? (
        <form
          className="surface p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = configSchema.safeParse(draft);
            if (!parsed.success) {
              setInvalid(
                "Use names of 1–40 characters, starting seconds from 1 to 86,400, and increment from 0 to 3,600. Use whole seconds.",
              );
              return;
            }
            await setupClock(parsed.data);
            setEditing(false);
            setInvalid(null);
          }}
        >
          <h2 className="mb-5 font-display text-2xl font-extrabold">
            Set up your clock
          </h2>
          <div className="mb-5 flex flex-wrap gap-2">
            {[
              [60, 0],
              [180, 2],
              [300, 0],
              [600, 5],
            ].map(([seconds, increment]) => (
              <button
                key={seconds}
                type="button"
                className={secondary}
                onClick={() =>
                  setDraft({
                    ...draft,
                    seconds: [seconds!, seconds!],
                    increment: increment!,
                  })
                }
              >
                {seconds! / 60} + {increment}
              </button>
            ))}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {([0, 1] as const).map((player) => (
              <div key={player} className="space-y-4">
                <label className="block font-bold">
                  Player {player + 1} name
                  <input
                    className={`${field} mt-2`}
                    required
                    maxLength={40}
                    value={draft.names[player]}
                    onChange={(e) => {
                      const names: [string, string] = [...draft.names];
                      names[player] = e.target.value;
                      setDraft({ ...draft, names });
                    }}
                  />
                </label>
                <label className="block font-bold">
                  Player {player + 1} starting seconds
                  <input
                    className={`${field} mt-2`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={86400}
                    step={1}
                    required
                    value={draft.seconds[player]}
                    onChange={(e) => {
                      const seconds: [number, number] = [...draft.seconds];
                      seconds[player] = e.target.valueAsNumber;
                      setDraft({ ...draft, seconds });
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="my-5 grid gap-5 sm:grid-cols-2">
            <label className="block font-bold">
              Increment per move (seconds)
              <input
                className={`${field} mt-2`}
                type="number"
                inputMode="numeric"
                min={0}
                max={3600}
                step={1}
                required
                value={draft.increment}
                onChange={(e) =>
                  setDraft({ ...draft, increment: e.target.valueAsNumber })
                }
              />
            </label>
            <label className="block font-bold">
              First to move
              <select
                className={`${field} mt-2`}
                value={draft.first}
                onChange={(e) =>
                  setDraft({ ...draft, first: Number(e.target.value) as 0 | 1 })
                }
              >
                {draft.names.map((name, i) => (
                  <option key={i} value={i}>
                    {name || `Player ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {invalid && (
            <p role="alert" className="mb-4 text-red-700">
              {invalid}
            </p>
          )}
          <button className={primary} disabled={state.busy}>
            Save clock
          </button>
          {clock && (
            <button
              type="button"
              className={`${secondary} ml-2`}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          )}
        </form>
      ) : (
        <>
          <p
            role="status"
            className="mx-auto mb-5 w-fit max-w-full rounded-full bg-white px-4 py-2 text-center text-sm font-bold shadow-card ring-1 ring-slate-900/5"
          >
            {clock.phase === "finished"
              ? `${clock.config.names[clock.active]} ran out of time.`
              : clock.phase === "running"
                ? `${clock.config.names[clock.active]} to move · tap your clock after moving`
                : clock.phase === "ready"
                  ? `${clock.config.names[clock.active]} moves first · ready to start`
                  : state.recovered
                    ? "Recovered clock · paused. Confirm the times, then resume."
                    : "Clock paused · resume when both players are ready"}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {([0, 1] as const).map((player) => (
              <button
                key={player}
                aria-label={`${clock.config.names[player]} clock`}
                aria-describedby={`chess-time-${player} chess-state-${player}`}
                disabled={
                  clock.phase !== "running" ||
                  clock.active !== player ||
                  state.busy ||
                  !!state.error
                }
                onClick={() => {
                  void act({ type: "move", player });
                }}
                data-active={clock.active === player}
                data-low={
                  clock.phase === "running" &&
                  clock.active === player &&
                  clock.remaining[player] <= 10_000
                }
                data-expired={
                  clock.phase === "finished" && clock.active === player
                }
                className="clock-face min-h-64 touch-manipulation p-3 pb-6 text-center focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-play-blue sm:p-6 sm:pb-8"
              >
                <span className="block break-words text-xl font-bold">
                  {clock.config.names[player]}
                </span>
                <span
                  className="my-6 block font-display text-[clamp(1.6rem,9vw,4.75rem)] font-black leading-none tabular-nums tracking-tight"
                  data-testid={`clock-${player}`}
                  id={`chess-time-${player}`}
                >
                  {time(clock.remaining[player])}
                </span>
                <span
                  id={`chess-state-${player}`}
                  className="block text-xs font-extrabold uppercase tracking-wider"
                >
                  {clock.phase === "finished" && clock.active === player
                    ? "Time expired"
                    : clock.phase === "running" && clock.active === player
                      ? "YOUR TURN · tap to finish move"
                      : clock.phase === "running"
                        ? "Waiting for your move"
                        : clock.phase === "ready"
                          ? "Ready"
                          : "Paused"}
                </span>
                <span className="clock-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, (clock.remaining[player] / (clock.config.seconds[player] * 1000)) * 100))}%`,
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              className={primary}
              disabled={
                clock.phase === "finished" || state.busy || !!state.error
              }
              onClick={() => {
                setNow(performance.now());
                void act({ type: running ? "pause" : "start" });
              }}
            >
              {running
                ? "Pause"
                : clock.phase === "ready"
                  ? "Start clock"
                  : "Resume clock"}
            </button>
            <button
              className={secondary}
              disabled={state.busy}
              onClick={() => setReset(true)}
            >
              Reset clock
            </button>
            <button
              className={secondary}
              disabled={running || state.busy}
              onClick={() => {
                setDraft(clock.config);
                setEditing(true);
              }}
            >
              New clock
            </button>
          </div>
          <p className="mt-5 text-center text-sm text-slate-500">
            +{clock.config.increment}s after each move · saved on this device
            <br />
            Leaving this screen or hiding the app pauses play. After a reload,
            resume explicitly.
          </p>
        </>
      )}
      {reset && (
        <Modal title="Reset the clock?" close={() => setReset(false)}>
          <p className="mb-5">
            Both players return to their configured starting times. Start again
            when you’re ready.
          </p>
          <button
            className={primary}
            disabled={state.busy || !!state.error}
            onClick={async () => {
              await act({ type: "reset" });
              setReset(false);
            }}
          >
            Confirm reset
          </button>
        </Modal>
      )}
    </div>
  );
}
