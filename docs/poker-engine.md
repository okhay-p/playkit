# Shared-device poker engine

The pure transition module is `src/poker/engine.ts`. It has no React, storage, network, or clock dependencies. A command envelope supplies a unique ID, expected revision, and timestamp. An accepted command returns a new session; it never mutates its input. Retrying an already processed ID returns the committed session, while a new stale command is rejected.

## Selected rules

This is a no-limit Texas Hold’em cash-game helper using moving-button rotation, integer chips, fixed blinds, and no rake or antes. Seats without chips sit out. Heads-up dealer/SB acts first preflop; BB acts first postflop. A short BB does not reduce the nominal bring-in while at least two players can bet. When only one player has chips and every opponent is all-in, only the actual outstanding wager requires a response; a covered player goes directly to the runout.

The betting interpretation follows [Poker TDA rules 45 and 49 and their illustrated examples](https://www.pokertda.com/view-poker-tda-rules/), used here as a reference for wager sizing and reopening rather than tournament administration. Each player's last faced wager is tracked separately. A short all-in, including an opening short all-in after a check, does not reopen action until the cumulative increase faced by that player reaches a full bet/raise. Unacted players may raise. Minimum total is current wager plus the last full increment, initially the BB; a short opening all-in of 5 with BB 10 therefore permits an unacted player's full raise to 15. A smaller increase is only accepted when it uses the player's entire stack. These choices are explicit regression fixtures.

Pot thresholds include folded contributions and exclude folded hands from eligibility. Uncalled excess is returned before street completion. Contested pots compare shown hands; mucking removes eligibility, but cannot leave any pot without a claimant. An originally uncontested pot requires no cards. Ties distribute odd chips clockwise starting left of the dealer. `src/poker/cards.ts` compares every five-card combination from the supplied seven, including wheel straights and all standard categories.

## State and corrections

Phases are `between`, `betting`, `awaiting`, `showdown`, `preview`, and `settled`. An explicit dealing command advances each street, including all-in runouts. Fold wins settle automatically. Showdown entry is atomic across board, hands, and muck decisions. Preview computes but does not credit awards. Settlement recomputes the validated result before crediting stacks.

Undo restores the preceding core state, while recording a correction in the permanent event log and advancing the revision. Starting a hand clears undo, so results from a previous hand cannot be reversed afterward. Rebuys and roster changes are limited to between hands and maintain deposited/withdrawn chip totals. Removing the current dealer preserves the next dealer's position.

## Commit and recovery boundary

`src/storage/session.ts` keeps one active session in IndexedDB through Dexie. Each accepted change validates the stored revision and writes the complete session in a read/write transaction before publishing it to React. A failed transaction leaves the accepted turn and committed state unchanged. Separate tabs cannot overwrite one another's actions or clear a newer table. A stale tab receives the stored state and must review it before retrying; there is no live multi-tab synchronization in this milestone.

Reload parses the saved schema and checks chip conservation, turn queues, phase consistency, undo snapshots, unique cards, and preview consistency. The UI requires explicit resume. Storage failures leave data intact and expose a retryable error. An unreadable saved record may be explicitly cleared. Data is local to a browser origin/profile; ending a table deletes the active record. Browser storage eviction or clearing site data can remove the saved game; no cloud backup exists.

The production service worker precaches the app shell, route chunks, icons, and self-hosted fonts. Update activation requires an explicit click between hands. Cached single-device play needs no network. Service workers require HTTPS or localhost; plain HTTP over a Tailscale IP is a UI preview only.

## Validation

`npm run check` covers rule transitions, evaluation, conservation, recovery, seeded legal hands, and 486 complete-hand configurations across 2–10 seats, every dealer position, three blind levels, and short/full stack patterns. `npm run test:e2e` runs a production build in desktop/phone Chromium, Firefox, and WebKit contexts: complete showdown/settlement/undo, all-in side pots and muck constraints, fold wins, rebuys/cashouts, stale tabs, storage-write failure, ten seats, and offline navigation with restored play. Additional flows exercise heads-up bets/raises after pre-hand recovery and short-blind runouts through settlement, rebuy, and the next hand. Phone contexts simulate touch/viewports; actual Zen profiles, Safari/iOS, and physical-device usability remain release checks. Overall workflow deadlines account for slow headless rendering; individual actions still time out after 15 seconds and assertions after 8 seconds.
