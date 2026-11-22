'use client';

import { useEffect, useState } from 'react';

export default function DealerHome() {
  const [dealer, setDealer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      window.location.href = '/';
      return;
    }
    fetch('/api/dealers/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/';
          return null;
        }
        return res.json();
      })
      .then((data) => {
        setDealer(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load dealer profile.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="py-10">Loading...</div>;
  if (error) return <div className="py-10 text-red-600">{error}</div>;
  if (!dealer) return <div className="py-10">Not found</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        Welcome back, {dealer.name} ({dealer.slug})
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Products', value: '—', sub: 'Catalog not yet built (Step 2)' },
          { label: 'Active customers', value: '—', sub: 'CRM coming in Step 7' },
          { label: 'Orders this month', value: '—', sub: 'Commerce in Step 3' },
        ].map((card) => (
          <div key={card.label} className="bg-card border border-border p-6 rounded-xl">
            <div className="text-sm font-medium text-muted-foreground">{card.label}</div>
            <div className="mt-2 text-2xl font-bold">{card.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-card border border-border p-6 rounded-xl">
        <h2 className="text-sm font-semibold mb-4">Next steps (per §20)</h2>
        <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
          <li>✅ Step 0: Foundation (repo, Docker Compose, migrations, JWT, RLS, seed Shweta Computers)</li>
          <li className="text-stellar-600">⏳ Step 1: Dealer Profile (profile/branding APIs, staff invite)</li>
          <li className="text-muted-foreground">Step 2: Product Catalog</li>
          <li className="text-muted-foreground">Step 3: WooCommerce Connector</li>
          <li className="text-muted-foreground">Step 4–10: Knowledge Base, AI Chat, Recommendations, CRM, Rewards, Local AI, Pilot</li>
        </ul>
      </div>
    </div>
  );
}
