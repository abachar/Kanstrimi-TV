import type { GroupsFilter } from "@/admin/groups/data";
import { kindParam, pageParam, pickEnum } from "../query";

export type GroupsQuery = GroupsFilter & { page: number };

export function parseGroupsQuery(q: Record<string, string>): GroupsQuery {
  return { kind: kindParam(q.kind), q: q.q?.trim() ?? "", only: pickEnum(q.only, ["", "multi", "fallback", "hidden", "adult"], ""), page: pageParam(q.page) };
}

export function groupsLink(qy: GroupsQuery, over: Partial<GroupsQuery> = {}) {
  const v = { ...qy, ...over };
  return "/admin/catalog?" + new URLSearchParams({ view: "groups", kind: v.kind, q: v.q, only: v.only, page: String(v.page) }).toString();
}
