import { Router } from 'express';
import { z } from 'zod';
import { Prisma, PaymentMethod, ReimbursementStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { db } from '../lib/db';
import { deleteFile } from '../lib/minio';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  familyMemberId: z.string().cuid(),
  categoryId: z.string().cuid(),
  provider: z.string().min(1).max(255),
  amount: z.number().positive(),
  paymentMethod: z.enum(['OUT_OF_POCKET', 'DIRECT_HSA']),
  reimbursementStatus: z.enum(['PENDING', 'REIMBURSED', 'NA']),
  reimbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function buildWhere(userId: string, q: Record<string, string>) {
  const where: Prisma.ExpenseWhereInput = { userId };

  if (q.memberId) where.familyMemberId = q.memberId;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.paymentMethod) where.paymentMethod = q.paymentMethod as PaymentMethod;
  if (q.status) where.reimbursementStatus = q.status as ReimbursementStatus;

  const dateFilter: Prisma.DateTimeFilter = {};
  if (q.year) {
    dateFilter.gte = new Date(`${q.year}-01-01`);
    dateFilter.lte = new Date(`${q.year}-12-31`);
  } else {
    if (q.dateFrom) dateFilter.gte = new Date(q.dateFrom);
    if (q.dateTo) dateFilter.lte = new Date(q.dateTo);
  }
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

  return where;
}

