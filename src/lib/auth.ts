import { redirect } from "next/navigation";
import { RoleName } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, SessionUser } from "@/lib/session";

/**
 * Returns the current session only when the JWT still maps to an active
 * database user with at least one active role on an active school.
 *
 * This extra database validation is important after database resets/seeds:
 * an old JWT can still have a valid signature while its user id no longer
 * exists in the freshly seeded database.
 */
export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) {
    return null;
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      id: sessionUser.id,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      schoolRoles: {
        where: {
          isActive: true,
          school: {
            isActive: true,
          },
        },
        select: {
          schoolId: true,
          role: true,
          school: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!dbUser || dbUser.schoolRoles.length === 0) {
    return null;
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    roles: dbUser.schoolRoles.map((schoolRole) => ({
      schoolId: schoolRole.schoolId,
      schoolName: schoolRole.school.name,
      role: schoolRole.role,
    })),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getAuthenticatedUser();

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
