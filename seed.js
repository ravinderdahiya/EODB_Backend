import prisma from "./src/config/db.js";
import bcrypt from "bcrypt";

async function main() {
  console.log("🌱 Starting seed...");

  const adminEmail = "admin@harsac.gov.in";
  const adminPassword = "admin123";
  const adminMobile = "9999999999";
  const adminFullname = "Super Admin";

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log("⚠️  Admin user already exists, updating...");
    
    // Update existing admin to superadmin role
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        password: hashedPassword,
        role: "superadmin",
        fullname: adminFullname,
        mobile: adminMobile,
      },
    });
    console.log("✅ Admin updated to superadmin role");
  } else {
    // Create new superadmin
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        fullname: adminFullname,
        email: adminEmail,
        password: hashedPassword,
        mobile: adminMobile,
        role: "superadmin",
      },
    });
    console.log("✅ Superadmin created successfully!");
  }

  // Create additional admin users if needed
  const adminUsers = [
    { email: "admin1@harsac.gov.in", fullname: "Admin One", password: "admin123", mobile: "8888888881" },
    { email: "admin2@harsac.gov.in", fullname: "Admin Two", password: "admin123", mobile: "8888888882" },
  ];

  for (const adminUser of adminUsers) {
    const existing = await prisma.user.findUnique({
      where: { email: adminUser.email },
    });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(adminUser.password, 10);
      await prisma.user.create({
        data: {
          fullname: adminUser.fullname,
          email: adminUser.email,
          password: hashedPassword,
          mobile: adminUser.mobile,
          role: "admin",
        },
      });
      console.log(`✅ Admin user ${adminUser.email} created`);
    }
  }

  console.log("🌱 Seed completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });