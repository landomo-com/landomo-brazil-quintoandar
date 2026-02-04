/**
 * Reverse engineer QuintoAndar API by capturing network requests
 * Uses Playwright stealth mode to see what API calls the website makes
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin
chromium.use(stealth());

interface APICall {
  url: string;
  method: string;
  status: number;
  responseBody?: any;
  requestHeaders?: any;
  requestBody?: any;
}

async function reverseEngineerDetailPage() {
  console.log(`\n🔍 Reverse engineering detail page API calls\n`);

  const apiCalls: APICall[] = [];

  // Launch browser with stealth
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  const page = await context.newPage();

  // Capture all network requests
  page.on('request', (request) => {
    const url = request.url();
    // Only log API calls (not images, CSS, etc.)
    if (
      url.includes('apigw.prod.quintoandar.com.br') ||
      url.includes('api.quintoandar.com') ||
      url.includes('/api/') ||
      url.includes('/graphql')
    ) {
      console.log(`📤 REQUEST: ${request.method()} ${url}`);
    }
  });

  // Capture all network responses
  page.on('response', async (response) => {
    const url = response.url();
    const request = response.request();

    // Only capture API calls
    if (
      url.includes('apigw.prod.quintoandar.com.br') ||
      url.includes('api.quintoandar.com') ||
      url.includes('/api/') ||
      url.includes('/graphql')
    ) {
      try {
        const status = response.status();
        console.log(`📥 RESPONSE: ${status} ${request.method()} ${url}`);

        let responseBody;
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            responseBody = await response.json();
          } else {
            responseBody = await response.text();
          }
        } catch (e) {
          // Can't read body
        }

        apiCalls.push({
          url,
          method: request.method(),
          status,
          responseBody,
          requestHeaders: request.headers(),
          requestBody: request.postData(),
        });
      } catch (error) {
        console.error(`Error capturing response: ${error}`);
      }
    }
  });

  try {
    // Navigate to search page first
    const searchUrl = 'https://www.quintoandar.com.br/alugar/imovel/brasilia-df-brasil';
    console.log(`\n🌐 Navigating to search page: ${searchUrl}\n`);

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('✅ Search page loaded\n');
    await page.waitForTimeout(5000); // Wait for listings to load

    // Find and click on first property listing
    console.log('🔍 Looking for property listings...\n');

    // Try multiple selectors
    const propertyLink = await page.locator('a[href*="/imovel/"]').first();
    const isVisible = await propertyLink.isVisible().catch(() => false);

    if (isVisible) {
      const href = await propertyLink.getAttribute('href');
      console.log(`✅ Found property link: ${href}\n`);

      // Click the property link
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        propertyLink.click(),
      ]);

      console.log('✅ Detail page loaded\n');
      await page.waitForTimeout(5000); // Wait for all API calls

    } else {
      console.log('❌ No property links found\n');
    }

    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 API CALLS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total API calls captured: ${apiCalls.length}\n`);

    // Analyze captured API calls
    for (const call of apiCalls) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`🔗 ${call.method} ${call.url}`);
      console.log(`📍 Status: ${call.status}`);

      // Check if this looks like property data
      if (call.responseBody && typeof call.responseBody === 'object') {
        const jsonStr = JSON.stringify(call.responseBody);

        // Look for property-related keywords
        const hasPropertyData =
          jsonStr.includes('bedrooms') ||
          jsonStr.includes('rent') ||
          jsonStr.includes('bathrooms') ||
          jsonStr.includes('salePrice') ||
          jsonStr.includes('totalCost');

        if (hasPropertyData) {
          console.log(`✅ FOUND PROPERTY DATA!`);
          console.log(`\n📦 Response preview (first 1000 chars):`);
          console.log(jsonStr.substring(0, 1000));

          // Show request details
          if (call.requestBody) {
            console.log(`\n📤 Request Body:`);
            console.log(call.requestBody);
          }

          console.log(`\n📋 Request Headers (key ones):`);
          const importantHeaders = [
            'authorization',
            'x-api-key',
            'x-client-id',
            'x-device-id',
            'content-type',
            'accept',
          ];
          for (const header of importantHeaders) {
            if (call.requestHeaders[header]) {
              console.log(`  ${header}: ${call.requestHeaders[header]}`);
            }
          }
        }
      }
    }

    // Save full details to file
    const fs = require('fs');
    fs.writeFileSync(
      '/tmp/quintoandar-api-calls.json',
      JSON.stringify(apiCalls, null, 2)
    );
    console.log(`\n\n💾 Full API capture saved to: /tmp/quintoandar-api-calls.json`);
  } catch (error) {
    console.error(`Error: ${error}`);
  } finally {
    await browser.close();
  }
}

// Reverse engineer detail page
reverseEngineerDetailPage();

async function reverseEngineerAPI(propertyId: string) {
  console.log(`\n🔍 Reverse engineering API for property ${propertyId}\n`);

  const apiCalls: APICall[] = [];

  // Launch browser with stealth
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  const page = await context.newPage();

  // Capture network requests (same as before)
  page.on('request', (request) => {
    const url = request.url();
    if (
      url.includes('apigw.prod.quintoandar.com.br') ||
      url.includes('api.quintoandar.com') ||
      url.includes('/api/') ||
      url.includes('/graphql')
    ) {
      console.log(`📤 REQUEST: ${request.method()} ${url}`);
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    const request = response.request();

    if (
      url.includes('apigw.prod.quintoandar.com.br') ||
      url.includes('api.quintoandar.com') ||
      url.includes('/api/') ||
      url.includes('/graphql')
    ) {
      try {
        const status = response.status();
        console.log(`📥 RESPONSE: ${status} ${request.method()} ${url}`);

        let responseBody;
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            responseBody = await response.json();
          } else {
            responseBody = await response.text();
          }
        } catch (e) {
          // Can't read body
        }

        apiCalls.push({
          url,
          method: request.method(),
          status,
          responseBody,
          requestHeaders: request.headers(),
          requestBody: request.postData(),
        });
      } catch (error) {
        console.error(`Error capturing response: ${error}`);
      }
    }
  });

  try {
    const propertyUrl = `https://www.quintoandar.com.br/imovel/${propertyId}`;
    console.log(`\n🌐 Navigating to: ${propertyUrl}\n`);

    await page.goto(propertyUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📊 API CALLS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total API calls captured: ${apiCalls.length}\n`);

    for (const call of apiCalls) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`🔗 ${call.method} ${call.url}`);
      console.log(`📍 Status: ${call.status}`);

      if (call.responseBody && typeof call.responseBody === 'object') {
        const jsonStr = JSON.stringify(call.responseBody);
        const hasPropertyData =
          jsonStr.includes('bedrooms') ||
          jsonStr.includes('rent') ||
          jsonStr.includes('bathrooms') ||
          jsonStr.includes('salePrice') ||
          jsonStr.includes('totalCost');

        if (hasPropertyData) {
          console.log(`✅ FOUND PROPERTY DATA!`);
          console.log(`\n📦 Response preview (first 1000 chars):`);
          console.log(jsonStr.substring(0, 1000));

          if (call.requestBody) {
            console.log(`\n📤 Request Body:`);
            console.log(call.requestBody);
          }

          console.log(`\n📋 Request Headers (key ones):`);
          const importantHeaders = [
            'authorization',
            'x-api-key',
            'x-client-id',
            'x-device-id',
            'content-type',
            'accept',
          ];
          for (const header of importantHeaders) {
            if (call.requestHeaders[header]) {
              console.log(`  ${header}: ${call.requestHeaders[header]}`);
            }
          }
        }
      }
    }

    const fs = require('fs');
    fs.writeFileSync(
      '/tmp/quintoandar-direct-api-calls.json',
      JSON.stringify(apiCalls, null, 2)
    );
    console.log(`\n\n💾 Full API capture saved to: /tmp/quintoandar-direct-api-calls.json`);
  } catch (error) {
    console.error(`Error: ${error}`);
  } finally {
    await browser.close();
  }
}
