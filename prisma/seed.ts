import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const schools = [
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

  for (const school of schools) {
    await prisma.school.upsert({
      where: { code: school.code },
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

  const passwordHash = await bcrypt.hash("Admin@12345", 12);

  const superAdmin = await prisma.user.upsert({
    where: {
      email: "admin@schoolpos.com",
    },
    update: {
      name: "Super Admin",
      isActive: true,
    },
    create: {
      name: "Super Admin",
      email: "admin@schoolpos.com",
      phone: "9999999999",
      passwordHash,
      isActive: true,
    },
  });

  const allSchools = await prisma.school.findMany();

  for (const school of allSchools) {
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

  console.log("Seed completed successfully");
  console.log("Super Admin Login:");
  console.log("Email: admin@schoolpos.com");
  console.log("Password: Admin@12345");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });