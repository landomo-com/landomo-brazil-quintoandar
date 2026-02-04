/**
 * QuintoAndar Scraper - Uses the apigw.prod.quintoandar.com.br API
 * API discovered via network capture - returns JSON directly
 * Primarily a rental platform but also has sales
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
  SearchPayload,
  ScraperResult,
  CityCoordinates,
} from './types';

export class QuintoAndarScraper {
  private client: TLSClient;
  private hasLoggedSample: boolean = false;
  private hasLoggedParams: boolean = false;

  constructor() {
    this.client = new TLSClient();
  }

  async initialize() {
    await this.client.initialize();
    logger.info('QuintoAndar scraper initialized with TLS fingerprinting');
  }

  /**
   * Convert city and state to QuintoAndar slug format
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
   * Get coordinates and viewport for a city
   */
  private getCityInfo(city: string, state: string): CityCoordinates {
    const slug = this.getCitySlug(city, state);
    return CITY_COORDS[slug] || CITY_COORDS['sao-paulo-sp-brasil'];
  }

  /**
   * Build query parameters for listings endpoint
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
      slug: slug,
      'pagination.offset': String(offset),
      'pagination.pageSize': String(pageSize),
    };

    // Add viewport
    if (viewport) {
      params['filters.location.viewport.north'] = String(viewport.north);
      params['filters.location.viewport.south'] = String(viewport.south);
      params['filters.location.viewport.east'] = String(viewport.east);
      params['filters.location.viewport.west'] = String(viewport.west);
    }

    // Don't add field selections - let API return all fields by default
    // (Adding fields selection seems to cause API to return minimal data)

    return params;
  }

  /**
   * Fetch listings from API
   */
  async fetchListings(
    city: string,
    state: string,
    businessContext: 'RENT' | 'SALE',
    offset: number = 0,
    pageSize: number = 100
  ): Promise<APIResponse> {
    const params = this.buildListingsParams(city, state, businessContext, offset, pageSize);

    if (config.debug && offset === 0 && !this.hasLoggedParams) {
      logger.info('API Request params sample:', {
        endpoint: config.coordinatesEndpoint,
        paramCount: Object.keys(params).length,
        fields: Object.keys(params).filter(k => k.startsWith('fields[')).length
      });
      this.hasLoggedParams = true;
    }

    try {
      const fullUrl = `${config.baseApiUrl}${config.coordinatesEndpoint}`;
      const response = await this.client.get(fullUrl, params);

      return response.data;
    } catch (error) {
      logger.error('Error fetching listings', {
        city,
        state,
        businessContext,
        offset,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Parse a single listing from API response
   */
  private parseListing(hit: QuintoAndarListing, businessContext: 'RENT' | 'SALE'): any {
    const source = hit._source;
    const listingId = hit._id;

    // Debug: Log first listing to see actual API structure
    if (config.debug && !this.hasLoggedSample) {
      logger.info('Sample API response structure:', { source, hit });
      this.hasLoggedSample = true;
    }

    // Determine transaction type and price
    const isSale = source.forSale || businessContext === 'SALE';
    const transactionType = isSale ? 'sale' : 'rent';
    const price = isSale ? source.salePrice : source.rent;

    // Get total cost breakdown for rentals
    const totalCost = source.totalCost;
    const condoIptu = source.iptuPlusCondominium;

    // Build URL
    const url = `https://www.quintoandar.com.br/imovel/${listingId}`;

    // Location
    const location = source.location;
    const lat = location?.lat;
    const lon = location?.lon;

    // Property type mapping
    const propType = source.type?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      apartment: 'apartamento',
      house: 'casa',
      kitnet: 'kitnet',
      studio: 'studio',
      flat: 'flat',
      condominium: 'condominio',
    };
    const propertyType = typeMap[propType] || propType;

    // Cover image
    const images: string[] = [];
    if (source.coverImage) {
      images.push(source.coverImage);
    }

    return {
      id: listingId,
      source: 'quintoandar',
      url,
      title: `${source.type || 'Imóvel'} em ${source.neighbourhood || ''}`,
      price: price ? Number(price) : undefined,
      condoFee: condoIptu ? Number(condoIptu) : undefined,
      totalMonthly: totalCost ? Number(totalCost) : undefined,
      transactionType,
      propertyType: propertyType || undefined,
      bedrooms: source.bedrooms,
      bathrooms: source.bathrooms,
      parkingSpaces: source.parkingSpaces,
      totalAreaM2: source.area ? Number(source.area) : undefined,
      address: source.address,
      neighborhood: source.neighbourhood,
      city: source.city,
      latitude: lat,
      longitude: lon,
      images,
      rawData: source,
    };
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(city: string, state: string): Promise<ScraperResult> {
    logger.info(`Starting scrape for ${city}, ${state}`);

    const result: ScraperResult = {
      total: 0,
      scraped: 0,
      failed: 0,
      city,
      state,
      properties: [],
    };

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchListings(city, state, config.businessContext, 0, config.pageSize);
      result.total = firstPage.hits.total.value;

      logger.info(`Found ${result.total} listings in ${city}, ${state}`);

      // Process all pages
      let offset = 0;
      while (offset < result.total) {
        let response;
        let retries = 0;
        const maxRetries = 3;

        while (retries <= maxRetries) {
          try {
            response = await this.fetchListings(
              city,
              state,
              config.businessContext,
              offset,
              config.pageSize
            );
            break; // Success, exit retry loop
          } catch (error) {
            retries++;
            if (retries > maxRetries) {
              logger.warn(`Stopping pagination at offset ${offset} after ${maxRetries} retries`, {
                city,
                state,
                error: error instanceof Error ? error.message : String(error),
              });
              break; // Stop pagination but keep what we got
            }

            // Exponential backoff: 5s, 10s, 20s
            const backoffDelay = config.requestDelayMs * Math.pow(2, retries - 1);
            logger.info(`Retry ${retries}/${maxRetries} after ${backoffDelay}ms delay`, { city, state, offset });
            await randomDelay(backoffDelay, backoffDelay * 1.5);
          }
        }

        if (!response) break; // No response after retries, stop pagination

        for (const hit of response.hits.hits) {
          try {
            const parsed = this.parseListing(hit, config.businessContext);
            const standardized = transformToStandard(parsed);

            // Always count as scraped
            result.scraped++;
            result.properties.push(standardized);

            // Send to Core Service if configured
            if (config.apiKey) {
              await sendToCoreService({
                portal: config.portal,
                portal_id: parsed.id,
                country: config.country,
                data: standardized,
                raw_data: parsed.rawData,
              });
            }

            if (config.debug && result.scraped <= 3) {
              logger.debug('Sample listing', { parsed, standardized });
            }
          } catch (error) {
            result.failed++;
            logger.error('Failed to process listing', {
              listingId: hit._id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        offset += config.pageSize;
        logger.info(`Progress: ${offset}/${result.total} listings processed`);

        // Rotate TLS fingerprint every 5 pages (500 listings)
        if (offset % (config.pageSize * 5) === 0) {
          await this.client.rotateProfile();
          logger.info('Rotated TLS fingerprint');
        }

        // Rate limiting with random delays (3-8 seconds instead of fixed 5s)
        if (offset < result.total) {
          const minDelay = config.requestDelayMs * 0.6; // 3s
          const maxDelay = config.requestDelayMs * 1.6; // 8s
          await randomDelay(minDelay, maxDelay);
        }
      }

      logger.info(`Completed scrape for ${city}, ${state}`, result);
    } catch (error) {
      logger.error(`Failed to scrape ${city}, ${state}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return result;
  }

  /**
   * Cleanup TLS client
   */
  async cleanup() {
    await this.client.destroy();
    logger.info('TLS client destroyed');
  }

  /**
   * Scrape multiple cities IN PARALLEL
   */
  async scrapeAll(cities: { city: string; state: string }[]): Promise<ScraperResult[]> {
    logger.info(`Starting parallel scrape for ${cities.length} cities`);

    // Launch all city scrapers in parallel
    const promises = cities.map(async ({ city, state }) => {
      try {
        const result = await this.scrapeCity(city, state);
        return result;
      } catch (error) {
        logger.error(`Failed to scrape city`, {
          city,
          state,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          total: 0,
          scraped: 0,
          failed: 0,
          city,
          state,
          properties: [],
        };
      }
    });

    // Wait for all cities to complete
    const results = await Promise.all(promises);

    logger.info(`Completed parallel scrape for ${cities.length} cities`);
    return results;
  }
}

// Main execution
async function main() {
  logger.info('Starting QuintoAndar scraper with TLS fingerprinting');

  const scraper = new QuintoAndarScraper();
  await scraper.initialize();

  // ALL Brazilian cities with coordinates
  const cities = [
    { city: 'São Paulo', state: 'SP' },
    { city: 'Rio de Janeiro', state: 'RJ' },
    { city: 'Belo Horizonte', state: 'MG' },
    { city: 'Curitiba', state: 'PR' },
    { city: 'Porto Alegre', state: 'RS' },
    { city: 'Brasília', state: 'DF' },
    { city: 'Salvador', state: 'BA' },
    { city: 'Fortaleza', state: 'CE' },
    { city: 'Recife', state: 'PE' },
    { city: 'Campinas', state: 'SP' },
  ];

  try {
    const results = await scraper.scrapeAll(cities);

    const summary = {
      totalListings: results.reduce((sum, r) => sum + r.total, 0),
      totalScraped: results.reduce((sum, r) => sum + r.scraped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      cities: results.length,
    };

    // Output JSON for test framework
    const allProperties = results.flatMap(r => r.properties);
    console.log(JSON.stringify(allProperties));

    logger.info('Scraping completed', summary);

    // Cleanup
    await scraper.cleanup();
  } catch (error) {
    logger.error('Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
