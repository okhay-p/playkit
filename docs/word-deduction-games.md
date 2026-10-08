# Word deduction games: research and proposed direction

Researched 2026-10-09. This note records findings and recommendations, not an approved implementation spec.

## Published rules

Yanstar Studio's **Undercover** gives the majority one word, Undercover players a related word, and Mr. White no word. Players with words initially cannot distinguish their own roles. Players give descriptions, discuss, vote, and eliminate someone; survivors repeat. Civilians win by removing all infiltrators; infiltrators win when only one civilian remains. An eliminated Mr. White gets one guess at the civilian word and wins immediately if correct. See the publisher's [rules](https://www.yanstarstudio.com/undercover-how-to-play).

The publisher supports offline pass-and-play and suggests several tie resolutions, including another description and a revote. See its [FAQ](https://www.yanstarstudio.com/undercover-faq).

**Imposter** names several implementations rather than one universal ruleset. One [implementation](https://impostor.me/en/how-to-play) uses a no-word player, clues, debate, and a vote; a tie lets the imposter survive. Another [implementation](https://imposterofficial.com/how-to-play.html) offers hints and a no-hint variant, plus a final word guess. These differences should be explicit settings or separate presets.

## Proposed PlayKit modes

| Preset     | Majority's private card      | Minority's private card                 |
| ---------- | ---------------------------- | --------------------------------------- |
| Undercover | A word, without a role label | A related word, without a role label    |
| Imposter   | The secret word              | Explicit imposter role; no word or hint |

For example, an original Undercover pair could be **coffee / tea**. Assign the two words to majority/minority randomly so a repeat player cannot infer their role from a fixed ordering. Multiple minority players would share the minority word. A mixed Undercover + no-word preset can come later.

These are recommendations, not claims about a universal rulebook:

- Start with shared-device offline play, using the existing React/Vite stack. No new dependency appears necessary for the initial mode.
- Use built-in, originally written word pairs so nobody playing has to supply or know the words in advance. Custom packs can follow; their author may already know answers.
- Setup selects players, mode, word category, and minority count. Require a civilian majority initially; balance recommendations need playtesting.
- Deal privately: named handoff screen → intentional reveal → hide → next player. Everyone, including the organizer, can participate. Hide secret cards when the app loses visibility and after reload.
- Keep clues and discussion spoken in person. Track turns, surviving players, voting, and outcomes rather than requiring typed clues.
- Undercover repeats clue/discussion/elimination cycles with the same words. Resolve ties through a runoff, with no forced elimination if the runoff ties again. This last fallback is a proposed house rule.
- Initially make Imposter a short game: one clue cycle, discussion, and a group vote. A correctly identified imposter loses; otherwise the imposter wins. An optional final-guess rescue rule should be clearly labeled and agreed before play. Multi-imposter end conditions require a separate decision.
- On the shared device, record an openly conducted group vote or selected elimination. Do not describe this as secret or simultaneous voting. Private voting would need a separate flow.
- Reveal roles on elimination without exposing either word until the game finishes. Show both words and assignments at the end, then offer a new game with the same players.

## Later multi-device support

The game flow can remain similar, with private cards appearing on individual phones. Do not reuse poker's whole-table snapshot broadcast for hidden information: send each peer only its own private card and the public game state. A peer host remains trusted because it holds the complete deal. This is suitable for friends playing together, not a claim of cheat-proof secrecy.

## Decisions before implementation

Confirm repeated eliminations versus one-vote endings for Imposter, final word-guess behavior, support for two imposters, tie handling, clue length, and initial language/content categories. Keep these distinctions visible in the rules shown before starting a game.
