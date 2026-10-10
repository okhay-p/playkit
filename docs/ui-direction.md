# UI direction: A — Table Club

Decision: use Variant A as Playkit’s visual direction. The user selected it after reviewing the interactive variants: “i like variant A.”

## Carry into implementation

- The supplied PlayKit palette, rounded typography, geometric mark, and playful chip motifs.
- Players arranged around a physical-table-style surface, with a central pot and visible street progression.
- A separate current-player action console for recording spoken actions, plus recent history and host undo.
- One table interface for shared-device and optional player-phone roles, with controls determined by permissions.
- The matching Variant A chess-clock direction when the chess milestone is implemented.

This decision establishes the preferred layout and visual treatment. It does not establish that the prototype’s simulated game logic or mobile interaction flow is production-ready. Implement against the agreed rules and acceptance criteria in [the implementation spec](implementation-spec.md).

## Primary source

The full comparison remains on [prototype/ui-variants](https://github.com/okhay-p/playkit/tree/prototype/ui-variants), originally captured in commit `9f525fa`. Reference [the prototype guide](https://github.com/okhay-p/playkit/blob/prototype/ui-variants/prototype/README.md), [the selected desktop screenshot](https://github.com/okhay-p/playkit/blob/prototype/ui-variants/prototype/screenshots/table-club.png), and [the selected mobile screenshot](https://github.com/okhay-p/playkit/blob/prototype/ui-variants/prototype/screenshots/table-club-mobile.png).

Decision and subsequent implementation tracking: [issue #1](https://github.com/okhay-p/playkit/issues/1).

Keep the throwaway variants on their reference branch. Build the selected layout as production code alongside the real poker engine, persistence, and synchronization milestones.

## Visual system

The Table Club direction is expressed through a small set of shared styles in `src/style.css`. Prefer these over repeating long Tailwind strings in screens.

- **Tokens:** brand colors (`play-blue`, `play-green`, `play-coral`, `play-yellow`, each with a `-deep` shade), `play-ink`, `play-paper`, the `shadow-card` / `shadow-lift` elevations, and the `--ease-snap` easing. Type stays Nunito for display and DM Sans for text.
- **Controls:** `primary`, `secondary`, `iconButton`, and `field` in `src/ui/primitives.tsx` map to the `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-icon`, and `.field` classes. Buttons press down like a chip edge. These classes live in the `components` layer, so Tailwind utilities (`w-full`, `text-red-600`) still override them.
- **Surfaces:** `.surface` is the standard white card. `.sheet` is the dialog (a bottom sheet on phones). `Tag` accepts a `tone` of `slate`, `blue`, `green`, `yellow`, or `coral`.
- **Table:** `.table-felt`, `.chip` (with `.green`, `.coral`, `.yellow`), `.seat` (positioning only), `.seat-card` and `.seat-avatar` (driven by `data-active` and `data-folded`), `.dealer-disc`, and `.street-step` (driven by `data-state`). Keep the `.seat` class: browser tests measure it.
- **Chess clock:** `.clock-face` is driven by `data-active`, `data-low` (10 seconds or less while running), and `data-expired`, with `.clock-bar` showing time remaining.
- **Motion:** every animation and transition is disabled under `prefers-reduced-motion`.

## Participant setup

Use Design B for every game’s setup roster: compact cards show the complete name with wrapping, and an Edit button opens a focused dialog (a bottom sheet on phones). Poker cards include starting chips and dealer status; chess cards include side and starting time. Scorekeeper and tournament accept player or team names; word games use player names. Add opens the same editor, Cancel leaves the roster untouched, and removals offer Undo. Keep game configuration outside the participant editor.
