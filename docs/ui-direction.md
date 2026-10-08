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
