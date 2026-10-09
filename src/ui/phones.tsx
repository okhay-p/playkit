import { useState } from "react";
import {
  approvePhone,
  disableJoining,
  enableJoining,
  leavePhone,
  reconnectPhones,
  requestSeat,
  signalingEndpoint,
  useSync,
  revokePhone,
} from "../sync/controller";
import { InvitationShare } from "./invitation-share";
import { invitationLink } from "../sync/credentials";
import { field, Modal, primary, secondary, Tag } from "./primitives";
export function Phones({ close }: { close: () => void }) {
  const sync = useSync();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [stop, setStop] = useState(false);
  async function perform(action: () => Promise<unknown>) {
    setError("");
    setWorking(true);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update phone joining.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal title="Invite players" close={close}>
      {error || sync.error ? (
        <p role="alert" className="mb-4 text-red-700">
          {error || sync.error}
        </p>
      ) : null}
      <p className="mb-4 text-sm text-slate-500">
        Phones connect directly. If your network blocks the connection, try the
        same Wi-Fi or keep playing on this shared device.
      </p>
      {!sync.host ? (
        <>
          <p className="mb-4 text-slate-500">
            Share a QR code or link, approve each person’s seat, and let them
            record their own turns. You can still record everyone’s actions on
            this device.
          </p>
          <button
            className={primary}
            disabled={working || sync.busy || !signalingEndpoint()}
            onClick={() => void perform(enableJoining)}
          >
            Enable joining
          </button>
          {!signalingEndpoint() && (
            <p className="mt-3 text-sm text-slate-500">
              Phone joining has not been configured on this installation.
              Shared-device play works offline.
            </p>
          )}
        </>
      ) : (
        <>
          <Tag>{sync.connected ? "Joining open" : "Joining disconnected"}</Tag>
          <p className="my-3 text-sm text-slate-500">
            Keep this host device open. Share this invitation only with people
            at your table. It expires after 12 hours.
          </p>
          <InvitationShare
            link={invitationLink(sync.host)}
            label="Invitation link"
            disabled={working}
          />
          {!sync.connected && (
            <button
              className={`${secondary} ml-2`}
              disabled={working}
              onClick={() => void perform(reconnectPhones)}
            >
              Reconnect
            </button>
          )}
          <h3 className="mb-3 mt-3 font-bold">Seat requests</h3>
          {sync.requests.length ? (
            <ul className="space-y-3">
              {sync.requests.map((request) => (
                <li key={request.peer} className="rounded-xl bg-blue-50 p-3">
                  <p className="font-bold">{request.name}</p>
                  <p className="mb-2 text-sm text-slate-500">
                    {request.seat
                      ? (sync.seats.find((s) => s.id === request.seat)?.name ??
                        "Seat requested")
                      : "Choosing a seat…"}
                  </p>
                  <button
                    className={primary}
                    disabled={working || !request.seat}
                    onClick={() =>
                      void perform(() => approvePhone(request.peer))
                    }
                  >
                    Approve {request.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No pending requests.</p>
          )}
          <h3 className="mb-3 mt-5 font-bold">Approved phones</h3>
          {sync.host.associations.length ? (
            <ul className="space-y-3">
              {sync.host.associations.map((a) => (
                <li
                  key={a.peer}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"
                >
                  <div>
                    <p className="font-bold">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {sync.peers.includes(a.peer)
                        ? "Connected"
                        : "Disconnected · host can record turns"}
                    </p>
                  </div>
                  <button
                    className={secondary}
                    disabled={working}
                    onClick={() => void perform(() => revokePhone(a.peer))}
                  >
                    Disconnect {a.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No seats approved yet.</p>
          )}
          {!stop ? (
            <button
              className={`${secondary} mt-5 text-red-700`}
              disabled={working}
              onClick={() => setStop(true)}
            >
              Close joining
            </button>
          ) : (
            <div className="mt-5 rounded-xl bg-red-50 p-4">
              <p className="mb-3 text-sm">
                This disconnects all phones and clears their connected copies.
                Keep playing on this device.
              </p>
              <button
                className={primary}
                disabled={working}
                onClick={() => void perform(disableJoining)}
              >
                Confirm close joining
              </button>
              <button
                className={`${secondary} ml-2`}
                onClick={() => setStop(false)}
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
export function PhoneStatus() {
  const sync = useSync();
  const [seat, setSeat] = useState("");
  const [error, setError] = useState("");
  if (sync.role !== "guest") return null;
  return (
    <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <p role="status" className="font-bold">
        {!sync.connected
          ? "Waiting for host"
          : !sync.seat
            ? "Waiting for seat approval"
            : sync.paused
              ? "Host is reviewing the recovered table"
              : `Your seat: ${sync.current?.core.players.find((p) => p.id === sync.seat)?.name ?? "Player"}`}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {sync.notice ||
          "The host manages dealing, cards, corrections, and payouts."}
      </p>
      {(sync.error || error) && (
        <p role="alert" className="mt-2 text-red-700">
          {error || sync.error}
        </p>
      )}
      {!sync.seat && sync.seats.length > 0 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            requestSeat(seat);
          }}
        >
          <label className="block font-bold">
            Choose your seat
            <select
              className={`${field} my-3`}
              value={seat}
              onChange={(e) => setSeat(e.target.value)}
              required
            >
              <option value="">Select a player</option>
              {sync.seats.map((s) => (
                <option key={s.id} value={s.id} disabled={s.claimed}>
                  {s.name}
                  {s.claimed ? " · already claimed" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className={primary} disabled={!seat}>
            Request seat
          </button>
        </form>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          className={secondary}
          onClick={async () => {
            try {
              await reconnectPhones();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not reconnect.",
              );
            }
          }}
        >
          Reconnect to host
        </button>
        <button className={secondary} onClick={() => void leavePhone()}>
          Leave table
        </button>
      </div>
    </section>
  );
}
