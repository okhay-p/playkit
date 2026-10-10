# Scorekeeper, tournaments, and word games

These four tools use the agreed frontend stack and native WebRTC. No new direct packages were added.

## Shared-device play

Each tool has a separate saved game in the `playkit-tools` IndexedDB database. Scores, results, and phase changes are saved before showing the new state. Up to ten unique player/team names are supported. Reloading restores the game; word cards remain hidden until deliberately revealed. A new game replaces only the corresponding tool's saved game.

- **Scorekeeper:** positive and negative whole-point rounds, round labels, corrections/deletion, highest/lowest standings, optional target, and ties. Undo keeps the last twenty states. Totals are limited to ±1 billion points; individual round scores to ±1 million. Reaching a target is announced; further scoring remains possible for corrections or house rules.
- **Tournament manager:** round robin pairs each entrant exactly once with no double booking within a round. Win/draw/loss awards 3/1/0 points. Equal points and wins remain tied; names only order the display. Knockout pairs entrants in listed order, spreads initial byes, and generates later rounds as winners become known. Draws are forbidden in knockout. Played later rounds require an explicit reset before correcting an earlier result. Undo also restores the previous bracket.
- **Undercover:** civilians share one word; one or two minority players share a related word. Neither receives a role label. Players give short spoken clues, discuss, and conduct an open group vote. The app records exactly one vote per surviving player, eliminates the largest tally, and repeats. A tie gets a runoff; another tie eliminates nobody and starts another clue cycle. Civilians win after all Undercover players are eliminated; Undercover wins with one civilian left.
- **Imposter:** civilians get a common word; imposters explicitly see their role and receive no word or hint. The elimination loop matches Undercover. An eliminated imposter gets one final spoken guess, confirmed by the group to accommodate synonyms; a correct guess wins immediately for the minority. A failed guess resumes play or resolves the remaining-player victory condition. These are explicit PlayKit rules; Imposter implementations differ.

The offline English pack contains 64 words in 32 originally selected word pairs. Hosts can choose All (the default) or Food & drink (6 pairs), Nature & animals (8), Places & transport (5), Everyday objects (6), and Arts & activities (7). Custom accepts pasted comma-separated words or a `.csv`/`.txt` upload, with no header; line breaks and CSV quoted phrases are supported. Imposter chooses a word from the custom list. Undercover groups consecutive entries into related pairs, requiring an even number of words with different words in each pair (for example `coffee, tea, beach, island`). Lists are limited to 100 KB, 1,000 words, and 80 characters per word/phrase. Uploads replace the setup text and are read locally; only the selected deal is saved, never the full custom list or sent to joined phones. New-game setup starts at All. Custom list authors may already know the answers. Majority/minority word orientation and minority assignments are randomized. No participant has to write the words or sit out as moderator. Clues and discussion stay in person. There is no microphone recording, speech recognition, automated word judgment, or AI word-generation service.

## Phones and permissions

Open **Phones**, enable joining, share the invitation, and approve each requested player/team seat. The host can operate every control throughout. Use separate browser profiles when testing; tabs in one profile share host storage.

For scorekeeper and tournaments, phones initially observe committed state. The host can enable **Allow approved phones to record results**; this permits score rounds/corrections/deletion or tournament results. Starting/replacing games, undo, bracket resets, and permission changes remain host-only. This is a group operator permission, not a restriction to scoring only the device's own team.

Word phones receive only their own private card and public state. A phone can mark its own spoken clue complete; dealing progress, discussion, vote tallies, and guess judgments remain host operations. The host can mix pass-and-play with private phone cards. It still moves through the named handoff screens to confirm everyone is ready.

`PeerTransport` accepts a parser for each application protocol. Poker retains version 1; these tools use version 2 and `/tools/join` invitations. An unapproved peer receives only the roster. The host binds credential + device + seat and checks permissions, game identity, command identity, and expected revision. Accepted command IDs are saved with the game for deduplication. Simultaneous changes at one revision cannot both commit.

The host sends a projection for each approved seat, never the full hidden-role deal, words, or undo snapshots. Words and all roles become public only when the game ends. The host device is trusted: its owner can inspect the full deal in storage/devtools. This is friendly in-person play, not protection from a malicious host.

Host room credentials and approved seats survive reload. Phones recover their own last-known projection and credentials from local storage; controls stay unavailable until a fresh host update arrives. There is no speculative offline scoring, clue advancement, or automatic resubmission after an uncertain acknowledgment. Reconnect and review the authoritative result before retrying a change. Closing joining clears connected phone copies; offline copies cannot be remotely erased. Rooms expire after 12 hours.

The host's tool connection stops when leaving its game route and reconnects when reopening it. Keeping that host game open is required. The poker connection retains its existing recovery behavior. Chess remains the existing shared-device clock; synchronized chess is a later milestone.

## Infrastructure and validation

The deployed free signaling Worker and STUN server are shared with poker. No TURN key, metered relay, new backend, or account SDK is provisioned. Networks that block direct WebRTC may need the same Wi-Fi or shared-device play. Physical phones on mixed networks remain a user/device acceptance check; automated separate contexts are not physical devices.

The browser suite raises room-creation allowance only in its isolated local Worker using `LOCAL_ROOM_CREATE_LIMIT=100` together with `ALLOW_LOCAL_ICE=true`. Production keeps the hard ten-per-IP/hour allowance; the local override is ignored when local ICE is disabled.

Engine checks cover all 2–10-player tournament sizes, corrections, scoring ties, minority counts, runoff ties, word projections, and victory conditions. Browser flows cover shared-device recovery/offline scores, private reveal/reload, byes/reset, final guesses, approved phone edits, host/guest reload, private card projections, and clue permissions. See [deployment](deployment.md), [roadmap](roadmap.md), and [word-game research](word-deduction-games.md).
