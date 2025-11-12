/**
 * Cache Manager
 * Handles cache management UI with browser-based filtering and pagination
 */

const CacheManager = {
  currentPage: 1,
  pageSize: 50,
  allEntries: [],
  filteredEntries: [],
  filterPattern: '',

  /**
   * Initialize cache manager
   */
  init() {
    this.setupEventListeners();
    this.loadCacheEntries();
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    const cacheFilter = document.getElementById('cache-filter');
    const cachePattern = document.getElementById('cache-pattern');
    const refreshCache = document.getElementById('refresh-cache');
    const clearCache = document.getElementById('clear-cache');

    if (cacheFilter) {
      cacheFilter.addEventListener('input', (e) => {
        this.filterPattern = e.target.value;
        this.filterEntries();
      });
    }

    if (cachePattern) {
      cachePattern.addEventListener('input', (e) => {
        this.filterPattern = e.target.value;
        this.filterEntries();
      });
    }

    if (refreshCache) {
      refreshCache.addEventListener('click', () => {
        this.loadCacheEntries();
      });
    }

    if (clearCache) {
      clearCache.addEventListener('click', () => {
        this.clearCache();
      });
    }
  },

  /**
   * Load cache entries from API
   */
  async loadCacheEntries() {
    const tbody = document.getElementById('cache-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading cache entries...</td></tr>';

    try {
      const response = await fetch('/api/dashboard/cache/manage?limit=1000&offset=0');
      const result = await response.json();

      if (result.status === 'success' && result.data.entries) {
        this.allEntries = result.data.entries;
        this.filteredEntries = [...this.allEntries];
        this.currentPage = 1;
        this.renderEntries();
        this.renderPagination();
      } else {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No cache entries found</td></tr>';
      }
    } catch (error) {
      console.error('Error loading cache entries:', error);
      tbody.innerHTML = '<tr><td colspan="7" class="loading text-error">Error loading cache entries</td></tr>';
    }
  },

  /**
   * Filter entries based on pattern (browser-based)
   */
  filterEntries() {
    if (!this.filterPattern || this.filterPattern.trim() === '') {
      this.filteredEntries = [...this.allEntries];
    } else {
      const pattern = this.filterPattern.toLowerCase();
      this.filteredEntries = this.allEntries.filter(entry => {
        return entry.key.toLowerCase().includes(pattern);
      });
    }

    this.currentPage = 1;
    this.renderEntries();
    this.renderPagination();
  },

  /**
   * Render cache entries table
   */
  renderEntries() {
    const tbody = document.getElementById('cache-tbody');
    if (!tbody) return;

    if (this.filteredEntries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading">No entries match the filter</td></tr>';
      return;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageEntries = this.filteredEntries.slice(start, end);

    tbody.innerHTML = pageEntries.map(entry => {
      const lastAccessed = entry.lastAccessed 
        ? new Date(entry.lastAccessed).toLocaleString()
        : 'Never';
      
      const ttl = entry.expiresAt 
        ? Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000))
        : 0;
      
      const ttlFormatted = ttl > 0 
        ? `${Math.floor(ttl / 60)}m ${ttl % 60}s`
        : 'Expired';
      
      const sizeFormatted = this.formatSize(entry.size);
      const statusClass = entry.expired ? 'badge-error' : 'badge-success';
      const statusText = entry.expired ? 'Expired' : 'Active';

      return `
        <tr>
          <td title="${entry.key}">${this.truncate(entry.key, 50)}</td>
          <td><span class="badge">${entry.level}</span></td>
          <td>${sizeFormatted}</td>
          <td>${entry.accessCount || 0}</td>
          <td>${lastAccessed}</td>
          <td>${ttlFormatted}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render pagination controls
   */
  renderPagination() {
    const pagination = document.getElementById('cache-pagination');
    if (!pagination) return;

    const totalPages = Math.ceil(this.filteredEntries.length / this.pageSize);
    
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const prevDisabled = this.currentPage === 1;
    const nextDisabled = this.currentPage === totalPages;

    pagination.innerHTML = `
      <button ${prevDisabled ? 'disabled' : ''} onclick="CacheManager.goToPage(${this.currentPage - 1})">
        Previous
      </button>
      <span class="page-info">
        Page ${this.currentPage} of ${totalPages} (${this.filteredEntries.length} entries)
      </span>
      <button ${nextDisabled ? 'disabled' : ''} onclick="CacheManager.goToPage(${this.currentPage + 1})">
        Next
      </button>
    `;
  },

  /**
   * Navigate to specific page
   */
  goToPage(page) {
    const totalPages = Math.ceil(this.filteredEntries.length / this.pageSize);
    if (page < 1 || page > totalPages) return;
    
    this.currentPage = page;
    this.renderEntries();
    this.renderPagination();
    
    // Scroll to top of table
    const table = document.getElementById('cache-table');
    if (table) {
      table.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  /**
   * Clear cache
   */
  async clearCache() {
    if (!confirm('Are you sure you want to clear the cache? This action cannot be undone.')) {
      return;
    }

    const pattern = document.getElementById('cache-pattern')?.value || '*';
    
    try {
      const response = await fetch(`/api/dashboard/cache/manage?pattern=${encodeURIComponent(pattern)}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        alert(`Cache cleared: ${result.data.message || 'Success'}`);
        this.loadCacheEntries();
      } else {
        alert(`Error: ${result.message || 'Failed to clear cache'}`);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache. Please try again.');
    }
  },

  /**
   * Format size in bytes to human-readable format
   */
  formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Truncate string with ellipsis
   */
  truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CacheManager.init());
} else {
  CacheManager.init();
}

