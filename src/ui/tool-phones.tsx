import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { token } from "../sync/signaling";
import { signalingEndpoint } from "../sync/controller";
import {
  allowToolEdits,
  approveToolPhone,
  closeToolJoining,
  enableToolJoining,
  joinToolPhone,
  leaveToolPhone,
  reconnectToolPhones,
  requestToolSeat,
  restoreToolGuest,
  revokeToolPhone,
  submitToolAction,
  toolInvitation,
  useToolPhones,
} from "../games/phones";
import { type GameCommand, type Kind, type WordView } from "../games/engine";
import { ScoreBoard, TournamentBoard, WordBoard } from "./game-tools";
import { field, Modal, primary, secondary, Tag } from "./primitives";
export function ToolPhones({ kind, close }: { kind: Kind; close: () => void }) {
  const s = useToolPhones();
  const [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [closing, setClosing] = useState(false);
  async function work(action: () => unknown) {
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update joining.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal title="Phones in your game" close={close}>
      {(error || s.error) && (
        <p role="alert" className="mb-4 text-red-700">
          {error || s.error}
        </p>
      )}
      <p className="mb-4 text-sm text-slate-500">
        Keep the host open. Phones connect directly; restrictive networks may
        need the same Wi-Fi or shared-device play. Each word-game player sees
        only their own card.
      </p>
      {!s.host ? (
        <>
          <button
            className={primary}
            disabled={working || !signalingEndpoint()}
            onClick={() => void work(() => enableToolJoining(kind))}
          >
            Enable phone joining
          </button>
          {!signalingEndpoint() && (
            <p className="mt-3">Phone joining is not configured here.</p>
          )}
        </>
      ) : (
        <>
          <Tag>{s.connected ? "Joining open" : "Joining disconnected"}</Tag>
          <label className="my-4 block font-bold">
            Game invitation
            <input
              className={`${field} mt-2`}
              readOnly
              value={toolInvitation()}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="flex gap-2">
            <button
              className={secondary}
              onClick={() =>
                void work(() => navigator.clipboard.writeText(toolInvitation()))
              }
            >
              Copy invitation
            </button>
            <button
              className={secondary}
              onClick={() => void work(reconnectToolPhones)}
            >
              Reconnect
            </button>
          </div>
          {(kind === "scorekeeper" || kind === "tournament") && (
            <label className="my-5 flex items-center gap-3 font-bold">
              <input
                type="checkbox"
                checked={s.host.remoteEdits}
                onChange={(e) =>
                  void work(() => allowToolEdits(e.target.checked))
                }
              />
              Allow approved phones to record results
            </label>
          )}
          <h3 className="mb-3 mt-5 font-bold">Seat requests</h3>
          {s.requests.length === 0 && (
            <p className="text-sm text-slate-500">No pending requests.</p>
          )}
          {s.requests.map((r) => (
            <div key={r.peer} className="mb-3 rounded-xl bg-blue-50 p-4">
              <p className="mb-2 font-bold">{r.name}</p>
              <button
                className={primary}
                disabled={working}
                onClick={() => void work(() => approveToolPhone(r.peer))}
              >
                Approve {r.name}
              </button>
            </div>
          ))}
          <h3 className="mb-3 mt-5 font-bold">Approved phones</h3>
          {s.host.bindings.map((b) => (
            <div
              key={b.peer}
              className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
            >
              <p>
                {b.name} ·{" "}
                {s.peers.includes(b.peer) ? "Connected" : "Disconnected"}
              </p>
              <button
                className={secondary}
                onClick={() => void work(() => revokeToolPhone(b.peer))}
              >
                Disconnect {b.name}
              </button>
            </div>
          ))}
          {!closing ? (
            <button
              className={`${secondary} mt-4`}
              onClick={() => setClosing(true)}
            >
              Close phone joining
            </button>
          ) : (
            <div className="mt-4 rounded-xl bg-red-50 p-4">
              <p className="mb-3">
                Disconnect phones and clear their connected copies? The host
                game stays saved.
              </p>
              <button
                className={primary}
                onClick={() => void work(() => closeToolJoining())}
              >
                Confirm close joining
              </button>
              <button
                className={`${secondary} ml-2`}
                onClick={() => setClosing(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
export function ToolJoin() {
  const s = useToolPhones();
  const [name, setName] = useState(""),
    [seat, setSeat] = useState(""),
    [error, setError] = useState("");
  const [invitation] = useState(() => {
    const p = new URLSearchParams(location.hash.slice(1)),
      r = token.safeParse(p.get("room")),
      i = token.safeParse(p.get("invitation"));
    const result =
      r.success && i.success ? { room: r.data, invitation: i.data } : null;
    if (result) {
      sessionStorage.setItem(
        "playkit-tools-invitation",
        JSON.stringify(result),
      );
      history.replaceState(null, "", location.pathname);
    }
    const saved = sessionStorage.getItem("playkit-tools-invitation");
    return (
      result ||
      (saved
        ? (JSON.parse(saved) as { room: string; invitation: string })
        : null)
    );
  });
  useEffect(() => {
    void restoreToolGuest(invitation?.room).catch((e) => setError(String(e)));
  }, []);
  async function send(command: GameCommand) {
    try {
      await submitToolAction(command);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the change.");
      return false;
    }
  }
  const v = s.view,
    g = s.guest;
  const canClue = !!(
    v &&
    g?.seat &&
    (v.kind === "undercover" || v.kind === "imposter") &&
    v.phase === "clues" &&
    v.order[v.turn] === g.seat &&
    s.connected &&
    !s.busy
  );
  return (
    <div className="py-6">
      <Link to="/" className="text-sm text-slate-500">
        ← Back to the toolkit
      </Link>
      <h1 className="my-5 font-display text-4xl font-black">
        {v?.title || "Join your game."}
      </h1>
      {(error || s.error) && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">
          {error || s.error}
        </p>
      )}
      {!g ? (
        <form
          className="mx-auto max-w-xl space-y-4 rounded-3xl bg-white p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!invitation) return;
            try {
              await joinToolPhone(invitation, name);
              setError("");
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          <p className="text-slate-500">
            Open the host’s invitation and request your player or team seat.
          </p>
          <label className="block font-bold">
            Your name
            <input
              className={`${field} mt-2`}
              required
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className={primary} disabled={!invitation}>
            Join game
          </button>
          {!invitation && <p>This page needs a game invitation.</p>}
        </form>
      ) : (
        <>
          <section className="mb-5 rounded-2xl bg-blue-50 p-4">
            <p role="status" className="font-bold">
              {!g.seat
                ? "Waiting for seat approval"
                : s.connected
                  ? "Connected to host"
                  : "Waiting for host · controls paused"}
            </p>
            {!g.seat && s.seats.length > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  requestToolSeat(seat);
                }}
              >
                <label className="block font-bold">
                  Choose your player
                  <select
                    aria-label="Choose your player"
                    className={`${field} my-3`}
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                    required
                  >
                    <option value="">Select a player</option>
                    {s.seats.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.claimed}>
                        {p.name}
                        {p.claimed ? " · claimed" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={primary} disabled={!seat}>
                  Request player
                </button>
              </form>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className={secondary}
                onClick={() =>
                  void reconnectToolPhones().catch((e) => setError(String(e)))
                }
              >
                Reconnect to host
              </button>
              <button
                className={secondary}
                onClick={() => {
                  leaveToolPhone();
                  sessionStorage.removeItem("playkit-tools-invitation");
                }}
              >
                Leave game
              </button>
            </div>
          </section>
          {v &&
            (v.kind === "scorekeeper" ? (
              <ScoreBoard
                key={v.id}
                game={v}
                send={send}
                readOnly={!s.connected || !s.remoteEdits || s.busy}
              />
            ) : v.kind === "tournament" ? (
              <TournamentBoard
                key={v.id}
                game={v}
                send={send}
                readOnly={!s.connected || !s.remoteEdits || s.busy}
              />
            ) : (
              <WordBoard
                key={v.id}
                game={v as WordView}
                send={send}
                privatePlayer={g.seat}
                readOnly={!canClue}
              />
            ))}
        </>
      )}
    </div>
  );
}
