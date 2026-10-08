# Deployment note

The intended production origin is **https://playkit.oakkarphyo.com**. The shared-device frontend is deployed at **https://playkit-677.pages.dev**. Its custom domain has a proxied CNAME configured, and HTTPS checks succeed. Shared poker and the shared chess clock can launch as a static HTTPS site without a backend or accounts. Optional poker phone joining uses the signaling Worker, SQLite Durable Objects, and free Cloudflare STUN. Direct connections may fail on restrictive networks; metered TURN remains disabled. Clerk accounts are still a future feature; no auth setup or SDK is required now.

## Current deployment

- Pages project: `playkit`, connected to `okhay-p/playkit` on GitHub.
- Production branch: `main`; automatic production builds are enabled. Preview builds are disabled initially.
- Build: `npm run build`, output `dist`, Node version `22`.
- First production deployment succeeded on 2026-10-08 UTC. The HTTPS homepage and `/chess` return successfully; the browser loads the toolkit and shows **Offline ready**.
- Custom domain: `playkit.oakkarphyo.com` has the proxied CNAME `playkit` → `playkit-677.pages.dev`. Public DNS resolves and HTTPS checks return 200 for `/`, `/poker`, `/chess`, and `/join`. Pages reports the domain, DNS verification, and HTTPS validation all active. A local resolver may temporarily cache the earlier missing record.
- Production signaling: `https://playkit-signaling-production.oakkarphyo7.workers.dev`, configured as the Pages production `VITE_SIGNALING_URL`. SQLite Durable Objects and `ICE_MODE=stun` are deployed. No TURN relay is enabled.
- No paid plan upgrade or TURN enrollment has been performed.

Cloudflare's official agent setup installed its skills globally under `~/.agents/skills/` and registered the `cloudflare` MCP server in `~/.codex/config.toml`. Wrangler OAuth is authenticated. MCP OAuth is authenticated with Pages read/write, DNS read/write, and zone read access; its tools were used to create the subdomain CNAME. Those user-level credentials/configuration are outside the Git repository.

## 1. Prepare a release

Use Node.js 22.12 or newer and the committed lockfile:

```sh
npm ci
npm run check
npm run format:check
npx playwright install chromium firefox webkit
npm run test:e2e
```

The tests run local signaling; they do not deploy services or consume paid TURN traffic. For a frontend-only release, leave `VITE_SIGNALING_URL` unset. Phone joining will be unavailable, while local games work normally.

## 2. Publish the frontend on Cloudflare Pages

Recommended: create a **Pages project with Git integration** in the Cloudflare dashboard, connect `okhay-p/playkit`, and select:

| Setting           | Value                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| Production branch | `main`                                                                         |
| Root directory    | Repository root                                                                |
| Build command     | `npm run build`                                                                |
| Build output      | `dist`                                                                         |
| Build environment | Set `NODE_VERSION` to an available, current Node 22.12+ version                |
| Signaling URL     | Omit initially; later set `VITE_SIGNALING_URL=https://YOUR-WORKER.workers.dev` |

Use the assigned `https://YOUR-PROJECT.pages.dev` URL to check the initial build, then attach the production subdomain before creating games you want to keep. No Pages Functions are needed. Cloudflare Pages provides SPA fallback when there is no top-level `404.html`; this repo intentionally has none. Verify direct navigation and reload on `/poker`, `/chess`, and `/join`. See [React deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/) and [SPA routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).

For manual uploads instead of Git integration, use the already-installed Wrangler:

```sh
npx wrangler login
npx wrangler pages project create YOUR-PROJECT --production-branch main
npm run build
npx wrangler pages deploy dist --project-name YOUR-PROJECT --branch main
```

