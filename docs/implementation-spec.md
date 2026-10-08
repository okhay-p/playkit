# Playkit implementation spec

Status: shared-device poker is implemented and validated in desktop/phone Chromium, including offline recovery. Real-device usability and Safari/iOS remain release checks. WebRTC synchronization and chess are not yet implemented.

Selected UI direction: **A — Table Club**, chosen from the interactive prototypes. See [the UI decision](ui-direction.md) for the visual direction and primary source references.

## Purpose and scope

Playkit supports people playing physical games together. It handles bookkeeping and timing while cards, boards, conversation, and play remain at the table.

The default experience uses one shared device. People may nominate an operator, pass a phone around, or tap a stationary tablet; the app does not mandate an operator. Optional personal phones use the same poker table interface.

Delivery order:

1. Complete shared-device poker, including offline use and recovery.
2. Add synchronized poker sessions over WebRTC.
3. Add a shared-device chess clock.

Remote play, digital dealing, accounts, payments, cash transfers, tournament management, and synchronized chess clocks are outside this version. Chip counts are game bookkeeping, with no currency conversion.

## Product requirements

### Session setup

- Create a poker session with 2–10 named players in a chosen seat order.
- Configure each starting stack and fixed small/big blinds using whole-number chips.
- Require positive blinds, small blind no greater than big blind, and positive starting stacks. Reject unsafe integer values and configurations whose total chips exceed the supported integer range.
- Select the initial dealer; rotate automatically between hands.
- Show seats, stacks, pot, current actor, current street, and action history.
- Support adding chips through rebuys between hands, recording the amount in history. No stack edits during a hand.
- Permit seat changes, player additions, and player departures only between hands. Record removed chips and preserve session accounting.
- A zero-stack player cannot begin another hand until rebuying. Require at least two active players to deal.
- Define a supported numeric ceiling during implementation and use it consistently in validation, UI, and tests.

### Shared-device poker interaction

- Use one table layout in shared and synchronized modes.
- Shared-device controls act for the current player; visually emphasize their name and seat before submission.
- Available actions: fold, check, call, bet, raise, and all-in, depending on legality.
- Display the amount to call, minimum legal bet/raise, remaining stack, and resulting total street contribution before an action is submitted.
- Define bet/raise input as the total contribution for the current street, labeled clearly as “Raise to” or “Bet.” Never mix total and additional amounts silently.
- Provide fast amount controls and an explicit confirm action; disable repeated submission while processing.
- Advance turns automatically after accepted actions.
- No private digital hands are held during betting. Physical cards remain with players.

### Hand lifecycle

State sequence:

`between hands → preflop → awaiting flop → flop → awaiting turn → turn → awaiting river → river → showdown entry → payout preview → settled`

- Beginning a hand posts blinds automatically, including short-stack partial blinds, and starts preflop action.
- When betting closes, wait for an explicit “Flop dealt,” “Turn dealt,” or “River dealt” action. These buttons record physical dealing; they do not require card entry.
- Enter the five community cards and shown players’ two hole cards together at showdown.
- If all but one player folds, settle immediately without card entry or showdown.
- If no further betting is possible because players are all-in, continue through explicit dealing confirmations to showdown without artificial betting turns.
- When only one player can still act, require any outstanding call/fold decision; do not allow further betting against players who cannot respond.
- A settled hand shows the payout and resulting stacks. The host explicitly starts the next hand.

### No-limit Texas Hold’em rules

The game engine, rather than UI controls alone, enforces:

