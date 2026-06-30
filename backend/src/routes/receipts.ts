import { Router } from 'express';
import multer from 'multer';
import { db } from '../lib/db';
import { uploadFile, getSignedUrl, deleteFile } from '../lib/minio';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, PNG, and WEBP files are allowed'));
    }
  },
});

// Upload receipt(s) to an expense
router.post('/expenses/:expenseId', upload.array('files', 10), async (req, res) => {
  try {
    const expense = await db.expense.findFirst({
      where: { id: req.params.expenseId, userId: req.user.id },
    });
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const receipts = await Promise.all(
      files.map(async (file) => {
        const receipt = await db.receipt.create({
          data: {
            expenseId: expense.id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileKey: '',
            fileSize: file.size,
          },
        });

        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
        const fileKey = `${req.user.id}/${expense.id}/${receipt.id}_${safeName}`;
        try {
          await uploadFile(fileKey, file.buffer, file.mimetype);
        } catch (uploadErr) {
          await db.receipt.delete({ where: { id: receipt.id } }).catch(() => {});
          throw uploadErr;
        }

        return db.receipt.update({
          where: { id: receipt.id },
          data: { fileKey },
        });
      }),
    );

    res.status(201).json(receipts);
  } catch (err: unknown) {
    if (err instanceof multer.MulterError || (err instanceof Error && err.message.includes('Only'))) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get signed URL for a receipt
router.get('/:id/url', async (req, res) => {
  try {
    const receipt = await db.receipt.findFirst({
      where: { id: req.params.id },
      include: { expense: { select: { userId: true } } },
    });

    if (!receipt || receipt.expense.userId !== req.user.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    const url = await getSignedUrl(receipt.fileKey, 3600);
    res.json({ url, fileName: receipt.fileName, mimeType: receipt.mimeType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a receipt
router.delete('/:id', async (req, res) => {
  try {
    const receipt = await db.receipt.findFirst({
      where: { id: req.params.id },
      include: { expense: { select: { userId: true } } },
    });

    if (!receipt || receipt.expense.userId !== req.user.id) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    await deleteFile(receipt.fileKey).catch(() => {});
    await db.receipt.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
