import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import type { SessionUser } from "@/server/context";
import {
  adminProcedure,
  creatorProcedure,
  protectedProcedure,
  router,
  createCallerFactory,
} from "@/server/trpc";
import { db } from "@/db";
import { callerFor } from "../helpers/caller";
import { createUser } from "../helpers/factories";

// A probe router exercising the real middlewares in isolation. Ownership
// checks (creator A cannot read creator B's submission) are tested against
// the real submission router when it lands with the money logic.
const probe = createCallerFactory(
  router({
    authed: protectedProcedure.query(() => "ok"),
    adminOnly: adminProcedure.query(() => "ok"),
    creatorOnly: creatorProcedure.query(() => "ok"),
  }),
);

const asUser = (user: SessionUser | null) =>
  probe({ db, headers: new Headers(), resHeaders: new Headers(), user });

const admin: SessionUser = {
  id: "00000000-0000-4000-8000-00000000000a",
  email: "a@example.com",
  role: "admin",
};
const creator: SessionUser = {
  id: "00000000-0000-4000-8000-00000000000c",
  email: "c@example.com",
  role: "creator",
};

describe("authorization layers", () => {
  it("anonymous is rejected from protected procedures", async () => {
    await expect(asUser(null).authed()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("role mismatch is FORBIDDEN in both directions", async () => {
    await expect(asUser(creator).adminOnly()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(asUser(admin).creatorOnly()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("matching roles pass through", async () => {
    expect(await asUser(admin).adminOnly()).toBe("ok");
    expect(await asUser(creator).creatorOnly()).toBe("ok");
    expect(await asUser(creator).authed()).toBe("ok");
  });
});

describe("session router", () => {
  it("me returns the acting user, or null for anonymous", async () => {
    const u = await createUser();
    const { caller } = callerFor({ id: u.id, email: u.email, role: u.role });
    expect((await caller.session.me())?.id).toBe(u.id);

    const anon = callerFor(null);
    expect(await anon.caller.session.me()).toBeNull();
  });

  it("switchUser writes a signed Set-Cookie for an existing user", async () => {
    const u = await createUser();
    const { caller, resHeaders } = callerFor(null);
    await caller.session.switchUser({ userId: u.id });

    const setCookie = resHeaders.get("set-cookie");
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
    // the cookie value must verify against the HMAC secret
    const value = /session=([^;]+)/.exec(setCookie ?? "")?.[1];
    const { verifySession } = await import("@/lib/auth/cookie");
    expect(verifySession(value)).toBe(u.id);
  });

  it("switchUser rejects an unknown userId", async () => {
    const { caller } = callerFor(null);
    await expect(
      caller.session.switchUser({
        userId: "00000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

});
