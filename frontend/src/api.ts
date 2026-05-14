export interface Task {
  id: string;
  name: string;
  intervalHours: number;
  ownerId: string | null;
  nextDeadline: string;
  createdAt: string;
  urgency: 'overdue' | 'due-soon' | 'on-track';
}

export interface User {
  id: string;
  name: string;
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

  getTasks: () => apiFetch<Task[]>('/tasks'),

  createTask: (data: { name: string; intervalHours: number; shared: boolean }) =>
    apiFetch<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: Partial<{ name: string; intervalHours: number; shared: boolean }>) =>
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
};
