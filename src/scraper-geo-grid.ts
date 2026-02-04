/**
 * QuintoAndar Geo Grid Scraper - Covers ENTIRE Brazil using geographic grid
 * Divides Brazil into grid cells and searches each area comprehensively
 */

import axios from 'axios';
import { config } from './config';
import { transformToStandard } from './transformer';
import { sendToCoreService } from './core';
import { logger } from './logger';
import { randomDelay } from './utils';
import { TLSClient } from './tls-client';
import { ScraperResult, APIResponse } from './types';

// Brazil's geographic boundaries
const BRAZIL_BOUNDS = {
  north: 5.27,      // Roraima (northern border)
  south: -33.75,    // Rio Grande do Sul (southern border)
  east: -34.79,     // Paraíba coast (eastern border)
  west: -73.99,     // Acre (western border)
};

// Grid cell size (in degrees) - 0.5° ≈ 55km at equator
const GRID_SIZE = 0.5;

interface GridCell {
  lat: number;
  lng: number;
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  index: number;
  total: number;
}

export class QuintoAndarGeoGridScraper {
  private client: TLSClient;
  private processedIds = new Set<string>();
  private allListingIds = new Set<string>();

  constructor() {
    this.client = new TLSClient();
  }

  async initialize() {
    await this.client.initialize();
    logger.info('QuintoAndar Geo Grid scraper initialized');
  }

  /**
   * Generate grid cells covering entire Brazil
   */
  generateGrid(): GridCell[] {
    const cells: GridCell[] = [];
    let index = 0;

    // Calculate number of cells
    const latSteps = Math.ceil((BRAZIL_BOUNDS.north - BRAZIL_BOUNDS.south) / GRID_SIZE);
    const lngSteps = Math.ceil((BRAZIL_BOUNDS.east - BRAZIL_BOUNDS.west) / GRID_SIZE);
    const totalCells = latSteps * lngSteps;

    logger.info(`Generating grid: ${latSteps} rows × ${lngSteps} cols = ${totalCells} cells`);

    for (let lat = BRAZIL_BOUNDS.south; lat < BRAZIL_BOUNDS.north; lat += GRID_SIZE) {
      for (let lng = BRAZIL_BOUNDS.west; lng < BRAZIL_BOUNDS.east; lng += GRID_SIZE) {
        const cellLat = lat + (GRID_SIZE / 2); // Center of cell
        const cellLng = lng + (GRID_SIZE / 2);

        cells.push({
          lat: cellLat,
          lng: cellLng,
          viewport: {
            north: lat + GRID_SIZE,
            south: lat,
            east: lng + GRID_SIZE,
            west: lng,
          },
          index: ++index,
          total: totalCells,
        });
      }
    }

    return cells;
  }