// List expenses
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'))));
    const q = req.query as Record<string, string>;
    const where = buildWhere(req.user.id, q);

    const [expenses, total] = await db.$transaction([
      db.expense.findMany({
        where,
        include: {
          familyMember: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          receipts: { select: { id: true, fileName: true, fileSize: true, mimeType: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.expense.count({ where }),
    ]);

    res.json({ expenses, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Summary
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const year = req.query.year ? String(req.query.year) : null;
    const yearFilter = year
      ? { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } }
      : {};

    // Bug fix #9: use the selected year for the reimbursedYTD aggregate so the
    // summary card reflects the year the user is actually viewing.  When no year
    // is selected (all-time view) fall back to the current calendar year.
    const effectiveYear = year ?? String(new Date().getFullYear());
    const ytdFilter = {
      date: {
        gte: new Date(`${effectiveYear}-01-01`),
        lte: new Date(`${effectiveYear}-12-31`),
      },
    };

    const [byMemberRaw, byCategoryRaw, pending, reimbursedYTD, reimbursedAll, directHSA] =
      await db.$transaction([
        db.expense.groupBy({
          by: ['familyMemberId'],
          where: { userId, ...yearFilter },
          _sum: { amount: true },
        }),
        db.expense.groupBy({
          by: ['categoryId'],
          where: { userId, ...yearFilter },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { userId, reimbursementStatus: 'PENDING', ...yearFilter },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { userId, reimbursementStatus: 'REIMBURSED', ...ytdFilter },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { userId, reimbursementStatus: 'REIMBURSED' },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { userId, paymentMethod: 'DIRECT_HSA', ...yearFilter },
          _sum: { amount: true },
        }),
      ]);

    const members = await db.familyMember.findMany({
      where: { id: { in: byMemberRaw.map((r) => r.familyMemberId) } },
    });
    const categories = await db.category.findMany({
      where: { id: { in: byCategoryRaw.map((r) => r.categoryId) } },
    });

    const memberMap = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    res.json({
      totalByMember: byMemberRaw.map((r) => ({
        memberId: r.familyMemberId,
        memberName: memberMap[r.familyMemberId] ?? 'Unknown',
        total: r._sum.amount?.toString() ?? '0',
      })),
      totalByCategory: byCategoryRaw.map((r) => ({
        categoryId: r.categoryId,
        categoryName: categoryMap[r.categoryId] ?? 'Unknown',
        total: r._sum.amount?.toString() ?? '0',
      })),
      totalPendingReimbursement: pending._sum.amount?.toString() ?? '0',
      totalReimbursedYTD: reimbursedYTD._sum.amount?.toString() ?? '0',
      totalReimbursedAllTime: reimbursedAll._sum.amount?.toString() ?? '0',
      totalDirectHSA: directHSA._sum.amount?.toString() ?? '0',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV export
router.get('/export/csv', async (req, res) => {
  try {
    const where = buildWhere(req.user.id, req.query as Record<string, string>);
    const expenses = await db.expense.findMany({
      where,
      include: {
        familyMember: true,
        category: true,
        receipts: { select: { id: true } },
      },
      orderBy: { date: 'asc' },
    });

    const header = [
      'Date',
      'Family Member',
      'Category',
      'Provider',
      'Amount',
      'Payment Method',
      'Reimbursement Status',
      'Reimbursement Date',
      'Notes',
      'Receipt Count',
    ];

    const rows = expenses.map((e) => [
      e.date.toISOString().split('T')[0],
      e.familyMember.name,
      e.category.name,
      e.provider,
      Number(e.amount).toFixed(2),
      e.paymentMethod === 'OUT_OF_POCKET' ? 'Out-of-Pocket' : 'Direct HSA',
      e.reimbursementStatus === 'PENDING'
        ? 'Pending'
        : e.reimbursementStatus === 'REIMBURSED'
          ? 'Reimbursed'
          : 'N/A',
      e.reimbursementDate ? e.reimbursementDate.toISOString().split('T')[0] : '',
      e.notes ?? '',
      String(e.receipts.length),
    ]);

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');

    const year = req.query.year ? `${req.query.year}` : 'all';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="hsa-expenses-${year}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PDF export
router.get('/export/pdf', async (req, res) => {
  try {
    const where = buildWhere(req.user.id, req.query as Record<string, string>);
    const expenses = await db.expense.findMany({
      where,
      include: { familyMember: true, category: true, receipts: { select: { id: true } } },
      orderBy: { date: 'asc' },
    });

    const doc = new PDFDocument({ margin: 40, size: 'LETTER', layout: 'landscape' });
    const year = req.query.year ? `${req.query.year}` : 'all';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="hsa-expenses-${year}.pdf"`);
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('HSA Expense Report', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    if (req.query.year) doc.text(`Tax Year: ${req.query.year}`, { align: 'center' });
    doc.moveDown();

    const cols = [40, 100, 175, 265, 370, 430, 520, 620, 690];
    const headers = ['Date', 'Member', 'Category', 'Provider', 'Amount', 'Method', 'Status', 'Reimb. Date', '#'];
    const colWidths = [60, 75, 90, 105, 60, 90, 80, 70, 20];

    const drawRow = (items: string[], y: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      items.forEach((text, i) => {
        doc.text(text, cols[i], y, { width: colWidths[i], ellipsis: true });
      });
    };

    const headerY = doc.y;
    doc.rect(35, headerY - 2, 725, 14).fill('#e2e8f0').stroke('#e2e8f0');
    doc.fillColor('black');
    drawRow(headers, headerY, true);
    doc.moveDown(0.8);

    expenses.forEach((e, idx) => {
      if (doc.y > 520) {
        doc.addPage({ size: 'LETTER', layout: 'landscape' });
        const hy = doc.y;
        doc.rect(35, hy - 2, 725, 14).fill('#e2e8f0').stroke('#e2e8f0');
        doc.fillColor('black');
        drawRow(headers, hy, true);
        doc.moveDown(0.8);
      }
      const rowY = doc.y;
      if (idx % 2 === 1) {
        doc.rect(35, rowY - 1, 725, 12).fill('#f8fafc').stroke('#f8fafc');
        doc.fillColor('black');
      }
      drawRow(
        [
          e.date.toISOString().split('T')[0],
          e.familyMember.name,
          e.category.name,
          e.provider,
          `$${Number(e.amount).toFixed(2)}`,
          e.paymentMethod === 'OUT_OF_POCKET' ? 'Out-of-Pocket' : 'Direct HSA',
          e.reimbursementStatus,
          e.reimbursementDate ? e.reimbursementDate.toISOString().split('T')[0] : '',
          String(e.receipts.length),
        ],
        rowY,
      );
      doc.moveDown(0.6);
    });

    doc.moveDown();
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    doc.font('Helvetica-Bold').fontSize(9).text(`Total Expenses: $${total.toFixed(2)}`, { align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single expense
router.get('/:id', async (req, res) => {
  try {
    const expense = await db.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        familyMember: true,
        category: true,
        receipts: true,
      },
    });
    if (!expense) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(expense);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create expense
router.post('/', async (req, res) => {
  try {
    const data = expenseSchema.parse(req.body);

    const [member, category] = await Promise.all([
      db.familyMember.findFirst({ where: { id: data.familyMemberId, userId: req.user.id } }),
      db.category.findFirst({
        where: { id: data.categoryId, OR: [{ userId: null }, { userId: req.user.id }] },
      }),
    ]);

    if (!member) {
      res.status(400).json({ error: 'Invalid family member' });
      return;
    }
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    if (data.paymentMethod === 'DIRECT_HSA' && data.reimbursementStatus !== 'NA') {
      res.status(400).json({ error: 'Direct HSA payments must have reimbursement status N/A' });
      return;
    }

    const expense = await db.expense.create({
      data: {
        userId: req.user.id,
        familyMemberId: data.familyMemberId,
        categoryId: data.categoryId,
        date: new Date(data.date),
        provider: data.provider,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        reimbursementStatus: data.reimbursementStatus,
        reimbursementDate: data.reimbursementDate ? new Date(data.reimbursementDate) : null,
        notes: data.notes ?? null,
      },
      include: { familyMember: true, category: true, receipts: true },
    });
    res.status(201).json(expense);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update expense
router.put('/:id', async (req, res) => {
  try {
    const existing = await db.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const data = expenseSchema.parse(req.body);

    if (data.paymentMethod === 'DIRECT_HSA' && data.reimbursementStatus !== 'NA') {
      res.status(400).json({ error: 'Direct HSA payments must have reimbursement status N/A' });
      return;
    }

    const expense = await db.expense.update({
      where: { id: req.params.id },
      data: {
        familyMemberId: data.familyMemberId,
        categoryId: data.categoryId,
        date: new Date(data.date),
        provider: data.provider,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        reimbursementStatus: data.reimbursementStatus,
        reimbursementDate: data.reimbursementDate ? new Date(data.reimbursementDate) : null,
        notes: data.notes ?? null,
      },
      include: { familyMember: true, category: true, receipts: true },
    });
    res.json(expense);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const expense = await db.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { receipts: true },
    });
    if (!expense) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    await Promise.all(expense.receipts.map((r) => deleteFile(r.fileKey).catch(() => {})));

    await db.expense.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk mark as reimbursed
router.post('/bulk-reimburse', async (req, res) => {
  try {
    const { ids, reimbursementDate } = z
      .object({
        ids: z.array(z.string().cuid()).min(1),
        reimbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);

    const result = await db.expense.updateMany({
      where: {
        id: { in: ids },
        userId: req.user.id,
        paymentMethod: 'OUT_OF_POCKET',
        reimbursementStatus: 'PENDING',
      },
      data: {
        reimbursementStatus: 'REIMBURSED',
        reimbursementDate: new Date(reimbursementDate),
      },
    });

    res.json({ updated: result.count });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
