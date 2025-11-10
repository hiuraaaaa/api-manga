/**
 * Scraper Service
 * Centralized scraping logic for Komikcast website
 * Now supports provider selection via provider manager
 */

const cheerio = require('cheerio');
const { AxiosService } = require('../helper/axios_service');
const { ParseError } = require('../helper/error_handler');
const {
  normalizeComicItem,
  normalizeChapterItem,
  normalizePagination,
  normalizeUrl
} = require('../helper/data_validator');
const { resolveProvider, executeScraper } = require('./provider_manager');

const BASE_URL = 'https://komikcast03.com';

/**
 * Extract pagination info from element
 * @param {object} $ - Cheerio instance
 * @param {object} element - Cheerio element
 * @returns {object} Pagination info
 */
const extractPagination = ($, element) => {
  const currentPage = element
    .find('.pagination > .page-numbers.current')
    .text()
    .trim();

  let lengthPage = 1;

  // Try different pagination patterns
  const paginationPatterns = [
    { selector: '.pagination > .page-numbers:nth-child(6)', class: 'next page-numbers', fallback: 5 },
    { selector: '.pagination > .page-numbers:nth-child(8)', class: 'next page-numbers', fallback: 7 },
    { selector: '.pagination > .page-numbers:nth-child(9)', class: 'next page-numbers', fallback: 8 },
    { selector: '.pagination > .page-numbers:nth-child(10)', class: 'next page-numbers', fallback: 9 },
    { selector: '.pagination > .page-numbers:nth-child(11)', class: 'next page-numbers', fallback: 10 },
    { selector: '.pagination > .page-numbers:nth-child(4)', class: 'next page-numbers', fallback: 3 },
    { selector: '.pagination > .page-numbers:nth-child(3)', class: 'next page-numbers', fallback: 2 },
    { selector: '.pagination > .page-numbers:nth-child(6)', class: 'page-numbers current', fallback: 6 }
  ];

  for (const pattern of paginationPatterns) {
    const el = element.find(pattern.selector);
    if (el.attr('class') === pattern.class) {
      lengthPage = el.prev().text().trim() || element.find(pattern.selector).eq(pattern.fallback - 1).text().trim();
      break;
    }
  }

  // Alternative pagination extraction for genre pages
  if (!lengthPage || lengthPage === '') {
    const altCurrent = element.find('.listupd > .list-update_items > .pagination > .current').text().trim();
    if (altCurrent) {
      // Try to find last page number
      const lastPageEl = element.find('.pagination > .page-numbers').last();
      if (lastPageEl.length && !lastPageEl.hasClass('next')) {
        lengthPage = lastPageEl.text().trim();
      }
    }
  }

  return {
    current_page: currentPage ? parseFloat(currentPage) : 1,
    length_page: lengthPage ? parseFloat(lengthPage) : 1
  };
};

/**
 * Extract comic item from list element
 * @param {object} $ - Cheerio instance
 * @param {object} element - Cheerio element
 * @param {string} selector - Selector for comic items
 * @returns {Array} Array of comic items
 */
const extractComicList = ($, element, selector = '.list-update_item') => {
  const comics = [];

  element.find(selector).each((i, data) => {
    try {
      const $item = $(data);
      
      const title = $item.find('a > .list-update_item-info > h3, a > .splide__slide-info > .title').text().trim();
      const href = $item.find('a').attr('href') || '';
      const thumbnail = $item.find('a > .list-update_item-image > img, a > .splide__slide-image > img').attr('src') || '';
      const type = $item.find('a > .list-update_item-image > .type, a > .splide__slide-image > .type').text().trim();
      const chapter = $item.find('a > .list-update_item-info > .other > .chapter, a > .splide__slide-info > .other > .chapter').text().trim();
      const rating = $item.find('a > .list-update_item-info > .other > .rate > .rating > .numscore, a > .splide__slide-info > .other > .rate > .rating > .numscore').text().trim();

      if (title && href) {
        comics.push(normalizeComicItem({
          title,
          href: normalizeUrl(href, `${BASE_URL}/komik`),
          thumbnail,
          type,
          chapter,
          rating
        }, BASE_URL));
      }
    } catch (error) {
      console.error('Error extracting comic item:', error);
    }
  });

  return comics;
};

