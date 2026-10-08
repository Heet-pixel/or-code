import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sqb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sqb_token');
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// PDF endpoints require a Bearer token, which a plain window.open()/<a href>
// can't send - so this fetches the file through axios (auth header goes
// along automatically) and triggers a real file download. Deliberately NOT
// using window.open(): browsers frequently block a popup opened after an
// awaited request, which silently breaks the download with no visible error.
export async function openPdf(path, filename = 'document.pdf') {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch (err) {
    // responseType: 'blob' means axios can't auto-parse a JSON error body -
    // it comes back as a Blob even on a 401/404/500, so unwrap it by hand.
    let message = 'Could not download the PDF. Please try again.';
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        if (parsed?.message) message = parsed.message;
      } catch {
        /* error body wasn't JSON - fall back to the generic message */
      }
    } else if (err.response?.data?.message) {
      message = err.response.data.message;
    }
    alert(message);
    throw err;
  }
}
