/**
 * Advanced API Service
 * Integrates all processing components untuk efficient data handling
 */

const { DataProcessor, DataEnrichmentService, BatchProcessor, DataAggregationService } = require('./data_processor');
const QueryBuilder = require('./query_builder');
const ParallelProcessor = require('./parallel_processor');
const ResponseOptimizer = require('./response_optimizer');
const { executeScraper, listProviders } = require('./provider_manager');

/**
 * Advanced API Service
 * Main service untuk mengolah data dengan pipeline yang kompleks
 */
class ApiService {
  constructor() {
    this.processor = new DataProcessor();
    this.setupPipeline();
  }

  /**
   * Setup default processing pipeline
   */
  setupPipeline() {
    // Validation stage
    this.processor.addStage('validate', (data, context) => {
      if (!data) {
        throw new Error('No data provided');
      }
      return data;
    });

    // Normalization stage
    this.processor.addStage('normalize', (data, context) => {
      if (Array.isArray(data)) {
        return data.map(item => this.normalizeItem(item));
      }
      return this.normalizeItem(data);
    });

    // Enrichment stage
    this.processor.addStage('enrich', (data, context) => {
      if (Array.isArray(data)) {
        return data.map(item => DataEnrichmentService.enrichComic(item, {
          includeSearchable: true,
          normalize: true,
          includeTimestamps: true
        }));
      }
      return DataEnrichmentService.enrichComic(data, {
        includeSearchable: true,
        normalize: true,
        includeTimestamps: true
      });
    });
  }

  /**
   * Normalize item
   * @param {object} item - Item to normalize
   * @returns {object} Normalized item
   */
  normalizeItem(item) {
    // Basic normalization - can be extended
    return item;
  }

  /**
   * Get latest comics with advanced processing
   * @param {object} options - Query options
   * @returns {Promise<object>} Processed comics
   */
  async getLatestComics(options = {}) {
    const {
      page = 1,
      provider = null,
      providers = null, // Multiple providers
      query = {},
      enrich = true,
      optimize = true
    } = options;

    const context = { page, provider, query };

    // Determine providers to use
    let providersList = [];
    if (providers && Array.isArray(providers)) {
      providersList = providers;
    } else if (provider) {
      providersList = [provider];
    } else {
      // Use all enabled providers
      const allProviders = listProviders();
      providersList = allProviders.map(p => p.id);
    }

    // Process providers
    let result;
    if (providersList.length > 1) {
      // Parallel processing
      result = await ParallelProcessor.processProviders(
        providersList,
        'getLatestComics',
        [page],
        {
          aggregate: true,
          aggregateOptions: {
            deduplicate: true,
            sortBy: 'qualityScore',
            limit: query.limit
          }
        }
      );
    } else {
      // Single provider
      const data = await executeScraper(providersList[0], 'getLatestComics', page);
      result = {
        success: true,
        providers: providersList,
        data: data.data || data,
        metadata: {
          current_page: data.current_page || page,
          length_page: data.length_page || 1
        }
      };
    }

    let comics = Array.isArray(result.data) ? result.data : (result.data?.data || []);

    // Apply query builder
    if (Object.keys(query).length > 0) {
      const queryBuilder = QueryBuilder.fromQuery(query);
      const queryResult = queryBuilder.execute(comics);
      comics = queryResult.data;
      context.pagination = {
        current_page: queryResult.page,
        length_page: queryResult.totalPages,
        total: queryResult.total
      };
    }

    // Process through pipeline
    if (enrich) {
      comics = await this.processor.process(comics, context);
    }

    // Optimize response
    if (optimize) {
      comics = ResponseOptimizer.optimize(comics, {
        removeNulls: true,
        removeEmpty: false
      });
    }

    return {
      status: 'success',
      data: comics,
      pagination: context.pagination || result.metadata || {
        current_page: page,
        length_page: 1
      },
      metadata: {
        providers: providersList,
        processed: comics.length,
        ...result.metadata
      }
    };
  }

