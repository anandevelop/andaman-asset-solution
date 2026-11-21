/**
 * e2e/mcp-oauth.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Adding the site as a connector that signs in: discovery, registration,
 * the consent screen behind the administrator's sign-in, the code exchange
 * with PKCE, a tool call with the issued token, rotation of the refresh
 * token, and the connection ending — for the client and in the back office.
 * ─────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import { expect, test } from "./harness";
import { BOT } from "./fixtures";
import { signIn } from "./sign-in";

test.setTimeout(240_000);

const b64 = (bytes: Buffer) => bytes.toString("base64url");

test("an application connects by signing in, and is cut off when the connection ends", async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL!).origin;

  // Discovery, starting where a connector starts: a 401 that says where to look.
  const challenge = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(challenge.status()).toBe(401);
  expect(challenge.headers()["www-authenticate"]).toContain("/.well-known/oauth-protected-resource");

  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
    const resource = await request.get(path);
    expect(resource.status(), path).toBe(200);
    expect((await resource.json()).authorization_servers).toEqual([origin]);
  }
  const server = await (await request.get("/.well-known/oauth-authorization-server")).json();
  expect(server).toMatchObject({ issuer: origin, code_challenge_methods_supported: ["S256"] });

  // Registration. A loopback redirect stands in for the application's own.
  const redirectUri = `${origin}/api/health`;
  expect((await request.post("/api/oauth/register", { data: { client_name: "Bad", redirect_uris: ["http://evil.example/cb"] } })).status()).toBe(400);
  const registered = await request.post("/api/oauth/register", { data: { client_name: "E2E Connector", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" } });
  expect(registered.status()).toBe(201);
  const clientId = (await registered.json()).client_id as string;

  const verifier = b64(crypto.randomBytes(32));
  const challengeValue = b64(crypto.createHash("sha256").update(verifier).digest());
  const authorizeUrl = (extra: Record<string, string> = {}) =>
    `/api/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challengeValue,
      code_challenge_method: "S256",
      state: "state-123",
      resource: `${origin}/api/mcp`,
      ...extra,
    })}`;

  // A redirect address the client never registered is refused here, on our
  // own page — the browser is not sent anywhere.
  const tampered = await request.get(authorizeUrl({ redirect_uri: "https://evil.example/cb" }), { maxRedirects: 0 });
  expect(tampered.status()).toBe(400);
  expect((await request.get(authorizeUrl({ code_challenge_method: "plain" }), { maxRedirects: 0 })).status()).toBe(400);

  // The consent screen is behind the administrator's sign-in.
  await page.goto("/en/login");
  await signIn(page);
  await page.goto(authorizeUrl());
  const consent = page.getByTestId("mcp-consent");
  await expect(consent).toContainText("Connect E2E Connector?");
  await expect(consent).toContainText(new URL(redirectUri).host);
  await consent.getByLabel("Bot account").selectOption({ label: BOT.name });
  await consent.getByLabel("Access").selectOption("write");
  await consent.getByRole("button", { name: "Allow" }).click();

  await page.waitForURL(/\/api\/health\?.*code=/);
  const back = new URL(page.url());
  expect(back.searchParams.get("state")).toBe("state-123");
  expect(back.searchParams.get("iss")).toBe(origin);
  const code = back.searchParams.get("code")!;

  // Answered once: the same request cannot be approved again.
  await page.goBack();
  const token = (form: Record<string, string>) => request.post("/api/oauth/token", { form });

  // The wrong verifier gets nothing — and spends the code.
  const stolen = await token({ grant_type: "authorization_code", code, code_verifier: b64(crypto.randomBytes(32)), client_id: clientId, redirect_uri: redirectUri });
  expect(stolen.status()).toBe(400);
  expect((await stolen.json()).error).toBe("invalid_grant");
  const afterTheft = await token({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri });
  expect(afterTheft.status()).toBe(400);

  // So: sign in again, properly this time.
  await page.goto(authorizeUrl({ state: "state-456" }));
  await page.getByTestId("mcp-consent").getByLabel("Bot account").selectOption({ label: BOT.name });
  await page.getByTestId("mcp-consent").getByLabel("Access").selectOption("write");
  await page.getByTestId("mcp-consent").getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/\/api\/health\?.*state=state-456/);
  const code2 = new URL(page.url()).searchParams.get("code")!;

  const issued = await token({ grant_type: "authorization_code", code: code2, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri, resource: `${origin}/api/mcp` });
  expect(issued.status()).toBe(200);
  const tokens = await issued.json();
  expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "write" });

  const call = (accessToken: string, name: string) =>
    request.post("/api/mcp", {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } },
    });
  const who = await call(tokens.access_token, "whoami");
  expect(who.status()).toBe(200);
  expect((await who.json()).result.structuredContent).toMatchObject({ role: "BOT", scope: "write", key: "E2E Connector" });

  // The back office shows the connection, not a pile of hourly keys.
  await page.goto("/en/admin/settings/integrations");
  const connections = page.getByTestId("mcp-connections");
  await expect(connections).toContainText("E2E Connector");
  await expect(connections).toContainText(BOT.name);

  // Its access can be changed there, and the token it already holds changes with it.
  const access = connections.getByLabel("Access: E2E Connector");
  await expect(access).toHaveValue("write");
  await access.selectOption("read");
  await expect.poll(async () => (await (await call(tokens.access_token, "whoami")).json()).result.structuredContent.scope).toBe("read");
  await page.getByTestId("mcp-connections").getByLabel("Access: E2E Connector").selectOption("write");
  await expect.poll(async () => (await (await call(tokens.access_token, "whoami")).json()).result.structuredContent.scope).toBe("write");
  // "Last used" follows use, not only sign-in.
  await page.reload();
  await expect(page.getByTestId("mcp-connections")).toContainText("last used");

  // Refresh: a new pair, and the old refresh token is spent.
  const refreshed = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(refreshed.status()).toBe(200);
  const next = await refreshed.json();
  expect(next.refresh_token).not.toBe(tokens.refresh_token);
  expect((await call(next.access_token, "whoami")).status()).toBe(200);

  // Replaying the spent refresh token means it was copied: everything ends.
  const replay = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(replay.status()).toBe(400);
  expect((await call(next.access_token, "whoami")).status()).toBe(401);
  expect((await token({ grant_type: "refresh_token", refresh_token: next.refresh_token, client_id: clientId })).status()).toBe(400);
  await page.reload();
  await expect(page.getByTestId("mcp-connections")).not.toContainText("E2E Connector");
});
