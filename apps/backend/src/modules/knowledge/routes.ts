import { Router } from 'express';
import {
  createDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  searchKnowledge,
  queryKnowledge,
} from './controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Document management
router.post('/documents', createDocument);
router.get('/documents', listDocuments);
router.get('/documents/:id', getDocument);
router.delete('/documents/:id', deleteDocument);

// Search & RAG
router.get('/search', searchKnowledge);
router.post('/query', queryKnowledge);

export default router;
