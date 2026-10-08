# Throwaway UI variants

**Question:** Which layout makes it easiest to record spoken actions during a physical poker game, while keeping the same interface usable on optional player phones?

**Verdict:** Awaiting user comparison. No design has been promoted to production.

This branch contains three structurally different layouts, using the supplied PlayKit brand guide: Play Blue `#3B82F6`, Field Green `#22C55E`, Coral Red `#F87171`, Sun Yellow `#FBBF24`, Ink Navy `#0F172A`, rounded display type, geometric shapes, and simple native chip illustrations. The geometric logo is an SVG approximation for this prototype, not a replacement master brand asset.

## Run

Install dependencies once with `npm install`, then run:

```sh
npm run prototype
```

Open <http://localhost:5173/prototype/?variant=A>.

| Variant | Layout hypothesis | URL |
| --- | --- | --- |
| A — Table Club | Spatial seats and a central pot help everyone read the table. | `/prototype/?variant=A` |
| B — Score Sheet | A player ledger, history, and operator console support spoken-action bookkeeping. | `/prototype/?variant=B` |
| C — Your Turn | A large current actor and one obvious next action reduce attention spent on the app. | `/prototype/?variant=C` |

The floating bottom bar and left/right keyboard arrows cycle layouts. Arrow keys are left alone while editing fields or using a dialog. The URL records the selected variant. Switches preserve the in-memory session and print it in the browser console; the inspector button shows the full relevant state.

Use the game navigation to compare chess clocks too, or append `&game=chess`. Use the device toggle to preview Alex’s player-phone permissions in poker. Both roles share the same table layout.

## Try

- Call, fold, or raise; watch the actor, stacks, pot, and history change.
- Switch layouts partway through the hand.
- Switch to player-phone mode on someone else’s turn; controls disable. Return to shared mode to keep recording.
- Undo an action, complete betting, then confirm the turn/river was physically dealt.
- At showdown, load the fixed example cards, muck a hand, preview a payout, and confirm it. Undo settlement before the next hand.
- Open the invite panel to see an illustrative seat-approval flow.
- Start the chess clock, tap the active player to switch, pause/resume, or change time/increment. Hiding the page pauses it.

## Limits

Everything is in memory. Reloading resets the demo. There is no P2P transport, durable storage, service worker, poker evaluator, or complete rules engine. Invites and seat approval are simulated. Showdown uses a fixed example ranking; side pots and full no-limit raising rules are not implemented. Starting the next hand resets sample stacks rather than maintaining a cash-game ledger. The demo is fixed to four named players, not the production 2–10 player setup.

The clock is an interactive demonstration of elapsed-time accounting and increment behavior, not a production clock. Google Fonts are loaded externally with local font fallbacks.

The switcher is only rendered in Vite development mode. All prototype code belongs on `prototype/ui-variants`, not `main`. After choosing a layout, capture the decision in the review issue and rewrite the selected approach with production rules, persistence, networking, and accessibility as needed.

## Verification captured

- Vite production build succeeds; development switcher is gated out of production rendering.
- Desktop (1440px) and phone (390px) screenshots of all poker layouts; no horizontal overflow.
- Phone-width checks of all three chess layouts; no horizontal overflow.
- Browser walkthrough: call/raise progression, variant state retention, player permissions, undo, dealing, muck guard, payout confirmation/reversal, elapsed clock time, switching, configuration, and reset.
- No browser runtime errors during the walkthrough.

Screenshots in [screenshots](screenshots/) are the primary visual reference. The browser walkthrough was run as a temporary script outside the repository, not as a production test suite.
