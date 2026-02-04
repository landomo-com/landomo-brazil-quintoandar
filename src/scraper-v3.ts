/**
 * QuintoAndar Scraper V3 - Uses yellow-pages detail endpoint
 * Scrapes ALL 70 Brazilian cities
 */

import axios from 'axios';
import { config, CITY_COORDS } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { TLSClient } from './tls-client';
import { ScraperResult, CityCoordinates, APIResponse } from './types';

// ALL 73 Brazilian cities from sitemap (including smallest municipalities)
const ALL_CITIES = [
  'americana-sp', 'aparecida-de-goiania-go', 'barueri-sp', 'belford-roxo-rj',
  'belo-horizonte-mg', 'betim-mg', 'brasilia-df', 'brumadinho-mg',
  'campinas-sp', 'canoas-rs', 'carapicuiba-sp', 'contagem-mg',
  'cotia-sp', 'curitiba-pr', 'diadema-sp', 'duque-de-caxias-rj',
  'embu-das-artes-sp', 'ferraz-de-vasconcelos-sp', 'florianopolis-sc', 'goiania-go',
  'guaruja-sp', 'guarulhos-sp', 'hortolandia-sp', 'indaiatuba-sp',
  'itabirito-mg', 'itaquaquecetuba-sp', 'jacarei-sp', 'jundiai-sp',
  'lagoa-santa-mg', 'maua-sp', 'mesquita-rj', 'mogi-das-cruzes-sp',
  'nilopolis-rj', 'niteroi-rj', 'nova-iguacu-rj', 'nova-lima-mg',
  'novo-hamburgo-rs', 'osasco-sp', 'paulinia-sp', 'pinhais-pr',
  'poa-sp', 'porto-alegre-rs', 'praia-grande-sp', 'ribeirao-das-neves-mg',
  'ribeirao-pires-sp', 'ribeirao-preto-sp', 'rio-de-janeiro-rj', 'sabara-mg',
  'salvador-ba', 'santana-de-parnaiba-sp', 'santo-andre-sp', 'santos-sp',
  'sao-bernardo-do-campo-sp', 'sao-caetano-do-sul-sp', 'sao-goncalo-rj', 'sao-jose-dos-campos-sp',
  'sao-jose-dos-pinhais-pr', 'sao-jose-sc', 'sao-leopoldo-rs', 'sao-paulo-sp',
  'sao-vicente-sp', 'sorocaba-sp', 'sumare-sp', 'suzano-sp',
  'taboao-da-serra-sp', 'taubate-sp', 'uberlandia-mg', 'valinhos-sp',
  'varzea-paulista-sp', 'vespasiano-mg', 'viamao-rs', 'vinhedo-sp',
  'votorantim-sp',
];

export class QuintoAndarScraperV3 {
  private client: TLSClient;
  private processedIds = new Set<string>();

  constructor() {
    this.client = new TLSClient();
  }

  async initialize() {
    await this.client.initialize();
    logger.info('QuintoAndar V3 scraper initialized');
  }

  /**
   * Parse city slug to get city name and state
   */
  private parseCitySlug(slug: string): { city: string; state: string } {
    const parts = slug.split('-');
    const state = parts[parts.length - 1].toUpperCase();
    const cityParts = parts.slice(0, -1);
    const city = cityParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return { city, state };
  }

  /**
   * Get city info (coordinates and viewport)
   */
  private getCityInfo(slug: string): CityCoordinates {
    // Use existing coordinates if available
    if (CITY_COORDS[slug + '-brasil']) {
      return CITY_COORDS[slug + '-brasil'];
    }
    // Default to São Paulo
    return CITY_COORDS['sao-paulo-sp-brasil'];
  }

