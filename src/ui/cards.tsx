import { useState } from "react";
import { DECK, suitGlyph } from "../poker/cards";
import { buildPots } from "../poker/engine";
import { type Core } from "../poker/model";
import { dispatch } from "../storage/session";
import { useSession } from "./use-session";
import { field, Modal, primary } from "./primitives";

export function Cards({ core: c, close }: { core: Core; close: () => void }) {
  const { busy } = useSession();
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
  const label = (card: string) =>
    `${card[0] === "T" ? "10" : card[0]}${suitGlyph[card[1] as keyof typeof suitGlyph]}`;
  const picker = (
    value: string,
    change: (value: string) => void,
    name: string,
    disabled = false,
  ) => (
    <select
      aria-label={name}
      className={`${field} text-center font-bold`}
      value={value}
      onChange={(e) => change(e.target.value)}
      disabled={disabled || busy}
    >
      <option value="">—</option>
      {DECK.map((card) => (
        <option
          value={card}
          key={card}
          disabled={card !== value && used.includes(card)}
        >
          {label(card)}
        </option>
      ))}
    </select>
  );
  return (
    <Modal title="Show the cards" close={close}>
      <p className="mb-5 text-sm text-slate-500">
        Enter all cards together at showdown. Only shown hands compete for
        contested pots. No cards are needed to claim an uncontested pot.
      </p>
      <form
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
        <div className="mb-5 grid grid-cols-5 gap-1 sm:gap-2">
          {board.map((value, i) => (
            <div key={i}>
              {picker(
                value,
                (value) => setBoard(board.map((v, j) => (j === i ? value : v))),
                `Community card ${i + 1}`,
              )}
            </div>
          ))}
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
                  <div className="grid grid-cols-2 gap-3">
                    {hands[p.id].map((value, i) => (
                      <div key={i}>
                        {picker(
                          value,
                          (value) =>
                            setHands({
                              ...hands,
                              [p.id]: hands[p.id].map((v, j) =>
                                j === i ? value : v,
                              ),
                            }),
                          `${p.name} card ${i + 1}`,
                          muck,
                        )}
                      </div>
                    ))}
                  </div>
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
        <button className={`${primary} mt-5 w-full`} disabled={busy}>
          Save showdown cards
        </button>
      </form>
    </Modal>
  );
}
