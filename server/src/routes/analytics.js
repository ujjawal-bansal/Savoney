import express from 'express';
import protect from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

router.get('/summary', protect, async (req, res, next) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id });
    const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expense = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    const balance = income - expense;

    const byCategory = transactions.reduce((acc, transaction) => {
      const existing = acc.find((item) => item.name === transaction.category);
      if (existing) {
        existing.amount += transaction.amount;
      } else {
        acc.push({ name: transaction.category, amount: transaction.amount });
      }
      return acc;
    }, []);

    res.json({ income, expense, balance, byCategory });
  } catch (error) {
    next(error);
  }
});

export default router;