/**
 * Get latest comics
 * @param {number} page - Page number
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<object>} Latest comics with pagination
 */
const getLatestComics = async (page, provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getLatestComics', page);
  }
  
  try {
    const url = `${BASE_URL}/project-list/page/${page}`;
    const response = await AxiosService(url);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch latest comics');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > .postbody > .bixbox');

    const pagination = extractPagination($, element);
    const comics = extractComicList($, element, '.list-update_items > .list-update_items-wrapper > .list-update_item');

    return {
      ...pagination,
      data: comics
    };
  } catch (error) {
    throw new ParseError(`Error scraping latest comics: ${error.message}`, error);
  }
};

/**
 * Get comics by genre
 * @param {string} genreUrl - Genre URL slug
 * @param {number} page - Page number
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<object>} Comics by genre with pagination
 */
const getComicsByGenre = async (genreUrl, page, provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getComicsByGenre', genreUrl, page);
  }
  
  try {
    const url = `${BASE_URL}/genres/${genreUrl}/page/${page}`;
    const response = await AxiosService(url);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch comics by genre');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > .postbody > .bixbox');

    // Alternative pagination check
    const checkPagination = element.find('.listupd > .list-update_items > .pagination > .current').text().trim();
    const pagination = extractPagination($, element);
    
    // Use alternative if main pagination is empty
    if (checkPagination && !pagination.current_page) {
      pagination.current_page = parseInt(checkPagination) || 1;
    }

    const comics = extractComicList($, element, '.listupd > .list-update_items > .list-update_items-wrapper > .list-update_item');

    return {
      ...pagination,
      data: comics
    };
  } catch (error) {
    throw new ParseError(`Error scraping comics by genre: ${error.message}`, error);
  }
};

/**
 * Get all genres
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<Array>} Array of genres
 */
const getGenres = async (provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getGenres');
  }
  
  try {
    const response = await AxiosService(BASE_URL);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch genres');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper');
    const genres = [];

    element.find('#sidebar > .section > ul.genre > li').each((i, data) => {
      const title = $(data).find('a').text().trim();
      const href = $(data).find('a').attr('href') || '';
      
      if (title && href) {
        genres.push({
          title,
          href: normalizeUrl(href, `${BASE_URL}/genres`)
        });
      }
    });

    return genres;
  } catch (error) {
    throw new ParseError(`Error scraping genres: ${error.message}`, error);
  }
};

/**
 * Get comic detail
 * @param {string} url - Comic URL slug
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<object>} Comic detail
 */
const getComicDetail = async (url, provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getComicDetail', url);
  }
  
  try {
    const comicUrl = `${BASE_URL}/manga/${url}`;
    const response = await AxiosService(comicUrl);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch comic detail');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > .komik_info');

    const rating = element.find('.komik_info-body > .komik_info-content > .komik_info-content-rating > .komik_info-content-rating-bungkus > .data-rating > strong').text().trim();
    const title = element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > h1').text().trim();
    const released = element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > .komik_info-content-meta > span:nth-child(1)').text().trim();
    const author = element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > .komik_info-content-meta > span:nth-child(2)').text().trim();
    const status = element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > .komik_info-content-meta > span:nth-child(3)').text().trim();
    const type = element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > .komik_info-content-meta > span:nth-child(4)').text().trim();
    const description = element.find('.komik_info-description-sinopsis > p').text().trim();
    const thumbnail = element.find('.komik_info-cover-box > .komik_info-cover-image > img').attr('src') || '';

    const chapters = [];
    element.find('.komik_info-body > .komik_info-chapters > ul > li').each((i, data) => {
      const $item = $(data);
      const title = $item.find('a').text().trim();
      const href = $item.find('a').attr('href') || $item.find('a:nth-child(2)').attr('href') || '';
      const date = $item.find('.chapter-link-time').text().trim();
      
      if (title && href) {
        chapters.push(normalizeChapterItem({
          title: `Chapter ${title.replace('Chapter', '').trim()}`,
          href: normalizeUrl(href, `${BASE_URL}/chapter`),
          date
        }, BASE_URL));
      }
    });

    const genres = [];
    element.find('.komik_info-body > .komik_info-content > .komik_info-content-body > .komik_info-content-genre > a').each((i, data) => {
      const title = $(data).text().trim();
      const href = $(data).attr('href') || '';
      
      if (title && href) {
        genres.push({
          title,
          href: normalizeUrl(href, `${BASE_URL}/genres`)
        });
      }
    });

    return normalizeComicItem({
      title,
      rating: rating.replace('Rating ', ''),
      status: status.replace('Status:', '').trim(),
      type: type.replace('Type:', '').trim(),
      released: released.replace('Released:', '').trim(),
      author: author.replace('Author:', '').trim(),
      genre: genres,
      description,
      thumbnail,
      chapter: chapters
    }, BASE_URL);
  } catch (error) {
    throw new ParseError(`Error scraping comic detail: ${error.message}`, error);
  }
};