- Dealer rotation, blind placement, heads-up special cases, and turn order. Heads-up: dealer posts small blind and acts first preflop; big blind acts first postflop.
- Checks only when no additional contribution is owed; calls capped by available stack; bets and raises capped by stack.
- Minimum opening bet equal to the big blind, except a smaller all-in. Minimum full raise based on the last full bet/raise increment. Posting a short big blind does not lower the nominal preflop bring-in.
- Correct reopening of betting: a short all-in does not by itself reopen raising for someone who already acted; cumulative short raises reopen it only when the amount faced since that player’s last action reaches a full raise.
- A player who has not acted retains their legal raise options. Track individual reopening rights rather than one global “raise allowed” flag.
- Big blind’s preflop option when action returns without a raise.
- Closing a betting street only once all required responses are complete; equal contributions alone are insufficient when someone retains an option to act.
- Folded players cannot act or win pots. All-in players remain eligible for pots supported by their contribution.
- Return unmatched excess contributions before settlement; do not manufacture a pot for an unmatched bet.
- Build main/side pots from contribution thresholds, including folded contributions but excluding folded players from eligibility.
- Determine each pot’s winner separately using the best five cards out of seven. Handle all standard hand categories, ties, and ace-low straights.
- Split pots in whole chips. Assign odd chips to tied winners in clockwise order starting left of the dealer.
- No rake, antes, straddles, run-it-twice, or custom house rules in this version.

Use a documented rule reference when implementing the engine, especially for short raises and unusual side-pot cases. Record the selected interpretation in engine documentation and fixtures.

### Showdown and mucking

- The host/shared device enters all showdown cards. Joined phones display the results and payout preview; they do not submit cards.
- Players can muck and explicitly relinquish claims to all pots for which they were eligible.
- Validate card uniqueness across the board and all shown hands. Represent cards with canonical rank/suit identifiers.
- Require a complete board and complete shown hands before evaluating contested pots.
- Every contested pot must retain at least one eligible shown hand. A player eligible only for the main pot cannot satisfy this requirement for a side pot.
- Prevent a muck that would leave a pot with no eligible winner; explain which pot requires a shown hand.
- A pot with only one eligible player is awarded without requiring that player to reveal cards. Do not allow mucking to erase that sole claim.
- Build an immutable payout preview showing each pot, eligibility, winning hand description, split/odd chips, returned excess, and resulting stacks.
- Confirm settlement once. Correcting cards invalidates the previous preview and requires recomputation.
- Confirmed settlement remains reversible until the next hand starts.

### Correction and history

- Host-controlled undo is available in shared mode and synchronized mode.
- Undo reverses the most recent game operation, including an action, dealing confirmation, card/muck change, or settlement, restoring a valid prior state.
- Show a confirmation with the player/action affected, especially when undoing settlement.
- Starting the next hand closes the preceding hand’s correction window. Earlier hands remain viewable but cannot be rewritten.
- Keep a human-readable history of actions, deals, rebuys, payouts, and corrections. Undo is recorded as a correction rather than silently erasing the audit trail.
- Joined devices see corrections as authoritative state updates.

### Persistence and offline use

- Store the shared/host session and action history locally in IndexedDB using a versioned schema.
- Persist each accepted command atomically before showing it as committed or broadcasting it.
- After refresh or reopening, offer to resume the saved session with the same stacks, street, actor, cards, and correction history.
- Cache application assets with a service worker so shared-device poker and chess work offline after an initial successful load. First-ever loading still needs access to the hosted app.
- Show network status without blocking shared-device play.
- Provide “End session and clear data,” with confirmation, to remove session data and joining credentials from the host. Connected clients clear their session copies upon receiving the closure message; offline/disconnected copies cannot be remotely erased.
- Do not promise recovery after browser storage is cleared, private browsing ends, or a device is lost.

## Synchronized poker sessions

### Joining and permissions

- Host enables phone joining and displays a QR code/link backed by a high-entropy session invitation, not a guessable room identifier alone.
- A phone joins, enters a name, requests an unclaimed seat, and waits for host approval.
- Host binds an approved device identity to one seat. A name alone is not authorization.
- Persist a scoped rejoin credential on the joined phone. Host can revoke a seat’s device association and approve a replacement.
- Joined devices view the same table and history. Player action controls are enabled only for their seat, on their turn.
- Host can record actions for every player regardless of whether they have a joined phone, and owns dealing, card entry, mucking, corrections, seat approvals, and settlement.
- If host and player submit concurrently, accept only the first valid command for that turn/state; reject the stale command without repeating the action.
- Show connection status distinctly from “waiting for your turn.” A disconnected player can continue physically while the host records their actions.

### Transport and authority

