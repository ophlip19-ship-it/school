const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('schoolrun_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('schoolrun_token', token);
  else localStorage.removeItem('schoolrun_token');
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Invalid response' };
  }

  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const authApi = {
  register: (body) => api('/auth/register', { method: 'POST', body }),
  login: (body) => api('/auth/login', { method: 'POST', body }),
  me: () => api('/auth/me'),
  updateMe: (body) => api('/auth/me', { method: 'PATCH', body }),
  verify: () => api('/auth/verify', { method: 'POST', body: {} }),
};

export const childrenApi = {
  list: () => api('/children'),
  create: (body) => api('/children', { method: 'POST', body }),
  update: (id, body) => api(`/children/${id}`, { method: 'PATCH', body }),
};

export const ridesApi = {
  list: () => api('/rides'),
  available: () => api('/rides/available'),
  active: () => api('/rides/active'),
  get: (id) => api(`/rides/${id}`),
  create: (body) => api('/rides', { method: 'POST', body }),
  accept: (id) => api(`/rides/${id}/accept`, { method: 'POST', body: {} }),
  setStatus: (id, status) => api(`/rides/${id}/status`, { method: 'PATCH', body: { status } }),
};

export const paymentsApi = {
  config: () => api('/payments/config'),
  createIntent: (rideId) => api('/payments/create-intent', { method: 'POST', body: { rideId } }),
  confirmDemo: (body) => api('/payments/confirm-demo', { method: 'POST', body }),
  confirmStripe: (body) => api('/payments/confirm-stripe', { method: 'POST', body }),
};

export const chatApi = {
  messages: (rideId) => api(`/chat/${rideId}/messages`),
  send: (rideId, body) => api(`/chat/${rideId}/messages`, { method: 'POST', body: { body } }),
};

export const adminApi = {
  stats: () => api('/admin/stats'),
};

export function formatMoney(cents, currency = 'NGN') {
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency.toUpperCase() === 'NGN' ? 'NGN' : currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString()}`;
  }
}