Choose Git integration or Direct Upload when creating the project; a Direct Upload project cannot later switch to Git integration. Git integration is preferable for this public repository. See [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

## 3. Attach playkit.oakkarphyo.com

1. In the Pages project, open **Custom domains → Set up a domain** and enter `playkit.oakkarphyo.com`. Associate it with Pages before adding a DNS record.
2. If `oakkarphyo.com` already uses Cloudflare DNS in this account, confirm the proposed CNAME record. Otherwise, keep your current DNS provider and add this record there:

| Type  | Name      | Target                   |
| ----- | --------- | ------------------------ |
| CNAME | `playkit` | `YOUR-PROJECT.pages.dev` |

Use the actual Pages hostname; do not include `https://` or a path in the DNS target. A subdomain does not require moving the apex domain's nameservers to Cloudflare. Leave the apex website and mail records as they are. Check for an existing record at `playkit` before replacing it.

3. Wait for the custom domain and HTTPS certificate to become active. Check `https://playkit.oakkarphyo.com`, including direct reloads of `/poker`, `/chess`, and `/join`. Configure any optional Pages-to-custom-domain redirect after activation.
4. Use the custom domain consistently for play and invitation links. The app creates invitations from the current origin; games made on `pages.dev` do not migrate to the custom domain.

These are the [Cloudflare Pages custom-domain steps](https://developers.cloudflare.com/pages/configuration/custom-domains/). The project and Pages domain registration already exist; the CNAME is configured and HTTPS checks succeed. Do not create a second project to finish the domain setup.

## 4. Enable optional poker phone joining

The current free-only deployment uses STUN and direct WebRTC. The TURN steps below are an optional future relay upgrade; do not perform them under the free-only constraint. Use `https://playkit.oakkarphyo.com` as the frontend origin, then:

1. In `wrangler.jsonc`, verify `env.production.vars.ALLOWED_ORIGINS` is `https://playkit.oakkarphyo.com`, as configured in the repository. Additional stable custom origins can be comma-separated. Do not allow arbitrary preview origins or use a wildcard. Keep `ALLOW_LOCAL_ICE` set to `false`.
2. Log in with `npx wrangler login`. Keep the Workers Free plan and use the configured SQLite Durable Object migration. No database containing game state is needed on Cloudflare.
3. Create a Cloudflare Realtime TURN key. Keep its privileged credentials only in Worker secrets:

```sh
npx wrangler secret put TURN_KEY_ID --env production
npx wrangler secret put TURN_API_TOKEN --env production
npm run deploy:signaling
```

If Wrangler requires the Worker to exist before adding secrets, deploy it first; joining remains unavailable until TURN secrets are configured. Never put these secrets in `VITE_*`, Git, Pages build variables, screenshots, or frontend code.

4. Copy the **production** Worker HTTPS URL printed by Wrangler. Add it as the Pages production build variable `VITE_SIGNALING_URL`, then rebuild/deploy the frontend. This variable is public and compiled into the bundle. Changing it requires a new build.
5. Leave `VITE_ICE_TRANSPORT_POLICY` unset for normal direct connections with TURN fallback. For a dedicated relay acceptance build, set it to `relay`, rebuild, verify relay connectivity, then remove it and rebuild for normal release.

The production Worker refuses unconfigured origins. In STUN mode it returns only the free public STUN server; TURN mode fails issuance when credentials are missing. A successful static deployment does not mean joining is ready. See [phone-sync configuration and recovery](phone-sync.md) for protocol, expiration, and limits.

## Free tier and costs

Start on Cloudflare Pages Free and Workers Free with SQLite Durable Objects. Static Pages requests are free; the Free plan currently includes 500 builds/month. Workers Free currently includes 100,000 requests/day; Durable Objects have separate request, duration, and storage allowances and reject operations after relevant free limits are exhausted. Refer to [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) before enabling services.

Cloudflare Realtime TURN currently includes 1,000 GB/month shared with SFU usage, then costs $0.05/GB of egress. This allowance is not a guaranteed hard spending cap. Check the account's activation/payment requirements, usage, and billing controls before opening invitations publicly. Keep Workers on Free; do not upgrade or enroll paid services just to follow this note. [TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/) and [Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) were checked on 2026-10-09.

The app limits rooms, peers, signaling messages, credential issuance, and invitation lifetimes, but these limits do not enforce a byte-based TURN spending ceiling. Game snapshots stay on players' devices; signaling metadata expires after 12 hours. No always-on dedicated server is required.

## Release checks

- On the deployed HTTPS origin, create a poker table, play through showdown/settlement, reload, and explicitly resume. Wait for **Offline ready**, disconnect, and repeat a reload.
- Open the chess clock, configure separate times/increment, switch turns, pause, reset, and reload. Recovery must be paused. Background the app on a real phone/tablet and confirm play pauses and wake lock behaves acceptably.
- Before offering joining, test a host plus two physical phones on mixed Wi-Fi/mobile data; repeat with relay forced and inspect WebRTC connection statistics for relay candidates. Verify all ten seats, host reload, phone sleep/rejoin, revocation, and room expiry. These checks remain pending; local automated browser tests cannot establish real-network TURN behavior.
- Confirm direct route reloads work and an update is offered only safely: poker between hands/settled, chess paused. Disable optional analytics/font integrations so the deployed behavior matches local privacy expectations.

## Updates, recovery, and rollback

Keep the production origin stable: IndexedDB and service-worker caches belong to an origin and browser profile. Moving from `pages.dev` to a custom domain opens separate storage and does not migrate games. Clearing browser data also removes games. The server cannot recover a lost host game.

Git integration builds `main` on pushes. Review build output and run the release checks after changes. Pages can roll back to a previous production deployment in its dashboard; users with a cached PWA may see the old app until they accept its update. Rollback does not revert IndexedDB data or schema migrations. Preserve storage compatibility before deploying or reverting versions. See [Pages rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/).

For a Worker rollback, deploy a known-good commit with `npm run deploy:signaling`; retain existing Durable Object namespaces/migrations. Never delete the namespace to repair a frontend problem. Allowlist changes do not evict already-connected peers; to stop new joining, remove the frontend signaling variable and redeploy, or restrict the Worker origin allowlist. Close active rooms from their hosts when possible.
