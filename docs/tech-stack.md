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

## Production implementation dependencies

The following direct packages were announced before installation for the shared-poker, phone-sync, and invitation-sharing updates. Exact installed versions are recorded in `package-lock.json`; `package.json` declares compatible version ranges.

| Packages | Purpose |
| --- | --- |
| `react`, `react-dom`, `vite` | Agreed frontend and build/dev server |
| `tailwindcss`, `@tailwindcss/vite` | Agreed styling and Vite integration |
| `@tanstack/react-router` | Agreed navigation; code-based routes with lazy UI loading |
| `dexie` | Atomic IndexedDB persistence before publishing accepted actions |
| `qrcode.react` | Locally generated SVG invitation QR codes, shared across poker and game tools |
| `jsqr` | Development-only independent decoder to verify rendered invitation QR codes in browser tests |
| `zod` | Saved-state and command validation at trust boundaries |
| `@fontsource/dm-sans`, `@fontsource/nunito` | Locally bundled brand typography, available offline |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | Strict checking and matching platform types |
| `@vitejs/plugin-react` | React compilation and development refresh |
| `vite-plugin-pwa` | Offline shell precaching and prompted updates |
| `vitest` | Pure engine/evaluator rule tests |
| `@playwright/test` | Production-browser integration tests |
| `prettier` | Development-only source formatting |
| `wrangler`, `@cloudflare/workers-types` | Announced phone-sync development tools: local/deployed Worker runtime and platform type checking |

The evaluator is implemented directly in `src/poker/cards.ts`; no poker evaluation library is added. React's native hooks manage UI/store subscriptions; no additional state-management or query library is installed. TypeScript uses strict checking and bundler resolution. Node 22.12+ is required.

The phone-sync tooling adds Cloudflare’s Miniflare/workerd local runtime and its build/native support packages. The `sharp` transitive package is overridden to the patched `^0.35.5` release; the lockfile records this and `npm audit` reports no vulnerabilities. No direct WebRTC, state, or auth library was added. The invitation-sharing update adds `qrcode.react` and development-only `jsqr`; neither adds transitive npm dependencies.

Transitive integrations include Workbox for the service worker, Rolldown/esbuild-related build tooling, and TanStack/Dexie internals. They are recorded by the lockfile rather than independently selected as application libraries.

Still to decide at later milestones: the auth SDK package set, live deployment/origin configuration, and any storage for future account features. Room authorization and temporary metadata retention are documented in [phone sync](phone-sync.md). Advance dependency notice continues to apply.

## Continuous integration tooling

Pull-request validation uses GitHub Actions on standard Ubuntu runners with Node 22. The direct workflow integrations are `actions/checkout` for source checkout, `actions/setup-node` for Node installation and npm caching, and `actions/upload-artifact` for timing reports and failure artifacts. Their announced release versions and immutable commit SHAs are recorded in [the workflow](../.github/workflows/ci.yml). This adds no npm dependency; the existing direct-package list and lockfile remain authoritative.

WebKit CI runners additionally install `avahi-daemon` and `libnss-mdns`, providing mDNS service and name resolution for native WebRTC phone tests. Ubuntu's package manager resolves their system dependencies; these packages do not enter the application bundle or npm lockfile.

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

Phone-sync implementation now includes the Worker configuration and native transport; see [configuration and validation](phone-sync.md). No live services have been provisioned, authentication SDKs installed, or deployments performed. Inform the user before adding Clerk SDKs, Cloudflare tooling, or other direct packages. Database selection for future account features remains a separate decision.

## References

- [Tailwind’s Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Clerk pricing](https://clerk.com/pricing)
- [Cloudflare TURN pricing](https://www.cloudflare.com/products/turn-sfu/)
- [TURN credential issuance](https://developers.cloudflare.com/realtime/turn/generate-credentials/)
