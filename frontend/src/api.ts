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
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (name: string, password: string, rememberMe: boolean) =>
    apiFetch<User>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, rememberMe }),
    }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<User>('/auth/me'),

  getTasks: (params?: { scope?: 'personal'; householdId?: string }) => {
    const qs = params?.scope
      ? `?scope=${params.scope}`
      : params?.householdId
      ? `?householdId=${params.householdId}`
      : '';
    return apiFetch<Task[]>(`/tasks${qs}`);
  },

  createTask: (data: { name: string; intervalHours: number; householdId?: string }) =>
    apiFetch<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: Partial<{ name: string; intervalHours: number }>) =>
    apiFetch<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteTask: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),

  completeTask: (id: string) => apiFetch<Task>(`/tasks/${id}/complete`, { method: 'POST' }),

  subscribe: (subscription: PushSubscriptionJSON) =>
    apiFetch<void>('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }),

  getHouseholds: () => apiFetch<Household[]>('/households'),

  createHousehold: (name: string) =>
    apiFetch<Household>('/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteHousehold: (id: string) => apiFetch<void>(`/households/${id}`, { method: 'DELETE' }),

  getMembers: (householdId: string) => apiFetch<Member[]>(`/households/${householdId}/members`),

  generateInvite: (householdId: string) =>
    apiFetch<{ url: string }>(`/households/${householdId}/invites`, { method: 'POST' }),

  acceptMember: (householdId: string, userId: string) =>
    apiFetch<Member>(`/households/${householdId}/members/${userId}/accept`, { method: 'POST' }),

  removeMember: (householdId: string, userId: string) =>
    apiFetch<void>(`/households/${householdId}/members/${userId}`, { method: 'DELETE' }),

  getInviteInfo: (token: string) => apiFetch<InviteInfo>(`/invite/${token}`),

  joinViaInvite: (token: string) =>
    apiFetch<{ status: string }>(`/invite/${token}/join`, { method: 'POST' }),
};
