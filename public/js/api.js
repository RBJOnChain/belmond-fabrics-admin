/**
 * API client for Belmond Fabrics Admin Panel
 * Handles requests, cookie credentials, real XHR upload progress, and 401 unauthorized session expiry
 */

class ApiClient {
  constructor() {
    this.onUnauthorized = null;
  }

  async request(endpoint, options = {}) {
    const config = {
      ...options,
      headers: {
        ...(options.headers || {})
      },
      credentials: 'same-origin' // Ensures HttpOnly cookie is included
    };

    try {
      const response = await fetch(endpoint, config);

      if (response.status === 401) {
        if (this.onUnauthorized && !endpoint.includes('/api/auth/login')) {
          this.onUnauthorized();
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Unauthorized: Please enter admin password');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Server returned ${response.status}`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  }

  // Auth methods
  async login(password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
  }

  async logout() {
    return this.request('/api/auth/logout', {
      method: 'POST'
    });
  }

  async checkAuth() {
    return this.request('/api/auth/me', {
      method: 'GET'
    });
  }

  // Dashboard & Dresses methods
  async getStats() {
    return this.request('/api/stats', {
      method: 'GET'
    });
  }

  async getDresses() {
    return this.request('/api/dresses', {
      method: 'GET'
    });
  }

  // Real XMLHttpRequest upload with byte-level upload progress tracking
  uploadDresses(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/dresses/upload');
      xhr.withCredentials = true;

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.min(Math.round((e.loaded / e.total) * 100), 99);
            onProgress(percent, e.loaded, e.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status === 401) {
          if (this.onUnauthorized) this.onUnauthorized();
          let errData = {};
          try { errData = JSON.parse(xhr.responseText); } catch (e) {}
          return reject(new Error(errData.error || 'Unauthorized: Please enter admin password'));
        }

        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {}

        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve(data);
        } else {
          reject(new Error(data.error || `Server returned ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network failure while uploading files'));
      };

      xhr.send(formData);
    });
  }

  async toggleVisibility(id, is_visible) {
    return this.request(`/api/dresses/${id}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_visible })
    });
  }

  async deleteDress(id) {
    return this.request(`/api/dresses/${id}`, {
      method: 'DELETE'
    });
  }
}

export const api = new ApiClient();
