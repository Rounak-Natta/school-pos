import { RoleName } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export enum Permission {
  VIEW_DASHBOARD = "VIEW_DASHBOARD",

  POS_BILLING = "POS_BILLING",

  VIEW_INVOICES = "VIEW_INVOICES",
  CANCEL_INVOICE = "CANCEL_INVOICE",
  RETURN_INVOICE = "RETURN_INVOICE",
  RECEIVE_PAYMENT = "RECEIVE_PAYMENT",

  VIEW_REPORTS = "VIEW_REPORTS",

  VIEW_INVENTORY = "VIEW_INVENTORY",
  MANAGE_INVENTORY = "MANAGE_INVENTORY",

  VIEW_PRODUCTS = "VIEW_PRODUCTS",
  MANAGE_PRODUCTS = "MANAGE_PRODUCTS",

  VIEW_TRANSFERS = "VIEW_TRANSFERS",
  MANAGE_TRANSFERS = "MANAGE_TRANSFERS",

  VIEW_STUDENTS = "VIEW_STUDENTS",
  MANAGE_STUDENTS = "MANAGE_STUDENTS",

  MANAGE_SCHOOLS = "MANAGE_SCHOOLS",
  MANAGE_USERS = "MANAGE_USERS",

  IMPORT_EXPORT = "IMPORT_EXPORT",
  VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS",
  SETTINGS = "SETTINGS",
}

export type AccessRole = {
  schoolId: string;
  schoolName: string;
  role: RoleName;
};

export type AccessScope = {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  roles: AccessRole[];
  schoolIds: string[];
};

const PERMISSION_ROLES: Record<Permission, RoleName[]> = {
  [Permission.VIEW_DASHBOARD]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
    RoleName.CASHIER,
    RoleName.ACCOUNTANT,
    RoleName.AUDITOR,
    RoleName.DATA_ENTRY,
  ],

  [Permission.POS_BILLING]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.CASHIER,
  ],

  [Permission.VIEW_INVOICES]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.CASHIER,
    RoleName.ACCOUNTANT,
    RoleName.AUDITOR,
  ],

  [Permission.CANCEL_INVOICE]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.ACCOUNTANT,
  ],

  [Permission.RETURN_INVOICE]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.ACCOUNTANT,
  ],

  [Permission.RECEIVE_PAYMENT]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.CASHIER,
    RoleName.ACCOUNTANT,
  ],

  [Permission.VIEW_REPORTS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.ACCOUNTANT,
    RoleName.AUDITOR,
  ],

  [Permission.VIEW_INVENTORY]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
    RoleName.ACCOUNTANT,
    RoleName.AUDITOR,
  ],

  [Permission.MANAGE_INVENTORY]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
  ],

  [Permission.VIEW_PRODUCTS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
  ],

  [Permission.MANAGE_PRODUCTS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
  ],

  [Permission.VIEW_TRANSFERS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
    RoleName.AUDITOR,
  ],

  [Permission.MANAGE_TRANSFERS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
  ],

  [Permission.VIEW_STUDENTS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.CASHIER,
    RoleName.DATA_ENTRY,
  ],

  [Permission.MANAGE_STUDENTS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.DATA_ENTRY,
  ],

  [Permission.MANAGE_SCHOOLS]: [RoleName.SUPER_ADMIN],

  [Permission.MANAGE_USERS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
  ],

  [Permission.IMPORT_EXPORT]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.INVENTORY_MANAGER,
    RoleName.DATA_ENTRY,
  ],

  [Permission.VIEW_AUDIT_LOGS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
    RoleName.AUDITOR,
  ],

  [Permission.SETTINGS]: [
    RoleName.SUPER_ADMIN,
    RoleName.SCHOOL_ADMIN,
  ],
};

export async function getAccessScope(): Promise<AccessScope> {
  // requireUser() already validates the JWT against the current database
  // and refreshes active school-role information from PostgreSQL.
  const sessionUser = await requireUser();
  const roles = sessionUser.roles;

  const isSuperAdmin = roles.some(
    (role) => role.role === RoleName.SUPER_ADMIN,
  );

  const schoolIds = Array.from(new Set(roles.map((role) => role.schoolId)));

  return {
    userId: sessionUser.id,
    email: sessionUser.email,
    isSuperAdmin,
    roles,
    schoolIds,
  };
}

export function hasPermission(
  access: AccessScope,
  permission: Permission,
  schoolId?: string,
) {
  if (access.isSuperAdmin) {
    return true;
  }

  const allowedRoles = PERMISSION_ROLES[permission];

  return access.roles.some((role) => {
    if (!allowedRoles.includes(role.role)) {
      return false;
    }

    if (schoolId) {
      return role.schoolId === schoolId;
    }

    return true;
  });
}

export function getSchoolIdsForPermission(
  access: AccessScope,
  permission: Permission,
) {
  if (access.isSuperAdmin) {
    return access.schoolIds;
  }

  return access.schoolIds.filter((schoolId) =>
    hasPermission(access, permission, schoolId),
  );
}

export function requirePermission(
  access: AccessScope,
  permission: Permission,
  schoolId?: string,
) {
  if (!hasPermission(access, permission, schoolId)) {
    throw new Error("You do not have permission to perform this action.");
  }
}

export function canAccessSchool(access: AccessScope, schoolId: string) {
  if (access.isSuperAdmin) {
    return true;
  }

  return access.schoolIds.includes(schoolId);
}

export async function resolveAccessibleSchoolId(input: {
  postedSchoolId: string;
  access: AccessScope;
  permission?: Permission;
}) {
  const { postedSchoolId, access, permission } = input;

  if (!postedSchoolId) {
    if (!access.isSuperAdmin && access.schoolIds.length === 1) {
      const onlySchoolId = access.schoolIds[0];

      if (permission) {
        requirePermission(access, permission, onlySchoolId);
      }

      return onlySchoolId;
    }

    throw new Error("School is required.");
  }

  if (!canAccessSchool(access, postedSchoolId)) {
    throw new Error("You do not have access to this school.");
  }

  if (permission) {
    requirePermission(access, permission, postedSchoolId);
  }

  const school = await prisma.school.findFirst({
    where: {
      id: postedSchoolId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (!school) {
    throw new Error("School was not found or is inactive.");
  }

  return school.id;
}

export function getPermissionKeys(access: AccessScope) {
  return Object.values(Permission).filter((permission) =>
    hasPermission(access, permission),
  );
}