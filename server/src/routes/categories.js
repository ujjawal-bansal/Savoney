import express from 'express';
import protect from '../middleware/auth.js';
import Category from '../models/Category.js';

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const categories = await Category.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.post('/', protect, async (req, res, next) => {
  try {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: 'Category name and type are required' });
    }

    const category = await Category.create({ user: req.user._id, name, type });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

export default router;
