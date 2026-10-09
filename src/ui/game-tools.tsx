import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  createGame,
  matchWinner,
  projectGame,
  scoreWinners,
  standings,
  totals,
  type Game,
  type GameCommand,
  type Kind,
  type Score,
  type Tournament,
  type WordView,
} from "../games/engine";
import {
  changeTool,
  clearTool,
  loadTool,
  saveNewTool,
  undoTool,
  useTool,
} from "../games/store";
import { field, Modal, primary, secondary, Tag } from "./primitives";
import { restoreToolHost, suspendToolPhones } from "../games/phones";
import { ToolPhones } from "./tool-phones";

export const toolTitles: Record<Kind, string> = {
  scorekeeper: "Scorekeeper",
  tournament: "Tournament manager",
  undercover: "Undercover",
  imposter: "Imposter",
};
function ToolSetup({
  kind,
  previous,
  onCreate,
}: {
  kind: Kind;
  previous?: Game;
  onCreate: (game: Game) => Promise<void>;
}) {
  const [names, setNames] = useState(
    previous?.players.map((p) => p.name).join("\n") ||
      "Alex\nJordan\nTaylor\nCasey",
  );
  const [title, setTitle] = useState(previous?.title || toolTitles[kind]);
  const [direction, setDirection] = useState<"high" | "low">("high"),
    [target, setTarget] = useState("");
  const [mode, setMode] = useState<"round-robin" | "knockout">("round-robin"),
    [minority, setMinority] = useState(1);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-auto max-w-xl space-y-5 surface p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await onCreate(
            createGame(
              kind,
              names.split("\n").filter((n) => n.trim()),
              {
                title,
                direction,
                target: target === "" ? null : Number(target),
                mode,
                minority,
              },
            ),
          );
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not start the game.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block font-bold">
        Game name
        <input
          className={`${field} mt-2`}
          value={title}
          maxLength={60}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block font-bold">
        Players or teams
        <textarea
          className={`${field} mt-2`}
          rows={5}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          required
        />
      </label>
      <p className="text-sm text-slate-500">
        One name per line. Up to 10 players or teams.
      </p>
      {kind === "scorekeeper" && (
        <>
          <label className="block font-bold">
            Winning score
            <select
              className={`${field} mt-2`}
              value={direction}
              onChange={(e) => setDirection(e.target.value as "high" | "low")}
            >
              <option value="high">Highest score wins</option>
              <option value="low">Lowest score wins</option>
            </select>
          </label>
          <label className="block font-bold">
            Target score (optional)
            <input
              className={`${field} mt-2`}
              type="number"
              step={1}
              min={-1e6}
              max={1e6}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <p className="text-sm text-slate-500">
            Without a target, the standings show the current leaders.
          </p>
        </>
      )}
      {kind === "tournament" && (
        <>
          <label className="block font-bold">
            Format
            <select
              className={`${field} mt-2`}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="round-robin">
                Round robin · everyone plays everyone
              </option>
              <option value="knockout">Knockout · winner advances</option>
            </select>
          </label>
          <p className="text-sm text-slate-500">
            Round robin: win 3 points, draw 1, loss 0. Knockout: listed order
            sets the bracket; byes advance automatically.
          </p>
        </>
      )}
      {(kind === "undercover" || kind === "imposter") && (
        <>
          <label className="block font-bold">
            {kind === "undercover" ? "Undercover players" : "Imposters"}
            <input
              className={`${field} mt-2`}
              type="number"
              min={1}
              max={2}
              step={1}
              value={minority}
              onChange={(e) => setMinority(Number(e.target.value))}
            />
          </label>
          <p className="text-sm leading-relaxed text-slate-500">
            {kind === "undercover"
              ? "Most players receive one word; Undercover players receive a related word. Nobody with a word is told their role."
              : "Most players receive the secret word. Imposters know their role but receive no word or hint; if voted out, they get one final spoken guess."}{" "}
            Give a short spoken clue each, discuss, and vote someone out. Repeat
            until all minority players are eliminated or only one civilian
            remains. A tied vote gets a runoff; a second tie eliminates nobody.
            Minority players must be fewer than half the group.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button className={`${primary} w-full`} disabled={busy}>
        Start {toolTitles[kind]}
      </button>
    </form>
  );
}
export function ScoreBoard({
  game,
  send,
  readOnly = false,
}: {
  game: Score;
  send: (command: GameCommand) => Promise<boolean | void>;
  readOnly?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [label, setLabel] = useState(""),
    [editing, setEditing] = useState<string | undefined>(),
    [error, setError] = useState("");
  const sum = totals(game),
    leaders = scoreWinners(game),
    ordered = [...game.players].sort((a, b) =>
      game.direction === "high" ? sum[b.id] - sum[a.id] : sum[a.id] - sum[b.id],
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="surface p-6">
        <h2 className="font-display text-2xl font-extrabold">Standings</h2>
        <p className="my-3 text-slate-500">
          {game.direction === "high" ? "Highest" : "Lowest"} score leads
          {game.target !== null ? ` · target ${game.target}` : ""}
        </p>
        <ol className="space-y-3">
          {ordered.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
            >
              <span className="font-bold">{p.name}</span>
              <span className="font-display text-3xl font-black">
                {sum[p.id]}
              </span>
            </li>
          ))}
        </ol>
        {leaders.length > 0 && (
          <p role="status" className="mt-4 font-bold text-green-700">
            {game.target === null ? "Leading" : "Target reached"}:{" "}
            {leaders.map((p) => p.name).join(", ")}
          </p>
        )}
        <h3 className="mb-3 mt-7 font-bold">Round history</h3>
        {game.rounds.length === 0 ? (
          <p className="text-slate-500">No scores recorded yet.</p>
        ) : (
          game.rounds.map((r) => (
            <div
              key={r.id}
              className="mb-3 rounded-xl border border-slate-200 p-4"
            >
              <p className="font-bold">{r.label}</p>
              <p className="my-2 text-sm text-slate-500">
                {game.players
                  .map((p) => `${p.name}: ${r.scores[p.id] || 0}`)
                  .join(" · ")}
              </p>
              {!readOnly && (
                <div className="flex gap-2">
                  <button
                    className={secondary}
                    onClick={() => {
                      setEditing(r.id);
                      setLabel(r.label);
                      setValues(
                        Object.fromEntries(
                          Object.entries(r.scores).map(([id, n]) => [
                            id,
                            String(n),
                          ]),
                        ),
                      );
                    }}
                  >
                    Edit {r.label}
                  </button>
                  <button
                    className={secondary}
                    onClick={() =>
                      void send({ type: "remove-round", id: r.id })
                    }
                  >
                    Delete {r.label}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
      {!readOnly && (
        <form
          className="h-fit space-y-4 surface p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const saved = await send({
                type: "score",
                id: editing,
                label,
                scores: Object.fromEntries(
                  game.players.map((p) => [p.id, Number(values[p.id] || 0)]),
                ),
              });
              if (saved === false) return;
              setValues({});
              setLabel("");
              setEditing(undefined);
              setError("");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <h2 className="font-display text-2xl font-extrabold">
            {editing ? "Edit round" : "Record a round"}
          </h2>
          <label className="block font-bold">
            Round label
            <input
              className={`${field} mt-1`}
              maxLength={60}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Round ${game.rounds.length + 1}`}
            />
          </label>
          {game.players.map((p) => (
            <label key={p.id} className="block font-bold">
              {p.name} score
              <input
                className={`${field} mt-1`}
                type="number"
                min={-1e6}
                max={1e6}
                step={1}
                value={values[p.id] || ""}
                placeholder="0"
                onChange={(e) =>
                  setValues({ ...values, [p.id]: e.target.value })
                }
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button className={primary}>
            {editing ? "Save round" : "Record scores"}
          </button>
          {editing && (
            <button
              type="button"
              className={`${secondary} ml-2`}
              onClick={() => {
                setEditing(undefined);
                setValues({});
                setLabel("");
              }}
            >
              Cancel edit
            </button>
          )}
        </form>
      )}
    </div>
  );
}
export function TournamentBoard({
  game,
  send,
  readOnly = false,
}: {
  game: Tournament;
  send: (command: GameCommand) => Promise<boolean | void>;
  readOnly?: boolean;
}) {
  const [reset, setReset] = useState<number | null>(null);
  const name = (id: string | null) =>
    game.players.find((p) => p.id === id)?.name || "Bye";
  const rounds = [...new Set(game.matches.map((m) => m.round))];
  const final = game.matches.filter((m) => m.round === rounds.at(-1));
  const complete = game.matches.every((m) => m.result !== null);
  return (
    <div className="space-y-6">
      {complete && (
        <p
          role="status"
          className="rounded-2xl bg-green-50 p-4 font-bold text-green-700"
        >
          {game.mode === "knockout" && final.length === 1
            ? `Champion: ${name(matchWinner(final[0]))}`
            : "All matches recorded"}
        </p>
      )}
      {game.mode === "round-robin" && (
        <section className="overflow-x-auto surface p-6">
          <h2 className="mb-4 font-display text-2xl font-extrabold">
            Standings
          </h2>
          <table className="w-full text-left">
            <thead>
              <tr>
                {[
                  "Player / team",
                  "Played",
                  "Won",
                  "Drawn",
                  "Lost",
                  "Points",
                ].map((h) => (
                  <th key={h} className="p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings(game).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <th className="p-2">{p.name}</th>
                  {[p.played, p.wins, p.draws, p.losses, p.points].map(
                    (n, i) => (
                      <td key={i} className="p-2">
                        {n}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-500">
            Equal points and wins share a rank; names only order the display.
          </p>
        </section>
      )}
      {rounds.map((r) => (
        <section key={r} className="surface p-6">
          <div className="mb-4 flex flex-wrap justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold">Round {r}</h2>
            {game.mode === "knockout" && !readOnly && (
              <button className={secondary} onClick={() => setReset(r)}>
                Reset round {r} and later
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {game.matches
              .filter((m) => m.round === r)
              .map((m) => (
                <article
                  key={m.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <h3 className="font-bold">
                    {name(m.a)} vs {name(m.b)}
                  </h3>
                  <p className="my-2 text-sm text-slate-500">
                    {!m.b
                      ? `${name(m.a)} advances with a bye`
                      : m.result === "draw"
                        ? "Draw"
                        : m.result
                          ? `Winner: ${name(matchWinner(m))}`
                          : "Ready to play"}
                  </p>
                  {m.b && !readOnly && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={secondary}
                        onClick={() =>
                          void send({
                            type: "result",
                            match: m.id,
                            result: "a",
                          })
                        }
                      >
                        {name(m.a)} wins
                      </button>
                      <button
                        className={secondary}
                        onClick={() =>
                          void send({
                            type: "result",
                            match: m.id,
                            result: "b",
                          })
                        }
                      >
                        {name(m.b)} wins
                      </button>
                      {game.mode === "round-robin" && (
                        <button
                          className={secondary}
                          onClick={() =>
                            void send({
                              type: "result",
                              match: m.id,
                              result: "draw",
                            })
                          }
                        >
                          Draw
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </section>
      ))}
      {reset !== null && (
        <Modal title="Reset these matches?" close={() => setReset(null)}>
          <p className="mb-4">
            This clears results in round {reset} and removes every later
            knockout round. Earlier results stay saved.
          </p>
          <button
            className={primary}
            onClick={async () => {
              if ((await send({ type: "reset-after", round: reset })) !== false)
                setReset(null);
            }}
          >
            Confirm reset matches
          </button>
        </Modal>
      )}
    </div>
  );
}
export function WordBoard({
  game,
  send,
  privatePlayer = null,
  readOnly = false,
}: {
  game: WordView;
  send: (command: GameCommand) => Promise<boolean | void>;
  privatePlayer?: string | null;
  readOnly?: boolean;
}) {
  const [revealed, setRevealed] = useState(false),
    [votes, setVotes] = useState<Record<string, string>>({});
  const name = (id: string) =>
    game.players.find((p) => p.id === id)?.name || "Player";
  useEffect(() => {
    setRevealed(false);
    setVotes({});
  }, [game.id, game.dealIndex, game.cycle, game.phase, game.runoffAttempt]);
  useEffect(() => {
    const hide = () => setRevealed(false);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  const dealing = game.players[game.dealIndex];
  const card = game.card;
  const eligible = game.runoff.length ? game.runoff : game.alive;
  return (
    <section className="mx-auto max-w-3xl space-y-5 surface p-6 sm:p-8">
      <Tag>
        Cycle {game.cycle} · {game.alive.length} still playing
      </Tag>
      {game.phase === "deal" && (
        <>
          <h2 className="font-display text-3xl font-black">
            {privatePlayer
              ? `Your private card, ${name(privatePlayer)}`
              : `Pass to ${dealing?.name}`}
          </h2>
          <p className="text-slate-500">
            Keep the screen to yourself. Hide the card before handing the phone
            over.
          </p>
          {(!privatePlayer || card) && (
            <button
              className={`${secondary} w-full`}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Hide card" : "Reveal my card"}
            </button>
          )}
          {revealed && card && (
            <div className="rounded-3xl bg-blue-50 p-8 text-center">
              <p className="text-sm font-bold text-slate-500">
                {card.imposter ? "YOUR ROLE" : "YOUR WORD"}
              </p>
              <p className="mt-3 font-display text-4xl font-black">
                {card.imposter ? "You are the imposter" : card.word}
              </p>
              {card.imposter && (
                <p className="mt-3">No word, no hint. Listen and bluff.</p>
              )}
            </div>
          )}
          {!readOnly && (
            <button
              className={`${primary} w-full`}
              disabled={revealed}
              onClick={() => void send({ type: "next" })}
            >
              {game.dealIndex === game.players.length - 1
                ? "Everyone ready · start clues"
                : "Card hidden · next player"}
            </button>
          )}
        </>
      )}
      {privatePlayer &&
        game.phase !== "deal" &&
        game.phase !== "finished" &&
        card && (
          <>
            <button
              className={secondary}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Hide my card" : "Review my card"}
            </button>
            {revealed && (
              <p className="rounded-xl bg-blue-50 p-5 font-bold">
                {card.imposter ? "You are the imposter · no word" : card.word}
              </p>
            )}
          </>
        )}
      {game.phase === "clues" && (
        <>
          <h2 className="font-display text-3xl font-black">
            {name(game.order[game.turn])}’s clue
          </h2>
          <p className="text-slate-500">
            Say a short hint aloud. Don’t say your word or repeat another
            player’s clue.
          </p>
          <ol className="space-y-2">
            {game.order.map((id, i) => (
              <li
                key={id}
                className={`rounded-xl p-3 ${i === game.turn ? "bg-green-50 font-bold" : "bg-slate-50"}`}
              >
                {i + 1}. {name(id)}{" "}
                {i < game.turn ? "✓" : i === game.turn ? "· speaking" : ""}
              </li>
            ))}
          </ol>
          {!readOnly && (
            <button
              className={primary}
              onClick={() => void send({ type: "next" })}
            >
              Clue given
            </button>
          )}
        </>
      )}
      {game.phase === "discussion" && (
        <>
          <h2 className="font-display text-3xl font-black">Talk it out.</h2>
          <p className="text-slate-500">
            Who sounds different? Discuss aloud, then each surviving player
            votes for one person.
          </p>
          {!readOnly && (
            <button
              className={primary}
              onClick={() => void send({ type: "next" })}
            >
              Start voting
            </button>
          )}
        </>
      )}
      {game.phase === "vote" && (
        <>
          <h2 className="font-display text-3xl font-black">
            {game.runoff.length ? "Runoff vote" : "Who gets your vote?"}
          </h2>
          <p className="text-slate-500">
            {game.runoff.length
              ? "Tied players give another clue. Vote again among them; another tie eliminates nobody."
              : "Vote together and record the tally. This is an open group vote."}{" "}
            Record exactly {game.alive.length} votes.
          </p>
          {!readOnly && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const saved = await send({
                  type: "vote",
                  votes: Object.fromEntries(
                    eligible.map((id) => [id, Number(votes[id] || 0)]),
                  ),
                });
                if (saved !== false) setVotes({});
              }}
            >
              {eligible.map((id) => (
                <label key={id} className="block font-bold">
                  Votes for {name(id)}
                  <input
                    className={`${field} mt-1`}
                    type="number"
                    min={0}
                    max={game.alive.length}
                    step={1}
                    value={votes[id] || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setVotes({ ...votes, [id]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button className={primary}>Record vote</button>
            </form>
          )}
        </>
      )}
      {game.phase === "guess" && (
        <>
          <h2 className="font-display text-3xl font-black">
            {name(game.guesser!)} gets one guess.
          </h2>
          <p className="text-slate-500">
            Say your guess aloud. The civilians confirm whether it matches their
            secret word, allowing agreed synonyms. Don’t reveal the word if the
            guess is wrong.
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-3">
              <button
                className={primary}
                onClick={() => void send({ type: "guess", correct: true })}
              >
                Guess was correct
              </button>
              <button
                className={secondary}
                onClick={() => void send({ type: "guess", correct: false })}
              >
                Guess was wrong
              </button>
            </div>
          )}
        </>
      )}
      {game.phase === "finished" && (
        <>
          <h2 className="font-display text-3xl font-black">
            {game.winner === "civilians"
              ? "Civilians win!"
              : game.kind === "undercover"
                ? "Undercover wins!"
                : "Imposters win!"}
          </h2>
          {game.revealed && (
            <>
              <p className="rounded-2xl bg-blue-50 p-5 font-bold">
                Civilian word: {game.revealed.words[0]}
                {game.kind === "undercover" &&
                  ` · Undercover word: ${game.revealed.words[1]}`}
              </p>
              <ul className="space-y-2">
                {game.players.map((p) => (
                  <li key={p.id} className="rounded-xl bg-slate-50 p-3">
                    {p.name} · {game.revealed!.roles[p.id]}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {game.eliminated.length > 0 && (
        <aside className="border-t border-slate-100 pt-4">
          <h3 className="font-bold">Eliminated</h3>
          <p className="mt-2 text-sm text-slate-500">
            {game.eliminated
              .map((p) => `${name(p.id)} · ${p.role}`)
              .join(" / ")}
          </p>
        </aside>
      )}
    </section>
  );
}
export function GameTool({ kind }: { kind: Kind }) {
  const state = useTool(kind);
  const [phones, setPhones] = useState(false);
  const [ending, setEnding] = useState(false);
  const [reset, setReset] = useState(false),
    [setup, setSetup] = useState(false);
  useEffect(() => {
    void loadTool(kind)
      .then(() => restoreToolHost(kind))
      .catch(() => {});
    return suspendToolPhones;
  }, [kind]);
  async function send(command: GameCommand) {
    if (!state.game) return false;
    try {
      await changeTool(kind, command, state.game.revision);
      return true;
    } catch {
      return false;
    }
  }
  const g = state.game;
  return (
    <div className="py-6">
      <Link to="/" className="text-sm text-slate-500">
        ← Back to the toolkit
      </Link>
      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-black">
          {g?.title || toolTitles[kind]}
        </h1>
        {g && (
          <div className="flex flex-wrap gap-2">
            <button className={secondary} onClick={() => setPhones(true)}>
              Phones
            </button>
            {(kind === "scorekeeper" || kind === "tournament") && (
              <button
                className={secondary}
                disabled={state.busy || !state.history.length}
                onClick={() => void undoTool(kind).catch(() => {})}
              >
                Undo last change
              </button>
            )}
            <button
              className={secondary}
              disabled={state.busy}
              onClick={() => setEnding(true)}
            >
              End game
            </button>
            <button
              className={secondary}
              disabled={state.busy}
              onClick={() => setReset(true)}
            >
              New game
            </button>
          </div>
        )}
      </div>
      {state.error && (
        <div
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-red-700"
        >
          {state.error}
          {!g && (
            <button
              className={`${secondary} ml-2`}
              onClick={() => void clearTool(kind).catch(() => {})}
            >
              Clear saved game
            </button>
          )}
        </div>
      )}
      {state.recovered && g && (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Your saved game is here. Private cards stay hidden until revealed.
        </p>
      )}
      {!state.ready ? (
        <p role="status">Opening your game…</p>
      ) : !g || setup ? (
        <ToolSetup
          key={`${kind}:${setup}`}
          kind={kind}
          previous={g || undefined}
          onCreate={async (game) => {
            await saveNewTool(game);
            setSetup(false);
          }}
        />
      ) : g.kind === "scorekeeper" ? (
        <ScoreBoard key={g.id} game={g} send={send} />
      ) : g.kind === "tournament" ? (
        <TournamentBoard key={g.id} game={g} send={send} />
      ) : (
        <WordBoard
          game={
            projectGame(
              g,
              g.phase === "deal" ? g.players[g.dealIndex]?.id || null : null,
            ) as WordView
          }
          send={send}
        />
      )}
      {phones && <ToolPhones kind={kind} close={() => setPhones(false)} />}
      {ending && (
        <Modal title="End this game?" close={() => setEnding(false)}>
          <p className="mb-4">
            Delete this tool’s saved game and close any joined phones? Your
            other games stay saved.
          </p>
          <button
            className={primary}
            disabled={state.busy}
            onClick={async () => {
              try {
                await clearTool(kind);
                setEnding(false);
              } catch {
                /* Store exposes the error. */
              }
            }}
          >
            Confirm end game
          </button>
        </Modal>
      )}
      {reset && (
        <Modal title="Start a new game?" close={() => setReset(false)}>
          <p className="mb-4">
            Your current {toolTitles[kind].toLowerCase()} will be replaced when
            you start the new game.
          </p>
          <button
            className={primary}
            onClick={() => {
              setReset(false);
              setSetup(true);
            }}
          >
            Set up a new game
          </button>
        </Modal>
      )}
      {g && setup && (
        <button className={`${secondary} mt-4`} onClick={() => setSetup(false)}>
          Keep current game
        </button>
      )}
    </div>
  );
}

export function Scorekeeper() {
  return <GameTool kind="scorekeeper" />;
}
export function TournamentManager() {
  return <GameTool kind="tournament" />;
}
export function Undercover() {
  return <GameTool kind="undercover" />;
}
export function Imposter() {
  return <GameTool kind="imposter" />;
}
