/**
 * Seed a demo account with a year of plausible financial history.
 *
 * The point is a database someone can actually look at: charts with shape,
 * budgets in every state, and goals part-funded. Random noise alone produces
 * flat, uninformative graphs, so amounts vary seasonally and by category.
 *
 *   npm run seed              # wipe and reseed the demo account
 *   npm run seed -- --keep    # add to whatever is already there
 */
import mongoose from 'mongoose';
import { DEFAULT_CURRENCY, toMinor } from '@savoney/shared';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../db/connect.js';
import { hashPassword } from '../lib/password.js';
import { Budget } from '../modules/budgets/budget.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Goal } from '../modules/goals/goal.model.js';
import { Transaction } from '../modules/transactions/transaction.model.js';
import { RefreshToken } from '../modules/auth/refresh-token.model.js';
import { User } from '../modules/auth/user.model.js';

const DEMO_EMAIL = 'demo@savoney.app';
const DEMO_PASSWORD = 'savoney-demo-2026';

/** Deterministic PRNG so repeated seeds produce the same demo data. */
const makeRandom = (seed: number) => () => {
  seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seed / 4_294_967_296;
};
const random = makeRandom(20_260_826);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) => min + random() * (max - min);

interface CategorySpec {
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: string;
  /** Typical transaction size in major units. */
  range?: [number, number];
  /** Roughly how many times a month it occurs. */
  perMonth?: number;
  merchants?: string[];
}

const CATEGORY_SPECS: CategorySpec[] = [
  {
    name: 'Salary',
    type: 'income',
    color: '#16a34a',
    icon: 'briefcase',
    range: [85000, 85000],
    perMonth: 1,
    merchants: ['Monthly salary'],
  },
  {
    name: 'Freelance',
    type: 'income',
    color: '#0d9488',
    icon: 'trending-up',
    range: [5000, 30000],
    perMonth: 0.7,
    merchants: ['Design retainer', 'Consulting invoice', 'Side project'],
  },
  {
    name: 'Rent',
    type: 'expense',
    color: '#8b5cf6',
    icon: 'home',
    range: [25000, 25000],
    perMonth: 1,
    merchants: ['Apartment rent'],
  },
  {
    name: 'Groceries',
    type: 'expense',
    color: '#f97316',
    icon: 'shopping-cart',
    range: [400, 2500],
    perMonth: 7,
    merchants: ['BigBasket', 'DMart', 'Reliance Fresh', 'Local kirana', 'Farmers market'],
  },
  {
    name: 'Dining Out',
    type: 'expense',
    color: '#ef4444',
    icon: 'utensils',
    range: [250, 1800],
    perMonth: 6,
    merchants: ['Chai point', 'Biryani house', 'Cafe order', 'Street food', 'Pizza place'],
  },
  {
    name: 'Transport',
    type: 'expense',
    color: '#3b82f6',
    icon: 'car',
    range: [50, 1200],
    perMonth: 8,
    merchants: ['Metro card', 'Auto fare', 'Cab ride', 'Fuel', 'Parking'],
  },
  {
    name: 'Utilities',
    type: 'expense',
    color: '#eab308',
    icon: 'plug',
    range: [800, 3500],
    perMonth: 2,
    merchants: ['Electricity', 'Water', 'Broadband'],
  },
  {
    name: 'Subscriptions',
    type: 'expense',
    color: '#6366f1',
    icon: 'smartphone',
    range: [150, 800],
    perMonth: 4,
    merchants: ['Streaming', 'Music', 'Cloud storage', 'News'],
  },
  {
    name: 'Healthcare',
    type: 'expense',
    color: '#ec4899',
    icon: 'heart-pulse',
    range: [300, 5000],
    perMonth: 0.8,
    merchants: ['Pharmacy', 'Dentist', 'Clinic visit'],
  },
  {
    name: 'Entertainment',
    type: 'expense',
    color: '#a855f7',
    icon: 'film',
    range: [250, 2000],
    perMonth: 2.5,
    merchants: ['Cinema', 'Concert', 'Bookstore', 'Games'],
  },
  {
    name: 'Travel',
    type: 'expense',
    color: '#0ea5e9',
    icon: 'plane',
    range: [4000, 25000],
    perMonth: 0.3,
    merchants: ['Flights', 'Hotel', 'Train fare'],
  },
  {
    name: 'Fitness',
    type: 'expense',
    color: '#14b8a6',
    icon: 'dumbbell',
    range: [1200, 2500],
    perMonth: 1,
    merchants: ['Gym membership'],
  },
];

