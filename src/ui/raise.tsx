import { useState } from "react";
import { legalActions } from "../poker/engine";
import { type Core } from "../poker/model";
import { submit } from "../sync/controller";
import { useSession } from "./use-session";
import { field, Modal, number, primary, secondary } from "./primitives";

export function Raise({ core, close }: { core: Core; close: () => void }) {
  const a = legalActions(core)!;
  const { busy, current } = useSession();
  const [revision] = useState(current!.revision);
  const stale = current?.revision !== revision;
  const [to, setTo] = useState(Math.min(a.minimum, a.maximum));
  const [error, setError] = useState("");
  return (
    <Modal
      title={`${a.player.name}: ${core.currentBet ? "raise" : "bet"}`}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await submit(
              {
                type: "action",
                playerId: a.player.id,
                kind: "raise",
                to,
              },
              revision,
            );
            close();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not record the bet.",
            );
          }
        }}
      >
        <label className="block font-bold">
          Total bet on this street
          <input
            autoFocus
            className={`${field} mt-2`}
            type="number"
            inputMode="numeric"
            step={1}
            min={Math.min(a.minimum, a.maximum)}
            max={a.maximum}
            value={to}
            onChange={(e) => setTo(Number(e.target.value))}
            required
          />
        </label>
        <p className="my-3 text-sm text-slate-500">
          Add {number(Math.max(0, to - a.player.streetBet))} chips.{" "}
          {a.maximum < a.minimum
            ? "Only a short all-in is available."
            : `Minimum total ${number(a.minimum)} · maximum ${number(a.maximum)}.`}
        </p>
        {stale && (
          <p role="alert" className="mb-4 text-red-700">
            The table changed. Close this action and review the updated turn.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-red-600">
            {error}
          </p>
        )}
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            className={secondary}
            onClick={() => setTo(Math.min(a.minimum, a.maximum))}
          >
            Minimum
          </button>
          <button
            type="button"
            className={secondary}
            onClick={() => setTo(a.maximum)}
          >
            All-in
          </button>
        </div>
        <button className={`${primary} w-full`} disabled={busy || stale}>
          Record {core.currentBet ? "raise" : "bet"} to {number(to)}
        </button>
      </form>
    </Modal>
  );
}
