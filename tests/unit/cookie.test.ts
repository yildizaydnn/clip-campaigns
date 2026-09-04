import { describe, expect, it } from "vitest";

import {
  readSessionCookie,
  signSession,
  verifySession,
} from "@/lib/auth/cookie";

describe("session cookie signing", () => {
  it("round-trips a valid signature", () => {
    const id = "5b2f9c1e-0000-4000-8000-000000000001";
    expect(verifySession(signSession(id))).toBe(id);
  });

  it("rejects a tampered userId", () => {
    const signed = signSession("5b2f9c1e-0000-4000-8000-000000000001");
    const tampered = signed.replace("001.", "002.");
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const signed = signSession("5b2f9c1e-0000-4000-8000-000000000001");
    expect(verifySession(signed.slice(0, -2) + "xx")).toBeNull();
  });

  it("rejects garbage and empty values", () => {
    expect(verifySession(null)).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("no-dot-here")).toBeNull();
    expect(verifySession(".sig-without-id")).toBeNull();
  });

  it("parses the session cookie out of a header", () => {
    expect(readSessionCookie("a=1; session=abc.def; b=2")).toBe("abc.def");
    expect(readSessionCookie("a=1; b=2")).toBeNull();
    expect(readSessionCookie(null)).toBeNull();
  });
});
