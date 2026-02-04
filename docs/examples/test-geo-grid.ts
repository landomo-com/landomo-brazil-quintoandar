/**
 * Test Geo Grid Scraper - Quick test with larger grid cells
 */

import { QuintoAndarGeoGridScraper } from './scraper-geo-grid';
import { logger } from './logger';

async function testGrid() {
  logger.info('Testing Geo Grid Scraper with 2° grid cells (quick test)');

  const scraper = new QuintoAndarGeoGridScraper();
  await scraper.initialize();

  try {
    // Generate grid
    const grid = scraper.generateGrid();
    logger.info(`Generated ${grid.length} cells`);

    // Test first 10 cells
    logger.info('Testing first 10 grid cells...');

    const testCells = grid.slice(0, 10);
    for (const cell of testCells) {
      const result = await scraper.scrapeCell(cell);
      logger.info(`Cell [${cell.lat.toFixed(2)}, ${cell.lng.toFixed(2)}]: ${result} new IDs`);

      // Small delay between cells
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info(`Total unique IDs discovered: ${scraper['allListingIds'].size}`);

    await scraper.cleanup();
  } catch (error) {
    logger.error('Test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

testGrid();
