/**
 * Test Geo Grid Scraper - Major city areas
 */

import { QuintoAndarGeoGridScraper } from './scraper-geo-grid';
import { logger } from './logger';

// Major city coordinates to test
const MAJOR_CITIES = [
  { name: 'São Paulo', lat: -23.55, lng: -46.63 },
  { name: 'Rio de Janeiro', lat: -22.91, lng: -43.17 },
  { name: 'Brasília', lat: -15.79, lng: -47.89 },
  { name: 'Belo Horizonte', lat: -19.92, lng: -43.93 },
  { name: 'Porto Alegre', lat: -30.03, lng: -51.23 },
];

async function testMajorCities() {
  logger.info('Testing Geo Grid Scraper with major city cells');

  const scraper = new QuintoAndarGeoGridScraper();
  await scraper.initialize();

  try {
    const grid = scraper.generateGrid();
    logger.info(`Generated ${grid.length} total cells`);

    // Find grid cells that cover major cities
    for (const city of MAJOR_CITIES) {
      const cell = grid.find(c =>
        Math.abs(c.lat - city.lat) < 0.5 &&
        Math.abs(c.lng - city.lng) < 0.5
      );

      if (cell) {
        logger.info(`\nTesting ${city.name} area [${city.lat}, ${city.lng}]`);
        const result = await scraper.scrapeCell(cell);
        logger.info(`${city.name}: ${result} new IDs discovered`);

        // Small delay between cities
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    logger.info(`\n=== RESULTS ===`);
    logger.info(`Total unique IDs discovered: ${scraper['allListingIds'].size}`);

    // Show sample IDs
    const sampleIds = Array.from(scraper['allListingIds']).slice(0, 10);
    logger.info(`Sample IDs: ${sampleIds.join(', ')}`);

    await scraper.cleanup();
  } catch (error) {
    logger.error('Test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

testMajorCities();
