import { apiRequest, buildQuery } from './http.js';
export const listNotifications = (params) => apiRequest(`/api/notifications?${buildQuery(params)}`);
export const readNotification = (id) => apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
export const readAllNotifications = () => apiRequest('/api/notifications/read-all', { method: 'POST' });
