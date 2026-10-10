import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { newSession } from "../storage/session";
import { useSync } from "../sync/controller";
import { useSession } from "./use-session";
import { field, primary } from "./primitives";
import { createId } from "../id";
import { ParticipantSetup } from "./participant-setup";

export function Setup() {
  const navigate = useNavigate();
  const { current, busy } = useSession();
  const sync = useSync();
  const [name, setName] = useState("Friday night poker");
  const [small, setSmall] = useState(5);
  const [big, setBig] = useState(10);
  const [players, setPlayers] = useState(() =>
    ["Alex", "Jordan", "Taylor", "Casey"].map((name) => ({
      id: createId(),
      name,
      value: 1000,
    })),
  );
  const [dealer, setDealer] = useState(players[0]!.id);
  const dealerIndex = Math.max(
    0,
    players.findIndex((p) => p.id === dealer),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await newSession({
        name,
        smallBlind: small,
        bigBlind: big,
        dealerIndex,
        players: players.map((p) => ({ name: p.name, stack: p.value! })),
      });
      await navigate({ to: "/poker" });
    } catch {
      /* Store exposes save failure. */
    }
  }
  if (sync.role === "guest" && !current)
    return (
      <section className="surface p-8">
        <h1 className="font-display text-3xl font-extrabold">
          Finish joining your table.
        </h1>
        <Link to="/join" className={`${primary} mt-4 inline-block`}>
          Open joining
        </Link>
      </section>
    );
  if (current)
    return (
      <section className="surface p-8">
        <h1 className="font-display text-3xl font-extrabold">
          Your table is still here.
        </h1>
        <p className="my-4">
          Resume or end {current.core.name} before starting another table.
        </p>
        <Link to="/poker" className={`${primary} inline-block`}>
          Open saved table
        </Link>
      </section>
    );
  return (
    <div className="mx-auto max-w-2xl py-6">
      <Link
        to="/"
        className="text-sm text-slate-500 transition-colors hover:text-play-blue"
      >
        ← Back to the toolkit
      </Link>
      <h1 className="mt-5 font-display text-4xl font-black tracking-tight">
        Bring everyone to the table.
      </h1>
      <p className="mb-7 mt-3 text-slate-500">
        No-limit Texas Hold’em · cash game · whole chips
      </p>
      <form onSubmit={submit} className="space-y-6 surface p-6 sm:p-8">
        <label className="block font-bold">
          Table name
          <input
            className={`${field} mt-2`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="font-bold">
            Small blind
            <input
              className={`${field} mt-2`}
              type="number"
              inputMode="numeric"
              min={1}
              max={1e9}
              step={1}
              required
              value={small}
              onChange={(e) => setSmall(Number(e.target.value))}
            />
          </label>
          <label className="font-bold">
            Big blind
            <input
              className={`${field} mt-2`}
              type="number"
              inputMode="numeric"
              min={small || 1}
              max={1e9}
              step={1}
              required
              value={big}
              onChange={(e) => setBig(Number(e.target.value))}
            />
          </label>
        </div>
        <ParticipantSetup
          title="Seats, clockwise"
          noun="seat"
          participants={players}
          onChange={(next) =>
            setPlayers(next.map((p) => ({ ...p, value: p.value! })))
          }
          numeric={{
            label: "Starting chips",
            min: 1,
            max: 1e9,
            defaultValue: 1000,
          }}
          summary={(p, i) =>
            `${p.value!.toLocaleString()} chips${i === dealerIndex ? " · First dealer" : ""}`
          }
        />
        <label className="block font-bold">
          First dealer
          <select
            className={`${field} mt-2`}
            value={players[dealerIndex]!.id}
            onChange={(e) => setDealer(e.target.value)}
          >
            {players.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.name || `Seat ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-500">
          Seat order determines the blinds and turns. Players with no chips sit
          out. Rebuys and seat changes happen between hands.
        </p>
        <button className={`${primary} w-full`} disabled={busy}>
          Create table
        </button>
      </form>
    </div>
  );
}