- Use WebRTC reliable, ordered data channels in a star topology: each phone connects to the host. No full mesh or automatic host election.
- Use managed signaling for invitation routing and connection negotiation, STUN for discovery, and managed TURN fallback when direct connections fail.
- Phones do not need to share a network. Internet is required for the supported joining flow; offline multiplayer is outside scope.
- Keep authoritative game state and history on the host. Signaling stores only short-lived connection metadata, not hands, bets, or game history.
- WebRTC encrypts peer data in transit, including when relayed through TURN. This does not hide network metadata from service operators or players’ state from approved peers.
- Make no multiplayer privacy promise that depends only on P2P branding. Avoid analytics and third-party logging of session payloads or invitation credentials.
- Validate transport payloads and permissions on the host. The shared host is trusted; protection against a malicious host is outside scope.
- Select service providers during the synchronization milestone. Document credential issuance, allowed origins, expiration, abuse limits, costs, and retention. Never ship privileged service credentials in the browser.
- Managed infrastructure reduces operational work but does not remove service dependencies. A small credential-issuance endpoint may be needed depending on the TURN provider.

### Protocol and recovery

- Every command includes protocol version, session identity, unique command ID, expected state revision, command type, and payload. Derive player authorization from the approved connection rather than trusting a supplied seat ID.
- Host validates legality, permissions, revision, and duplicate command IDs before applying changes.
- Commands receive a success/rejection acknowledgment. Committed updates carry monotonically increasing revisions.
- On initial join or rejoin, send a complete versioned snapshot; stream committed updates afterward. Request a fresh snapshot on a gap or incompatible local state.
- A snapshot and subsequent event stream must agree on the same revision boundary so joining cannot miss an action.
- Resending an unacknowledged command uses its original ID. Reconnect must never turn a retransmission into a second bet.
- Host disconnection freezes new client submissions. Preserve the displayed last-known state and show “Waiting for host.” Do not queue speculative actions for later application.
- On host recovery, restore saved state and reopen connections; joined phones retry using their rejoin credentials. Resume only after authoritative reconciliation.
- Require an explicit host resume after recovery when a hand is in progress, so the table can confirm physical play did not advance independently.
- If the host cannot return, use the last-known display to resolve the physical game manually; automatic host migration is outside scope.
- Tell hosts to keep the app open. Use screen wake lock where supported as a convenience, handle loss of the lock, and do not depend on background execution.

## Shared-device chess clock

- Two players use one device; no chessboard, move legality, remote synchronization, or player accounts.
- Configure equal or separate starting times and an optional nonnegative Fischer increment per completed move, stored as whole seconds.
- Select the first player and start explicitly.
- During play, tapping the active player’s clock adds their increment and starts the opponent’s clock. Inactive clock taps do nothing.
- Provide large touch targets, clear active-player styling, pause/resume, and reset with confirmation. Disable move taps while paused or finished.
- Reset returns to the configured times and pre-start state.
- At zero, stop both clocks and identify the player whose time expired. Do not award increment if their time had already expired when the tap is processed.
- Calculate remaining time from a monotonic elapsed-time reference, not by decrementing once per timer callback. Rendering frequency must not determine elapsed time.
- If visibility is lost, pause the clock and require explicit resume when the app returns. This is a casual shared clock, not a tournament-certified clock.
- Persist configuration and recovery state. After reload or crash recovery, restore paused; do not infer continuous elapsed time across a terminated browser session.
- Use screen wake lock where available while running, and handle unsupported/released locks gracefully.

## Implementation architecture

