# Poker phone synchronization

Implementation uses native WebRTC reliable ordered data channels, an authoritative browser host, and a Cloudflare Worker with SQLite-backed Durable Objects for signaling. Local browser integration checks run against the actual Worker runtime. Live infrastructure has not been provisioned or deployed; real-device, mixed-network, TURN relay, and ten-phone validation remain release gates.

## Local setup

Run two terminals:

```sh
npm run dev:signaling
VITE_SIGNALING_URL=http://localhost:8787 npm run dev
```

Open `http://localhost:5173`, create a table, open **Phones**, and enable joining. Share the invitation with a separate browser profile/device, choose a seat, and approve it on the host. Separate tabs in the same browser profile share the local host database and cannot simulate separate devices; use separate profiles or private windows.

For Tailscale, set `VITE_SIGNALING_URL=http://<host-tailscale-ip>:8787`, add the exact frontend origin `http://<host-tailscale-ip>:5173` to `ALLOWED_ORIGINS` in the development Wrangler configuration, and open that frontend address on both devices. Development binds all interfaces. Local ICE returns no external servers: direct candidates can work on the same machine/network, but this is not the supported mixed-network production configuration. HTTP IP previews lack service workers, clipboard permissions, and wake lock on some browsers; the selectable invitation input still works.

## Cloudflare configuration and deployment

Use Workers Free and SQLite Durable Objects. Do not upgrade to a paid plan. Production configuration allows `https://playkit.oakkarphyo.com` and refuses joining without TURN credentials.

1. Log in with `npx wrangler login` in your own terminal and select your Cloudflare account.
2. Verify `env.production.vars.ALLOWED_ORIGINS` in `wrangler.jsonc` matches the production frontend: `https://playkit.oakkarphyo.com`. Additional stable origins can be separated by commas without spaces. Leave `ALLOW_LOCAL_ICE` set to `false`.
3. Create a TURN key in Cloudflare Realtime. Set the key ID and its privileged API token as Worker secrets using `npx wrangler secret put TURN_KEY_ID --env production` and `npx wrangler secret put TURN_API_TOKEN --env production`. Do not put them in `VITE_*` variables, source files, or the static frontend.
4. Run `npm run deploy:signaling`. The production environment has its own SQLite Durable Object binding/migration. Set `VITE_SIGNALING_URL=https://<production-worker-url>` when building the static frontend.
5. Host `dist/` over HTTPS with SPA fallback to `index.html`, including `/join`. No authentication or account is required to play locally. Clerk integration remains a future milestone.
6. Test a host plus two physical phones across Wi-Fi/mobile data, then ten approved seats. Repeat with `VITE_ICE_TRANSPORT_POLICY=relay` to force TURN and verify that connection statistics report relay candidates. Exercise sleep, backgrounding, host reload, rejoin, and expiration before releasing phone joining.

Local Worker state is ignored under `.wrangler/`. E2E tests reset only their isolated `.wrangler/e2e` directory at startup. They do not contact Cloudflare or issue billable TURN credentials.

## Joining and authority

Room IDs, host credentials, and invitations each have 256 random bits. An invitation lives in the URL fragment, rather than the path/query, so the frontend web host and Referer do not receive it. The joining page removes the fragment after saving its scoped credentials locally. The signaling service receives the invitation over an authenticated WebSocket handshake and stores its SHA-256 digest. Host credentials are separate and never shared in invitations.

Guest device identities have independent random credentials. Signaling retains their credential digests to prevent another invite holder from replacing a device socket by copying its public ID. A phone sends its name and requested seat to the host over the encrypted data channel. Until host approval it receives only the seat roster. Approval persists the device/credential/seat binding on the host before sending a snapshot. Rejoining must present the same credential; names and supplied seat IDs do not authorize actions. The host can revoke a binding and approve a replacement.

The host can still operate every player’s controls. Phones can submit only betting actions for their bound seat. Dealing, cards, mucking, payouts, seat management, and correction remain host operations. The host checks protocol version, table identity, peer-scoped command ID, permissions, expected revision, and engine legality. Concurrent commands can commit only once at a revision.

Every accepted action is atomically saved to the existing IndexedDB session before publication and broadcast. The original command IDs survive host reload. Client submissions persist their original IDs before sending; uncertain submissions resend only those IDs after authoritative reconciliation. They never create speculative offline bets. Updates carry full validated snapshots at monotonically increasing revisions, so gaps recover without replaying an incomplete event stream. Host-only undo snapshots and deduplication records are omitted from phone copies; approved phones see the table and public history.

## Recovery and limits

The host restores its game, room credentials, and seat bindings after reload. Its game stays paused until explicit **Resume game**. Phones preserve their last-known display, freeze submissions when disconnected/offline, and automatically retry signaling with bounded backoff. The **Reconnect to host** control starts fresh negotiation. A successful signaling connection alone does not enable actions: a validated authoritative snapshot does.

A removed/revoked seat needs approval again. Closing joining clears connected phone copies and their credentials while preserving the shared host game. Ending the table closes joining too. Disconnected copies cannot be remotely erased; invitations expire and a reconnect then clears the expired joined copy. Room expiry does not erase the locally saved host game.

Rooms expire after 12 hours. Cloudflare alarms remove room metadata and close sockets. Hibernatable sockets keep only authenticated routing attachments; metadata contains credential digests, device IDs, counts, and expiration, with no game state, cards, bets, or player names. Idle signaling does not require a continuously running application server.

Abuse bounds: 10 room creations per IP/hour; 20 total signaling sockets and 10 authenticated guest sockets per room; 40 distinct guest identities over the room lifetime; authentication within 10 seconds; 150 signaling messages/minute/socket, each at most 40,000 characters; 240 TURN credential issuances per room. TURN credentials expire in one hour and active transports refresh them after 40 minutes. Peer application messages are schema-validated, limited to 120 messages/minute/peer and 8.4 million characters per assembled snapshot, and chunked with data-channel backpressure. There is no automatic host election.

These limits reduce abuse; they do not guarantee a zero bill or impose a byte-level TURN spending cap. Configure usage monitoring and verify provider billing controls before enabling public TURN. Privileged credentials and app payloads are not logged by application code; Worker observability is disabled in the checked-in configuration. Cloudflare can still observe service/network metadata, and approved peers can inspect the public state sent to them.

## References

- [Cloudflare hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/): socket acceptance and attachments survive hibernation.
- [Cloudflare TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/): server-side issuance, expiration, and refresh with `setConfiguration`.
- [WebRTC data channels](https://webrtc.org/getting-started/data-channels): native encrypted peer transport.
