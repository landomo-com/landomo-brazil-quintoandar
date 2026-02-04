/**
 * Find the property detail endpoint by loading a property page
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

async function findDetailEndpoint() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const detailAPICalls: any[] = [];

  // Capture API responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('quintoandar.com')) {
      const method = response.request().method();
      const status = response.status();

      // Only log QuintoAndar API calls
      if (url.includes('apigw.prod.quintoandar.com.br') || url.includes('/api/')) {
        console.log(`${status} ${method} ${url}`);

        try {
          const body = await response.json();
          const bodyStr = JSON.stringify(body);

          // Check if this contains full property details
          if (
            bodyStr.includes('"rent"') &&
            bodyStr.includes('"bedrooms"') &&
            bodyStr.includes('"address"')
          ) {
            console.log('\n✅ FOUND DETAIL ENDPOINT!');
            console.log(`URL: ${url}`);
            console.log(`Method: ${method}`);
            console.log(`Status: ${status}`);
            console.log(`Response preview: ${bodyStr.substring(0, 500)}...\n`);

            detailAPICalls.push({
              url,
              method,
              status,
              body,
            });
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
  });

  const propertyId = '894910935';
  console.log(`\nLoading property: ${propertyId}\n`);

  await page.goto(`https://www.quintoandar.com.br/imovel/${propertyId}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  console.log('\nWaiting for additional API calls...\n');
  await page.waitForTimeout(5000);

  await browser.close();

  if (detailAPICalls.length > 0) {
    console.log(`\n✅ Found ${detailAPICalls.length} detail endpoint(s)!`);
    const fs = require('fs');
    fs.writeFileSync('/tmp/detail-endpoints.json', JSON.stringify(detailAPICalls, null, 2));
    console.log('Saved to: /tmp/detail-endpoints.json');
  } else {
    console.log('\n❌ No detail endpoint found');
  }
}

findDetailEndpoint();
