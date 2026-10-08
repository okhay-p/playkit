# PlayKit

**Tools for real-world play.** PlayKit helps people play physical games together by tracking bets, turns, and time. Cards and chessboards stay on the table; one shared device is enough to get started.

## What you can do

- **Poker:** run a 2–10 player no-limit Texas Hold’em cash game. Track betting turns, blinds, folds, raises, and all-ins; enter physical cards at showdown; preview side-pot payouts and settle the hand. Includes mucking, undo/history, rebuys, cashouts, and saved-game recovery.
- **Chess clock:** configure each player's time, choose who starts, and add a Fischer increment after moves. Tap the active clock to switch turns, pause/resume, or reset with confirmation. Reloading or hiding the app pauses play.
- **Optional poker phones:** invite players to join the shared table through native WebRTC. The host approves seats and remains responsible for dealing, showdown, corrections, and settlement. Players can act for their own approved seats.

Shared-device games work without accounts or a backend. After the production app is cached, they also work offline. Phone joining needs internet, Cloudflare signaling, and TURN fallback. Synchronized chess clocks and user accounts are outside the current version.

## Quick start

Requires **Node.js 22.12 or newer** and npm.

```sh
git clone https://github.com/okhay-p/playkit.git
cd playkit
npm ci
npm run dev
```

Open **http://localhost:5173**. Choose poker or the chess clock from the toolkit. No environment variables are needed for shared-device play.

The dev server listens on all interfaces. To try it on another device, use your machine's reachable IP address; plain HTTP on an IP does not support offline service-worker installation. Use localhost or HTTPS to verify offline behavior.

### Enable local phone joining

Run the signaling Worker and frontend in separate terminals:

```sh
# Terminal 1
npm run dev:signaling

# Terminal 2
VITE_SIGNALING_URL=http://localhost:8787 npm run dev
```

Open **Phones** on a poker table, enable joining, share the invitation, and approve requested seats. Use separate browser profiles or devices to simulate different players. For another device, use a signaling URL it can reach and allow the frontend's exact origin in the development Worker configuration. Local signaling has no external TURN service; see [phone-sync setup](docs/phone-sync.md) for network requirements and production configuration.

## Build and test

```sh
npm run build
npm run preview
```

Open **http://localhost:4173** for the production preview. Wait for **Offline ready**, then disconnect and reload to try local recovery. Fonts and app assets are bundled. App updates wait until poker is between hands and the chess clock is paused.

```sh
npm run check
npm run format:check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`check` runs frontend/Worker type checks and unit tests. The browser suite starts its own production preview and local signaling server, so ports **4173** and **8787** must be free. It exercises poker, chess, offline recovery, and real WebRTC data channels in desktop/touch Chromium, Firefox, and WebKit. Headless WebKit runs can take several minutes. Live TURN connectivity and physical-device usability still need release validation.

## Explore the code

The frontend uses **React, Vite, Tailwind CSS, and TanStack Router**. Pure game engines are separate from React, storage, and networking. IndexedDB persistence uses Dexie; Zod validates saved state and transport messages.

| Location                       | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| [`src/app.tsx`](src/app.tsx)   | Routes, app shell, and PWA update handling                     |
| [`src/ui/`](src/ui/)           | Poker setup/table/showdown, joining, and chess screens         |
| [`src/poker/`](src/poker/)     | Poker rules, hand evaluation, settlement, and engine tests     |
| [`src/chess/`](src/chess/)     | Monotonic clock engine, persistence, and timing tests          |
| [`src/storage/`](src/storage/) | Authoritative local poker session storage                      |
| [`src/sync/`](src/sync/)       | Native WebRTC transport, permissions, protocol, and recovery   |
| [`worker/`](worker/)           | Cloudflare signaling and TURN credential issuance              |
| [`tests/e2e/`](tests/e2e/)     | Browser integration tests                                      |
| [`docs/`](docs/)               | Product rules, architecture decisions, and deployment guidance |

The poker host saves accepted commands before publishing updates. Joined phones receive committed snapshots and cannot perform host-only operations. The chess clock calculates elapsed time from a monotonic reference and always recovers paused.

## Deployment

The shared-device app is hosted at **https://playkit.oakkarphyo.com** on Cloudflare Pages, with **https://playkit-677.pages.dev** as its Pages address. Pushes to `main` build and deploy automatically. Optional poker joining adds a separate Cloudflare Worker with SQLite Durable Objects and TURN credentials.

Follow the [deployment guide](docs/deployment.md) for Pages builds, the custom subdomain, origin configuration, secrets, free-tier costs, release checks, and rollback. Shared-device play can be deployed first without provisioning the signaling backend.

## Data and privacy

Games are saved in IndexedDB in the current browser profile and origin. There is no account-based backup or telemetry, and fonts do not make third-party requests. Ending a poker table deletes its local game record. Changing browser profiles, clearing browser data, or moving to a different domain opens separate storage.

Approved poker phones receive table state over encrypted WebRTC connections. The signaling service retains short-lived connection metadata, not cards or betting history. Service operators still observe network metadata. Keep TURN API credentials in Worker secrets; `VITE_*` values are public build configuration. See [phone-sync security and recovery](docs/phone-sync.md).

## Further reading and contributing

- [Implementation spec and acceptance criteria](docs/implementation-spec.md)
- [Tech stack and direct dependency decisions](docs/tech-stack.md)
- [Poker engine and persistence](docs/poker-engine.md)
- [Chess clock behavior and recovery](docs/chess-clock.md)
- [UI direction and original prototypes](docs/ui-direction.md)

Keep rule changes in the pure engines and validate them with meaningful fixtures. For UI or synchronization changes, run the relevant browser flows. Follow [AGENTS.md](AGENTS.md) before adding or replacing a direct dependency, and commit the npm lockfile with dependency changes.

Earlier throwaway UI comparisons are preserved on [`prototype/ui-variants`](https://github.com/okhay-p/playkit/tree/prototype/ui-variants).