- Use React with Vite, Tailwind CSS, and TanStack Router for the browser application, with native WebRTC for optional phone synchronization. Retain responsive UI, installable PWA assets, IndexedDB persistence, and a separate pure game engine. See [tech stack decisions](tech-stack.md) for agreed choices and pending supporting libraries/providers.
- Keep poker commands, validation, state transitions, pot construction, evaluation, and payout calculation independent of DOM, storage, and networking.
- Use the same command interface from shared controls and joined phones. Route both through the host authority; UI permission checks supplement engine checks.
- Separate transport, persistence, and UI adapters. Shared mode uses an in-process transport without networking services.
- Model seats, session chip ledger, dealer, hand/street, current actor, stacks, total/street contributions, fold/all-in status, individual raise rights, showdown decisions, pots, cards, and settlement explicitly.
- Store accepted operations plus snapshots. Corrections create new revisions and restore earlier valid game state without revision rollback.
- Persist command deduplication information alongside game updates so host reload does not break idempotency.
- Evaluate a suitable maintained hand evaluator or implement one behind an isolated interface; verify correctness with independent fixtures either way.
- Render phones and shared devices through one table component with capability-based controls. Reflow for screen size without creating separate game workflows.

## UX and accessibility

- Optimize the main action loop for an operator listening to spoken actions: identify actor, choose action, confirm, immediately see the next actor.
- Keep current actor, call amount, pot, and stacks visible without opening secondary screens.
- Use clear errors for illegal raises, stale turns, duplicate cards, blocked mucking, and disconnected sessions.
- Prefer names and chip amounts over implementation vocabulary in product text.
- Provide keyboard support, labeled controls, visible focus, readable contrast, and status that does not rely on color alone.
- Validate core flows on narrow phone screens and a stationary tablet. Check actual mobile browser behavior for joining, sleep, reconnect, and offline recovery.

## Validation and acceptance criteria

### Engine correctness

- Scenario tests cover heads-up and multiway order, blind options, short blinds, legal/illegal actions, full and short raises, cumulative reopening, all-in runouts, folds, and unmatched returns.
- Side-pot fixtures include different stack sizes, folded contributors, tied winners, odd chips, mucking, and separate main/side-pot winners.
- Hand-evaluation fixtures cover all categories, board-playing ties, kicker comparisons, flushes, full houses, and ace-low straights.
- Across accepted operations, stacks and committed contributions conserve session chips, except recorded additions/removals. Settlement produces no negative stacks and allocates every committed chip exactly once.
- Undo and replay reproduce the expected state; settlement confirmation and command retries are idempotent.

### Shared poker acceptance

- Run a complete physical hand from setup through betting, dealing confirmations, showdown, payout preview, settlement, and next hand.
- Run a fold-win hand and a multiway all-in with side pots.
- Correct a bet and showdown card, reverse settlement, and verify correction becomes unavailable after the next hand starts.
- Refresh during betting and showdown; restore the exact agreed state. Repeat after going offline with cached assets.

### Synchronization acceptance

- Host plus at least two phones join, receive approvals, and observe identical state revisions.
- Unauthorized, out-of-turn, duplicate, and stale commands never alter game state.
- Exercise concurrent host/player actions, missing acknowledgments, client reconnect, host refresh, seat replacement, and revoked credentials.
- Verify TURN fallback and a mixed Wi-Fi/mobile-data session on real devices. Exercise the supported 10-seat limit.
- Host loss blocks submissions; host recovery preserves committed bets and requires explicit resume.

### Chess acceptance

- Verify switching, increments, pause/resume, expiration, reset, and restored paused state.
- Verify delayed rendering does not change elapsed-time accounting, and hiding the page pauses play.
- Test touch interaction on a shared phone/tablet, including rapid repeated taps.

## Milestone deliverables

1. **Shared poker:** pure engine and meaningful rule tests; setup/table/showdown UI; corrections; local persistence; offline assets; complete manual hand walkthrough.
2. **Phone sync:** selected managed services; secure joining and seat approval; permission-aware shared UI; revisioned/idempotent protocol; reconnect and host recovery; real-device connectivity validation.
3. **Chess:** setup and two-clock UI; accurate elapsed-time accounting; increment and pause behavior; local recovery; mobile interaction validation.

Implementation is complete only when each milestone’s acceptance criteria pass. The public repository should contain setup instructions, service configuration guidance when applicable, and no secrets or private session data.

## Technical references

- [WebRTC peer connections and signaling](https://webrtc.org/getting-started/peer-connections)
- [WebRTC TURN fallback](https://webrtc.org/getting-started/turn-server)
- [WebRTC data channels](https://webrtc.org/getting-started/data-channels)
- [Browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
