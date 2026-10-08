import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { joinPhone, signalingEndpoint, useSync } from "../sync/controller";
import { parseInvitation } from "../sync/credentials";
import { PhoneStatus } from "./phones";
import { field, primary } from "./primitives";
import { Table } from "./poker";
export function Join() {
  const sync = useSync();
  const [name, setName] = useState("");

  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  if (sync.role === "guest" && sync.current) return <Table />;
  return (
    <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6">
      <h1 className="font-display text-3xl font-black">Take a seat.</h1>
      <p className="mb-5 mt-2 text-slate-500">
        Join the physical table from your phone. The host approves your seat
        before you can play.
      </p>
      {error || sync.error ? (
        <p role="alert" className="mb-3 text-red-700">
          {error || sync.error}
        </p>
      ) : null}
      {sync.role !== "guest" ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setWorking(true);
            setError("");
            try {
              await joinPhone(parseInvitation(location.hash), name);
              history.replaceState(null, "", location.pathname);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not join. Check your invitation.",
              );
            } finally {
              setWorking(false);
            }
          }}
        >
          <label className="block font-bold">
            Your name
            <input
              autoComplete="nickname"
              className={`${field} my-3`}
              required
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className={primary}
            disabled={working || !signalingEndpoint()}
          >
            Join table
          </button>
          {!signalingEndpoint() && (
            <p className="mt-3 text-sm">
              Phone joining is not configured here.
            </p>
          )}
          {sync.notice && <p className="mt-4 text-sm">{sync.notice}</p>}
        </form>
      ) : (
        <>
          <PhoneStatus />
        </>
      )}
      <Link to="/" className="mt-5 block text-sm font-bold text-play-blue">
        ← The toolkit
      </Link>
    </section>
  );
}
