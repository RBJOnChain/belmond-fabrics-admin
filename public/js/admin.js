/**
 * Belmond Fabrics and Tailor — Admin Application Controller
 */

import { api } from './api.js';

class AdminApp {
  constructor() {
    this.currentView = 'dashboard';
    this.stagedFiles = [];
    this.dresses = [];
    this.activeFilter = 'all'; // 'all', 'published', 'hidden'
    this.pendingDeleteId = null;

    this.initElements();
    this.bindEvents();
    this.initAuth();
  }

  initElements() {
    // Auth Elements
    this.authOverlay = document.getElementById('auth-overlay');
    this.authForm = document.getElementById('auth-form');
    this.adminPasswordInput = document.getElementById('admin-password-input');
    this.passwordToggleBtn = document.getElementById('password-toggle-btn');
    this.authError = document.getElementById('auth-error');
    this.authSubmitBtn = document.getElementById('auth-submit-btn');

    // Shell & Nav
    this.adminShell = document.getElementById('admin-shell');
    this.btnLogout = document.getElementById('btn-logout');
    this.btnMobileLogout = document.getElementById('btn-mobile-logout');
    this.navTabBtns = document.querySelectorAll('.nav-tab-btn');
    this.mobileNavBtns = document.querySelectorAll('.mobile-nav-btn[data-view]');
    this.viewSections = document.querySelectorAll('.view-section');

    // Dashboard Elements
    this.statTotal = document.getElementById('stat-total');
    this.statPublished = document.getElementById('stat-published');
    this.statHidden = document.getElementById('stat-hidden');
    this.recentGrid = document.getElementById('recent-grid');
    this.btnDashUpload = document.getElementById('btn-dash-upload');

    // Upload Elements
    this.dropzone = document.getElementById('dropzone');
    this.fileInput = document.getElementById('file-input');
    this.stagedSection = document.getElementById('staged-section');
    this.stagedGrid = document.getElementById('staged-grid');
    this.stagedCount = document.getElementById('staged-count');
    this.btnClearStaged = document.getElementById('btn-clear-staged');
    this.btnSubmitUpload = document.getElementById('btn-submit-upload');
    this.progressCard = document.getElementById('progress-card');
    this.progressBarFill = document.getElementById('progress-bar-fill');
    this.progressStatusText = document.getElementById('progress-status-text');
    this.progressPercentText = document.getElementById('progress-percent-text');
    this.uploadAlert = document.getElementById('upload-alert');

    // Manage Elements
    this.manageFilterBtns = document.querySelectorAll('.filter-pill-btn');
    this.dressesGrid = document.getElementById('dresses-grid');
    this.filterCountAll = document.getElementById('filter-count-all');
    this.filterCountPub = document.getElementById('filter-count-pub');
    this.filterCountHid = document.getElementById('filter-count-hid');

    // Modals
    this.deleteModal = document.getElementById('delete-modal');
    this.btnCancelDelete = document.getElementById('btn-cancel-delete');
    this.btnConfirmDelete = document.getElementById('btn-confirm-delete');
    this.lightboxModal = document.getElementById('lightbox-modal');
    this.lightboxImg = document.getElementById('lightbox-img');
    this.lightboxClose = document.getElementById('lightbox-close');

    // Toasts
    this.toastContainer = document.getElementById('toast-container');
  }

