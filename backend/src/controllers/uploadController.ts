import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';

export function uploadResult(req: AuthRequest, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'Файл не выбран' });
  const isImage = req.file.mimetype.startsWith('image/');
  const requestedKind = typeof req.body.kind === 'string' ? req.body.kind : 'attachment';
  if (requestedKind === 'avatar' && !isImage) {
    return res.status(400).json({ error: 'Для аватарки можно выбрать только изображение' });
  }
  return res.status(201).json({
    file: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      type: isImage ? 'image' : 'file',
    },
  });
}
