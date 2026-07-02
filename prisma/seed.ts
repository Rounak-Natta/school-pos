import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const FIXED_SCHOOLS = [
  {
    name: "HP GHOSH MEMORIAL SCHOOL",
    code: "HPGMS",
    adminName: "HPGMS School Admin",
    adminEmail: "hpgms@schoolpos.com",
    adminPhone: "9000000001",
  },
  {
    name: "The Bandhan School - Aranghata",
    code: "TBS-ARANGHATA",
    adminName: "Aranghata School Admin",
    adminEmail: "aranghata@schoolpos.com",
    adminPhone: "9000000002",
  },
  {
    name: "The Bandhan School - Taldi",
    code: "TBS-TALDI",
    adminName: "Taldi School Admin",
    adminEmail: "taldi@schoolpos.com",
    adminPhone: "9000000003",
  },
  {
    name: "The Bandhan School - Chakdaha",
    code: "TBS-CHAKDAHA",
    adminName: "Chakdaha School Admin",
    adminEmail: "chakdaha@schoolpos.com",
    adminPhone: "9000000004",
  },
];

const MAIN_ADMIN_EMAIL = "admin@schoolpos.com";
const MAIN_ADMIN_PASSWORD = "Admin@12345";

const SCHOOL_ADMIN_PASSWORD = "School@12345";

async function upsertUser(params: {
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
}) {
  const { name, email, phone, passwordHash } = params;

  return prisma.user.upsert({
    where: {
      email,
    },
    update: {
      name,
      phone,
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name,
      email,
      phone,
      passwordHash,
      isActive: true,
    },
  });
}

async function assignSingleRole(params: {
  userId: string;
  schoolId: string;
  role: RoleName;
}) {
  const { userId, schoolId, role } = params;

  await prisma.userSchoolRole.upsert({
    where: {
      userId_schoolId_role: {
        userId,
        schoolId,
        role,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      userId,
      schoolId,
      role,
      isActive: true,
    },
  });
}

async function main() {
  console.log("Seeding 4 schools, 4 school accounts, and 1 main account...");

  const mainPasswordHash = await bcrypt.hash(MAIN_ADMIN_PASSWORD, 12);
  const schoolPasswordHash = await bcrypt.hash(SCHOOL_ADMIN_PASSWORD, 12);

  const seededSchools = [];

  for (const school of FIXED_SCHOOLS) {
    const seededSchool = await prisma.school.upsert({
      where: {
        code: school.code,
      },
      update: {
        name: school.name,
        isActive: true,
        isSystemFixed: true,
      },
      create: {
        name: school.name,
        code: school.code,
        isActive: true,
        isSystemFixed: true,
      },
    });

    seededSchools.push({
      ...school,
      id: seededSchool.id,
    });
  }

  const mainAdmin = await upsertUser({
    name: "Super Admin",
    email: MAIN_ADMIN_EMAIL,
    phone: "9999999999",
    passwordHash: mainPasswordHash,
  });

  await prisma.userSchoolRole.updateMany({
    where: {
      userId: mainAdmin.id,
    },
    data: {
      isActive: false,
    },
  });

  for (const school of seededSchools) {
    await assignSingleRole({
      userId: mainAdmin.id,
      schoolId: school.id,
      role: RoleName.SUPER_ADMIN,
    });
  }

  for (const school of seededSchools) {
    const schoolAdmin = await upsertUser({
      name: school.adminName,
      email: school.adminEmail,
      phone: school.adminPhone,
      passwordHash: schoolPasswordHash,
    });

    await prisma.userSchoolRole.updateMany({
      where: {
        userId: schoolAdmin.id,
      },
      data: {
        isActive: false,
      },
    });

    await assignSingleRole({
      userId: schoolAdmin.id,
      schoolId: school.id,
      role: RoleName.SCHOOL_ADMIN,
    });
  }

  const [schoolCount, userCount, roleCount] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.userSchoolRole.count(),
  ]);

  console.log("");
  console.log("Seed completed successfully.");
  console.log({
    schools: schoolCount,
    users: userCount,
    userSchoolRoles: roleCount,
  });

  console.log("");
  console.log("Main Account:");
  console.log(`Email: ${MAIN_ADMIN_EMAIL}`);
  console.log(`Password: ${MAIN_ADMIN_PASSWORD}`);

  console.log("");
  console.log("School Login Accounts:");
  for (const school of seededSchools) {
    console.log(`${school.name}`);
    console.log(`Email: ${school.adminEmail}`);
    console.log(`Password: ${SCHOOL_ADMIN_PASSWORD}`);
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });