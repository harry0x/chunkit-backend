import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Seed subscription plans
  await prisma.subscriptionPlan.upsert({
    where: { planType: "monthly" },
    update: {},
    create: {
      planType: "monthly",
      priceInr: 99.0,
      durationDays: 30,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { planType: "yearly" },
    update: {},
    create: {
      planType: "yearly",
      priceInr: 999.0,
      durationDays: 365,
    },
  });

  console.log("✅ Subscription plans seeded (monthly: ₹99, yearly: ₹999)");

  // Seed admin user
  const adminEmail = "admin@chunkit.com";
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: {
        fullName: "ChunkIt Admin",
        email: adminEmail,
        passwordHash: hashedPassword,
        role: "admin",
        isActive: true,
      },
    });
    console.log(`✅ Admin user seeded (email: ${adminEmail}, password: admin123)`);
  } else {
    console.log("ℹ️  Admin user already exists, skipping.");
  }

  console.log("🌱 Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
