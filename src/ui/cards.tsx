import { useLayoutEffect, useRef, useState } from "react";
import { buildPots } from "../poker/engine";
import { boardSize, STREETS, type Core } from "../poker/model";
import { dispatch } from "../storage/session";
import { submit } from "../sync/controller";
import { CardSlots, focusNextEmptySlot } from "./card-slots";
import { useSession } from "./use-session";
import { Modal, primary } from "./primitives";

function useFirstEmptySlotFocus() {
  const form = useRef<HTMLFormElement>(null);
  // Runs after Modal's own layout effect has opened the dialog.
  useLayoutEffect(() => focusNextEmptySlot(form.current), []);
  return form;
}
const replaceAt = (list: string[], index: number, value: string) =>
  list.map((v, i) => (i === index ? value : v));

/**
 * Community cards during a hand. While betting is closed this also records the next street being
 * dealt, so entering the cards and advancing is one step.
 */
export function BoardCards({
  core: c,
  close,
}: {
  core: Core;
  close: () => void;
}) {
  const { busy, current } = useSession();
  const form = useFirstEmptySlotFocus();
  const [revision] = useState(current!.revision);
  const stale = current?.revision !== revision;
  const dealing = c.phase === "awaiting";
  const street = dealing ? c.street + 1 : c.street;
  const [board, setBoard] = useState(
    Array.from({ length: boardSize(street) }, (_, i) => c.board[i] ?? ""),
  );
  const [error, setError] = useState("");
  const name = STREETS[street].toLowerCase();
  return (
    <Modal
      title={dealing ? `Deal the ${name}` : "Community cards"}
      close={close}
    >
      <p className="mb-5 text-sm text-slate-500">
        Type a card like <strong>as</strong> or <strong>10h</strong>, or pick it
        from the list. You can leave any card for later and finish at showdown.
      </p>
      <form
        ref={form}
        onSubmit={async (e) => {
          e.preventDefault();
          const cards = board.filter(Boolean);
          try {
            await submit(
              dealing
                ? { type: "deal", board: cards }
                : { type: "board", board: cards },
              revision,
            );
            close();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not save cards.",
            );
          }
        }}
      >
        <CardSlots
          values={board}
          labels={board.map((_, i) => `Community card ${i + 1}`)}
          used={board.filter(Boolean)}
          onChange={(i, card) => setBoard(replaceAt(board, i, card))}
          className="grid grid-cols-5 gap-1 sm:gap-2"
        />
        {stale && (
          <p role="alert" className="mt-4 text-red-700">
            The table changed. Close this action and review the updated turn.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${primary} mt-5 w-full`}
          disabled={busy || stale}
        >
          {dealing ? `Save ${name} cards` : "Save community cards"}
        </button>
      </form>
    </Modal>
  );
}

export function Cards({ core: c, close }: { core: Core; close: () => void }) {
  const { busy } = useSession();
  const form = useFirstEmptySlotFocus();
  const [board, setBoard] = useState(
    Array.from({ length: 5 }, (_, i) => c.board[i] ?? ""),
  );
  const [hands, setHands] = useState<Record<string, string[]>>(
    Object.fromEntries(
      c.players
        .filter((p) => p.status === "active")
        .map((p) => [
          p.id,
          [c.hands[p.id]?.[0] ?? "", c.hands[p.id]?.[1] ?? ""],
        ]),
    ),
  );
  const [mucked, setMucked] = useState(c.mucked);
  const [error, setError] = useState("");
  const pots = buildPots(c);
  const used = [
    ...board,
    ...Object.entries(hands)
      .filter(([id]) => !mucked.includes(id))
      .flatMap(([, cards]) => cards),
  ].filter(Boolean);
  return (
    <Modal title="Show the cards" close={close}>
      <p className="mb-5 text-sm text-slate-500">
        Fill in any missing community cards and the hands players show. Type a
        card like <strong>as</strong> or <strong>10h</strong>, or pick it from
        the list. Only shown hands compete for contested pots. No cards are
        needed to claim an uncontested pot.
      </p>
      <form
        ref={form}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await dispatch({
              type: "showdown",
              board: board.filter(Boolean),
              hands: Object.fromEntries(
                Object.entries(hands)
                  .filter(([id]) => !mucked.includes(id))
                  .map(([id, cards]) => [id, cards.filter(Boolean)]),
              ),
              mucked,
            });
            close();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not save cards.",
            );
          }
        }}
      >
        <h3 className="mb-2 font-bold">Community cards</h3>
        <div className="mb-5">
          <CardSlots
            values={board}
            labels={board.map((_, i) => `Community card ${i + 1}`)}
            used={used}
            disabled={busy}
            onChange={(i, card) => setBoard(replaceAt(board, i, card))}
            className="grid grid-cols-5 gap-1 sm:gap-2"
          />
        </div>
        <div className="space-y-4">
          {c.players
            .filter((p) => p.status === "active")
            .map((p) => {
              const muck = mucked.includes(p.id);
              const cannotMuck = pots.some(
                (pot) =>
                  pot.eligible.includes(p.id) &&
                  pot.eligible.filter((id) => !mucked.includes(id)).length ===
                    1,
              );
              return (
                <div key={p.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold">{p.name}</h3>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={muck}
                        disabled={busy || (!muck && cannotMuck)}
                        onChange={(e) =>
                          setMucked(
                            e.target.checked
                              ? [...mucked, p.id]
                              : mucked.filter((id) => id !== p.id),
                          )
                        }
                      />
                      Muck
                    </label>
                  </div>
                  <CardSlots
                    values={hands[p.id]}
                    labels={hands[p.id].map(
                      (_, i) => `${p.name} card ${i + 1}`,
                    )}
                    used={used}
                    disabled={muck || busy}
                    onChange={(i, card) =>
                      setHands({
                        ...hands,
                        [p.id]: replaceAt(hands[p.id], i, card),
                      })
                    }
                    className="grid grid-cols-2 gap-3"
                  />
                  {cannotMuck && !muck && (
                    <p className="mt-2 text-xs text-slate-500">
                      This hand must keep a claim to at least one pot.
                    </p>
                  )}
                </div>
              );
            })}
        </div>
        {error && (
          <p className="mt-4 text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${primary} mt-5 w-full`}
          disabled={busy}
        >
          Save showdown cards
        </button>
      </form>
    </Modal>
  );
}
