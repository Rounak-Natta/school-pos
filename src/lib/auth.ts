import { redirect } from "next/navigation";
import { RoleName } from "@/generated/prisma/client";
import { getCurrentUser, SessionUser } from "@/lib/session";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  const isSuperAdmin = user.roles.some(
    (role) => role.role === RoleName.SUPER_ADMIN
  );

  if (!isSuperAdmin) {
    redirect("/dashboard");
  }

  return user;
}

export function canAccessSchool(user: SessionUser, schoolId: string) {
  return user.roles.some((role) => role.schoolId === schoolId);
}

export function hasRole(
  user: SessionUser,
  roleName: RoleName,
  schoolId?: string
) {
  return user.roles.some((role) => {
    if (schoolId) {
      return role.role === roleName && role.schoolId === schoolId;
    }

    return role.role === roleName;
  });
}