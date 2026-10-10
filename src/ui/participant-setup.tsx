import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createId } from "../id";
import { field, Modal, primary, secondary, Tag } from "./primitives";

export type SetupParticipant = { id: string; name: string; value?: number };

export function ParticipantSetup({
  participants,
  onChange,
  title = "Players",
  noun = "player",
  min = 2,
  max = 10,
  nameLimit = 24,
  fixed = false,
  summary,
  numeric,
  uniqueNames = true,
}: {
  participants: SetupParticipant[];
  onChange: (participants: SetupParticipant[]) => void;
  title?: string;
  noun?: "player" | "player or team" | "seat";
  min?: number;
  max?: number;
  nameLimit?: number;
  fixed?: boolean;
  summary?: (participant: SetupParticipant, index: number) => ReactNode;
  numeric?: { label: string; min: number; max: number; defaultValue: number };
  uniqueNames?: boolean;
}) {
  const headingId = useId();
  const list = useRef<HTMLOListElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<{
    id: string | null;
    name: string;
    value: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<{
    participant: SetupParticipant;
    index: number;
  } | null>(null);
  const index = editor ? participants.findIndex((p) => p.id === editor.id) : -1;
  function open(participant?: SetupParticipant) {
    setError("");
    setEditor({
      id: participant?.id ?? null,
      name: participant?.name ?? "",
      value: String(participant?.value ?? numeric?.defaultValue ?? ""),
    });
  }
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={headingId} className="font-display text-xl font-extrabold">
          {title}
        </h2>
        <Tag>
          {participants.length} / {max}
        </Tag>
      </div>
      <ol ref={list} className="space-y-3">
        {participants.map((participant, i) => (
          <li
            key={participant.id}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
          >
            <span className="seat-avatar shrink-0" aria-hidden="true">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="participant-name font-bold">{participant.name}</p>
              {summary && (
                <p className="mt-1 text-sm text-slate-500">
                  {summary(participant, i)}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn participant-edit shrink-0 text-play-blue-deep"
              aria-label={`Edit ${noun} ${i + 1}: ${participant.name}`}
              onClick={() => open(participant)}
            >
              Edit
            </button>
          </li>
        ))}
      </ol>
      {!fixed && (
        <button
          ref={addButton}
          type="button"
          className={`${secondary} mt-3 w-full`}
          disabled={participants.length >= max}
          onClick={() => open()}
        >
          + Add {noun === "seat" ? "a seat" : `a ${noun}`}
        </button>
      )}
      {removed && (
        <div
          role="status"
          className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3 text-sm"
        >
          <span className="participant-name min-w-0">
            Removed {removed.participant.name}.
          </span>
          <button
            type="button"
            className={`${secondary} shrink-0`}
            disabled={participants.length >= max}
            onClick={() => {
              const restored = [...participants];
              restored.splice(removed.index, 0, removed.participant);
              onChange(restored);
              setRemoved(null);
            }}
          >
            Undo removal
          </button>
        </div>
      )}
      {editor &&
        createPortal(
          <Modal
            title={`${editor.id ? "Edit" : "Add"} ${noun === "seat" ? "player" : noun}`}
            initialFocus={nameInput}
            close={() => setEditor(null)}
          >
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                // Portals preserve React bubbling; never submit the setup form.
                event.stopPropagation();
                const name = editor.name.trim();
                if (!name) {
                  setError("Enter a name.");
                  return;
                }
                if (
                  uniqueNames &&
                  participants.some(
                    (p) =>
                      p.id !== editor.id &&
                      p.name.toLowerCase() === name.toLowerCase(),
                  )
                ) {
                  setError("Use a different name for each player or team.");
                  return;
                }
                const next: SetupParticipant = {
                  id: editor.id ?? createId(),
                  name,
                  ...(numeric ? { value: Number(editor.value) } : {}),
                };
                onChange(
                  editor.id
                    ? participants.map((p) => (p.id === editor.id ? next : p))
                    : [...participants, next],
                );
                setEditor(null);
              }}
            >
              <label className="block font-bold">
                {noun === "player or team"
                  ? "Player or team name"
                  : "Player name"}
                <input
                  ref={nameInput}
                  className={`${field} mt-2`}
                  autoComplete="off"
                  required
                  maxLength={nameLimit}
                  value={editor.name}
                  onChange={(event) => {
                    setEditor({ ...editor, name: event.target.value });
                    setError("");
                  }}
                />
              </label>
              {numeric && (
                <label className="block font-bold">
                  {numeric.label}
                  <input
                    className={`${field} mt-2`}
                    type="number"
                    inputMode="numeric"
                    min={numeric.min}
                    max={numeric.max}
                    step={1}
                    required
                    value={editor.value}
                    onChange={(event) =>
                      setEditor({ ...editor, value: event.target.value })
                    }
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button className={`${primary} flex-1`}>
                  {editor.id ? "Save changes" : `Add ${noun}`}
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
              </div>
              {editor.id && !fixed && (
                <button
                  type="button"
                  className={`${secondary} w-full text-red-600`}
                  disabled={participants.length <= min}
                  onClick={() => {
                    setRemoved({ participant: participants[index]!, index });
                    onChange(participants.filter((p) => p.id !== editor.id));
                    setEditor(null);
                    requestAnimationFrame(() => {
                      const buttons = list.current?.querySelectorAll("button");
                      (
                        buttons?.[Math.min(index, buttons.length - 1)] ??
                        addButton.current
                      )?.focus();
                    });
                  }}
                >
                  Remove {noun === "seat" ? `seat ${index + 1}` : noun}
                </button>
              )}
            </form>
          </Modal>,
          document.body,
        )}
    </section>
  );
}
