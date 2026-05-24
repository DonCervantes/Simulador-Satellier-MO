import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/v1`,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg: string =
      err.response?.data?.detail ?? err.message ?? 'Unknown API error';
    console.error('[API]', err.config?.url, msg);
    return Promise.reject(new Error(msg));
  },
);
