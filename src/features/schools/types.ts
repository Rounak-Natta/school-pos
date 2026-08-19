export type SchoolAdminListItem = Awaited<
  ReturnType<typeof import("@/features/schools/queries").getSchoolsAdminPageData>
>["schools"][number];