  /**
   * Fetch listing IDs for a specific grid cell
   */
  async fetchCellListingIds(cell: GridCell, offset: number = 0, pageSize: number = 100): Promise<{ ids: string[]; total: number }> {
    const params: Record<string, string> = {
      'context.mapShowing': 'true',
      'context.listShowing': 'true',
      'context.deviceId': 'scraper-' + Math.random().toString(36).substring(7),
      'context.numPhotos': '12',
      'context.isSSR': 'false',
      'filters.businessContext': config.businessContext,
      'filters.location.coordinate.lat': String(cell.lat),
      'filters.location.coordinate.lng': String(cell.lng),
      'filters.location.countryCode': 'BR',
      'filters.availability': 'ANY',
      'filters.occupancy': 'ANY',
      'filters.enableFlexibleSearch': 'true',
      'filters.location.viewport.north': String(cell.viewport.north),
      'filters.location.viewport.south': String(cell.viewport.south),
      'filters.location.viewport.east': String(cell.viewport.east),
      'filters.location.viewport.west': String(cell.viewport.west),
      'pagination.offset': String(offset),
      'pagination.pageSize': String(pageSize),
    };

    try {
      const fullUrl = `${config.baseApiUrl}${config.coordinatesEndpoint}`;
      const response = await this.client.get(fullUrl, params);
      const data: APIResponse = response.data;

      if (!data.hits || !data.hits.hits) {
        return { ids: [], total: 0 };
      }

      const ids = data.hits.hits.map(hit => hit._id);
      const total = data.hits.total.value;

      return { ids, total };
    } catch (error) {
      logger.error('Error fetching cell IDs', {
        cell: `[${cell.lat.toFixed(2)}, ${cell.lng.toFixed(2)}]`,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ids: [], total: 0 };
    }
  }

  /**
   * Scrape all listings from a single grid cell
   */
  async scrapeCell(cell: GridCell): Promise<number> {
    let collectedIds: string[] = [];
    let offset = 0;
    const pageSize = 100;

    try {
      // Fetch first page to get total count
      const firstPage = await this.fetchCellListingIds(cell, 0, pageSize);

      if (firstPage.total === 0) {
        return 0; // Empty cell, skip
      }

      collectedIds.push(...firstPage.ids);

      logger.info(`Cell ${cell.index}/${cell.total} [${cell.lat.toFixed(2)}, ${cell.lng.toFixed(2)}]: ${firstPage.total} listings`);

      // Fetch remaining pages if needed
      offset += pageSize;
      while (offset < firstPage.total) {
        await randomDelay(config.requestDelayMs * 0.5, config.requestDelayMs * 1.0);

        const page = await this.fetchCellListingIds(cell, offset, pageSize);
        collectedIds.push(...page.ids);
        offset += pageSize;

        // Rotate TLS every 3 pages
        if (offset % (pageSize * 3) === 0) {
          await this.client.rotateProfile();
        }
      }

      // Add to global set (deduplication)
      const newIds = collectedIds.filter(id => !this.allListingIds.has(id));
      newIds.forEach(id => this.allListingIds.add(id));

      if (newIds.length > 0) {
        logger.info(`Cell ${cell.index}/${cell.total}: ${newIds.length} new IDs (${collectedIds.length - newIds.length} duplicates)`);
      }

      return newIds.length;
    } catch (error) {
      logger.error(`Failed to scrape cell ${cell.index}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
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

    const baseUrl = 'https://www.quintoandar.com.br/api/yellow-pages/v2/search';
    const queryParams = new URLSearchParams();
    queryParams.append('house_ids', listingId);
    queryParams.append('availability', 'any');
    queryParams.append('business_context', config.businessContext);
    returnFields.forEach(field => queryParams.append('return', field));

    try {
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
   * Phase 1: Discover all listing IDs across entire Brazil using grid search
   */
  async discoverAllListings(): Promise<void> {
    logger.info('=== PHASE 1: Geographic Grid Discovery ===');

    const grid = this.generateGrid();
    logger.info(`Generated ${grid.length} grid cells covering all of Brazil`);

    let cellsProcessed = 0;
    let cellsWithListings = 0;

    // Process grid cells sequentially (can be parallelized with batching)
    for (const cell of grid) {
      const newIds = await this.scrapeCell(cell);

      cellsProcessed++;
      if (newIds > 0) {
        cellsWithListings++;
      }

      // Progress update every 50 cells
      if (cellsProcessed % 50 === 0) {
        logger.info(`Progress: ${cellsProcessed}/${grid.length} cells | ${this.allListingIds.size} unique IDs | ${cellsWithListings} cells with listings`);
      }

      // Rate limiting
      await randomDelay(config.requestDelayMs * 0.3, config.requestDelayMs * 0.8);
    }

    logger.info('=== PHASE 1 COMPLETE ===', {
      totalCells: grid.length,
      cellsWithListings,
      uniqueListingIds: this.allListingIds.size,
    });
  }

  /**
   * Phase 2: Fetch detailed data for all discovered listings
   */
  async fetchAllDetails(): Promise<ScraperResult> {
    logger.info('=== PHASE 2: Fetching Property Details ===');
    logger.info(`Processing ${this.allListingIds.size} unique listings`);

    const result: ScraperResult = {
      total: this.allListingIds.size,
      scraped: 0,
      failed: 0,
      city: 'all-brazil',
      state: 'all',
      properties: [],
    };

    const listingIds = Array.from(this.allListingIds);

    for (const id of listingIds) {
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
              logger.debug('Sample property', { property, standardized });
            }
          }

          success = true;

          // Rate limiting
          await randomDelay(config.requestDelayMs * 0.6, config.requestDelayMs * 1.6);

          // Rotate TLS every 10 requests
          if (result.scraped % 10 === 0) {
            await this.client.rotateProfile();
          }

          if (result.scraped % 100 === 0 && result.scraped > 0) {
            logger.info(`Progress: ${result.scraped}/${this.allListingIds.size} properties`);
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

    logger.info('=== PHASE 2 COMPLETE ===', {
      total: result.total,
      scraped: result.scraped,
      failed: result.failed,
    });

    return result;
  }

  async cleanup() {
    await this.client.destroy();
  }
}

// Main execution
async function main() {
  logger.info('Starting QuintoAndar Geo Grid Scraper - ENTIRE BRAZIL');
  logger.info('Strategy: Geographic grid search covering all coordinates');

  const scraper = new QuintoAndarGeoGridScraper();
  await scraper.initialize();

  try {
    // Phase 1: Discover all listing IDs using grid search
    await scraper.discoverAllListings();

    // Phase 2: Fetch detailed data for all listings
    const result = await scraper.fetchAllDetails();

    console.log(JSON.stringify(result.properties));

    const summary = {
      totalListings: result.total,
      totalScraped: result.scraped,
      totalFailed: result.failed,
      propertiesCollected: result.properties.length,
      coverage: 'entire-brazil-geographic-grid',
    };

    logger.info('🎉 Geo Grid Scraping completed - ENTIRE BRAZIL', summary);

    await scraper.cleanup();
  } catch (error) {
    logger.error('Geo Grid Scraping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
