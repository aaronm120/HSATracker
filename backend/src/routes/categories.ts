import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const categories = await db.category.findMany({
      where: { OR: [{ userId: null }, { userId: req.user.id }] },
      orderBy: [{ userId: 'asc' }, { name: 'asc' }],
    });
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);

    const category = await db.category.create({
      data: { userId: req.user.id, name, isCustom: true },
    });
    res.status(201).json(category);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const category = await db.category.findFirst({
      where: { id: req.params.id, userId: req.user.id, isCustom: true },
    });
    if (!category) {
      res.status(404).json({ error: 'Custom category not found' });
      return;
    }

    const expenseCount = await db.expense.count({
      where: { categoryId: req.params.id },
    });
    if (expenseCount > 0) {
      res.status(400).json({
        error: `Cannot delete: ${expenseCount} expense(s) use this category.`,
      });
      return;
    }

    await db.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
