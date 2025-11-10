/**
 * Shinigami Scraper Service
 * Scraping logic khusus untuk Shinigami (https://08.shinigami.asia/)
 * Menggunakan API endpoint: https://api.shngm.io/v1/
 */

const { AxiosService } = require('../helper/axios_service');
const { ParseError, NotFoundError } = require('../helper/error_handler');
const {
  normalizeComicItem,
  normalizeChapterItem,
  normalizeUrl,
  normalizeRating,
  normalizePagination
} = require('../helper/data_validator');

const BASE_URL = 'https://08.shinigami.asia';
const API_BASE_URL = 'https://api.shngm.io/v1';

/**
 * Get latest comics
 * @param {number} page - Page number
 * @returns {Promise<object>} Latest comics with pagination
 */
const getLatestComics = async (page = 1) => {
  try {
    const url = `${API_BASE_URL}/manga/list?page=${page || 1}&page_size=24&sort=latest&sort_order=desc`;
    const response = await AxiosService(url);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new ParseError('Failed to fetch latest comics');
    }

    const { data, meta } = response.data;
    const comics = data.map(item => normalizeComicItem({
      title: item.title || '',
      href: `/series/${item.manga_id}`,
      thumbnail: item.cover_image_url || item.cover_portrait_url || '',
      chapter: item.latest_chapter_number ? `Chapter ${item.latest_chapter_number}` : '',
      rating: item.user_rate || item.rank || '',
      type: item.taxonomy?.Format?.[0]?.name || '',
      genre: item.taxonomy?.Genre?.map(g => g.name).join(', ') || '',
      year: item.release_year || '',
      status: item.status === 1 ? 'Ongoing' : 'Completed',
      author: item.taxonomy?.Author?.[0]?.name || '',
      released: item.release_year || '',
      description: item.description || ''
    }, BASE_URL));

    return {
      current_page: meta.page || page,
      length_page: meta.total_page || 1,
      has_next: (meta.page || page) < (meta.total_page || 1),
      has_prev: (meta.page || page) > 1,
      data: comics
    };
  } catch (error) {
    throw new ParseError(`Error scraping latest comics: ${error.message}`, error);
  }
};

/**
 * Get comics by genre (not supported by Shinigami)
 * @param {string} genreUrl - Genre URL slug
 * @param {number} page - Page number
 * @returns {Promise<object>} Empty result
 */
const getComicsByGenre = async (genreUrl, page) => {
  throw new ParseError('Genre filtering is not supported by Shinigami provider');
};

/**
 * Get all genres (not supported by Shinigami)
 * @returns {Promise<Array>} Empty array
 */
const getGenres = async () => {
  return [];
};

/**
 * Get comic detail
 * @param {string} url - Comic UUID or slug
 * @returns {Promise<object>} Comic detail
 */
const getComicDetail = async (url) => {
  try {
    // Extract UUID from URL if it contains path
    const mangaId = url.includes('/') ? url.split('/').pop().replace(/\/$/, '') : url;
    
    const detailUrl = `${API_BASE_URL}/manga/detail/${mangaId}`;
    const response = await AxiosService(detailUrl);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new NotFoundError('Comic not found');
    }

    const item = response.data.data;
    
    // Get chapters
    const chaptersUrl = `${API_BASE_URL}/chapter/${mangaId}/list?page=1&page_size=100&sort_by=chapter_number&sort_order=desc`;
    const chaptersResponse = await AxiosService(chaptersUrl);
    
    let chapters = [];
    if (chaptersResponse.status === 200 && chaptersResponse.data && chaptersResponse.data.retcode === 0) {
      chapters = chaptersResponse.data.data.map(ch => normalizeChapterItem({
        title: ch.chapter_title || `Chapter ${ch.chapter_number}`,
        href: `/chapter/${ch.chapter_id}`,
        date: ch.release_date || ''
      }, BASE_URL));
    }

    // Extract genres
    const genres = (item.taxonomy?.Genre || []).map(genre => ({
      title: genre.name,
      href: ''
    }));

    return {
      title: item.title || '',
      rating: normalizeRating(item.user_rate || item.rank || '0'),
      status: item.status === 1 ? 'Ongoing' : 'Completed',
      type: item.taxonomy?.Format?.[0]?.name || '',
      released: item.release_year || '',
      author: item.taxonomy?.Author?.[0]?.name || '',
      genre: genres,
      description: item.description || '',
      thumbnail: item.cover_image_url || item.cover_portrait_url || '',
      chapter: chapters
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new ParseError(`Error scraping comic detail: ${error.message}`, error);
  }
};

/**
 * Read chapter (get images)
 * @param {string} url - Chapter UUID or slug
 * @returns {Promise<object>} Chapter data with images
 */
