// ApplyRecall Dashboard API Client

const API_BASE = typeof window !== 'undefined' ? '/api' : 'http://127.0.0.1:8000/api';

const DEFAULT_AUTH_HEADER = {
  'Authorization': 'Bearer 00000000-0000-0000-0000-000000000001',
  'Content-Type': 'application/json'
};

async function fetcher<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...DEFAULT_AUTH_HEADER,
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `HTTP Error ${response.status}`);
  }

  return response.json();
}

// Dashboard
export const api = {
  getSummary: () => fetcher<any>('/dashboard/summary'),
  getActivity: () => fetcher<any[]>('/dashboard/activity'),

  // Applications
  getApplications: (params?: { search?: string; status?: string; source?: string; sort?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetcher<any[]>(`/applications${query ? `?${query}` : ''}`);
  },
  getApplication: (id: string) => fetcher<any>(`/applications/${id}`),
  createApplication: (data: any) => fetcher<any>('/applications', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateApplication: (id: string, data: any) => fetcher<any>(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteApplication: (id: string) => fetcher<any>(`/applications/${id}`, {
    method: 'DELETE'
  }),
  confirmApplied: (id: string, createReminder = true, reminderDays = 7) => fetcher<any>(`/applications/${id}/confirm-applied`, {
    method: 'POST',
    body: JSON.stringify({ create_reminder: createReminder, reminder_days: reminderDays })
  }),
  getFollowUpDraft: (id: string, data?: { hr_email?: string; recipient_name?: string; notes?: string }) =>
    fetcher<any>(`/applications/${id}/followup-draft`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),

  // Answers
  getAnswers: (params?: { scope?: string; search?: string; company?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetcher<any[]>(`/answers${query ? `?${query}` : ''}`);
  },
  createAnswer: (data: any) => fetcher<any>('/answers', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateAnswer: (id: string, data: any) => fetcher<any>(`/answers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  deleteAnswer: (id: string) => fetcher<any>(`/answers/${id}`, {
    method: 'DELETE'
  }),

  // Profile
  getProfile: () => fetcher<any>('/profile'),
  updateProfile: (data: any) => fetcher<any>('/profile', {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  addExperience: (data: any) => fetcher<any>('/profile/experiences', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteExperience: (id: string) => fetcher<any>(`/profile/experiences/${id}`, {
    method: 'DELETE'
  }),
  addProject: (data: any) => fetcher<any>('/profile/projects', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteProject: (id: string) => fetcher<any>(`/profile/projects/${id}`, {
    method: 'DELETE'
  }),
  exportData: () => fetcher<any>('/profile/export'),

  // Reminders
  getReminders: (params?: { status?: string; tab?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetcher<any[]>(`/reminders${query ? `?${query}` : ''}`);
  },
  createReminder: (data: any) => fetcher<any>('/reminders', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateReminder: (id: string, data: any) => fetcher<any>(`/reminders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  snoozeReminder: (id: string, days = 1) => fetcher<any>(`/reminders/${id}/snooze?days=${days}`, {
    method: 'POST'
  }),
  deleteReminder: (id: string) => fetcher<any>(`/reminders/${id}`, {
    method: 'DELETE'
  }),
  checkRemindersNow: () => fetcher<any>('/reminders/check-now', {
    method: 'POST'
  }),

  // Pairing & Auth
  generatePairingCode: (deviceType: 'extension' | 'telegram') => fetcher<any>('/auth/pair/generate', {
    method: 'POST',
    body: JSON.stringify({ device_type: deviceType })
  }),
  verifyPairingCode: (code: string, deviceType: 'extension' | 'telegram') => fetcher<any>('/auth/pair/verify', {
    method: 'POST',
    body: JSON.stringify({ code, device_type: deviceType })
  }),

  // Telegram simulation
  simulateTelegram: (text: string, chatId = 'sim_test_user') => fetcher<any>('/telegram/simulate', {
    method: 'POST',
    body: JSON.stringify({ text, chat_id: chatId })
  })
};
