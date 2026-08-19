export type UserAdminListItem = Awaited<
  ReturnType<typeof import("@/features/users/queries").getUsersAdminPageData>
>["users"][number];