const readChapter = async (url) => {
  try {
    // Extract UUID from URL if it contains path
    const chapterId = url.includes('/') ? url.split('/').pop().replace(/\/$/, '') : url;
    
    const chapterUrl = `${API_BASE_URL}/chapter/detail/${chapterId}`;
    const response = await AxiosService(chapterUrl);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new NotFoundError('Chapter not found');
    }

    const item = response.data.data;
    
    // Extract images from chapter object
    let panels = [];
    if (item.chapter && item.chapter.data && Array.isArray(item.chapter.data)) {
      const baseUrl = item.base_url || 'https://delivery.shngm.id';
      const chapterPath = item.chapter.path || '';
      panels = item.chapter.data.map(filename => {
        // Construct full URL
        return `${baseUrl}${chapterPath}${filename}`;
      });
    }
    
    return {
      title: item.chapter_title || `Chapter ${item.chapter_number || ''}`,
      panel: panels
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new ParseError(`Error scraping chapter: ${error.message}`, error);
  }
};

/**
 * Search comics
 * @param {string} keyword - Search keyword
 * @returns {Promise<Array>} Array of search results
 */
const searchComics = async (keyword) => {
  try {
    const url = `${API_BASE_URL}/manga/list?page=1&page_size=50&q=${encodeURIComponent(keyword)}`;
    const response = await AxiosService(url);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new ParseError('Failed to search comics');
    }

    const { data } = response.data;
    const comics = data.map(item => normalizeComicItem({
      title: item.title || '',
      href: `/series/${item.manga_id}`,
      thumbnail: item.cover_image_url || item.cover_portrait_url || '',
      chapter: item.latest_chapter_number ? `Chapter ${item.latest_chapter_number}` : '',
      rating: item.user_rate || item.rank || '',
      type: item.taxonomy?.Format?.[0]?.name || '',
      genre: item.taxonomy?.Genre?.map(g => g.name).join(', ') || '',
      year: item.release_year || '',
      status: item.status === 1 ? 'Ongoing' : 'Completed',
      author: item.taxonomy?.Author?.[0]?.name || '',
      released: item.release_year || '',
      description: item.description || ''
    }, BASE_URL));

    return comics;
  } catch (error) {
    throw new ParseError(`Error searching comics: ${error.message}`, error);
  }
};

/**
 * Get popular comics
 * @returns {Promise<Array>} Array of popular comics
 */
const getPopularComics = async () => {
  try {
    const url = `${API_BASE_URL}/manga/list?page=1&page_size=50&sort=rank&sort_order=asc`;
    const response = await AxiosService(url);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new ParseError('Failed to fetch popular comics');
    }

    const { data } = response.data;
    const comics = data.map(item => normalizeComicItem({
      title: item.title || '',
      href: `/series/${item.manga_id}`,
      thumbnail: item.cover_image_url || item.cover_portrait_url || '',
      chapter: item.latest_chapter_number ? `Chapter ${item.latest_chapter_number}` : '',
      rating: item.user_rate || item.rank || '',
      type: item.taxonomy?.Format?.[0]?.name || '',
      genre: item.taxonomy?.Genre?.map(g => g.name).join(', ') || '',
      year: item.release_year || '',
      status: item.status === 1 ? 'Ongoing' : 'Completed',
      author: item.taxonomy?.Author?.[0]?.name || '',
      released: item.release_year || '',
      description: item.description || ''
    }, BASE_URL));

    return comics;
  } catch (error) {
    throw new ParseError(`Error scraping popular comics: ${error.message}`, error);
  }
};

/**
 * Get recommended comics
 * @returns {Promise<Array>} Array of recommended comics
 */
const getRecommendedComics = async () => {
  try {
    const url = `${API_BASE_URL}/manga/list?page=1&page_size=50&is_recommended=true`;
    const response = await AxiosService(url);
    
    if (response.status !== 200 || !response.data || response.data.retcode !== 0) {
      throw new ParseError('Failed to fetch recommended comics');
    }

    const { data } = response.data;
    const comics = data.map(item => normalizeComicItem({
      title: item.title || '',
      href: `/series/${item.manga_id}`,
      thumbnail: item.cover_image_url || item.cover_portrait_url || '',
      chapter: item.latest_chapter_number ? `Chapter ${item.latest_chapter_number}` : '',
      rating: item.user_rate || item.rank || '',
      type: item.taxonomy?.Format?.[0]?.name || '',
      genre: item.taxonomy?.Genre?.map(g => g.name).join(', ') || '',
      year: item.release_year || '',
      status: item.status === 1 ? 'Ongoing' : 'Completed',
      author: item.taxonomy?.Author?.[0]?.name || '',
      released: item.release_year || '',
      description: item.description || ''
    }, BASE_URL));

    return comics;
  } catch (error) {
    throw new ParseError(`Error scraping recommended comics: ${error.message}`, error);
  }
};

module.exports = {
  getLatestComics,
  getComicsByGenre,
  getGenres,
  getComicDetail,
  readChapter,
  searchComics,
  getPopularComics,
  getRecommendedComics,
  BASE_URL
};