  /**
   * Fetch listing IDs using coordinates endpoint
   */
  async fetchListingIds(slug: string, offset: number = 0, pageSize: number = 100): Promise<{ ids: string[]; total: number }> {
    const cityInfo = this.getCityInfo(slug);
    const viewport = cityInfo.viewport;

    const params: Record<string, string> = {
      'context.mapShowing': 'true',
      'context.listShowing': 'true',
      'context.deviceId': 'scraper-' + Math.random().toString(36).substring(7),
      'context.numPhotos': '12',
      'context.isSSR': 'false',
      'filters.businessContext': config.businessContext,
      'filters.location.coordinate.lat': String(cityInfo.lat),
      'filters.location.coordinate.lng': String(cityInfo.lng),
      'filters.location.countryCode': 'BR',
      'filters.availability': 'ANY',
      'filters.occupancy': 'ANY',
      'filters.enableFlexibleSearch': 'true',
      [slug + '-brasil']: slug + '-brasil',
      'pagination.offset': String(offset),
      'pagination.pageSize': String(pageSize),
    };

    if (viewport) {
      params['filters.location.viewport.north'] = String(viewport.north);
      params['filters.location.viewport.south'] = String(viewport.south);
      params['filters.location.viewport.east'] = String(viewport.east);
      params['filters.location.viewport.west'] = String(viewport.west);
    }

    const fullUrl = `${config.baseApiUrl}${config.coordinatesEndpoint}`;
    const response = await this.client.get(fullUrl, params);
    const data: APIResponse = response.data;

    if (!data.hits || !data.hits.hits) {
      return { ids: [], total: 0 };
    }

    const ids = data.hits.hits.map(hit => hit._id);
    const total = data.hits.total.value;

    return { ids, total };
  }

