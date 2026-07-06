import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { config } from "../config";
import { requireApiKey } from "./apiKeyAuth";

function makeMockResponse() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };

  return res;
}

function makeMockRequest(headerValue?: string) {
  return {
    headers: headerValue === undefined ? {} : { "x-api-key": headerValue },
  } as unknown as Request;
}

describe("requireApiKey", () => {
  beforeEach(() => {
    config.apiAccessKey = "";
  });

  it("rejects with 401 when no key is configured on the server", () => {
    const req = makeMockRequest("anything");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "API key not configured on the server." });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the header is missing or wrong", () => {
    config.apiAccessKey = "correct-key";

    const req = makeMockRequest("wrong-key");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or missing API key." });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when the header matches", () => {
    config.apiAccessKey = "correct-key";

    const req = makeMockRequest("correct-key");
    const res = makeMockResponse();
    const next = vi.fn();

    requireApiKey(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });
});
