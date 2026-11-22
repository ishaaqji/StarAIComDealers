import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { withDealerContext } from '../middleware/rls';
import { categorySchema, productSchema, paginationSchema } from './schema';

type Category = {
  id: string;
  dealer_id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  icon?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type Product = {
  id: string;
  dealer_id: string;
  sku: string;
  name: string;
  brand?: string | null;
  category_id?: string | null;
  description?: string | null;
  specs: any;
  images: string[];
  purchase_price?: number | null;
  selling_price: number;
  mrp?: number | null;
  stock_qty: number;
  warranty_months: number;
  product_url?: string | null;
  tags: string[];
  status: string;
  ai_featured: boolean;
  created_at: string;
  updated_at: string;
};

/* ---------- Categories ---------- */

export async function listCategories(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, dealer_id, name, slug, parent_id, icon, sort_order, created_at, updated_at
         FROM product_categories
         WHERE dealer_id = $1
         ORDER BY sort_order ASC, name ASC`,
        [dealerId]
      );
      // Build tree
      const byId = new Map<string, Category & { children: Category[] }>();
      const roots: Category[] = [];
      for (const r of rows) {
        byId.set(r.id, { ...r, children: [] });
      }
      for (const r of rows) {
        const cat = byId.get(r.id)!;
        if (r.parent_id && byId.has(r.parent_id)) {
          byId.get(r.parent_id)!.children.push(cat);
        } else {
          roots.push(cat);
        }
      }
      res.json(roots);
    });
  } finally {
    client.release();
  }
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO product_categories (dealer_id, name, slug, parent_id, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, dealer_id, name, slug, parent_id, icon, sort_order, created_at, updated_at`,
        [
          dealerId,
          parsed.data.name,
          parsed.data.slug,
          parsed.data.parent_id ?? null,
          parsed.data.icon ?? null,
          parsed.data.sort_order,
        ]
      );
      res.status(201).json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const categoryId = req.params.id;
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const sets: string[] = [];
      const params: unknown[] = [dealerId, categoryId];
      let idx = 3;
      const d = parsed.data;
      if (d.name !== undefined) { sets.push(`name = $${idx++}`); params.push(d.name); }
      if (d.slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(d.slug); }
      if (d.parent_id !== undefined) { sets.push(`parent_id = $${idx++}`); params.push(d.parent_id ?? null); }
      if (d.icon !== undefined) { sets.push(`icon = $${idx++}`); params.push(d.icon ?? null); }
      if (d.sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(d.sort_order); }
      if (sets.length === 0) {
        res.status(400).json({ error: 'nothing_to_update' });
        return;
      }
      sets.push(`updated_at = now()`);
      const { rows } = await c.query(
        `UPDATE product_categories SET ${sets.join(', ')} WHERE dealer_id = $1 AND id = $2 RETURNING id, dealer_id, name, slug, parent_id, icon, sort_order, created_at, updated_at`,
        params
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'category_not_found' });
        return;
      }
      res.json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const categoryId = req.params.id;
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rowCount } = await c.query(
        'DELETE FROM product_categories WHERE dealer_id = $1 AND id = $2 AND id NOT IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)',
        [dealerId, categoryId]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: 'category_not_found_or_in_use' });
        return;
      }
      res.status(204).end();
    });
  } finally {
    client.release();
  }
}

/* ---------- Products ---------- */

