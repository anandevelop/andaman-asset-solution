/**
 * tests/mcp-oauth.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The parts of the OAuth server that are decisions rather than storage:
 * which redirect addresses a client may use, and what a scope string means.
 * The flow itself runs against a real database in e2e/mcp-oauth.spec.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { authorizationServerMetadata, bearerChallenge, isAllowedRedirectUri, parseScope, protectedResourceMetadata, redirectUriMatches } from "@/lib/mcp/oauth";

describe("redirect addresses", () => {
  it.each(["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:33418/callback", "http://127.0.0.1/cb"])("%s may be registered", (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each(["http://evil.example/cb", "javascript:alert(1)", "myapp://cb", "https://ok.example/cb#frag", "", 42, null, "not a url"])("%s may not", (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });

  it("must match what was registered exactly", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback"];
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback?x=1")).toBe(false);
    expect(redirectUriMatches(registered, "https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(redirectUriMatches(registered, "https://evil.example/?https://claude.ai/api/mcp/auth_callback")).toBe(false);
  });

  it("lets a loopback client use whichever port it got, and nothing else", () => {
    const registered = ["http://127.0.0.1:1234/callback"];
    expect(redirectUriMatches(registered, "http://127.0.0.1:55001/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:55001/other")).toBe(false);
    expect(redirectUriMatches(registered, "http://localhost:55001/callback")).toBe(false);
    expect(redirectUriMatches(["https://app.example/callback"], "https://app.example:8443/callback")).toBe(false);
  });
});

describe("scope", () => {
  it("is read-only unless write is asked for by name", () => {
    expect(parseScope(null)).toBe("read");
    expect(parseScope("")).toBe("read");
    expect(parseScope("read")).toBe("read");
    expect(parseScope("openid offline_access admin")).toBe("read");
    expect(parseScope("read write")).toBe("write");
  });
});

describe("discovery documents", () => {
  it("point at this site and require PKCE with public clients", () => {
    const server = authorizationServerMetadata();
    const resource = protectedResourceMetadata();
    expect(resource.authorization_servers).toEqual([server.issuer]);
    expect(resource.resource).toBe(`${server.issuer}/api/mcp`);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(server.authorization_endpoint.startsWith(server.issuer)).toBe(true);
    expect(server.client_id_metadata_document_supported).toBe(true);
  });

  it("the 401 challenge names the metadata document", () => {
    expect(bearerChallenge()).toContain('resource_metadata="');
    expect(bearerChallenge()).toContain("/.well-known/oauth-protected-resource");
    expect(bearerChallenge("invalid_token")).toContain('error="invalid_token"');
  });
});
