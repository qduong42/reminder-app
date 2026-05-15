export interface Task {
  id: string;
  name: string;
  intervalHours: number;
  ownerId: string | null;
  householdId: string | null;
  nextDeadline: string;
  createdAt: string;
  urgency: 'overdue' | 'due-soon' | 'on-track';
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'active';
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  status: 'pending' | 'active';
  invitedById: string | null;
  createdAt: string;
}

export interface InviteInfo {
  householdName: string;
  expiresAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...options });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* response had no JSON body */ }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (usernameOrEmail: string, password: string, rememberMe: boolean) =>
    apiFetch<User>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password, rememberMe }),
    }),

  register: (data: { username: string; email: string; password: string }) =>
    apiFetch<{ id: string; username: string; email: string }>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  forgotPassword: (email: string) =>
    apiFetch<void>('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<void>(`/api/auth/reset-password/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    }),

  getAccount: () => apiFetch<{ id: string; username: string; email: string }>('/api/account'),

  updateIdentity: (data: { username: string; email: string; currentPassword: string }) =>
    apiFetch<{ id: string; username: string; email: string }>('/api/account/identity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updatePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiFetch<void>('/api/account/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteAccount: (currentPassword: string) =>
    apiFetch<void>('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword }),
    }),

  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch<User>('/api/auth/me'),

  getTasks: (params?: { scope?: 'personal'; householdId?: string }) => {
    const qs = params?.scope
      ? `?scope=${params.scope}`
      : params?.householdId
      ? `?householdId=${params.householdId}`
      : '';
    return apiFetch<Task[]>(`/api/tasks${qs}`);
  },

  createTask: (data: { name: string; intervalHours: number; householdId?: string }) =>
    apiFetch<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: Partial<{ name: string; intervalHours: number }>) =>
    apiFetch<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteTask: (id: string) => apiFetch<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  completeTask: (id: string) => apiFetch<Task>(`/api/tasks/${id}/complete`, { method: 'POST' }),

  subscribe: (subscription: PushSubscriptionJSON) =>
    apiFetch<void>('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }),

  getHouseholds: () => apiFetch<Household[]>('/api/households'),

  createHousehold: (name: string) =>
    apiFetch<Household>('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteHousehold: (id: string) => apiFetch<void>(`/api/households/${id}`, { method: 'DELETE' }),

  getMembers: (householdId: string) => apiFetch<Member[]>(`/api/households/${householdId}/members`),

  generateInvite: (householdId: string) =>
    apiFetch<{ url: string }>(`/api/households/${householdId}/invites`, { method: 'POST' }),

  acceptMember: (householdId: string, userId: string) =>
    apiFetch<Member>(`/api/households/${householdId}/members/${userId}/accept`, { method: 'POST' }),

  removeMember: (householdId: string, userId: string) =>
    apiFetch<void>(`/api/households/${householdId}/members/${userId}`, { method: 'DELETE' }),

  getInviteInfo: (token: string) => apiFetch<InviteInfo>(`/api/invite/${token}`),

  joinViaInvite: (token: string) =>
    apiFetch<{ status: string }>(`/api/invite/${token}/join`, { method: 'POST' }),
};
