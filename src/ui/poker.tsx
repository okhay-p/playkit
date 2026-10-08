import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { legalActions, potTotal } from "../poker/engine";
import { STREETS, type Command, type Core } from "../poker/model";
import { clearSession, resumeSession } from "../storage/session";
import { useSession } from "./use-session";
import { Modal, number, primary, secondary, Tag } from "./primitives";
import { Raise } from "./raise";
import { Cards } from "./cards";
import { submit, useSync } from "../sync/controller";
import { Phones, PhoneStatus } from "./phones";
import { Manage } from "./manage";

type Confirmation = { title: string; description: string; command: Command };
type Confirm = Confirmation & { revision: number };
export function Table() {
  const { current, busy, recoveryPending, failure } = useSession();
  const navigate = useNavigate();
  const sync = useSync();
  const hostControls = sync.role !== "guest";
  const [confirm, changeConfirm] = useState<Confirm | null>(null);
  const setConfirm = (value: Confirmation | null) =>
    changeConfirm(
      value && current ? { ...value, revision: current.revision } : null,
    );
  const [panel, setPanel] = useState<
    "cards" | "raise" | "history" | "manage" | "end" | "phones" | null
  >(null);
  async function send(command: Command, revision?: number) {
    try {
      await submit(command, revision);
      return true;
    } catch {
      return false;
    }
  }
  if (!current)
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold">
          Ready when you are.
        </h1>
        <Link to="/poker/new" className={`${primary} mt-5 inline-block`}>
          Set up a table
        </Link>
      </div>
    );
  const c = current.core;
  const dealtSeats = c.players.filter((p) => p.status !== "sitting");
  const dealerAt = dealtSeats.findIndex((p) => p.id === c.dealer);
  const sb =
    dealtSeats.length === 2
      ? c.dealer
      : dealtSeats[(dealerAt + 1) % dealtSeats.length]?.id;
  const bb =
    dealtSeats[
      (dealerAt + (dealtSeats.length === 2 ? 1 : 2)) % dealtSeats.length
    ]?.id;
  const actions = legalActions(c);
  const between = c.phase === "between" || c.phase === "settled";
  const disabled =
    busy ||
    recoveryPending ||
    (!hostControls && (!sync.connected || sync.paused || !sync.seat));
  const actionDisabled = disabled || (!hostControls && c.actor !== sync.seat);
  const names = (ids: string[]) =>
    ids
      .map((id) => c.players.find((p) => p.id === id)?.name ?? "Player")
      .join(", ");
  const record = (kind: "fold" | "check" | "call" | "all-in") => {
    if (!actions) return;
    const verb =
      kind === "call"
        ? `call ${number(actions.call)}`
        : kind === "all-in"
          ? `go all-in for ${number(actions.player.stack)}`
          : kind;
    setConfirm({
      title: `${actions.player.name}: ${verb}?`,
      description:
        kind === "fold"
          ? "This player gives up this hand and any claim to its pots."
          : "Record the action once the player has made their choice at the table.",
      command: { type: "action", playerId: actions.player.id, kind },
    });
  };
  return (
    <div className="pb-3">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="text-xs font-bold text-slate-400">
            ← THE TOOLKIT
          </Link>
          <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">
            {c.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag>Hold’em · no limit</Tag>
            <Tag>
              Blinds {number(c.smallBlind)} / {number(c.bigBlind)}
            </Tag>
            <Tag>{c.handNumber ? `Hand ${c.handNumber}` : "Ready to deal"}</Tag>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hostControls && (
            <button
              className={secondary}
              disabled={busy || recoveryPending}
              onClick={() => setPanel("phones")}
            >
              Phones
            </button>
          )}
          <button className={secondary} onClick={() => setPanel("history")}>
            History
          </button>
          <button
            className={secondary}
            disabled={disabled || !hostControls || !between}
            onClick={() => setPanel("manage")}
          >
            Table
          </button>
          <button
            className={`${secondary} text-slate-500`}
            disabled={disabled || !hostControls}
            onClick={() => setPanel("end")}
          >
            End
          </button>
        </div>
      </div>
      <PhoneStatus />
      {recoveryPending && hostControls && (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div>
            <h2 className="font-bold">Your saved table is ready.</h2>
            <p className="text-sm text-slate-600">
              Hand {c.handNumber} · {STREETS[c.street]} ·{" "}
              {actions
                ? `${actions.player.name}’s turn`
                : c.phase === "settled"
                  ? "Hand settled"
                  : c.phase === "between"
                    ? "Between hands"
                    : "Waiting for the table"}
              . Review it before continuing.
            </p>
          </div>
          <button className={primary} onClick={resumeSession}>
            Resume game
          </button>
        </section>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="order-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:order-1">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">Around the table</h2>
            <span className="text-xs font-bold text-slate-400">
              CLOCKWISE SEATS
            </span>
          </div>
          <div
            className={`poker-surface ${c.players.length > 6 ? "crowded" : ""}`}
          >
            <div className="table-felt" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="mb-3 flex -space-x-2" aria-hidden="true">
                <span className="chip coral" />
                <span className="chip" />
                <span className="chip green" />
              </div>
              <span className="mt-1 text-xs font-bold tracking-widest text-green-800">
                {between ? "LAST POT" : "POT TOTAL"}
              </span>
              <span className="font-display text-4xl font-black sm:text-5xl">
                {number(between ? (c.lastResult?.total ?? 0) : potTotal(c))}
              </span>
              <span className="mt-1 text-sm text-green-800">
                {between ? "Between hands" : STREETS[c.street]}
              </span>
              {c.phase === "showdown" || c.phase === "preview" ? (
                <Tag>Showdown</Tag>
              ) : null}
            </div>
            {c.players.map((p, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / c.players.length;
              const active = c.actor === p.id;
              return (
                <div
                  key={p.id}
                  className="seat"
                  style={{
                    left: `clamp(54px, ${50 + 37 * Math.cos(angle)}%, calc(100% - 54px))`,
                    top: `${50 + 37 * Math.sin(angle)}%`,
                  }}
                >
                  <div
                    className={`rounded-2xl border p-3 text-center shadow-sm ${active ? "border-green-400 bg-white ring-4 ring-green-100" : "border-slate-200 bg-white"} ${p.status === "folded" && !between ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${active ? "bg-play-green text-white" : "bg-blue-50 text-play-blue"}`}
                    >
                      {i + 1}
                    </div>
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <div className="font-display text-xl font-black">
                      {number(p.stack)}
                    </div>
                    <div className="mt-1 flex min-h-5 items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
                      {c.dealer === p.id && (
                        <span className="rounded-full bg-play-yellow px-1.5 text-play-ink">
                          D
                        </span>
                      )}
                      {!between && p.id === sb && (
                        <span className="rounded-full bg-blue-50 px-1.5 text-play-blue">
                          SB
                        </span>
                      )}
                      {!between && p.id === bb && (
                        <span className="rounded-full bg-blue-50 px-1.5 text-play-blue">
                          BB
                        </span>
                      )}
                      {active ? (
                        <span className="text-green-700">
                          {hostControls || sync.seat === p.id
                            ? "YOUR TURN"
                            : "ACTING"}
                        </span>
                      ) : !between && p.status === "folded" ? (
                        "FOLDED"
                      ) : !between && p.status === "active" && p.stack === 0 ? (
                        "ALL-IN"
                      ) : p.stack === 0 ? (
                        "SITTING OUT"
                      ) : (
                        "CHIPS"
                      )}
                    </div>
                  </div>
                  {p.contribution > 0 && (
                    <div className="mx-auto mt-1 w-fit rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
                      In pot {number(p.contribution)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-2 border-t border-slate-100 px-4 py-4">
            {STREETS.map((s, i) => (
              <span
                key={s}
                className={`rounded-full px-2.5 py-1.5 text-xs font-bold ${!between && i === c.street ? "bg-blue-50 text-play-blue" : "text-slate-400"}`}
              >
                {s}
              </span>
            ))}
          </div>
        </section>
        <aside className="order-1 space-y-4 lg:order-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {actions ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <Tag>Up next</Tag>
                  <span className="h-2.5 w-2.5 rounded-full bg-play-green" />
                </div>
                <h2 className="font-display text-3xl font-black">
                  {actions.player.name}’s turn
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {STREETS[c.street]} · {number(actions.player.stack)} chips
                  left
                </p>
                <div className="my-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3">
                    <p className="text-xs text-slate-500">To call</p>
                    <p className="font-display text-2xl font-black">
                      {number(actions.call)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">This street</p>
                    <p className="font-display text-2xl font-black">
                      {number(actions.player.streetBet)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`${primary} col-span-2`}
                    disabled={actionDisabled}
                    onClick={() => record(actions.check ? "check" : "call")}
                  >
                    {actions.check
                      ? "Check"
                      : `Call ${number(actions.call)}${actions.call === actions.player.stack ? " · all-in" : ""}`}
                  </button>
                  <button
                    className={secondary}
                    disabled={actionDisabled || !actions.raise}
                    onClick={() => setPanel("raise")}
                  >
                    {c.currentBet ? "Raise" : "Bet"}
                  </button>
                  <button
                    className={`${secondary} text-red-600`}
                    disabled={actionDisabled}
                    onClick={() => record("fold")}
                  >
                    Fold
                  </button>
                  <button
                    className={`${secondary} col-span-2`}
                    disabled={actionDisabled || !actions.allIn}
                    onClick={() => record("all-in")}
                  >
                    All-in · {number(actions.player.stack)}
                  </button>
                </div>
                {!actions.raise && actions.maximum > c.currentBet && (
                  <p className="mt-3 text-xs text-slate-500">
                    Raising is unavailable: action hasn’t reopened or every
                    opponent is all-in.
                  </p>
                )}
                <p className="mt-4 text-xs text-slate-400">
                  {hostControls
                    ? "Anyone can record the table’s actions."
                    : c.actor === sync.seat
                      ? "Choose your action at the physical table, then record it here."
                      : "Waiting for your turn. The host can record this player’s action."}
                </p>
              </>
            ) : between ? (
              <>
                <Tag>
                  {c.phase === "settled" ? "Hand complete" : "Everyone ready?"}
                </Tag>
                <h2 className="mt-3 font-display text-2xl font-black">
                  {c.phase === "settled" ? "Ready for another?" : "Let’s play."}
                </h2>
                <p className="mb-5 mt-2 text-sm text-slate-500">
                  {c.phase === "settled"
                    ? "Starting the next hand locks in this hand’s result and moves the dealer."
                    : "Deal the physical cards. Starting the hand posts the blinds automatically."}
                </p>
                <button
                  className={`${primary} w-full`}
                  disabled={
                    disabled ||
                    !hostControls ||
                    c.players.filter((p) => p.stack > 0).length < 2
                  }
                  onClick={() =>
                    setConfirm({
                      title: c.handNumber
                        ? "Start the next hand?"
                        : "Start the first hand?",
                      description:
                        "Make sure the players are ready and the physical cards are dealt.",
                      command: { type: "start" },
                    })
                  }
                >
                  {c.handNumber ? "Next hand" : "Start hand"}
                </button>
                {c.players.filter((p) => p.stack > 0).length < 2 && (
                  <p className="mt-3 text-sm text-red-600">
                    At least two players need chips. Add a rebuy in Table.
                  </p>
                )}
              </>
            ) : c.phase === "awaiting" ? (
              <>
                <Tag>Betting complete</Tag>
                <h2 className="mt-3 font-display text-2xl font-black">
                  Deal the {STREETS[c.street + 1].toLowerCase()}.
                </h2>
                <p className="mb-5 mt-2 text-sm text-slate-500">
                  Place the physical community cards on the table. Enter the
                  cards together at showdown.
                </p>
                <button
                  className={`${primary} w-full`}
                  disabled={disabled || !hostControls}
                  onClick={() => void send({ type: "deal" })}
                >
                  {STREETS[c.street + 1]} dealt
                </button>
              </>
            ) : (
              <>
                <Tag>Showdown</Tag>
                <h2 className="mt-3 font-display text-2xl font-black">
                  Time to show.
                </h2>
                <p className="mb-5 mt-2 text-sm text-slate-500">
                  Enter the community cards and the hands players show. Mucked
                  hands give up their claim.
                </p>
                <button
                  className={`${primary} w-full`}
                  disabled={disabled || !hostControls}
                  onClick={() => setPanel("cards")}
                >
                  Enter cards
                </button>
                <button
                  className={`${secondary} mt-3 w-full`}
                  disabled={disabled || !hostControls}
                  onClick={() => void send({ type: "preview" })}
                >
                  Preview payout
                </button>
              </>
            )}
            {hostControls && current.undo.length > 0 && (
              <button
                className="mt-5 w-full text-sm font-bold text-slate-500 hover:text-play-blue disabled:opacity-40"
                disabled={disabled}
                onClick={() =>
                  setConfirm({
                    title: "Undo the last change?",
                    description: current.undo.at(-1)!.label,
                    command: { type: "undo" },
                  })
                }
              >
                ↶ Undo last change
              </button>
            )}
          </section>
          {c.refunds.length > 0 && (
            <section className="rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-900">
              {c.refunds.map((r, i) => (
                <p key={i}>
                  {names([r.playerId])}: {number(r.amount)} uncalled chips
                  returned.
                </p>
              ))}
            </section>
          )}
          {c.phase === "preview" && c.preview && (
            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="font-display text-xl font-extrabold">
                Review the payout
              </h2>
              <Payout core={c} />
              <p className="my-4 text-xs text-slate-500">
                These chips haven’t been added to stacks yet.
              </p>
              <button
                className={`${primary} w-full`}
                disabled={disabled || !hostControls}
                onClick={() =>
                  setConfirm({
                    title: "Confirm this payout?",
                    description: `Distribute ${number(c.preview!.total)} chips as shown in the preview. You can undo this until the next hand starts.`,
                    command: { type: "settle" },
                  })
                }
              >
                Confirm payout
              </button>
            </section>
          )}
          {c.phase === "settled" && c.lastResult && (
            <section className="rounded-3xl border border-green-100 bg-green-50 p-5">
              <h2 className="font-display text-xl font-extrabold">
                Chips settled ✓
              </h2>
              <Payout core={c} />
            </section>
          )}
          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Latest at the table</h2>
              <span className="text-play-yellow" aria-hidden="true">
                ✦
              </span>
            </div>
            {current.events.length ? (
              <ol className="space-y-3 text-sm text-slate-500">
                {current.events
                  .slice(-3)
                  .reverse()
                  .map((e) => (
                    <li key={e.id}>
                      {e.correction ? "↶ " : ""}
                      {e.message}
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">
                Your table is set. Good company, good cards.
              </p>
            )}
          </section>
        </aside>
      </div>
      {confirm && (
        <Modal
          title={confirm.title}
          close={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="mb-6 text-slate-500">{confirm.description}</p>
          {failure && <p className="mb-4 text-sm text-red-600">{failure}</p>}
          {confirm.revision !== current.revision && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              The table changed. Close this action and review the updated turn.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              className={secondary}
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className={primary}
              disabled={
                disabled ||
                (confirm !== null && confirm.revision !== current.revision)
              }
              onClick={async () => {
                if (await send(confirm.command, confirm.revision))
                  setConfirm(null);
              }}
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
      {panel === "phones" && hostControls && (
        <Phones close={() => setPanel(null)} />
      )}
      {panel === "raise" && actions && (
        <Raise core={c} close={() => setPanel(null)} />
      )}
      {panel === "cards" && <Cards core={c} close={() => setPanel(null)} />}
      {panel === "history" && (
        <Modal title="Table history" close={() => setPanel(null)}>
          {current.events.length ? (
            <ol className="space-y-4">
              {[...current.events].reverse().map((e) => (
                <li key={e.id} className="border-b border-slate-100 pb-3">
                  <span className="text-xs text-slate-400">
                    Hand {e.hand} · {new Date(e.at).toLocaleTimeString()}
                    {e.correction && " · Correction"}
                  </span>
                  <p className="mt-1 text-sm">{e.message}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-slate-500">
              Actions will appear here once the game begins.
            </p>
          )}
        </Modal>
      )}
      {panel === "manage" && between && (
        <Manage core={c} close={() => setPanel(null)} />
      )}
      {panel === "end" && (
        <Modal title="End this table?" close={() => setPanel(null)}>
          <p className="mb-4 text-slate-500">
            This clears this table, its stacks, and its history from this
            device. Record any balances you need first.
          </p>
          <ul className="mb-5 space-y-2">
            {c.players.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                <strong>
                  {number(p.stack)} chips
                  {p.contribution ? ` + ${number(p.contribution)} in pot` : ""}
                </strong>
              </li>
            ))}
          </ul>
          {failure && <p className="mb-4 text-sm text-red-600">{failure}</p>}
          <button
            className={`${primary} w-full`}
            disabled={busy}
            onClick={async () => {
              try {
                await clearSession();
                setPanel(null);
                await navigate({ to: "/" });
              } catch {
                /* Store exposes failure. */
              }
            }}
          >
            End and clear table
          </button>
        </Modal>
      )}
    </div>
  );
}
function Payout({ core: c }: { core: Core }) {
  const result = c.preview ?? c.lastResult;
  if (!result) return null;
  const name = (id: string) =>
    c.players.find((p) => p.id === id)?.name ?? "Player";
  return (
    <div className="mt-3 space-y-3">
      {result.pots.map((p, i) => (
        <div className="rounded-xl bg-white/80 p-3" key={i}>
          <div className="flex justify-between text-sm font-bold">
            <span>{i ? `Side pot ${i}` : "Main pot"}</span>
            <span>{number(p.amount)}</span>
          </div>
          <p className="mt-1 text-sm">{p.winners.map(name).join(" + ")}</p>
          <p className="text-xs text-slate-500">{p.description}</p>
        </div>
      ))}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        {Object.entries(result.awards).map(([id, amount]) => (
          <div key={id} className="flex justify-between text-sm">
            <span>{name(id)}</span>
            <strong>
              +{number(amount)}
              {c.preview && (
                <span className="ml-1 text-xs font-normal text-slate-500">
                  → {number(c.players.find((p) => p.id === id)!.stack + amount)}
                </span>
              )}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
