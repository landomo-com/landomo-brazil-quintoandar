# Landomo Scraper: Brazil - QuintoAndar

Scraper for **QuintoAndar** (quintoandar.com.br) in **Brazil**.

## Overview

This scraper extracts real estate listings from QuintoAndar and sends them to the Landomo Core Service for standardization and storage.

**Portal URL**: https://www.quintoandar.com.br
**Country**: Brazil
**Status**: Production Ready
**Scraping Method**: API (Unofficial)

QuintoAndar is Brazil's leading digital real estate platform, primarily focused on rentals but also handling sales. They're known for their transparent pricing (no hidden fees) and digital-first approach.

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your LANDOMO_API_KEY
   ```

3. **Run scraper**:
   ```bash
   npm start
   ```

4. **Development mode** (auto-reload):
   ```bash
   npm run dev
   ```

## Configuration

See `.env.example` for all configuration options.

Required:
- `LANDOMO_API_KEY` - API key for Landomo Core Service

Optional:
- `DEBUG=true` - Enable debug logging
- `REQUEST_DELAY_MS` - Delay between requests (default: 1000ms)
- `BUSINESS_CONTEXT` - RENT or SALE (default: RENT)
- `PAGE_SIZE` - Results per page (default: 100)
- Redis configuration for deduplication

## Architecture

This scraper follows the standard Landomo scraper pattern:

```
QuintoAndar API → Scraper → Transformer → Core Service → Core DB
```

### Files

- `src/scraper.ts` - Main scraping logic using QuintoAndar API
- `src/transformer.ts` - QuintoAndar data → StandardProperty conversion
- `src/types.ts` - TypeScript type definitions
- `src/config.ts` - Configuration management with city coordinates
- `src/logger.ts` - Winston logger setup
- `src/utils.ts` - Utility functions (delays, etc.)
- `src/redis.ts` - Redis client for deduplication

## Development

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Portal-Specific Notes

### API Endpoints

QuintoAndar uses an unofficial API at `apigw.prod.quintoandar.com.br`:

- **Count Endpoint**: `/house-listing-search/v2/search/count` - Get total listings count
- **Coordinates Endpoint**: `/cached/house-listing-search/v2/search/coordinates` - Main listings endpoint
- **Listings Endpoint**: `/cached/house-listing-search/v2/search` - Alternative listings endpoint

### Supported Cities

The scraper includes coordinates for major Brazilian cities:
- São Paulo (SP)
- Rio de Janeiro (RJ)
- Belo Horizonte (MG)
- Curitiba (PR)
- Porto Alegre (RS)
- Brasília (DF)
- Salvador (BA)
- Fortaleza (CE)
- Recife (PE)
- Campinas (SP)

### Business Context

QuintoAndar supports two business contexts:
- **RENT** (default) - Rental properties
- **SALE** - Properties for sale

Set via `BUSINESS_CONTEXT` environment variable.

### Data Structure

The API returns Elasticsearch-style responses with:
- `hits.total.value` - Total count of listings
- `hits.hits[]` - Array of listing objects

Each listing includes:
- Basic info: id, type, address, city, neighborhood
- Pricing: rent, salePrice, totalCost, iptuPlusCondominium (condo fee + property tax)
- Details: bedrooms, bathrooms, parkingSpaces, area
- Location: coordinates (lat/lon)
- Images: coverImage

### Rate Limiting

The API is relatively permissive but we implement:
- 1-2 second delay between page requests
- 2-4 second delay between cities
- Configurable via `REQUEST_DELAY_MS`

### Known Issues

- No bot detection or Cloudflare protection
- API may return up to 10,000 results max per city
- Full descriptions not available in listings endpoint (would need detail scraping)

## Country-Specific Fields

Brazil-specific fields stored in `country_specific`:

```typescript
{
  neighborhood: string;           // Brazilian neighborhood (bairro)
  condo_fee: number;             // Condominium fee
  total_monthly: number;          // Total monthly cost (rent + condo + IPTU)
  property_type_br: string;       // Original Brazilian property type
}
```

### Brazilian Property Types

- `apartamento` - Apartment
- `casa` - House
- `kitnet` - Small studio apartment
- `studio` - Studio
- `cobertura` - Penthouse
- `sobrado` - Townhouse/duplex
- `terreno` - Land

## Deployment

This scraper is deployed via GitHub Actions on every push to `main`.

See `.github/workflows/deploy.yml` for deployment configuration.

## Migration from Python

This scraper was converted from the original Python implementation at `/old/brazil/quintoandar_scraper.py`. The TypeScript version maintains the same API endpoints and logic while adding:

- Type safety with TypeScript
- Better error handling and logging
- Redis-based deduplication
- Integration with @landomo/core
- Standardized transformer pattern

## Contributing

See the main [Landomo Registry](https://github.com/landomo-com/landomo-registry) for contribution guidelines.

## License

UNLICENSED - Internal use only
