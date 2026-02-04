/**
 * QuintoAndar Scraper - Uses the apigw.prod.quintoandar.com.br API
 * API discovered via network capture - returns JSON directly
 * Primarily a rental platform but also has sales
 */

import axios, { AxiosInstance } from 'axios';
import { config, CITY_COORDS } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import {
  QuintoAndarListing,
  APIResponse,
  SearchPayload,
  ScraperResult,
  CityCoordinates,
} from './types';

export class QuintoAndarScraper {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.baseApiUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Content-Type': 'application/json',
      },
    });
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

    // Add field selections
    const fields = [
      'id',
      'rent',
      'totalCost',
      'iptuPlusCondominium',
      'area',
      'bedrooms',
      'bathrooms',
      'parkingSpaces',
      'address',
      'regionName',
      'city',
      'neighbourhood',
      'coverImage',
      'forSale',
      'salePrice',
      'type',
      'visitStatus',
    ];

    fields.forEach((field, i) => {
      params[`fields[${i}]`] = field;
    });

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

    try {
      const response = await this.client.get<APIResponse>(config.coordinatesEndpoint, {
        params,
      });

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
    };

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchListings(city, state, config.businessContext, 0, config.pageSize);
      result.total = firstPage.hits.total.value;

      logger.info(`Found ${result.total} listings in ${city}, ${state}`);

      // Process all pages
      let offset = 0;
      while (offset < result.total) {
        const response = await this.fetchListings(
          city,
          state,
          config.businessContext,
          offset,
          config.pageSize
        );

        for (const hit of response.hits.hits) {
          try {
            const parsed = this.parseListing(hit, config.businessContext);
            const standardized = transformToStandard(parsed);

            // Send to Core Service
            if (config.apiKey) {
              await sendToCoreService({
                portal: config.portal,
                portal_id: parsed.id,
                country: config.country,
                data: standardized,
                raw_data: parsed.rawData,
              });
            }

            result.scraped++;

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

        // Rate limiting
        if (offset < result.total) {
          await randomDelay(config.requestDelayMs, config.requestDelayMs * 2);
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
   * Scrape multiple cities
   */
  async scrapeAll(cities: { city: string; state: string }[]): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    for (const { city, state } of cities) {
      try {
        const result = await this.scrapeCity(city, state);
        results.push(result);

        // Delay between cities
        await randomDelay(config.requestDelayMs * 2, config.requestDelayMs * 4);
      } catch (error) {
        logger.error(`Failed to scrape city`, {
          city,
          state,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({
          total: 0,
          scraped: 0,
          failed: 0,
          city,
          state,
        });
      }
    }

    return results;
  }
}

// Main execution
async function main() {
  logger.info('Starting QuintoAndar scraper');

  const scraper = new QuintoAndarScraper();

  // Default cities to scrape
  const cities = [
    { city: 'São Paulo', state: 'SP' },
    { city: 'Rio de Janeiro', state: 'RJ' },
    { city: 'Belo Horizonte', state: 'MG' },
    { city: 'Curitiba', state: 'PR' },
    { city: 'Porto Alegre', state: 'RS' },
  ];

  try {
    const results = await scraper.scrapeAll(cities);

    const summary = {
      totalListings: results.reduce((sum, r) => sum + r.total, 0),
      totalScraped: results.reduce((sum, r) => sum + r.scraped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      cities: results.length,
    };

    logger.info('Scraping completed', summary);
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