/**
 * Read chapter (get images)
 * @param {string} url - Chapter URL
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<object>} Chapter data with images
 */
const readChapter = async (url, provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'readChapter', url);
  }
  
  try {
    const chapterUrl = `${BASE_URL}/${url}`;
    const response = await AxiosService(chapterUrl);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch chapter');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper');
    
    const title = element.find('.chapter_headpost > h1').text().trim();
    const panels = [];

    element.find('.chapter_ > #chapter_body > .main-reading-area > img').each((i, data) => {
      const src = $(data).attr('src');
      if (src) {
        panels.push(src);
      }
    });

    return {
      title,
      panel: panels
    };
  } catch (error) {
    throw new ParseError(`Error scraping chapter: ${error.message}`, error);
  }
};

/**
 * Search comics
 * @param {string} keyword - Search keyword
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<Array>} Array of search results
 */
const searchComics = async (keyword, provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'searchComics', keyword);
  }
  
  try {
    const url = `${BASE_URL}/?s=${encodeURIComponent(keyword)}`;
    const response = await AxiosService(url);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to search comics');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > .postbody > .dev > #main > .list-update');
    
    const comics = extractComicList($, element, '.list-update_items > .list-update_items-wrapper > .list-update_item');

    return comics;
  } catch (error) {
    throw new ParseError(`Error searching comics: ${error.message}`, error);
  }
};

/**
 * Get popular comics
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<Array>} Array of popular comics
 */
const getPopularComics = async (provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getPopularComics');
  }
  
  try {
    const response = await AxiosService(BASE_URL);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch popular comics');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > #sidebar');
    const comics = [];

    element.find('.section > .widget-post > .serieslist.pop > ul > li').each((i, data) => {
      const $item = $(data);
      const title = $item.find('.leftseries > h2 > a').text().trim();
      const year = $item.find('.leftseries > span:nth-child(3)').text().trim();
      const genre = $item.find('.leftseries > span:nth-child(2)').text().trim();
      const thumbnail = $item.find('.imgseries > a > img').attr('src') || '';
      const href = $item.find('.imgseries > a').attr('href') || '';

      if (title && href) {
        comics.push(normalizeComicItem({
          title,
          href: normalizeUrl(href, `${BASE_URL}/komik`),
          genre: genre.replace('Genres:', '').trim(),
          year,
          thumbnail
        }, BASE_URL));
      }
    });

    return comics;
  } catch (error) {
    throw new ParseError(`Error scraping popular comics: ${error.message}`, error);
  }
};

/**
 * Get recommended comics
 * @param {string} provider - Provider ID (optional)
 * @returns {Promise<Array>} Array of recommended comics
 */
const getRecommendedComics = async (provider = null) => {
  const providerId = resolveProvider(provider);
  
  if (providerId !== 'komikcast') {
    return executeScraper(providerId, 'getRecommendedComics');
  }
  
  try {
    const response = await AxiosService(BASE_URL);
    
    if (response.status !== 200) {
      throw new ParseError('Failed to fetch recommended comics');
    }

    const $ = cheerio.load(response.data);
    const element = $('#content > .wrapper > .bixbox > .listupd > .swiper > .swiper-wrapper > .swiper-slide');
    
    const comics = extractComicList($, element, '.swiper-slide');

    return comics.filter(comic => comic.href);
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
