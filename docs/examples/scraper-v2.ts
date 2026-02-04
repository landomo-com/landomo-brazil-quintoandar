/**
 * QuintoAndar Scraper V2 - Uses discovered /nearby endpoint
 * Returns FULL property data including price, bedrooms, etc.
 */

import { config, CITY_COORDS } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { TLSClient } from './tls-client';
import {
  QuintoAndarListing,
  APIResponse,
  ScraperResult,
  CityCoordinates,
} from './types';

interface NearbyResponse {
  recommendation_id: string;
  showcase: string;
  took: number;
  hits: {
    hits: Array<{
      _id: string;
      _score: number;
      _source: any;
      fields?: any;
    }>;
  };
}

export class QuintoAndarScraperV2 {
  private client: TLSClient;
  private processedIds = new Set<string>();

  constructor() {
    this.client = new TLSClient();
  }

  async initialize() {
    await this.client.initialize();
    logger.info('QuintoAndar V2 scraper initialized with TLS fingerprinting');
  }

  /**
   * Get city slug in QuintoAndar format
   */
  private getCitySlug(city: string, state: string): string {
    const citySlug = city
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/ã/g, 'a')
      .replace(/á/g, 'a')
      .replace(/é/g, 'e')
      .replace(/í/g, 'i')
      .replace(/ó/g, 'o')
      .replace(/ú/g, 'u')
      .replace(/ç/g, 'c');
    const stateSlug = state.toLowerCase();
    return `${citySlug}-${stateSlug}-brasil`;
  }

  /**
   * Get coordinates for a city
   */
  private getCityInfo(city: string, state: string): CityCoordinates {
    const slug = this.getCitySlug(city, state);
    return CITY_COORDS[slug] || CITY_COORDS['sao-paulo-sp-brasil'];
  }

  /**
   * Build params for coordinates endpoint (to get listing IDs)
   */
  private buildListingsParams(
    city: string,
    state: string,
    businessContext: 'RENT' | 'SALE',
    offset: number,
    pageSize: number
  ): Record<string, string> {
    const slug = this.getCitySlug(city, state);
    const cityInfo = this.getCityInfo(city, state);
    const viewport = cityInfo.viewport;

    const params: Record<string, string> = {
      'context.mapShowing': 'true',
      'context.listShowing': 'true',
      'context.deviceId': 'scraper-device-id',
      'context.numPhotos': '12',
      'context.isSSR': 'false',
      'filters.businessContext': businessContext,
      'filters.location.coordinate.lat': String(cityInfo.lat),
      'filters.location.coordinate.lng': String(cityInfo.lng),
      'filters.location.countryCode': 'BR',
      'filters.availability': 'ANY',
      'filters.occupancy': 'ANY',
      'filters.enableFlexibleSearch': 'true',
      [slug]: slug,
      'pagination.offset': String(offset),
      'pagination.pageSize': String(pageSize),
    };

    if (viewport) {
      params['filters.location.viewport.north'] = String(viewport.north);
      params['filters.location.viewport.south'] = String(viewport.south);
      params['filters.location.viewport.east'] = String(viewport.east);
      params['filters.location.viewport.west'] = String(viewport.west);
    }

    return params;
  }

  /**
   * Fetch listing IDs from coordinates endpoint
   */
  async fetchListingIds(
    city: string,
    state: string,
    businessContext: 'RENT' | 'SALE',
    offset: number = 0,
    pageSize: number = 100
  ): Promise<{ ids: string[]; total: number }> {
    const params = this.buildListingsParams(city, state, businessContext, offset, pageSize);
    const fullUrl = `${config.baseApiUrl}${config.coordinatesEndpoint}`;

    try {
      const response = await this.client.get(fullUrl, params);
      const data: APIResponse = response.data;

      if (config.debug) {
        logger.info('Coordinates API response structure', {
          hasHits: !!data.hits,
          hasHitsHits: !!(data.hits && data.hits.hits),
          responseKeys: Object.keys(data),
        });
      }

      if (!data.hits || !data.hits.hits) {
        logger.error('Invalid response structure from coordinates API', {
          response: JSON.stringify(data).substring(0, 500),
        });
        throw new Error('Invalid API response structure');
      }

      const ids = data.hits.hits.map((hit) => hit._id);
      const total = data.hits.total.value;

      return { ids, total };
    } catch (error) {
      logger.error('Error fetching listing IDs', {
        city,
        state,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Fetch full property details using /nearby endpoint
   */
  async fetchPropertyDetails(listingId: string, businessContext: 'RENT' | 'SALE'): Promise<any[]> {
    const url = `${config.baseApiUrl}/house-listing-search/v1/recommendation/listing/${listingId}/nearby`;

    const requestBody = {
      businessContext: businessContext,
      context: {
        deviceId: 'scraper-device-' + Math.random().toString(36).substring(7),
      },
    };

    try {
      const response = await this.client.post(url, requestBody);
      const data: NearbyResponse = response.data;

      if (config.debug) {
        logger.info('Nearby API response', {
          listingId,
          hasHits: !!data.hits,
          hitCount: data.hits?.hits?.length || 0,
        });
      }

      if (!data.hits || !data.hits.hits || data.hits.hits.length === 0) {
        logger.warn('No properties returned from /nearby endpoint', { listingId });
        return [];
      }

      // Extract properties from response
      const properties = data.hits.hits.map((hit) => ({
        id: hit._id,
        source: 'quintoandar',
        url: `https://www.quintoandar.com.br/imovel/${hit._id}`,
        ...hit._source,
        rawData: hit._source,
      }));

      return properties;
    } catch (error) {
      logger.error('Error fetching property details', {
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(city: string, state: string): Promise<ScraperResult> {
    logger.info(`Starting V2 scrape for ${city}, ${state}`);

    const result: ScraperResult = {
      total: 0,
      scraped: 0,
      failed: 0,
      city,
      state,
      properties: [],
    };

    try {
      // Phase 1: Get all listing IDs from coordinates endpoint
      logger.info(`Phase 1: Fetching listing IDs for ${city}`);
      const allIds: string[] = [];
      let offset = 0;
      const pageSize = 100;

      // Fetch first page to get total
      const firstPage = await this.fetchListingIds(city, state, config.businessContext, 0, pageSize);
      result.total = firstPage.total;
      allIds.push(...firstPage.ids);

      logger.info(`Found ${result.total} listings in ${city}, ${state}`);

      // Fetch remaining pages with proper rate limiting
      offset += pageSize;
      while (offset < result.total && offset < 1000) {
        // Random delay between requests to same area (3-8 seconds)
        const minDelay = config.requestDelayMs * 0.6;
        const maxDelay = config.requestDelayMs * 1.6;
        await randomDelay(minDelay, maxDelay);

        // Rotate TLS fingerprint every 3 pages
        if (offset % (pageSize * 3) === 0) {
          await this.client.rotateProfile();
          logger.info('Rotated TLS fingerprint during ID collection');
        }

        try {
          const page = await this.fetchListingIds(city, state, config.businessContext, offset, pageSize);
          allIds.push(...page.ids);
          offset += pageSize;

          if (offset % 500 === 0) {
            logger.info(`Collected ${allIds.length} IDs so far...`);
          }
        } catch (error) {
          logger.warn(`Failed to fetch page at offset ${offset}, stopping pagination`, {
            error: error instanceof Error ? error.message : String(error),
          });
          break; // Stop pagination on error but keep what we have
        }
      }

      logger.info(`Phase 1 complete: ${allIds.length} IDs collected`);

      // Phase 2: Fetch full details using /nearby endpoint
      logger.info(`Phase 2: Fetching full property details`);

      let requestCount = 0;
      for (const id of allIds) {
        if (this.processedIds.has(id)) {
          continue; // Skip already processed
        }

        // Exponential backoff retry logic
        let retries = 0;
        const maxRetries = 3;
        let success = false;

        while (retries <= maxRetries && !success) {
          try {
            const properties = await this.fetchPropertyDetails(id, config.businessContext);

            for (const prop of properties) {
              if (this.processedIds.has(prop.id)) {
                continue;
              }

              this.processedIds.add(prop.id);

              const standardized = transformToStandard(prop);
              result.scraped++;
              result.properties.push(standardized);

              // Send to Core Service if configured
              if (config.apiKey) {
                await sendToCoreService({
                  portal: config.portal,
                  portal_id: prop.id,
                  country: config.country,
                  data: standardized,
                  raw_data: prop.rawData,
                });
              }

              if (config.debug && result.scraped <= 3) {
                logger.debug('Sample V2 listing', { prop, standardized });
              }
            }

            success = true;
            requestCount++;

            // Rate limiting with random delays (3-8 seconds)
            const minDelay = config.requestDelayMs * 0.6;
            const maxDelay = config.requestDelayMs * 1.6;
            await randomDelay(minDelay, maxDelay);

            // Rotate TLS every 5 requests
            if (requestCount % 5 === 0) {
              await this.client.rotateProfile();
              logger.info('Rotated TLS fingerprint during detail fetch');
            }

            if (result.scraped % 50 === 0 && result.scraped > 0) {
              logger.info(`Progress: ${result.scraped} properties with full details`);
            }
          } catch (error) {
            retries++;
            if (retries > maxRetries) {
              result.failed++;
              logger.error('Failed to fetch details after retries', {
                id,
                retries: maxRetries,
                error: error instanceof Error ? error.message : String(error),
              });
            } else {
              // Exponential backoff: 5s, 10s, 20s
              const backoffDelay = config.requestDelayMs * Math.pow(2, retries - 1);
              logger.info(`Retry ${retries}/${maxRetries} after ${backoffDelay}ms delay`, { id });
              await randomDelay(backoffDelay, backoffDelay * 1.5);
            }
          }
        }
      }

      logger.info(`Completed V2 scrape for ${city}, ${state}`, result);
    } catch (error) {
      logger.error(`Failed to scrape ${city}, ${state}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return result;
  }

  async cleanup() {
    await this.client.destroy();
    logger.info('TLS client destroyed');
  }
}

// Main execution
async function main() {
  logger.info('Starting QuintoAndar V2 scraper with /nearby endpoint');

  const scraper = new QuintoAndarScraperV2();
  await scraper.initialize();

  // Test with single city first
  const testCity = { city: 'Brasília', state: 'DF' };

  try {
    const result = await scraper.scrapeCity(testCity.city, testCity.state);

    console.log(JSON.stringify(result.properties));

    logger.info('V2 Scraping completed', {
      total: result.total,
      scraped: result.scraped,
      failed: result.failed,
    });

    await scraper.cleanup();
  } catch (error) {
    logger.error('V2 Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
