import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  'Medical - Doctor Visits',
  'Medical - Labs',
  'Medical - Imaging',
  'Medical - Surgery',
  'Medical - Hospital',
  'Dental',
  'Vision',
  'Prescriptions',
  'Mental Health',
  'Physical Therapy / Chiropractic',
  'Medical Equipment / Supplies',
  'Preventive Care',
  'Other',
];

async function main() {
  const existing = await prisma.category.count({ where: { userId: null } });
  if (existing === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ name, isCustom: false })),
    });
    console.log(`Seeded ${DEFAULT_CATEGORIES.length} default categories`);
  } else {
    console.log('Default categories already seeded, skipping');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
