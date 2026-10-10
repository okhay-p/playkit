import { createId } from "../id";
import { useState } from "react";
import { type Command, type Core } from "../poker/model";
import { dispatch } from "../storage/session";
import { useSession } from "./use-session";
import { field, Modal, number, secondary } from "./primitives";

export function Manage({ core: c, close }: { core: Core; close: () => void }) {
  const { busy } = useSession();
  const [playerId, setPlayerId] = useState(c.players[0].id);
  const [amount, setAmount] = useState(1000);
  const [name, setName] = useState("");
  const [stack, setStack] = useState(1000);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  async function send(cmd: Command) {
    try {
      await dispatch(cmd);
      setError("");
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the table.",
      );
      return false;
    }
  }
  return (
    <Modal title="Between hands" close={close}>
      <p className="mb-5 text-sm text-slate-500">
        Adjust the table before the next hand. All amounts are whole chips.
      </p>
      <h3 className="mb-3 font-bold">Seats, clockwise</h3>
      <div className="mb-6 space-y-2">
        {c.players.map((p, i) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"
          >
            <div>
              <strong>{p.name}</strong>
              <span className="ml-2 text-sm text-slate-500">
                {number(p.stack)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-white p-2 disabled:opacity-30"
                aria-label={`Move ${p.name} up`}
                disabled={busy || i === 0}
                onClick={() => {
                  const ids = c.players.map((p) => p.id);
                  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                  void send({ type: "reorder", ids });
                }}
              >
                ↑
              </button>
              <button
                className="rounded-lg bg-white p-2 disabled:opacity-30"
                aria-label={`Move ${p.name} down`}
                disabled={busy || i === c.players.length - 1}
                onClick={() => {
                  const ids = c.players.map((p) => p.id);
                  [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                  void send({ type: "reorder", ids });
                }}
              >
                ↓
              </button>
              <button
                className="rounded-lg bg-white p-2 text-sm text-red-600 disabled:opacity-30"
                disabled={busy || c.players.length <= 2}
                onClick={() => setRemove(p.id)}
              >
                Remove
              </button>
            </div>
            {remove === p.id && (
              <div className="w-full text-sm">
                <p className="mb-2">
                  Remove {p.name} and cash out {number(p.stack)} chips?
                </p>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={async () => {
                    if (await send({ type: "remove-player", playerId: p.id })) {
                      setRemove(null);
                      setPlayerId(
                        c.players.find((other) => other.id !== p.id)!.id,
                      );
                    }
                  }}
                >
                  Confirm removal
                </button>
                <button
                  className="ml-3 text-slate-500"
                  onClick={() => setRemove(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="mb-6"
        onSubmit={async (e) => {
          e.preventDefault();
          await send({ type: "rebuy", playerId, amount });
        }}
      >
        <h3 className="mb-3 font-bold">Add a rebuy</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Player
            <select
              className={`${field} mt-1`}
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              {c.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Chips
            <input
              className={`${field} mt-1`}
              type="number"
              inputMode="numeric"
              min={1}
              max={1e9}
              step={1}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
        </div>
        <button className={`${secondary} mt-3 w-full`} disabled={busy}>
          Record rebuy
        </button>
      </form>
      {c.players.length < 10 && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await send({
                type: "add-player",
                name,
                stack,
                playerId: createId(),
              })
            )
              setName("");
          }}
        >
          <h3 className="mb-3 font-bold">Add a player</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Name
              <input
                className={`${field} mt-1`}
                required
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Starting chips
              <input
                className={`${field} mt-1`}
                type="number"
                inputMode="numeric"
                min={1}
                max={1e9}
                step={1}
                required
                value={stack}
                onChange={(e) => setStack(Number(e.target.value))}
              />
            </label>
          </div>
          <button className={`${secondary} mt-3 w-full`} disabled={busy}>
            Add player
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      <p className="mt-5 text-xs text-slate-500">
        {number(c.totalChips)} total chips · {number(c.addedChips)} bought in ·{" "}
        {number(c.removedChips)} cashed out
      </p>
    </Modal>
  );
}