export async function listProducts(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const { page, limit, search, category_id, status, min_stock } = parsed.data;
  const offset = (page - 1) * limit;

  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const conditions: string[] = [`dealer_id = $1`];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (search) {
        conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }
      if (category_id) {
        conditions.push(`category_id = $${idx}`);
        params.push(category_id);
        idx++;
      }
      if (status) {
        conditions.push(`status = $${idx}`);
        params.push(status);
        idx++;
      }
      if (min_stock !== undefined) {
        conditions.push(`stock_qty >= $${idx}`);
        params.push(min_stock);
        idx++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { rows: data } = await c.query(
        `SELECT id, dealer_id, sku, name, brand, category_id, description, specs, images,
                purchase_price, selling_price, mrp, stock_qty, warranty_months,
                product_url, tags, status, ai_featured, created_at, updated_at
         FROM products
         ${where}
         ORDER BY created_at DESC
         LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`,
        params
      );
      const { rows: countRows } = await c.query(
        `SELECT COUNT(*)::int FROM products ${where}`,
        params
      );
      const total = countRows[0].count;
      res.json({
        data,
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      });
    });
  } finally {
    client.release();
  }
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO products (dealer_id, sku, name, brand, category_id, description, specs, images,
                  purchase_price, selling_price, mrp, stock_qty, warranty_months,
                  product_url, tags, status, ai_featured)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id, dealer_id, sku, name, brand, category_id, description, specs, images,
                   purchase_price, selling_price, mrp, stock_qty, warranty_months,
                   product_url, tags, status, ai_featured, created_at, updated_at`,
        [
          dealerId,
          parsed.data.sku,
          parsed.data.name,
          parsed.data.brand ?? null,
          parsed.data.category_id ?? null,
          parsed.data.description ?? null,
          JSON.stringify(parsed.data.specs),
          parsed.data.images,
          parsed.data.purchase_price ?? null,
          parsed.data.selling_price,
          parsed.data.mrp ?? null,
          parsed.data.stock_qty,
          parsed.data.warranty_months,
          parsed.data.product_url ?? null,
          parsed.data.tags,
          parsed.data.status,
          parsed.data.ai_featured,
        ]
      );
      res.status(201).json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const productId = req.params.id;
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, dealer_id, sku, name, brand, category_id, description, specs, images,
                  purchase_price, selling_price, mrp, stock_qty, warranty_months,
                  product_url, tags, status, ai_featured, created_at, updated_at
         FROM products WHERE dealer_id = $1 AND id = $2`,
        [dealerId, productId]
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'product_not_found' });
        return;
      }
      res.json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const productId = req.params.id;
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_failed', details: parsed.error.flatten() });
    return;
  }
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const sets: string[] = [];
      const params: unknown[] = [dealerId, productId];
      let idx = 3;
      const d = parsed.data;
      const setField = (val: unknown, sql: string) => {
        if (val !== undefined) { sets.push(`${sql} = $${idx++}`); params.push(val); }
      };
      setField(d.sku, 'sku');
      setField(d.name, 'name');
      setField(d.brand, 'brand');
      setField(d.category_id, 'category_id');
      setField(d.description, 'description');
      if (d.specs !== undefined) { sets.push(`specs = $${idx++}`); params.push(JSON.stringify(d.specs)); }
      if (d.images !== undefined) { sets.push(`images = $${idx++}`); params.push(d.images); }
      setField(d.purchase_price, 'purchase_price');
      setField(d.selling_price, 'selling_price');
      setField(d.mrp, 'mrp');
      setField(d.stock_qty, 'stock_qty');
      setField(d.warranty_months, 'warranty_months');
      setField(d.product_url, 'product_url');
      if (d.tags !== undefined) { sets.push(`tags = $${idx++}`); params.push(d.tags); }
      setField(d.status, 'status');
      if (d.ai_featured !== undefined) { sets.push(`ai_featured = $${idx++}`); params.push(d.ai_featured); }
      if (sets.length === 0) {
        res.status(400).json({ error: 'nothing_to_update' });
        return;
      }
      sets.push(`updated_at = now()`);
      const { rows } = await c.query(
        `UPDATE products SET ${sets.join(', ')} WHERE dealer_id = $1 AND id = $2 RETURNING id, dealer_id, sku, name, brand, category_id, description, specs, images,
                  purchase_price, selling_price, mrp, stock_qty, warranty_months,
                  product_url, tags, status, ai_featured, created_at, updated_at`,
        params
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'product_not_found' });
        return;
      }
      res.json(rows[0]);
    });
  } finally {
    client.release();
  }
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const dealerId = (req as any).user?.dealer_id;
  if (!dealerId) {
    res.status(403).json({ error: 'dealer_scoped_required' });
    return;
  }
  const productId = req.params.id;
  const client = await pool.connect();
  try {
    await withDealerContext(client, dealerId, async (c) => {
      const { rowCount } = await c.query(
        'UPDATE products SET status = $3, updated_at = now() WHERE dealer_id = $1 AND id = $2',
        [dealerId, productId, 'discontinued']
      );
      if (rowCount === 0) {
        res.status(404).json({ error: 'product_not_found' });
        return;
      }
      res.status(204).end();
    });
  } finally {
    client.release();
  }
}

export default {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
};
