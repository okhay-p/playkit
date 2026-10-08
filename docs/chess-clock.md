# Shared chess clock

Open **Chess clock** from the toolkit. Two people share one device; no account, network, chessboard, or move validation is involved. Poker phone joining does not synchronize the chess clock.

Set both names, starting seconds independently, a common Fischer increment, and the first player. Presets populate the fields; saving does not start play. Starting times must be whole seconds from 1 to 86,400; increment is 0 to 3,600 seconds. Tap the active player's large clock after completing a move: the mover receives the increment and the opponent starts. Inactive taps have no effect. Pause/resume explicitly; reset requires confirmation and returns both clocks to configured times before start.

The pure engine in `src/chess/engine.ts` derives elapsed time from `performance.now()`. Rendering callbacks never decrement time. A late tap checks expiration before granting increment. At zero, both clocks stop and the player whose time expired is named.

The adapter stores validated snapshots in a separate `playkit-chess` IndexedDB database. Configuration and accepted controls are saved; running clocks also checkpoint once a second. On crash/reload, the latest saved snapshot returns paused, with no inferred browser downtime. A crash may lose elapsed time since the last successful checkpoint; confirm the displayed times together before resuming. Normal pause/background/navigation saves the elapsed state. Browser shutdown can interrupt a final asynchronous save, so recovery always uses the latest successful checkpoint.

Leaving the clock screen, page hiding, and pagehide request a pause. Returning never starts automatically. Screen wake lock is requested while running when supported; battery/permission failures are harmless. This is a casual shared clock, not tournament-certified timing. A storage failure pauses play and blocks further timer commands; recovery or creating a new clock is explicit. Revision checks reject writes from a stale second tab; use one clock tab per shared device.

Unit tests cover turn switches, increments, inactive/duplicate taps, delayed rendering, pause/resume, zero before increment, reset, schema validation, and paused restoration. Browser tests cover configuration, switching, expiration, reset cancellation/confirmation, reload, visibility pause, navigation pause, presets, and offline recovery across Chromium desktop/touch, Firefox, and WebKit. Actual shared-device touch ergonomics, mobile sleep, and native wake lock need physical-device validation.
