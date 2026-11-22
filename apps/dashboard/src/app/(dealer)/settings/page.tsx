'use client';

import { useEffect, useState, useCallback } from 'react';

type Dealer = {
  id: string;
  slug: string;
  name: string;
  gstin?: string | null;
  address: any;
  contact: any;
  website_url?: string | null;
  ecommerce_type?: string | null;
  specializations: string[];
  ai_enabled: boolean;
  local_ai_enabled: boolean;
  status: string;
  branding: any;
  settings: any;
};

type Staff = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
};

export default function SettingsPage() {
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'branding' | 'settings' | 'staff'>('profile');
  const [saving, setSaving] = useState(false);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;

  const fetchDealer = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [dRes, sRes] = await Promise.all([
        fetch('/api/dealers/me', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/dealers/me/users', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const dealerData = await dRes.json();
      const staffData = await sRes.json();
      setDealer(dealerData);
      setStaff(Array.isArray(staffData) ? staffData : []);
    } catch {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDealer();
  }, [fetchDealer]);

  const updateField = async (path: string, body: any) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dealers/${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchDealer();
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const inviteStaff = async (email: string, role: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/dealers/me/users/invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) throw new Error('Invite failed');
      await fetchDealer();
    } catch {
      setError('Failed to invite staff.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10">Loading...</div>;
  if (error) return <div className="py-10 text-red-600">{error}</div>;
  if (!dealer) return <div className="py-10">Not found</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dealer Settings</h1>
        <p className="text-muted-foreground">{dealer.name} &nbsp;·&nbsp; {dealer.slug}</p>
      </div>

      <div className="flex gap-2 mb-6">
        {['profile', 'branding', 'settings', 'staff'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-stellar-50 text-stellar-700 border border-stellar-200'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="bg-card border border-border p-6 rounded-xl mb-6">
          <h2 className="text-sm font-semibold mb-4">Business Profile</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            updateField('me', {
              name: form.get('name'),
              slug: form.get('slug'),
              gstin: form.get('gstin'),
              website_url: form.get('website_url'),
              ecommerce_type: form.get('ecommerce_type'),
              specializations: (form.get('specializations') as string).split(',').map((s) => s.trim()).filter(Boolean),
              ai_enabled: form.get('ai_enabled') === 'on',
              local_ai_enabled: form.get('local_ai_enabled') === 'on',
              status: form.get('status'),
            });
          }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input name="name" defaultValue={dealer.name} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <input name="slug" defaultValue={dealer.slug} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">GSTIN</label>
              <input name="gstin" defaultValue={dealer.gstin ?? ''} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Website URL</label>
              <input name="website_url" defaultValue={dealer.website_url ?? ''} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">E-commerce Type</label>
              <select name="ecommerce_type" className="w-full rounded-md border border-border px-3 py-2">
                <option value="none">None</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="shopify">Shopify</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Specializations</label>
              <input name="specializations" defaultValue={dealer.specializations.join(', ')} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="ai_enabled" type="checkbox" defaultChecked={dealer.ai_enabled} /> AI Enabled
              </label>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="local_ai_enabled" type="checkbox" defaultChecked={dealer.local_ai_enabled} /> Local AI Enabled
              </label>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select name="status" className="w-full rounded-md border border-border px-3 py-2">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="trial">Trial</option>
              </select>
            </div>
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="w-auto bg-stellar-600 px-4 py-2 rounded-md text-white hover:bg-stellar-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="bg-card border border-border p-6 rounded-xl mb-6">
          <h2 className="text-sm font-semibold mb-4">Branding</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            updateField('me/branding', {
              logo_url: form.get('logo_url') || null,
              primary_color: form.get('primary_color'),
              tagline: form.get('tagline') || null,
            });
          }} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Logo URL</label>
              <input name="logo_url" defaultValue={dealer.branding?.logo_url ?? ''} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Primary Color</label>
              <input name="primary_color" type="color" defaultValue={dealer.branding?.primary_color ?? '#3B82F6'} className="w-full h-10 rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tagline</label>
              <input name="tagline" defaultValue={dealer.branding?.tagline ?? ''} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <button type="submit" disabled={saving} className="w-auto bg-stellar-600 px-4 py-2 rounded-md text-white hover:bg-stellar-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-card border border-border p-6 rounded-xl mb-6">
          <h2 className="text-sm font-semibold mb-4">AI Settings</h2>
          <p className="text-sm text-muted-foreground mb-4">
            AI provider and feature flags for this dealer.
          </p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const settings = dealer.settings?.settings || {};
            updateField('me/settings', {
              ai_config: {
                provider: form.get('provider'),
                model: form.get('model'),
                temperature: Number(form.get('temperature')),
              },
              feature_flags: {
                catalog: form.get('catalog') === 'on',
                chat: form.get('chat') === 'on',
                recommendations: form.get('recommendations') === 'on',
                local_ai: form.get('local_ai') === 'on',
              },
              ...settings,
            });
          }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">AI Provider</label>
              <select name="provider" defaultValue={settings.ai_config?.provider ?? 'ollama'} className="w-full rounded-md border border-border px-3 py-2">
                <option value="ollama">Ollama (local)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <input name="model" defaultValue={settings.ai_config?.model ?? 'llama3.2:3b-instruct-q4_0'} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Temperature</label>
              <input name="temperature" type="number" step="0.1" min="0" max="2" defaultValue={settings.ai_config?.temperature ?? 0.3} className="w-full rounded-md border border-border px-3 py-2" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="catalog" type="checkbox" defaultChecked={settings.feature_flags?.catalog !== false} /> Catalog
              </label>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="chat" type="checkbox" defaultChecked={settings.feature_flags?.chat !== false} /> AI Chat
              </label>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="recommendations" type="checkbox" defaultChecked={settings.feature_flags?.recommendations !== false} /> Recommendations
              </label>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input name="local_ai" type="checkbox" defaultChecked={settings.feature_flags?.local_ai === true} /> Local AI
              </label>
            </div>
            <div className="col-span-2">
              <button type="submit" disabled={saving} className="w-auto bg-stellar-600 px-4 py-2 rounded-md text-white hover:bg-stellar-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="bg-card border border-border p-6 rounded-xl mb-6">
          <h2 className="text-sm font-semibold mb-4">Staff</h2>
          <div className="flex gap-2 mb-4">
            <input id="invite-email" type="email" placeholder="email@example.com" className="flex-1 rounded-md border border-border px-3 py-2" />
            <select id="invite-role" className="rounded-md border border-border px-3 py-2">
              <option value="dealer_staff">Staff</option>
              <option value="dealer_admin">Admin</option>
              <option value="service_tech">Service Tech</option>
            </select>
            <button
              onClick={() => {
                const email = (document.getElementById('invite-email') as HTMLInputElement).value;
                const role = (document.getElementById('invite-role') as HTMLSelectElement).value;
                inviteStaff(email, role);
              }}
              disabled={saving}
              className="bg-stellar-600 px-4 py-2 rounded-md text-white hover:bg-stellar-700 disabled:opacity-50"
            >
              {saving ? 'Inviting...' : 'Invite'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-muted-foreground">Email</th>
                  <th className="text-left pb-2 text-muted-foreground">Role</th>
                  <th className="text-left pb-2 text-muted-foreground">Status</th>
                  <th className="text-left pb-2 text-muted-foreground">Joined</th>
                  <th className="text-right pb-2 text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className="py-2">{s.email}</td>
                    <td className="py-2">{s.role}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${s.status === 'active' ? 'bg-green-100 text-green-700' : s.status === 'invited' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="py-2 text-right">
                      {s.role !== 'dealer_admin' && (
                        <button
                          onClick={() => fetch('/api/dealers/me/users/' + s.id, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).then(fetchDealer)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
