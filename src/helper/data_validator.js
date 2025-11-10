/**
 * Data validation and normalization utilities
 */

/**
 * Sanitize string to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim();
};

/**
 * Normalize URL
 * @param {string} url - URL to normalize
 * @param {string} baseUrl - Base URL to remove
 * @returns {string} Normalized URL
 */
const normalizeUrl = (url, baseUrl = '') => {
  if (!url || typeof url !== 'string') return '';
  
  let normalized = url.trim();
  
  // Remove base URL if present
  if (baseUrl && normalized.includes(baseUrl)) {
    normalized = normalized.replace(baseUrl, '');
  }
  
  // Remove leading/trailing slashes
  normalized = normalized.replace(/^\/+|\/+$/g, '');
  
  // Ensure it starts with /
  if (normalized && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  
  return normalized;
};

/**
 * Normalize rating
 * @param {string} rating - Rating string
 * @returns {number} Normalized rating (0-10)
 */
const normalizeRating = (rating) => {
  if (!rating) return 0;
  
  const str = String(rating).trim();
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  
  if (isNaN(num)) return 0;
  
  // Clamp between 0 and 10
  return Math.max(0, Math.min(10, num));
};

/**
 * Normalize date string
 * @param {string} date - Date string
 * @returns {string} Normalized date string
 */
const normalizeDate = (date) => {
  if (!date || typeof date !== 'string') return '';
  return date.trim();
};

/**
 * Extract and normalize chapter number
 * @param {string} chapterTitle - Chapter title
 * @returns {object} Chapter info with number and title
 */
const normalizeChapter = (chapterTitle) => {
  if (!chapterTitle || typeof chapterTitle !== 'string') {
    return { number: 0, title: '' };
  }
  
  const cleaned = chapterTitle.trim();
  const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  const number = numberMatch ? parseFloat(numberMatch[1]) : 0;
  
  return {
    number,
    title: cleaned.replace(/^Chapter\s*/i, '').trim()
  };
};

/**
 * Validate and normalize comic item
 * @param {object} item - Comic item
 * @param {string} baseUrl - Base URL for normalization
 * @returns {object} Normalized comic item
 */
const normalizeComicItem = (item, baseUrl = '') => {
  return {
    title: sanitizeString(item.title || ''),
    href: normalizeUrl(item.href || '', baseUrl),
    thumbnail: item.thumbnail || '',
    type: sanitizeString(item.type || ''),
    chapter: sanitizeString(item.chapter || ''),
    rating: normalizeRating(item.rating),
    genre: item.genre || '',
    year: item.year || '',
    status: sanitizeString(item.status || ''),
    author: sanitizeString(item.author || ''),
    released: normalizeDate(item.released || ''),
    description: sanitizeString(item.description || '')
  };
};

/**
 * Validate and normalize chapter item
 * @param {object} chapter - Chapter item
 * @param {string} baseUrl - Base URL for normalization
 * @returns {object} Normalized chapter item
 */
const normalizeChapterItem = (chapter, baseUrl = '') => {
  const normalized = normalizeChapter(chapter.title || '');
  
  return {
    title: normalized.title || chapter.title || '',
    number: normalized.number,
    href: normalizeUrl(chapter.href || '', baseUrl),
    date: normalizeDate(chapter.date || '')
  };
};

/**
 * Validate pagination data
 * @param {object} pagination - Pagination data
 * @returns {object} Normalized pagination data
 */
const normalizePagination = (pagination) => {
  const currentPage = parseInt(pagination.current_page || pagination.currentPage || 1);
  const lengthPage = parseInt(pagination.length_page || pagination.lengthPage || 1);
  
  return {
    current_page: Math.max(1, currentPage),
    length_page: Math.max(1, lengthPage),
    has_next: currentPage < lengthPage,
    has_prev: currentPage > 1
  };
};

/**
 * Filter array of items
 * @param {Array} items - Array of items to filter
 * @param {object} filters - Filter criteria
 * @returns {Array} Filtered items
 */
const filterItems = (items, filters = {}) => {
  if (!Array.isArray(items)) return [];
  
  return items.filter(item => {
    // Filter by genre
    if (filters.genre) {
      const itemGenre = (item.genre || '').toLowerCase();
      const filterGenre = filters.genre.toLowerCase();
      if (!itemGenre.includes(filterGenre)) return false;
    }
    
    // Filter by type
    if (filters.type) {
      const itemType = (item.type || '').toLowerCase();
      const filterType = filters.type.toLowerCase();
      if (itemType !== filterType) return false;
    }
    
    // Filter by status
    if (filters.status) {
      const itemStatus = (item.status || '').toLowerCase();
      const filterStatus = filters.status.toLowerCase();
      if (itemStatus !== filterStatus) return false;
    }
    
    // Filter by rating (minimum)
    if (filters.minRating !== undefined) {
      const rating = normalizeRating(item.rating);
      if (rating < filters.minRating) return false;
    }
    
    // Filter by search query
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const title = (item.title || '').toLowerCase();
      const author = (item.author || '').toLowerCase();
      if (!title.includes(search) && !author.includes(search)) return false;
    }
    
    return true;
  });
};

/**
 * Sort array of items
 * @param {Array} items - Array of items to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} order - Sort order (asc/desc)
 * @returns {Array} Sorted items
 */
const sortItems = (items, sortBy = 'title', order = 'asc') => {
  if (!Array.isArray(items)) return [];
  
  const sorted = [...items];
  const isDesc = order.toLowerCase() === 'desc';
  
  sorted.sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    // Handle different data types
    if (sortBy === 'rating') {
      aVal = normalizeRating(aVal);
      bVal = normalizeRating(bVal);
    } else if (sortBy === 'title' || sortBy === 'author') {
      aVal = (aVal || '').toLowerCase();
      bVal = (bVal || '').toLowerCase();
    } else if (sortBy === 'date' || sortBy === 'released') {
      aVal = new Date(aVal || 0);
      bVal = new Date(bVal || 0);
    }
    
    if (aVal < bVal) return isDesc ? 1 : -1;
    if (aVal > bVal) return isDesc ? -1 : 1;
    return 0;
  });
  
  return sorted;
};

/**
 * Validate required fields
 * @param {object} data - Data to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {object} Validation result
 */
const validateRequired = (data, requiredFields = []) => {
  const errors = [];
  
  requiredFields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push(`${field} is required`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  sanitizeString,
  normalizeUrl,
  normalizeRating,
  normalizeDate,
  normalizeChapter,
  normalizeComicItem,
  normalizeChapterItem,
  normalizePagination,
  filterItems,
  sortItems,
  validateRequired
};

