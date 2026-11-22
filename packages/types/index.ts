// Shared TypeScript types across backend, dashboard, and installer.

export type Role = 'platform_admin' | 'dealer_admin' | 'dealer_staff' | 'dealer_customer' | 'service_tech';

export interface TokenPayload {
  user_id: string;
  dealer_id: string | null;
  role: Role;
  session_id: string;
}

export interface Dealer {
  id: string;
  slug: string;
  name: string;
  gstin?: string | null;
  address: Record<string, any>;
  contact: Record<string, any>;
  website_url?: string | null;
  ecommerce_type?: string | null;
  specializations: string[];
  ai_enabled: boolean;
  local_ai_enabled: boolean;
  status: 'active' | 'suspended' | 'trial';
  created_at: string;
}

export interface DealerUser {
  id: string;
  dealer_id: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: Role;
    dealer_id: string;
    dealer_name?: string;
  };
}