  /**
   * Search comics with advanced processing
   * @param {object} options - Search options
   * @returns {Promise<object>} Search results
   */
  async searchComics(options = {}) {
    const {
      keyword,
      provider = null,
      providers = null,
      query = {},
      enrich = true,
      optimize = true
    } = options;

    if (!keyword) {
      throw new Error('Keyword is required');
    }

    const context = { keyword, provider, query };

    // Determine providers
    let providersList = [];
    if (providers && Array.isArray(providers)) {
      providersList = providers;
    } else if (provider) {
      providersList = [provider];
    } else {
      const allProviders = listProviders();
      providersList = allProviders.map(p => p.id);
    }

    // Process providers
    let result;
    if (providersList.length > 1) {
      result = await ParallelProcessor.processProviders(
        providersList,
        'searchComics',
        [keyword],
        {
          aggregate: true,
          aggregateOptions: {
            deduplicate: true,
            sortBy: 'qualityScore'
          }
        }
      );
    } else {
      const data = await executeScraper(providersList[0], 'searchComics', keyword);
      result = {
        success: true,
        providers: providersList,
        data: Array.isArray(data) ? data : (data.data || [])
      };
    }

    let comics = Array.isArray(result.data) ? result.data : [];

    // Apply query builder
    if (Object.keys(query).length > 0) {
      const queryBuilder = QueryBuilder.fromQuery({ ...query, search: keyword });
      const queryResult = queryBuilder.execute(comics);
      comics = queryResult.data;
    }

    // Process through pipeline
    if (enrich) {
      comics = await this.processor.process(comics, context);
    }

    // Optimize response
    if (optimize) {
      comics = ResponseOptimizer.optimize(comics, {
        removeNulls: true
      });
    }

    return {
      status: 'success',
      data: comics,
      metadata: {
        keyword,
        providers: providersList,
        total: comics.length,
        ...result.metadata
      }
    };
  }

  /**
   * Get popular comics with advanced processing
   * @param {object} options - Query options
   * @returns {Promise<object>} Popular comics
   */
  async getPopularComics(options = {}) {
    const {
      provider = null,
      providers = null,
      query = {},
      enrich = true,
      optimize = true
    } = options;

    const context = { provider, query };

    // Determine providers
    let providersList = [];
    if (providers && Array.isArray(providers)) {
      providersList = providers;
    } else if (provider) {
      providersList = [provider];
    } else {
      const allProviders = listProviders();
      providersList = allProviders.map(p => p.id);
    }

    // Process providers
    let result;
    if (providersList.length > 1) {
      result = await ParallelProcessor.processProviders(
        providersList,
        'getPopularComics',
        [],
        {
          aggregate: true,
          aggregateOptions: {
            deduplicate: true,
            sortBy: 'rating'
          }
        }
      );
    } else {
      const data = await executeScraper(providersList[0], 'getPopularComics');
      result = {
        success: true,
        providers: providersList,
        data: Array.isArray(data) ? data : (data.data || [])
      };
    }

    let comics = Array.isArray(result.data) ? result.data : [];

    // Apply query builder
    if (Object.keys(query).length > 0) {
      const queryBuilder = QueryBuilder.fromQuery(query);
      const queryResult = queryBuilder.execute(comics);
      comics = queryResult.data;
    }

    // Process through pipeline
    if (enrich) {
      comics = await this.processor.process(comics, context);
    }

    // Optimize response
    if (optimize) {
      comics = ResponseOptimizer.optimize(comics, {
        removeNulls: true
      });
    }

    return {
      status: 'success',
      data: comics,
      metadata: {
        providers: providersList,
        total: comics.length,
        ...result.metadata
      }
    };
  }

  /**
   * Get recommended comics with advanced processing
   * @param {object} options - Query options
   * @returns {Promise<object>} Recommended comics
   */
  async getRecommendedComics(options = {}) {
    return this.getPopularComics({ ...options }); // Similar processing
  }

  /**
   * Get comic detail with advanced processing
   * @param {object} options - Detail options
   * @returns {Promise<object>} Comic detail
   */
  async getComicDetail(options = {}) {
    const {
      url,
      provider = null,
      enrich = true,
      optimize = true
    } = options;

    if (!url) {
      throw new Error('URL is required');
    }

    const context = { url, provider };

    // Get detail
    const providersList = provider ? [provider] : listProviders().map(p => p.id);
    let detail;

    // Try providers with fallback
    try {
      detail = await ParallelProcessor.processWithFallback(
        providersList,
        'getComicDetail',
        [url]
      );
    } catch (error) {
      throw error;
    }

    let comic = detail.data;

    // Process through pipeline
    if (enrich) {
      comic = await this.processor.process(comic, context);
    }

    // Enrich chapters
    if (comic.chapter && Array.isArray(comic.chapter)) {
      comic.chapter = comic.chapter.map(ch => DataEnrichmentService.enrichChapter(ch));
    }

    // Optimize response
    if (optimize) {
      comic = ResponseOptimizer.optimize(comic, {
        removeNulls: true
      });
    }

    return {
      status: 'success',
      data: comic,
      metadata: {
        provider: detail.provider,
        fallback: detail.fallback
      }
    };
  }
}

// Export singleton instance
const apiService = new ApiService();

module.exports = apiService;

