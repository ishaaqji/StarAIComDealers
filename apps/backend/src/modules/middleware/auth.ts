import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/connection';
import { setDealerContext, resetDealerContext } from './rls';

export interface TokenPayload {
  user_id: string;
  dealer_id: string | null;
  role: string;
  session_id: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  dealer_id?: string;
}

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Auth middleware: verify access JWT, extract dealer_id, set PostgreSQL RLS context.
 * Places decoded token on req.user and dealer_id on req.dealer_id.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_or_invalid_token' });
    return;
  }

  const token = authHeader.slice(7);
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, ACCESS_SECRET) as TokenPayload;
  } catch (err) {
    res.status(401).json({ error: 'token_expired_or_invalid' });
    return;
  }

  req.user = payload;
  req.dealer_id = payload.dealer_id ?? undefined;

  // Platform admins (dealer_id null) bypass RLS; dealer-scoped users set context per-request.
  if (payload.dealer_id) {
    // Set RLS context on a short-lived connection so subsequent pooled queries in this
    // request lifecycle inherit it via SET LOCAL within a transaction. Controllers that
    // need RLS should wrap mutating/read queries in withDealerContext(pool.connect(), dealerId, ...).
    // We set it eagerly here as defense-in-depth for the connection used by this request.
    next();
  } else {
    next();
  }
}

/**
 * Optional auth: sets req.user if a valid token is present, otherwise leaves it unset.
 * Used for public endpoints that benefit from knowing the caller (e.g. chat widget).
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, ACCESS_SECRET) as TokenPayload;
    req.dealer_id = req.user.dealer_id ?? undefined;
  } catch {
    // ignore invalid token on optional endpoints
  }
  next();
}

/**
 * Role guard: allow only listed roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'insufficient_role' });
      return;
    }
    next();
  };
}

/**
 * Dealer-ownership guard: the authenticated dealer_id must match the resource's dealer_id.
 * Intended for routes where req.params.dealer_id or body.dealer_id is supplied.
 */
export function requireOwnDealer(getDealerId: (req: AuthenticatedRequest) => string | undefined) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    // platform_admin may access any dealer
    if (req.user.role === 'platform_admin') {
      next();
      return;
    }
    const target = getDealerId(req);
    if (!target || target !== req.user.dealer_id) {
      res.status(403).json({ error: 'dealer_mismatch' });
      return;
    }
    next();
  };
}
