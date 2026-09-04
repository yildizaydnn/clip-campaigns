export type Role = "admin" | "creator";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/campaigns",
  creator: "/creator/campaigns",
};

/** Can this role view this path? Drives the post-switch redirect. */
export function canViewPath(role: Role, path: string): boolean {
  if (path.startsWith("/admin")) return role === "admin";
  if (path.startsWith("/creator")) return role === "creator";
  return true; // shared pages (/, etc.)
}
