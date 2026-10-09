import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { newSession } from "../storage/session";
import { useSync } from "../sync/controller";
import { useSession } from "./use-session";
import { field, primary, secondary, Tag } from "./primitives";

export function Setup() {
  const navigate = useNavigate();
  const { current, busy } = useSession();
  const sync = useSync();
  const [name, setName] = useState("Friday night poker");
  const [small, setSmall] = useState(5);
  const [big, setBig] = useState(10);
  const [dealer, setDealer] = useState(0);
  const [players, setPlayers] = useState(
    ["Alex", "Jordan", "Taylor", "Casey"].map((name) => ({
      name,
      stack: 1000,
    })),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await newSession({
        name,
        smallBlind: small,
        bigBlind: big,
        dealerIndex: dealer,
        players,
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
              min={small || 1}
              max={1e9}
              step={1}
              required
              value={big}
              onChange={(e) => setBig(Number(e.target.value))}
            />
          </label>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">
              Seats, clockwise
            </h2>
            <Tag>{players.length} / 10</Tag>
          </div>
          <div className="space-y-3">
            {players.map((p, i) => (
              <div className="flex items-end gap-2" key={i}>
                <span className="seat-avatar mb-2.5 shrink-0">{i + 1}</span>
                <label className="min-w-0 flex-1 text-xs font-bold text-slate-500">
                  Player {i + 1}
                  <input
                    aria-label={`Player ${i + 1} name`}
                    className={`${field} mt-1 text-play-ink`}
                    value={p.name}
                    required
                    maxLength={24}
                    onChange={(e) =>
                      setPlayers(
                        players.map((p, j) =>
                          j === i ? { ...p, name: e.target.value } : p,
                        ),
                      )
                    }
                  />
                </label>
                <label className="w-28 text-xs font-bold text-slate-500">
                  Starting chips
                  <input
                    aria-label={`Player ${i + 1} chips`}
                    className={`${field} mt-1 text-play-ink`}
                    type="number"
                    min={1}
                    max={1e9}
                    step={1}
                    value={p.stack}
                    required
                    onChange={(e) =>
                      setPlayers(
                        players.map((p, j) =>
                          j === i ? { ...p, stack: Number(e.target.value) } : p,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  className={secondary}
                  type="button"
                  aria-label={`Remove seat ${i + 1}`}
                  disabled={players.length <= 2}
                  onClick={() => {
                    setPlayers(players.filter((_, j) => j !== i));
                    setDealer(0);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`${secondary} mt-3 w-full`}
            disabled={players.length >= 10}
            onClick={() =>
              setPlayers([
                ...players,
                { name: `Player ${players.length + 1}`, stack: 1000 },
              ])
            }
          >
            + Add a seat
          </button>
        </div>
        <label className="block font-bold">
          First dealer
          <select
            className={`${field} mt-2`}
            value={dealer}
            onChange={(e) => setDealer(Number(e.target.value))}
          >
            {players.map((p, i) => (
              <option key={i} value={i}>
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
