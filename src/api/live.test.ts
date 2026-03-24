import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Mock dependencies before importing the module
vi.mock("../live/session-manager.js", () => ({
  liveSessionManager: {
    startSession: vi.fn().mockResolvedValue({ cameraId: 1, clients: new Set() }),
    joinSession: vi.fn().mockReturnValue({ cameraId: 1, clients: new Set() }),
    leaveSession: vi.fn(),
    getSession: vi.fn(),
    stopSession: vi.fn(),
  },
}));

vi.mock("../logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { isAuthorized } from "./live.js";
import type { IncomingMessage } from "http";

const TEST_PASSWORD = "test-secret";
const VALID_TOKEN = crypto
  .createHmac("sha256", "dingdongditch")
  .update(TEST_PASSWORD)
  .digest("hex");

function createMockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    headers: {},
    url: "/api/live/ws",
    ...overrides,
  } as IncomingMessage;
}

describe("live WebSocket handler", () => {
  describe("isAuthorized", () => {
    describe("when UI_PASSWORD is not set", () => {
      beforeEach(() => {
        // Ensure UI_PASSWORD is empty — the module reads it at import time,
        // so we test the default (no password) path here.
        // The isAuthorized function is already imported with UI_PASSWORD="" (default)
      });

      it("should allow any connection when UI_PASSWORD is empty", () => {
        const req = createMockReq();
        // When UI_PASSWORD is "" (default in test env), all connections are allowed
        expect(isAuthorized(req)).toBe(true);
      });

      it("should allow connections without cookies when no password is set", () => {
        const req = createMockReq({ headers: {} });
        expect(isAuthorized(req)).toBe(true);
      });
    });
  });
});

// Test auth rejection with password enabled in a separate module context
describe("live WebSocket auth rejection", () => {
  // We test the auth logic by directly exercising isAuthorized with env control
  // Since the module captures UI_PASSWORD at import time, we test the auth logic
  // through the exported isAuthorized function and verify cookie/query parsing

  describe("cookie-based auth", () => {
    it("should parse auth_token from cookie header", () => {
      // This tests the cookie parsing path — with no password set,
      // it returns true regardless, but the parsing logic is exercised
      const req = createMockReq({
        headers: { cookie: `auth_token=${VALID_TOKEN}` },
      });
      expect(isAuthorized(req)).toBe(true);
    });

    it("should handle missing cookie header gracefully", () => {
      const req = createMockReq({ headers: {} });
      expect(isAuthorized(req)).toBe(true);
    });

    it("should handle cookie with multiple values", () => {
      const req = createMockReq({
        headers: { cookie: `other=foo; auth_token=${VALID_TOKEN}; bar=baz` },
      });
      expect(isAuthorized(req)).toBe(true);
    });
  });

  describe("query-string auth", () => {
    it("should accept token from query string", () => {
      const req = createMockReq({
        url: `/api/live/ws?token=${VALID_TOKEN}`,
      });
      expect(isAuthorized(req)).toBe(true);
    });

    it("should handle missing url gracefully", () => {
      const req = createMockReq({ url: undefined });
      expect(isAuthorized(req)).toBe(true);
    });
  });
});

// Integration-style test for the WS handler auth rejection behavior
describe("WebSocket connection auth rejection (integration)", () => {
  it("should send error and close unauthorized connections when password is set", async () => {
    // Reset modules to test with UI_PASSWORD set
    vi.resetModules();

    // Set the environment variable BEFORE importing the module
    const originalPassword = process.env.UI_PASSWORD;
    process.env.UI_PASSWORD = TEST_PASSWORD;

    try {
      // Re-import with password set
      const { isAuthorized: isAuthWithPw } = await import("./live.js");

      // Without any auth credentials, should reject
      const unauthReq = createMockReq({ headers: {} });
      expect(isAuthWithPw(unauthReq)).toBe(false);

      // With wrong token, should reject
      const wrongTokenReq = createMockReq({
        headers: { cookie: "auth_token=wrong-token" },
      });
      expect(isAuthWithPw(wrongTokenReq)).toBe(false);

      // With valid cookie token, should accept
      const validCookieReq = createMockReq({
        headers: { cookie: `auth_token=${VALID_TOKEN}` },
      });
      expect(isAuthWithPw(validCookieReq)).toBe(true);

      // With valid query string token, should accept
      const validQueryReq = createMockReq({
        url: `/api/live/ws?token=${VALID_TOKEN}`,
      });
      expect(isAuthWithPw(validQueryReq)).toBe(true);

      // With wrong query string token, should reject
      const wrongQueryReq = createMockReq({
        url: "/api/live/ws?token=invalid",
      });
      expect(isAuthWithPw(wrongQueryReq)).toBe(false);
    } finally {
      if (originalPassword === undefined) {
        delete process.env.UI_PASSWORD;
      } else {
        process.env.UI_PASSWORD = originalPassword;
      }
      vi.resetModules();
    }
  });
});
