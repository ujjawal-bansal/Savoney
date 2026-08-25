import express from 'express';
import protect from '../middleware/auth.js';
import Budget from '../models/Budget.js';

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const budgets = await Budget.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(budgets);
  } catch (error) {
    next(error);
  }
});

router.post('/', protect, async (req, res, next) => {
  try {
    const { name, amount, category, period } = req.body;

    if (!name || !amount || !category) {
      return res.status(400).json({ message: 'Budget name, amount, and category are required' });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ message: 'Budget amount must be a valid non-negative number' });
    }

    const budget = await Budget.create({
      user: req.user._id,
      name,
      amount: parsedAmount,
      category,
      period: period || 'monthly',
    });

    res.status(201).json(budget);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', protect, async (req, res, next) => {
  try {
    const budget = await Budget.findOne({ _id: req.params.id, user: req.user._id });
    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    if (req.body.amount !== undefined) {
      const parsedAmount = Number(req.body.amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: 'Budget amount must be a valid non-negative number' });
      }
      req.body.amount = parsedAmount;
    }

    Object.assign(budget, req.body);
    await budget.save();
    res.json(budget);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', protect, async (req, res, next) => {
  try {
    const result = await Budget.deleteOne({ _id: req.params.id, user: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    res.json({ message: 'Budget deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
