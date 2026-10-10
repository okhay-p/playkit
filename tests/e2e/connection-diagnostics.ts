import type { Page, TestInfo } from "@playwright/test";

type Observation = { at: number; page: number; event: string; detail: unknown };
const observations = new WeakMap<TestInfo, Observation[]>();
export async function observeConnections(page: Page, info: TestInfo) {
  const log = observations.get(info) ?? [];
  observations.set(info, log);
  const pageId = log.filter((item) => item.event === "page").length;
  const record = (event: string, detail: unknown) =>
    log.push({ at: Date.now(), page: pageId, event, detail });
  record("page", null);
  page.on("domcontentloaded", () => record("navigation", null));
  page.on("console", (message) => {
    if (message.text().startsWith("playkit-rtc:"))
      record("rtc", JSON.parse(message.text().slice("playkit-rtc:".length)));
  });
  page.on("websocket", (socket) => {
    record("socket-open", null);
    socket.on("close", () => record("socket-close", null));
    const frame =
      (event: string) =>
      ({ payload }: { payload: string | Buffer }) => {
        try {
          const data = JSON.parse(payload.toString());
          // Keep protocol ordering and state, excluding credentials, invitations,
          // SDP bodies, IP addresses, and application messages.
          record(event, {
            type: data.type,
            role: data.role,
            description: data.description?.type,
            candidate: !!data.candidate,
          });
        } catch {
          /* Non-JSON frames aren't part of the signaling protocol. */
        }
      };
    socket.on("framesent", frame("framesent"));
    socket.on("framereceived", frame("framereceived"));
  });
  await page.addInitScript(() => {
    let next = 0;
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = new Proxy(Native, {
      construct(target, args) {
        const pc = Reflect.construct(target, args) as RTCPeerConnection;
        const id = next++;
        const observeChannel = (channel: RTCDataChannel, source: string) => {
          const reportChannel = (event: string) =>
            console.debug(
              "playkit-rtc:" +
                JSON.stringify({
                  id,
                  source,
                  event,
                  channel: channel.readyState,
                }),
            );
          reportChannel("channel-created");
          for (const event of ["open", "close", "error"])
            channel.addEventListener(event, () => reportChannel(event));
          channel.addEventListener("message", (event) => {
            let type: string | undefined;
            try {
              const chunk = JSON.parse(event.data);
              if (chunk.type === "chunk" && chunk.count === 1)
                type = JSON.parse(chunk.text).type;
            } catch {
              /* Record state even for a multipart or non-JSON message. */
            }
            console.debug(
              "playkit-rtc:" +
                JSON.stringify({
                  id,
                  source,
                  event: "message",
                  channel: channel.readyState,
                  type,
                }),
            );
          });
        };
        const createChannel = pc.createDataChannel.bind(pc);
        pc.createDataChannel = (...args) => {
          const channel = createChannel(...args);
          observeChannel(channel, "local");
          return channel;
        };
        pc.addEventListener("datachannel", (event) =>
          observeChannel(event.channel, "remote"),
        );
        const report = (event: string) =>
          console.debug(
            "playkit-rtc:" +
              JSON.stringify({
                id,
                event,
                connection: pc.connectionState,
                ice: pc.iceConnectionState,
                gathering: pc.iceGatheringState,
                signaling: pc.signalingState,
              }),
          );
        report("created");
        for (const event of [
          "connectionstatechange",
          "iceconnectionstatechange",
          "icegatheringstatechange",
          "signalingstatechange",
        ])
          pc.addEventListener(event, () => report(event));
        return pc;
      },
    });
  });
}
export async function attachConnections(info: TestInfo) {
  if (info.status !== info.expectedStatus)
    await info.attach("connection-diagnostics", {
      body: JSON.stringify(observations.get(info) ?? [], null, 2),
      contentType: "application/json",
    });
  observations.delete(info);
}