const seed = async (): Promise<void> => {
  const keepExisting = process.argv.includes('--keep');

  await connectDatabase();
  logger.info({ database: mongoose.connection.name }, 'seeding demo data');

  let user = await User.findOne({ email: DEMO_EMAIL });

  if (user && !keepExisting) {
    // Remove the demo account's data only — never anything else in the database.
    await Promise.all([
      Transaction.deleteMany({ user: user._id }),
      Category.deleteMany({ user: user._id }),
      Budget.deleteMany({ user: user._id }),
      Goal.deleteMany({ user: user._id }),
      RefreshToken.deleteMany({ user: user._id }),
    ]);
    // Reset the profile too, not just the rows. A demo account left in some
    // other currency would render the freshly seeded USD amounts under the
    // wrong symbol — reseeding must produce a known state, not a partial one.
    user.currency = DEFAULT_CURRENCY;
    user.name = 'Demo User';
    user.monthlyIncomeTargetMinor = toMinor('90000');
    await user.save();

    logger.info('cleared previous demo data');
  }

  if (!user) {
    user = await User.create({
      name: 'Demo User',
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      currency: DEFAULT_CURRENCY,
      monthlyIncomeTargetMinor: toMinor('90000'),
    });
  }

  const categories = await Category.insertMany(
    CATEGORY_SPECS.map((spec) => ({
      user: user!._id,
      name: spec.name,
      type: spec.type,
      color: spec.color,
      icon: spec.icon,
    })),
    { ordered: false },
  );
  const categoryByName = new Map(categories.map((category) => [category.name, category]));

  // Twelve months of history ending today.
  const now = new Date();
  const transactions: Record<string, unknown>[] = [];

  for (let monthsBack = 11; monthsBack >= 0; monthsBack -= 1) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
    const daysInMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ).getUTCDate();

    // A gentle seasonal swing keeps the trend chart from looking like noise.
    const seasonal = 1 + 0.18 * Math.sin((monthsBack / 12) * Math.PI * 2);

    for (const spec of CATEGORY_SPECS) {
      const category = categoryByName.get(spec.name);
      if (!category || !spec.range || !spec.perMonth) continue;

      const occurrences = Math.round(spec.perMonth * (spec.perMonth < 1 ? 1 : seasonal));
      const happens = spec.perMonth >= 1 || random() < spec.perMonth;
      if (!happens) continue;

      for (let i = 0; i < Math.max(1, occurrences); i += 1) {
        const day = Math.min(daysInMonth, 1 + Math.floor(random() * daysInMonth));
        const occurredAt = new Date(
          Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day, 12),
        );
        if (occurredAt > now) continue;

        const [min, max] = spec.range;
        const amount =
          min === max ? min : between(min, max) * (spec.type === 'expense' ? seasonal : 1);

        transactions.push({
          user: user._id,
          title: pick(spec.merchants ?? [spec.name]),
          amountMinor: toMinor(amount.toFixed(2)),
          type: spec.type,
          category: category._id,
          occurredAt,
          notes: '',
          tags: [],
          recurrence: null,
        });
      }
    }
  }

  await Transaction.insertMany(transactions, { ordered: false });

  // Budgets chosen to land in all three states, so every UI branch is visible.
  const budgetSpecs: Array<[string, string, number, number]> = [
    ['Groceries', 'Groceries', 12000, 0.8],
    ['Dining Out', 'Eating out', 6000, 0.75],
    ['Transport', 'Getting around', 4000, 0.8],
    ['Entertainment', 'Fun money', 3500, 0.7],
    ['Subscriptions', 'Subscriptions', 1500, 0.9],
  ];

  await Budget.insertMany(
    budgetSpecs.flatMap(([categoryName, name, amount, threshold]) => {
      const category = categoryByName.get(categoryName);
      return category
        ? [
            {
              user: user!._id,
              name,
              amountMinor: toMinor(String(amount)),
              category: category._id,
              period: 'monthly',
              alertThreshold: threshold,
            },
          ]
        : [];
    }),
    { ordered: false },
  );

  const inMonths = (months: number) => {
    const date = new Date(now.getTime());
    date.setUTCMonth(date.getUTCMonth() + months);
    return date;
  };

  await Goal.insertMany([
    {
      user: user._id,
      name: 'Emergency fund',
      targetMinor: toMinor('10000'),
      savedMinor: toMinor('6400'),
      targetDate: inMonths(8),
      color: '#0ea5e9',
      notes: 'Six months of expenses',
    },
    {
      user: user._id,
      name: 'Japan trip',
      targetMinor: toMinor('4200'),
      savedMinor: toMinor('1750'),
      targetDate: inMonths(5),
      color: '#f43f5e',
      notes: 'Flights and two weeks',
    },
    {
      user: user._id,
      name: 'New laptop',
      targetMinor: toMinor('2400'),
      savedMinor: toMinor('2400'),
      targetDate: inMonths(2),
      color: '#8b5cf6',
      notes: 'Fully funded',
    },
  ]);

  const total = await Transaction.countDocuments({ user: user._id });
  logger.info(
    { transactions: total, categories: categories.length, email: DEMO_EMAIL },
    'seed complete',
  );

  // Printed rather than logged: this is the one thing the operator needs.
  console.log(
    `\n  Demo account ready\n    email:    ${DEMO_EMAIL}\n    password: ${DEMO_PASSWORD}\n`,
  );

  await disconnectDatabase();
};

seed().catch((error: unknown) => {
  logger.fatal({ err: error }, 'seed failed');
  void disconnectDatabase().finally(() => process.exit(1));
});
