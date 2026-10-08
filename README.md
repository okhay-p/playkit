# PlayKit

Tools for real-world play: a webapp that helps people play physical games together, with a shared device as the default.

The first implementation milestone provides **shared-device no-limit Texas Hold’em**: setup for 2–10 seats, betting and turn enforcement, explicit physical dealing, showdown entry and mucking, side-pot payout previews, settlement, undo/history, rebuys, cashouts, and local recovery. Its interface follows [A — Table Club](docs/ui-direction.md).

Optional **phone synchronization** now adds native WebRTC, host-approved seats, shared table/history, restricted player controls, idempotent actions, and recovery after host/client reload. The Cloudflare signaling Worker and TURN credential endpoint run locally; live services are not provisioned or deployed. See [phone-sync setup](docs/phone-sync.md). The chess clock and future Clerk accounts remain later milestones. Shared-device poker needs no backend or account.

## Run locally

Use Node.js **22.12 or newer**.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The dev server binds all interfaces, so a device on your Tailscale network can also use `http://<this-machine-tailscale-ip>:5173`. Plain HTTP on an IP cannot install an offline service worker; use localhost or HTTPS for offline verification.

## Production and offline verification

```sh
npm run build
npm run preview
```

The production preview uses `http://localhost:4173`. After the first successful load and the “Offline ready” indicator, cached single-device play continues without internet, including a reload and explicit resume. Fonts are bundled locally. App updates are prompted and only accepted between hands.

The static `dist/` output can be hosted over HTTPS. Configure any host to serve `index.html` for app navigation routes. No deployment or Cloudflare account setup has been performed yet.

## Checks

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

The browser suite starts and stops its own production preview and local signaling servers. Its sync flows use real WebRTC data channels between isolated host/phone browser contexts, including complete hand settlement/correction and recovery/revocation/closure. It covers desktop and touch phone Chromium, Firefox, and WebKit contexts. Actual Safari/iOS, Zen profiles, and physical-device usability are still release validation tasks. Headless WebKit runs with one worker to avoid software-renderer contention; its full two-hand walkthrough can take several minutes.

## Implementation references

- [Implementation spec and milestones](docs/implementation-spec.md)
- [Stack decisions and direct dependencies](docs/tech-stack.md)
- [Poker rules, state, persistence, and validation](docs/poker-engine.md)
- [Selected UI direction](docs/ui-direction.md)

The throwaway comparison prototypes remain on [`prototype/ui-variants`](https://github.com/okhay-p/playkit/tree/prototype/ui-variants).

Game state and history stay in IndexedDB on this browser/device. No telemetry or third-party font requests are included. Ending the table deletes its local game record; changing origin or browser profile opens separate storage.
