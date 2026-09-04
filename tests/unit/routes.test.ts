import { describe, expect, it } from "vitest";

import { canViewPath, ROLE_HOME } from "@/lib/auth/routes";

describe("post-switch routing", () => {
  it("admins keep admin pages, lose creator pages", () => {
    expect(canViewPath("admin", "/admin/campaigns")).toBe(true);
    expect(canViewPath("admin", "/admin/campaigns/abc/edit")).toBe(true);
    expect(canViewPath("admin", "/creator/submissions")).toBe(false);
  });

  it("creators keep creator pages, lose admin pages", () => {
    expect(canViewPath("creator", "/creator/campaigns/abc")).toBe(true);
    expect(canViewPath("creator", "/admin/campaigns")).toBe(false);
  });

  it("shared pages are visible to both; homes are role-correct", () => {
    expect(canViewPath("admin", "/")).toBe(true);
    expect(canViewPath("creator", "/")).toBe(true);
    expect(ROLE_HOME.admin).toBe("/admin/campaigns");
    expect(ROLE_HOME.creator).toBe("/creator/campaigns");
  });
});
