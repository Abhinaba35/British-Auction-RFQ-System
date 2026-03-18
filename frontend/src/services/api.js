import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rfq_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});


api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rfq_token');
      localStorage.removeItem('rfq_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authService = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

export const rfqService = {
  create: (data) => api.post('/rfqs', data),
  getAll: (params) => api.get('/rfqs', { params }),
  getById: (id) => api.get(`/rfqs/${id}`),
  activate: (id) => api.patch(`/rfqs/${id}/activate`),
  getSuppliers: () => api.get('/rfqs/suppliers/list'),
};

export const bidService = {
  submit: (rfqId, data) => api.post(`/rfqs/${rfqId}/bids`, data),
  getByRfq: (rfqId) => api.get(`/rfqs/${rfqId}/bids`),
  getActivity: (rfqId) => api.get(`/rfqs/${rfqId}/activity`),
};

export default api;