  bindEvents() {
    // Handle 401 Unauthorized globally
    api.onUnauthorized = () => {
      this.showAuthScreen();
      this.showToast('Session expired. Please enter admin password.', 'error');
    };

    // Password visibility toggle
    this.passwordToggleBtn.addEventListener('click', () => {
      const type = this.adminPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      this.adminPasswordInput.setAttribute('type', type);
    });

    // Login Form
    this.authForm.addEventListener('submit', (e) => this.handleLogin(e));

    // Logout
    this.btnLogout.addEventListener('click', () => this.handleLogout());
    if (this.btnMobileLogout) {
      this.btnMobileLogout.addEventListener('click', () => this.handleLogout());
    }

    // View Navigation (Desktop & Mobile)
    const handleNavClick = (viewName) => {
      this.switchView(viewName);
    };

    this.navTabBtns.forEach(btn => {
      btn.addEventListener('click', () => handleNavClick(btn.dataset.view));
    });

    this.mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => handleNavClick(btn.dataset.view));
    });

    if (this.btnDashUpload) {
      this.btnDashUpload.addEventListener('click', () => this.switchView('upload'));
    }

    // Drag & Drop Upload Handlers
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-over');
      }, false);
    });

    this.dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.addFilesToStage(Array.from(files));
      }
    });

    this.fileInput.addEventListener('change', (e) => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        this.addFilesToStage(Array.from(this.fileInput.files));
        this.fileInput.value = ''; // Reset input to allow re-selection
      }
    });

    this.btnClearStaged.addEventListener('click', () => {
      this.stagedFiles = [];
      this.renderStagedFiles();
    });

    this.btnSubmitUpload.addEventListener('click', () => this.executeUpload());

    // Manage Filter Buttons
    this.manageFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.manageFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.filter;
        this.renderDressesGrid();
      });
    });

    // Delete Modal Events
    this.btnCancelDelete.addEventListener('click', () => {
      this.closeDeleteModal();
    });

    this.deleteModal.addEventListener('click', (e) => {
      if (e.target === this.deleteModal) {
        this.closeDeleteModal();
      }
    });

    this.btnConfirmDelete.addEventListener('click', () => this.confirmDeleteDress());

    // Lightbox Events
    this.lightboxClose.addEventListener('click', () => {
      this.lightboxModal.classList.remove('active');
    });

    this.lightboxModal.addEventListener('click', (e) => {
      if (e.target === this.lightboxModal) {
        this.lightboxModal.classList.remove('active');
      }
    });
  }

  // ==========================================
  // Auth Flow
  // ==========================================

  async initAuth() {
    try {
      const res = await api.checkAuth();
      if (res && res.authenticated) {
        this.showAdminPanel();
        await this.loadInitialData();
      } else {
        this.showAuthScreen();
      }
    } catch (err) {
      this.showAuthScreen();
    }
  }

  showAuthScreen() {
    this.authOverlay.classList.remove('hidden');
    this.adminPasswordInput.value = '';
    this.authError.classList.remove('visible');
    setTimeout(() => this.adminPasswordInput.focus(), 200);
  }

  showAdminPanel() {
    this.authOverlay.classList.add('hidden');
  }

  async handleLogin(e) {
    e.preventDefault();
    const password = this.adminPasswordInput.value.trim();
    if (!password) return;

    this.authSubmitBtn.disabled = true;
    this.authSubmitBtn.textContent = 'Verifying...';
    this.authError.classList.remove('visible');

    try {
      await api.login(password);
      this.showAdminPanel();
      this.showToast('Welcome to Belmond Fabrics Admin', 'success');
      await this.loadInitialData();
    } catch (err) {
      this.authError.textContent = err.message || 'Incorrect admin password. Please try again.';
      this.authError.classList.add('visible');
      this.adminPasswordInput.select();
    } finally {
      this.authSubmitBtn.disabled = false;
      this.authSubmitBtn.textContent = 'Unlock Admin Panel';
    }
  }

  async handleLogout() {
    try {
      await api.logout();
      this.showToast('Logged out successfully', 'info');
    } catch (err) {
      // Proceed to lock UI regardless
    }
    this.showAuthScreen();
  }

  // ==========================================
  // Navigation
  // ==========================================

  switchView(viewName) {
    this.currentView = viewName;

    // Update Desktop Nav
    this.navTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update Mobile Nav
    this.mobileNavBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update View Sections
    this.viewSections.forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });

    // Reload content if needed
    if (viewName === 'dashboard') {
      this.loadStats();
    } else if (viewName === 'manage') {
      this.loadDresses();
    }
  }

  // ==========================================
  // Data Loading
  // ==========================================

  async loadInitialData() {
    await Promise.all([this.loadStats(), this.loadDresses()]);
  }

  async loadStats() {
    try {
      const stats = await api.getStats();
      this.statTotal.textContent = stats.total;
      this.statPublished.textContent = stats.published;
      this.statHidden.textContent = stats.hidden;

      this.renderRecentGrid(stats.recentUploads || stats.recent || []);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    }
  }

  renderRecentGrid(recentItems) {
    if (!this.recentGrid) return;
    this.recentGrid.innerHTML = '';

    if (recentItems.length === 0) {
      this.recentGrid.innerHTML = `
        <div style="grid-column: 1 / -1; color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">
          No dress photographs uploaded yet.
        </div>
      `;
      return;
    }

    recentItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'recent-card';

      const statusBadge = item.is_visible
        ? `<span class="status-badge published"><span class="status-badge-dot"></span>Live</span>`
        : `<span class="status-badge hidden-badge"><span class="status-badge-dot"></span>Hidden</span>`;

      const dateStr = this.formatDate(item.created_at);

      card.innerHTML = `
        <div class="recent-img-wrap">
          <img src="${item.image_url}" alt="Dress Piece" loading="lazy" />
          ${statusBadge}
        </div>
        <div class="recent-meta">
          <span class="recent-date">${dateStr}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openLightbox(item.image_url);
      });

      this.recentGrid.appendChild(card);
    });
  }

  async loadDresses() {
    try {
      const res = await api.getDresses();
      this.dresses = res.dresses || [];
      this.updateFilterCounts();
      this.renderDressesGrid();
    } catch (err) {
      console.error('Error loading dresses:', err);
      this.showToast('Failed to load dresses', 'error');
    }
  }

  updateFilterCounts() {
    const total = this.dresses.length;
    const pub = this.dresses.filter(d => d.is_visible).length;
    const hid = total - pub;

    if (this.filterCountAll) this.filterCountAll.textContent = total;
    if (this.filterCountPub) this.filterCountPub.textContent = pub;
    if (this.filterCountHid) this.filterCountHid.textContent = hid;
  }

  // ==========================================
  // Upload Management
  // ==========================================

  addFilesToStage(files) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const maxSizeBytes = 25 * 1024 * 1024; // 25MB

    let addedCount = 0;
    let rejectedCount = 0;

    files.forEach(file => {
      if (!allowedTypes.includes(file.type.toLowerCase())) {
        rejectedCount++;
        return;
      }
      if (file.size > maxSizeBytes) {
        this.showToast(`"${file.name}" exceeds 25MB limit.`, 'error');
        return;
      }

      // Avoid exact duplicate objects
      const isAlreadyStaged = this.stagedFiles.some(f => f.file.name === file.name && f.file.size === file.size);
      if (!isAlreadyStaged) {
        const previewUrl = URL.createObjectURL(file);
        this.stagedFiles.push({ file, previewUrl, id: Math.random().toString(36).substr(2, 9) });
        addedCount++;
      }
    });

    if (rejectedCount > 0) {
      this.showToast(`${rejectedCount} unsupported file(s) skipped. Use JPG, PNG, or WEBP.`, 'error');
    }

    if (addedCount > 0) {
      this.renderStagedFiles();
    }
  }

  removeStagedFile(id) {
    const itemIndex = this.stagedFiles.findIndex(f => f.id === id);
    if (itemIndex !== -1) {
      URL.revokeObjectURL(this.stagedFiles[itemIndex].previewUrl);
      this.stagedFiles.splice(itemIndex, 1);
      this.renderStagedFiles();
    }
  }

  renderStagedFiles() {
    if (this.stagedFiles.length === 0) {
      this.stagedSection.classList.remove('active');
      this.stagedGrid.innerHTML = '';
      return;
    }

    this.stagedSection.classList.add('active');
    this.stagedCount.textContent = this.stagedFiles.length;
    this.btnSubmitUpload.textContent = `Upload ${this.stagedFiles.length} Image${this.stagedFiles.length > 1 ? 's' : ''}`;
    this.stagedGrid.innerHTML = '';

    this.stagedFiles.forEach(item => {
      const card = document.createElement('div');
      card.className = 'staged-card';

      const formattedSize = this.formatBytes(item.file.size);

      card.innerHTML = `
        <div class="staged-thumb-wrap">
          <img src="${item.previewUrl}" alt="Upload preview" />
          <button class="btn-remove-staged" title="Remove" aria-label="Remove image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="staged-info">
          <span class="staged-name" title="${item.file.name}">${item.file.name}</span>
          <span class="staged-size">${formattedSize}</span>
        </div>
      `;

      card.querySelector('.btn-remove-staged').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeStagedFile(item.id);
      });

      this.stagedGrid.appendChild(card);
    });
  }

  async executeUpload() {
    if (this.stagedFiles.length === 0) return;

    this.btnSubmitUpload.disabled = true;
    this.btnClearStaged.disabled = true;
    this.progressCard.classList.add('active');
    this.uploadAlert.className = 'alert-banner';
    this.uploadAlert.style.display = 'none';

    this.progressBarFill.style.width = '0%';
    this.progressStatusText.textContent = `Preparing ${this.stagedFiles.length} file(s)...`;
    this.progressPercentText.textContent = '0%';

    const formData = new FormData();
    this.stagedFiles.forEach(item => {
      formData.append('images', item.file);
    });

    try {
      const result = await api.uploadDresses(formData, (percent) => {
        this.progressBarFill.style.width = `${percent}%`;
        this.progressPercentText.textContent = `${percent}%`;
        this.progressStatusText.textContent = percent < 100
          ? `Uploading to server (${percent}%)...`
          : 'Processing & saving to Supabase Storage...';
      });

      this.progressBarFill.style.width = '100%';
      this.progressStatusText.textContent = 'Upload complete';
      this.progressPercentText.textContent = '100%';

      // Clear staged files
      this.stagedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
      this.stagedFiles = [];
      this.renderStagedFiles();

      // Show success alert
      this.showUploadAlert(
        'success',
        'Upload Successful',
        `Successfully uploaded and published ${result.uploadedCount} dress photograph(s). They are now visible on the showcase website.`
      );

      this.showToast(`✓ Uploaded ${result.uploadedCount} dress(es)`, 'success');

      // Refresh data
      await this.loadInitialData();

      setTimeout(() => {
        this.progressCard.classList.remove('active');
      }, 1500);
    } catch (err) {
      console.error('Upload failed:', err);
      this.progressBarFill.style.width = '100%';
      this.progressBarFill.style.background = '#EF4444';
      this.progressStatusText.textContent = 'Upload encountered an issue';

      this.showUploadAlert(
        'error',
        'Upload Failed',
        err.message || 'An error occurred during upload. Please check your network and try again.'
      );
      this.showToast('Upload failed', 'error');
    } finally {
      this.btnSubmitUpload.disabled = false;
      this.btnClearStaged.disabled = false;
    }
  }

  showUploadAlert(type, title, msg) {
    this.uploadAlert.className = `alert-banner visible ${type}`;
    this.uploadAlert.style.display = 'flex';
    this.uploadAlert.querySelector('.alert-title').textContent = title;
    this.uploadAlert.querySelector('.alert-msg').textContent = msg;
  }

  // ==========================================
  // Manage Dresses Flow
  // ==========================================

  renderDressesGrid() {
    this.dressesGrid.innerHTML = '';

    let filtered = this.dresses;
    if (this.activeFilter === 'published') {
      filtered = this.dresses.filter(d => d.is_visible);
    } else if (this.activeFilter === 'hidden') {
      filtered = this.dresses.filter(d => !d.is_visible);
    }

    if (filtered.length === 0) {
      this.dressesGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
          <h3 class="empty-title">No Dresses Found</h3>
          <p class="empty-desc">${this.activeFilter === 'all' ? 'No dress images uploaded yet.' : `No ${this.activeFilter} dress images in your collection.`}</p>
          <button class="btn-primary" id="btn-empty-upload">
            <span>+ Upload Dresses</span>
          </button>
        </div>
      `;
      const btn = document.getElementById('btn-empty-upload');
      if (btn) btn.addEventListener('click', () => this.switchView('upload'));
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('article');
      card.className = 'dress-card';
      card.dataset.id = item.id;

      const isVis = item.is_visible;
      const statusBadge = isVis
        ? `<span class="status-badge published"><span class="status-badge-dot"></span>Published</span>`
        : `<span class="status-badge hidden-badge"><span class="status-badge-dot"></span>Hidden</span>`;

      const dateStr = this.formatDate(item.created_at);
      const toggleLabel = isVis ? 'Hide' : 'Show';
      const toggleClass = isVis ? 'is-visible' : 'is-hidden';

      card.innerHTML = `
        <div class="dress-preview-wrap">
          <img src="${item.image_url}" alt="Dress Piece" loading="lazy" />
          ${statusBadge}
          <div class="dress-preview-overlay">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </div>
        </div>
        <div class="dress-content">
          <div class="dress-meta-row">
            <span class="dress-date">${dateStr}</span>
            <span class="dress-order">#${item.display_order !== null && item.display_order !== undefined ? item.display_order : '—'}</span>
          </div>
          <div class="dress-card-actions">
            <button class="btn-toggle-vis ${toggleClass}" data-id="${item.id}" data-current="${isVis}">
              <span>${toggleLabel}</span>
            </button>
            <button class="btn-delete-dress" data-id="${item.id}" title="Delete dress permanently" aria-label="Delete dress">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Zoom preview on click
      card.querySelector('.dress-preview-wrap').addEventListener('click', () => {
        this.openLightbox(item.image_url);
      });

      // Toggle Visibility
      const toggleBtn = card.querySelector('.btn-toggle-vis');
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDressVisibility(item.id, !item.is_visible);
      });

      // Delete Button
      const deleteBtn = card.querySelector('.btn-delete-dress');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDeleteModal(item.id);
      });

      this.dressesGrid.appendChild(card);
    });
  }

  async toggleDressVisibility(id, newVisibility) {
    // Optimistic local state update
    const index = this.dresses.findIndex(d => d.id === id);
    if (index === -1) return;

    const prevVisibility = this.dresses[index].is_visible;
    this.dresses[index].is_visible = newVisibility;
    this.updateFilterCounts();
    this.renderDressesGrid();

    try {
      await api.toggleVisibility(id, newVisibility);
      this.showToast(newVisibility ? 'Dress is now visible on website' : 'Dress is now hidden from website', 'success');
      this.loadStats(); // update dashboard count
    } catch (err) {
      // Revert optimistic update on failure
      this.dresses[index].is_visible = prevVisibility;
      this.updateFilterCounts();
      this.renderDressesGrid();
      this.showToast(`Failed to update status: ${err.message}`, 'error');
    }
  }

  openDeleteModal(id) {
    this.pendingDeleteId = id;
    this.deleteModal.classList.add('active');
  }

  closeDeleteModal() {
    this.pendingDeleteId = null;
    this.deleteModal.classList.remove('active');
  }

  async confirmDeleteDress() {
    const id = this.pendingDeleteId;
    if (!id) return;

    this.btnConfirmDelete.disabled = true;
    this.btnConfirmDelete.textContent = 'Deleting...';

    try {
      const result = await api.deleteDress(id);

      // Remove from memory
      this.dresses = this.dresses.filter(d => d.id !== id);
      this.updateFilterCounts();
      this.renderDressesGrid();

      this.closeDeleteModal();
      this.showToast('Dress permanently deleted from database & storage', 'success');

      if (result.storageWarning) {
        console.warn('Storage delete warning:', result.storageWarning);
      }

      await this.loadStats();
    } catch (err) {
      console.error('Delete failed:', err);
      this.showToast(`Delete failed: ${err.message}`, 'error');
    } finally {
      this.btnConfirmDelete.disabled = false;
      this.btnConfirmDelete.textContent = 'Yes, Delete Permanently';
    }
  }

  openLightbox(imageUrl) {
    this.lightboxImg.src = imageUrl;
    this.lightboxModal.classList.add('active');
  }

  // ==========================================
  // Utilities
  // ==========================================

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconSvg = type === 'success'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : type === 'error'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminApp = new AdminApp();
});
