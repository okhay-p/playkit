# Tech stack decisions

## Agreed

| Area | Choice |
| --- | --- |
| Frontend | React with Vite |
| Styling | Tailwind CSS, retaining its spacing/sizing scale and adding PlayKit brand tokens |
| Navigation | TanStack Router |
| Multiplayer transport | Native WebRTC reliable, ordered data channels; authoritative host with a star topology |
| UI direction | A — Table Club; see [the UI decision](ui-direction.md) |
| Backend/signaling | Cloudflare Workers Free with SQLite-backed Durable Objects and WebSocket hibernation |
| Future managed auth | Clerk Hobby, the free managed-auth option used in the cost comparison |
| Managed TURN | Cloudflare TURN, starting within its free usage allowance |

Tailwind replaces the earlier CSS Modules recommendation. TanStack Router replaces the earlier React Router recommendation. Native WebRTC does not select TanStack Start, TanStack Query, PeerJS, or simple-peer.

Expected supporting integrations include React’s Vite plugin and Tailwind’s Vite plugin. TanStack’s route-generation plugin is an option if file-based routing is selected. Inform the user of the exact package set before scaffolding or installation.

## Still to decide

- TypeScript configuration and exact package versions.
- IndexedDB wrapper: Dexie was recommended; idb is an alternative.
- Runtime validation: Zod was recommended.
- Offline tooling: vite-plugin-pwa was recommended.
- Test tooling: Vitest and Playwright were recommended.
- Hand evaluator implementation or library.
- Exact backend/auth packages, deployment configuration, and frontend hosting configuration.

No packages have been installed on main. The prototype branch’s dependencies are not the production dependency list.

## Selected backend direction

Shared-device play needs static app hosting and local storage, with no game backend. Synchronized play needs signaling and TURN availability even though game actions travel between devices. Future user accounts require a trusted authentication service; account data or cloud history would require additional storage according to the eventual feature scope.

A dedicated self-managed server is optional. Managed services and serverless functions can handle authentication, signaling, and short-lived TURN credential issuance. The app’s authoritative poker engine stays on the host device in either arrangement.

Use Cloudflare Workers/Durable Objects for signaling and trusted endpoints, Cloudflare TURN for relay fallback, and Clerk Hobby for future accounts. Start on the free tiers/allowances. Do not enroll in paid Workers or Clerk plans during initial setup. Room authorization, temporary guest identities, expiration, and metadata retention need design before implementation.

The earlier Supabase recommendation is not selected. Cloudflare requires more custom signaling code, but matches the chosen cost and maintenance direction.

User accounts are planned for a future milestone, not the initial poker implementation. Keep local games usable without login. Accounts do not imply cloud storage of hands or bets; decide cloud features and privacy separately.

## Initial free-tier budget

Pricing checked 8 October 2026. Limits are provider/account quotas, not per-room allowances; recheck before deployment.

- Workers Free: 100,000 dynamic requests per day, subject to CPU and other platform limits.
- Durable Objects Free: use the SQLite storage backend; 100,000 metered requests/day and 13,000 GB-seconds/day of duration. Hibernatable WebSockets avoid charging idle connection time. Additional storage quotas apply.
- Clerk Hobby: up to 50,000 monthly retained users per app. Hobby has feature restrictions, including a fixed seven-day session lifetime.
- Cloudflare TURN: 1,000 GB/month free, then USD 0.05/GB. This is a metered free allowance, not a guarantee of zero charges under unlimited use.

The intended initial platform bill is USD 0 while usage stays within the allowances. Free Workers/Durable Object quotas can reject operations when exhausted. TURN can incur overage charges; use short-lived scoped credentials, app-level rate/usage limits, and monitoring, and verify available provider billing controls before activation. Do not promise a provider-enforced TURN hard spending cap without verifying it.

No services have been provisioned, authentication SDKs installed, or deployments performed by this decision. Inform the user before adding Clerk SDKs, Cloudflare tooling, or other direct packages. Database selection for future account features remains a separate decision.

## References

- [Tailwind’s Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Clerk pricing](https://clerk.com/pricing)
- [Cloudflare TURN pricing](https://www.cloudflare.com/products/turn-sfu/)
- [TURN credential issuance](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
