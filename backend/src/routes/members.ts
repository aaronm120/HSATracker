import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const memberSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().optional(),
});

router.get('/', async (req, res) => {
  try {
    const members = await db.familyMember.findMany({
      where: { userId: req.user.id },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, sortOrder } = memberSchema.parse(req.body);

    const existing = await db.familyMember.findUnique({
      where: { userId_name: { userId: req.user.id, name } },
    });
    if (existing) {
      res.status(400).json({ error: 'A family member with that name already exists' });
      return;
    }

    const maxOrder = await db.familyMember.findFirst({
      where: { userId: req.user.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const member = await db.familyMember.create({
      data: {
        userId: req.user.id,
        name,
        sortOrder: sortOrder ?? (maxOrder ? maxOrder.sortOrder + 1 : 0),
      },
    });
    res.status(201).json(member);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, sortOrder } = memberSchema.parse(req.body);

    const member = await db.familyMember.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!member) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const updated = await db.familyMember.update({
      where: { id: req.params.id },
      data: { name, ...(sortOrder !== undefined && { sortOrder }) },
    });
    res.json(updated);
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
    const member = await db.familyMember.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!member) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const expenseCount = await db.expense.count({
      where: { familyMemberId: req.params.id },
    });
    if (expenseCount > 0) {
      res.status(400).json({
        error: `Cannot delete: this member has ${expenseCount} expense(s). Reassign or delete those first.`,
      });
      return;
    }

    await db.familyMember.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
