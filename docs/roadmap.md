# Game roadmap

PlayKit helps people play together in person. Shared-device, offline play is the default; optional native WebRTC phones connect through free Cloudflare signaling and STUN. The host retains authority. No account is needed.

## Implemented games

- **Scorekeeper:** named players or teams, positive/negative whole-point rounds, highest/lowest score wins, optional target, editable results and undo, saved recovery.
- **Tournament manager:** round-robin matches and knockout brackets, recorded results, byes, standings, next matches, saved recovery. Editing a knockout result must not silently invalidate later matches.
- **Undercover:** private related words with no role labels, spoken clues, discussion, voting and repeated eliminations. Civilians win by eliminating all Undercover players; Undercover wins with one civilian remaining.
- **Imposter:** private common word for civilians; explicit imposter card without a word or hint. Spoken clues, discussion, repeated eliminations; civilians eliminate all imposters, imposters survive until one civilian remains. On elimination, an imposter gets one final word guess. This is PlayKit's explicit preset, not a universal rulebook.

The word games share safe pass-and-reveal, original offline word packs, a surviving-player roster, and outcome reveal. Ties get a runoff; a second tied vote eliminates nobody. Guess correctness is confirmed by the group to accommodate synonyms and spoken answers. Minority roles must start below half the group. See [research](word-deduction-games.md).

## Release milestones

1. Record these games and show Coming soon tiles.
2. Deploy and verify the existing poker WebRTC sessions using free signaling and STUN. Avoid metered TURN enrollment; restrictive networks may need shared-device play.
3. Implement the four tools, retaining offline recovery and adding meaningful engine/browser checks.
4. Extend the shared multiplayer protocol to the four new tools with private, per-player projections for the word games. Never broadcast a hidden-role deal as a public snapshot.

These milestones are implemented; see [game rules and recovery](game-tools.md). Synchronized chess, custom word packs/languages, and accounts remain later work.

No direct library additions are planned. Existing React, TanStack Router, Tailwind, Dexie, Zod, and native browser APIs are sufficient.
