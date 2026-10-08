import { expect, test } from "@playwright/test";
const endpoint = "http://127.0.0.1:8787";
const origin = { Origin: "http://127.0.0.1:4173" };
test("signaling requires an allowed origin, invitation, and host closure credential", async ({
  request,
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Worker HTTP checks are independent of browser engine.",
  );
  expect((await request.post(`${endpoint}/rooms`)).status()).toBe(403);
  expect(
    (
      await request.post(`${endpoint}/rooms`, {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  const response = await request.post(`${endpoint}/rooms`, { headers: origin });
  expect(response.ok()).toBe(true);
  const credentials = await response.json();
  expect(credentials.room).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(credentials.invitation).not.toBe(credentials.hostSecret);
  const room = `${endpoint}/rooms/${credentials.room}`;
  expect(
    (await request.post(`${room}/ice`, { headers: origin })).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`${room}/ice`, {
        headers: { ...origin, Authorization: `Bearer ${"x".repeat(43)}` },
      })
    ).status(),
  ).toBe(401);
  const ice = await request.post(`${room}/ice`, {
    headers: { ...origin, Authorization: `Bearer ${credentials.invitation}` },
  });
  expect(ice.ok()).toBe(true);
  expect(await ice.json()).toEqual({ iceServers: [] });
  await page.goto("/");
  const auth = await page.evaluate(async ({ room, invitation, hostSecret }) => {
    const sockets: WebSocket[] = [];
    const open = (
      role: "host" | "guest",
      peer: string,
      secret: string,
      credential?: string,
    ) =>
      new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:8787/rooms/${room}`);
        sockets.push(ws);
        ws.onopen = () =>
          ws.send(
            JSON.stringify({ type: "auth", role, peer, secret, credential }),
          );
        ws.onmessage = (event) => {
          if (JSON.parse(event.data).type === "ready") resolve(0);
        };
        ws.onclose = (event) => resolve(event.code);
        ws.onerror = () => reject(new Error("WebSocket failed."));
      });
    try {
      const wrongHost = await open("host", "badhost-1234567890", invitation);
      const host = await open("host", "host-1234567890123", hostSecret);
      const guest = await open(
        "guest",
        "guest-123456789012",
        invitation,
        "a".repeat(43),
      );
      const impersonatedGuest = await open(
        "guest",
        "guest-123456789012",
        invitation,
        "b".repeat(43),
      );
      const impersonatedHost = await open(
        "guest",
        "host-1234567890123",
        invitation,
        "c".repeat(43),
      );
      return {
        wrongHost,
        host,
        guest,
        impersonatedGuest,
        impersonatedHost,
        hostStillOpen: sockets[1].readyState === WebSocket.OPEN,
        guestStillOpen: sockets[2].readyState === WebSocket.OPEN,
      };
    } finally {
      sockets.forEach((ws) => ws.close());
    }
  }, credentials);
  expect(auth).toEqual({
    wrongHost: 1008,
    host: 0,
    guest: 0,
    impersonatedGuest: 1008,
    impersonatedHost: 1008,
    hostStillOpen: true,
    guestStillOpen: true,
  });
  expect(
    (
      await request.delete(room, {
        headers: {
          ...origin,
          Authorization: `Bearer ${credentials.invitation}`,
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.delete(room, {
        headers: {
          ...origin,
          Authorization: `Bearer ${credentials.hostSecret}`,
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${room}/ice`, {
        headers: {
          ...origin,
          Authorization: `Bearer ${credentials.invitation}`,
        },
      })
    ).status(),
  ).toBe(410);
});
