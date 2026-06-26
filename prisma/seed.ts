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
  },
  {
    name: "The Bandhan School - Aranghata",
    code: "TBS-ARANGHATA",
  },
  {
    name: "The Bandhan School - Taldi",
    code: "TBS-TALDI",
  },
  {
    name: "The Bandhan School - Chakdaha",
    code: "TBS-CHAKDAHA",
  },
];

const ADMIN_EMAIL = "admin@schoolpos.com";
const ADMIN_PASSWORD = "Admin@12345";

async function main() {
  console.log("Seeding fixed schools and super admin...");

  for (const school of FIXED_SCHOOLS) {
    await prisma.school.upsert({
      where: {
        code: school.code,
      },
      update: {
        name: school.name,
        isActive: true,
      },
      create: {
        name: school.name,
        code: school.code,
        isActive: true,
      },
    });
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const superAdmin = await prisma.user.upsert({
    where: {
      email: ADMIN_EMAIL,
    },
    update: {
      name: "Super Admin",
      phone: "9999999999",
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
    create: {
      name: "Super Admin",
      email: ADMIN_EMAIL,
      phone: "9999999999",
      passwordHash,
      isActive: true,
    },
  });

  const schools = await prisma.school.findMany({
    where: {
      code: {
        in: FIXED_SCHOOLS.map((school) => school.code),
      },
    },
  });

  for (const school of schools) {
    await prisma.userSchoolRole.upsert({
      where: {
        userId_schoolId_role: {
          userId: superAdmin.id,
          schoolId: school.id,
          role: RoleName.SUPER_ADMIN,
        },
      },
      update: {
        isActive: true,
      },
      create: {
        userId: superAdmin.id,
        schoolId: school.id,
        role: RoleName.SUPER_ADMIN,
        isActive: true,
      },
    });
  }

  const [schoolCount, userCount, roleCount] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.userSchoolRole.count(),
  ]);

  console.log("Seed completed successfully.");
  console.log({
    schools: schoolCount,
    users: userCount,
    userSchoolRoles: roleCount,
  });

  console.log("Super Admin Login:");
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
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