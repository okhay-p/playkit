# Tech stack decisions

## Agreed

| Area | Choice |
| --- | --- |
| Frontend | React with Vite |
| Styling | Tailwind CSS, retaining its spacing/sizing scale and adding PlayKit brand tokens |
| Navigation | TanStack Router |
| Multiplayer transport | Native WebRTC reliable, ordered data channels; authoritative host with a star topology |
| UI direction | A — Table Club; see [the UI decision](ui-direction.md) |

Tailwind replaces the earlier CSS Modules recommendation. TanStack Router replaces the earlier React Router recommendation. Native WebRTC does not select TanStack Start, TanStack Query, PeerJS, or simple-peer.

Expected supporting integrations include React’s Vite plugin and Tailwind’s Vite plugin. TanStack’s route-generation plugin is an option if file-based routing is selected. Inform the user of the exact package set before scaffolding or installation.

## Still to decide

- TypeScript configuration and exact package versions.
- IndexedDB wrapper: Dexie was recommended; idb is an alternative.
- Runtime validation: Zod was recommended.
- Offline tooling: vite-plugin-pwa was recommended.
- Test tooling: Vitest and Playwright were recommended.
- Hand evaluator implementation or library.
- Backend, auth, signaling, TURN, and hosting providers.

No packages have been installed on main. The prototype branch’s dependencies are not the production dependency list.

## Backend direction under discussion

Shared-device play needs static app hosting and local storage, with no game backend. Synchronized play needs signaling and TURN availability even though game actions travel between devices. Future user accounts require a trusted authentication service; account data or cloud history would require additional storage according to the eventual feature scope.

A dedicated self-managed server is optional. Managed services and serverless functions can handle authentication, signaling, and short-lived TURN credential issuance. The app’s authoritative poker engine stays on the host device in either arrangement.

Candidate: managed Supabase for future accounts, room signaling through Realtime Broadcast, and small Edge Functions for trusted operations, with a separate managed TURN provider. Room authorization, temporary guest identities, expiration, and metadata retention need design before implementation. This is a proposed provider combination, not a selected dependency.

Alternative: Cloudflare Workers/Durable Objects for signaling and trusted endpoints, with a separately selected managed auth service. This offers more control over signaling but introduces more custom backend code and service integration.

User accounts are planned for a future milestone, not the initial poker implementation. Keep local games usable without login. Accounts do not imply cloud storage of hands or bets; decide cloud features and privacy separately.

## References

- [Tailwind’s Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [TURN credential issuance](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