  /**
   * Fetch property details using yellow-pages endpoint
   */
  async fetchPropertyDetail(listingId: string): Promise<any | null> {
    const returnFields = [
      'id', 'rent', 'salePrice', 'forRent', 'forSale', 'bedrooms', 'bathrooms',
      'area', 'totalCost', 'city', 'address', 'neighbourhood', 'type', 'coverImage',
      'parkingSpaces', 'condominium', 'iptuPlusCondominium', 'location', 'imageList',
      'amenities', 'installations', 'visitStatus', 'hasElevator', 'isFurnished',
      'regionName', 'countryCode',
    ];

    const params: Record<string, string> = {
      house_ids: listingId,
      availability: 'any',
      business_context: config.businessContext,
    };

    returnFields.forEach(field => {
      params[`return`] = field; // Will send multiple return params
    });

    // Build URL with all return parameters
    const baseUrl = 'https://www.quintoandar.com.br/api/yellow-pages/v2/search';
    const queryParams = new URLSearchParams();
    queryParams.append('house_ids', listingId);
    queryParams.append('availability', 'any');
    queryParams.append('business_context', config.businessContext);
    returnFields.forEach(field => queryParams.append('return', field));

    try {
      // Use regular axios for this endpoint (not apigw domain)
      const response = await axios.get(`${baseUrl}?${queryParams.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });

      const data = response.data;

      if (data.hits && data.hits.hits && data.hits.hits.length > 0) {
        const hit = data.hits.hits[0];
        return {
          id: hit._id,
          source: 'quintoandar',
          url: `https://www.quintoandar.com.br/imovel/${hit._id}`,
          ...hit._source,
          rawData: hit._source,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error fetching property detail', {
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Scrape a single city
   */
  async scrapeCity(citySlug: string): Promise<ScraperResult> {
    const { city, state } = this.parseCitySlug(citySlug);
    logger.info(`Starting V3 scrape for ${city}, ${state}`);

    const result: ScraperResult = {
      total: 0,
      scraped: 0,
      failed: 0,
      city,
      state,
      properties: [],
    };

    try {
      // Phase 1: Collect listing IDs
      logger.info(`Phase 1: Fetching listing IDs for ${city}`);
      const allIds: string[] = [];
      let offset = 0;
      const pageSize = 100;

      const firstPage = await this.fetchListingIds(citySlug, 0, pageSize);
      result.total = firstPage.total;
      allIds.push(...firstPage.ids);

      logger.info(`Found ${result.total} listings in ${city}`);

      // Fetch remaining pages with rate limiting
      offset += pageSize;
      while (offset < result.total) {
        await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

        try {
          const page = await this.fetchListingIds(citySlug, offset, pageSize);
          allIds.push(...page.ids);
          offset += pageSize;

          if (offset % 500 === 0) {
            logger.info(`Collected ${allIds.length} IDs...`);
          }

          // Rotate TLS every 3 pages
          if (offset % (pageSize * 3) === 0) {
            await this.client.rotateProfile();
          }
        } catch (error) {
          logger.warn(`Failed at offset ${offset}, stopping`, {
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }

      logger.info(`Phase 1 complete: ${allIds.length} IDs collected`);

      // Phase 2: Fetch details for each property
      logger.info(`Phase 2: Fetching property details`);

      for (const id of allIds) {
        if (this.processedIds.has(id)) continue;

        let retries = 0;
        const maxRetries = 3;
        let success = false;

        while (retries <= maxRetries && !success) {
          try {
            const property = await this.fetchPropertyDetail(id);

            if (property) {
              this.processedIds.add(property.id);
              const standardized = transformToStandard(property);
              result.scraped++;
              result.properties.push(standardized);

              if (config.apiKey) {
                await sendToCoreService({
                  portal: config.portal,
                  portal_id: property.id,
                  country: config.country,
                  data: standardized,
                  raw_data: property.rawData,
                });
              }

              if (config.debug && result.scraped <= 3) {
                logger.debug('Sample V3 property', { property, standardized });
              }
            }

            success = true;

            // Rate limiting
            await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

            // Rotate TLS every 10 requests
            if (result.scraped % 10 === 0) {
              await this.client.rotateProfile();
            }

            if (result.scraped % 50 === 0 && result.scraped > 0) {
              logger.info(`Progress: ${result.scraped}/${allIds.length} properties`);
            }
          } catch (error) {
            retries++;
            if (retries > maxRetries) {
              result.failed++;
              logger.error('Failed after retries', { id });
            } else {
              const backoffDelay = config.requestDelayMs * Math.pow(2, retries - 1);
              await randomDelay(backoffDelay, backoffDelay * 1.5);
            }
          }
        }
      }

      logger.info(`Completed ${city}:`, {
        total: result.total,
        scraped: result.scraped,
        failed: result.failed,
      });
    } catch (error) {
      logger.error(`Failed to scrape ${city}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * Scrape all cities in parallel
   */
  async scrapeAllCities(cityLimit?: number): Promise<ScraperResult[]> {
    const citiesToScrape = cityLimit ? ALL_CITIES.slice(0, cityLimit) : ALL_CITIES;

    logger.info(`Starting scrape for ${citiesToScrape.length} cities`);

    const promises = citiesToScrape.map(async (citySlug) => {
      try {
        return await this.scrapeCity(citySlug);
      } catch (error) {
        logger.error(`Failed to scrape ${citySlug}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          total: 0,
          scraped: 0,
          failed: 0,
          city: citySlug,
          state: '',
          properties: [],
        };
      }
    });

    return await Promise.all(promises);
  }

  async cleanup() {
    await this.client.destroy();
  }
}

// Main execution
async function main() {
  logger.info('Starting QuintoAndar V3 scraper - ALL 73 Brazilian cities');

  const scraper = new QuintoAndarScraperV3();
  await scraper.initialize();

  try {
    // Scrape ALL cities in parallel!
    const results = await scraper.scrapeAllCities();

    const allProperties = results.flatMap(r => r.properties);
    console.log(JSON.stringify(allProperties));

    const summary = {
      totalListings: results.reduce((sum, r) => sum + r.total, 0),
      totalScraped: results.reduce((sum, r) => sum + r.scraped, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      cities: results.length,
      propertiesCollected: allProperties.length,
    };

    logger.info('🎉 V3 Scraping completed - ALL BRAZIL', summary);

    await scraper.cleanup();
  } catch (error) {
    logger.error('V3 Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
