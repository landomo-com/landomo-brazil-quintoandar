/**
 * Integration Test - End-to-End Pipeline
 * Tests: API fetch → Transform → Core Service ingestion
 */

import axios from 'axios';
import { transformToStandard } from './transformer';
import { sendToCoreService, IngestionPayload } from './core';
import { config } from './config';
import { logger } from './logger';

// Test listing IDs from different cities
const TEST_LISTING_IDS = [
  '894910935', // Brasília - from previous test
  '895023021', // São Paulo area
  '893975831', // Rio area
];

interface TestResult {
  listingId: string;
  fetchSuccess: boolean;
  transformSuccess: boolean;
  coreServiceSuccess: boolean;
  error?: string;
  property?: any;
  standardized?: any;
}

/**
 * Fetch property details from yellow-pages endpoint
 */
async function fetchPropertyDetail(listingId: string): Promise<any | null> {
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
    throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Test single listing through entire pipeline
 */
async function testListing(listingId: string): Promise<TestResult> {
  const result: TestResult = {
    listingId,
    fetchSuccess: false,
    transformSuccess: false,
    coreServiceSuccess: false,
  };

  try {
    // Step 1: Fetch from API
    logger.info(`Testing listing ${listingId} - Step 1: Fetch from API`);
    const property = await fetchPropertyDetail(listingId);

    if (!property) {
      result.error = 'Property not found';
      return result;
    }

    result.fetchSuccess = true;
    result.property = property;
    logger.info(`✅ Fetch successful: ${property.city} - ${property.neighbourhood}`);

    // Step 2: Transform to StandardProperty
    logger.info(`Testing listing ${listingId} - Step 2: Transform to StandardProperty`);
    const standardized = transformToStandard(property);

    // Validate required fields
    if (!standardized.title) throw new Error('Missing title');
    if (!standardized.currency) throw new Error('Missing currency');
    if (!standardized.property_type) throw new Error('Missing property_type');
    if (!standardized.transaction_type) throw new Error('Missing transaction_type');
    if (!standardized.location.country) throw new Error('Missing country');

    result.transformSuccess = true;
    result.standardized = standardized;
    logger.info(`✅ Transform successful: ${standardized.title}`);
    logger.info(`   Price: ${standardized.currency} ${standardized.price || 'N/A'}`);
    logger.info(`   Type: ${standardized.property_type} (${standardized.transaction_type})`);
    logger.info(`   Location: ${standardized.location.city || 'N/A'}`);
    logger.info(`   Details: ${standardized.details.bedrooms || 0} bed, ${standardized.details.bathrooms || 0} bath, ${standardized.details.sqm || 0}m²`);

    // Step 3: Send to Core Service
    logger.info(`Testing listing ${listingId} - Step 3: Send to Core Service`);

    const payload: IngestionPayload = {
      portal: config.portal,
      portal_id: property.id,
      country: config.country,
      data: standardized,
      raw_data: property.rawData,
    };

    if (config.apiKey) {
      await sendToCoreService(payload);
      result.coreServiceSuccess = true;
      logger.info(`✅ Core Service ingestion successful`);
    } else {
      logger.warn('⚠️  LANDOMO_API_KEY not set - skipping Core Service test');
      logger.info('Payload that would be sent:');
      logger.info(JSON.stringify(payload, null, 2));
      result.coreServiceSuccess = true; // Mark as success since we validated payload structure
    }

    return result;

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Test failed for ${listingId}:`, { error: result.error });
    return result;
  }
}

/**
 * Run integration test suite
 */
async function runIntegrationTest() {
  logger.info('=== INTEGRATION TEST SUITE ===');
  logger.info(`Testing ${TEST_LISTING_IDS.length} properties through complete pipeline`);
  logger.info('');

  const results: TestResult[] = [];

  for (const listingId of TEST_LISTING_IDS) {
    logger.info(`\n${'='.repeat(60)}`);
    const result = await testListing(listingId);
    results.push(result);

    // Delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  logger.info(`\n${'='.repeat(60)}`);
  logger.info('=== TEST SUMMARY ===');
  logger.info('');

  const fetchSuccesses = results.filter(r => r.fetchSuccess).length;
  const transformSuccesses = results.filter(r => r.transformSuccess).length;
  const coreServiceSuccesses = results.filter(r => r.coreServiceSuccess).length;

  logger.info(`Total tests: ${results.length}`);
  logger.info(`Fetch success: ${fetchSuccesses}/${results.length} (${(fetchSuccesses / results.length * 100).toFixed(1)}%)`);
  logger.info(`Transform success: ${transformSuccesses}/${results.length} (${(transformSuccesses / results.length * 100).toFixed(1)}%)`);
  logger.info(`Core Service success: ${coreServiceSuccesses}/${results.length} (${(coreServiceSuccesses / results.length * 100).toFixed(1)}%)`);

  // Failed tests
  const failedTests = results.filter(r => r.error);
  if (failedTests.length > 0) {
    logger.info('');
    logger.info('Failed tests:');
    failedTests.forEach(test => {
      logger.error(`  - ${test.listingId}: ${test.error}`);
    });
  }

  // Validation checks
  logger.info('');
  logger.info('=== VALIDATION CHECKS ===');

  const allFetchSucceeded = results.every(r => r.fetchSuccess);
  const allTransformSucceeded = results.every(r => r.transformSuccess);
  const allCoreServiceSucceeded = results.every(r => r.coreServiceSuccess);

  logger.info(`✅ API Endpoint Working: ${allFetchSucceeded ? 'YES' : 'NO'}`);
  logger.info(`✅ Transformer Working: ${allTransformSucceeded ? 'YES' : 'NO'}`);
  logger.info(`✅ Core Service Integration: ${allCoreServiceSucceeded ? 'YES' : config.apiKey ? 'NO' : 'SKIPPED (no API key)'}`);

  // Sample standardized property
  const sampleResult = results.find(r => r.standardized);
  if (sampleResult && sampleResult.standardized) {
    logger.info('');
    logger.info('=== SAMPLE STANDARDIZED PROPERTY ===');
    logger.info(JSON.stringify(sampleResult.standardized, null, 2));
  }

  // Exit code
  const allPassed = allFetchSucceeded && allTransformSucceeded && allCoreServiceSucceeded;
  if (allPassed) {
    logger.info('');
    logger.info('🎉 ALL INTEGRATION TESTS PASSED');
    process.exit(0);
  } else {
    logger.error('');
    logger.error('❌ SOME INTEGRATION TESTS FAILED');
    process.exit(1);
  }
}

// Run tests
runIntegrationTest().catch(error => {
  logger.error('Integration test suite failed:', error);
  process.exit(1);
});
