import { useId, useState, type KeyboardEvent } from "react";
import { cardLabel, matchCards } from "../poker/cards";
import { field } from "./primitives";

const slotSelector = "input[data-card-slot]:not(:disabled)";
const isRed = (card: string) => card[1] === "h" || card[1] === "d";

/** Moves to the first empty card slot in a form, or its submit button when all are filled. */
export function focusNextEmptySlot(form: Element | null, after?: Element) {
  if (!form) return;
  const slots = [...form.querySelectorAll<HTMLInputElement>(slotSelector)];
  const next = slots
    .slice(after ? slots.indexOf(after as HTMLInputElement) + 1 : 0)
    .find((slot) => slot.dataset.empty === "true");
  if (next) next.focus();
  else if (after) form.querySelector<HTMLElement>("[type=submit]")?.focus();
}

/**
 * A row of card slots you can type into. Typing filters the deck in a list below the row, and a
 * complete card such as "as" or "10h" fills the slot and moves on, so a flop can be typed in one go.
 */
export function CardSlots({
  values,
  labels,
  used,
  disabled = false,
  onChange,
  className,
}: {
  values: string[];
  labels: string[];
  used: string[];
  disabled?: boolean;
  onChange: (index: number, card: string) => void;
  className: string;
}) {
  const listId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const current = active === null ? "" : values[active];
  const matches = matchCards(query);
  const available = matches.filter(
    (card) => card === current || !used.includes(card),
  );
  const highlighted = available[cursor === -1 && query ? 0 : cursor];
  const optionId = (card: string) => `${listId}-${card}`;

  function pick(index: number, card: string, input: Element | null) {
    onChange(index, card);
    setQuery("");
    setCursor(-1);
    const form = input?.closest("form");
    // The slot's own data-empty attribute is stale until React commits this pick.
    if (input instanceof HTMLInputElement) input.dataset.empty = "false";
    focusNextEmptySlot(form ?? null, input ?? undefined);
    if (document.activeElement === input) setActive(null);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    const input = event.currentTarget;
    if (event.key === "Enter" && highlighted) {
      event.preventDefault();
      pick(index, highlighted, input);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!available.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next =
        (Math.max(cursor, step === 1 ? -1 : 0) + step + available.length) %
        available.length;
      setActive(index);
      setCursor(next);
      document
        .getElementById(optionId(available[next]))
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Backspace" && !query) {
      if (values[index]) onChange(index, "");
      else {
        const slots = [
          ...(input
            .closest("form")
            ?.querySelectorAll<HTMLInputElement>(slotSelector) ?? []),
        ];
        slots[slots.indexOf(input) - 1]?.focus();
      }
    } else if (event.key === "Escape" && active !== null) {
      // The first Escape only closes the list, so typed cards survive it.
      event.preventDefault();
      input.blur();
    }
  }

  return (
    <div
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setActive(null);
        setQuery("");
        setCursor(-1);
      }}
    >
      <div className={className}>
        {values.map((value, i) => (
          <input
            key={i}
            data-card-slot
            data-empty={!value}
            aria-label={labels[i]}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={active === i}
            aria-controls={active === i ? listId : undefined}
            aria-activedescendant={
              active === i && highlighted ? optionId(highlighted) : undefined
            }
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            disabled={disabled}
            className={`${field} px-1 text-center font-bold ${
              active !== i && value && isRed(value) ? "text-red-600" : ""
            }`}
            placeholder={value ? cardLabel(value) : "—"}
            value={active === i ? query : value ? cardLabel(value) : ""}
            onFocus={() => {
              setActive(i);
              setQuery("");
              setCursor(-1);
            }}
            onClick={() => setActive(i)}
            onKeyDown={(event) => keyDown(event, i)}
            onChange={(event) => {
              const text = event.target.value;
              const found = matchCards(text);
              setActive(i);
              setCursor(-1);
              // A complete card is unambiguous, so there is nothing left to choose.
              if (
                found.length === 1 &&
                (found[0] === value || !used.includes(found[0]))
              )
                pick(i, found[0], event.target);
              else setQuery(text);
            }}
          />
        ))}
      </div>
      {active !== null && (
        <div
          className="mt-2 rounded-2xl bg-white p-2 shadow-card ring-1 ring-slate-200"
          // Keeps focus in the slot while tapping a card or dragging the scrollbar.
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex min-h-6 items-center justify-between gap-2 px-1 text-xs text-slate-500">
            <span aria-live="polite">
              {!matches.length
                ? "No card matches. Try a rank and suit, like 10h."
                : !available.length
                  ? `${matches.map(cardLabel).join(", ")} already entered.`
                  : "Type a rank and suit, like as or 10h."}
            </span>
            {current && (
              <button
                type="button"
                tabIndex={-1}
                className="shrink-0 font-bold text-slate-500 hover:text-play-blue"
                onClick={() => onChange(active, "")}
              >
                Clear
              </button>
            )}
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="Matching cards"
            className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto"
          >
            {matches.map((card) => {
              const taken = card !== current && used.includes(card);
              return (
                <button
                  key={card}
                  id={optionId(card)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={card === current}
                  disabled={taken}
                  data-highlighted={card === highlighted}
                  className={`rounded-xl bg-slate-50 py-2 font-bold tabular-nums ring-inset hover:bg-blue-50 disabled:opacity-30 data-[highlighted=true]:ring-2 data-[highlighted=true]:ring-play-blue ${
                    isRed(card) ? "text-red-600" : ""
                  }`}
                  onClick={(event) => {
                    const input = event.currentTarget
                      .closest("form")
                      ?.querySelector(
                        `input[data-card-slot][aria-controls="${CSS.escape(listId)}"]`,
                      );
                    pick(active, card, input ?? null);
                  }}
                >
                  {cardLabel(card)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
