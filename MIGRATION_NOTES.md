# Migration from Python to TypeScript

## Overview

This document describes the conversion of the QuintoAndar scraper from Python to TypeScript.

## Source

**Original Python Implementation**: `/old/brazil/quintoandar_scraper.py`
- 437 lines of Python
- Used `httpx` for HTTP requests
- Sync implementation with manual async handling

**New TypeScript Implementation**: `src/scraper.ts`
- 381 lines of TypeScript
- Uses `axios` for HTTP requests
- Full async/await implementation
- Type-safe with TypeScript interfaces

## Key Changes

### 1. Project Structure

**Python** (single file):
```
quintoandar_scraper.py
models.py (external)
```

**TypeScript** (multi-file):
```
src/
├── scraper.ts       - Main scraping logic
├── transformer.ts   - Data transformation
├── types.ts         - Type definitions
├── config.ts        - Configuration + city coordinates
├── core.ts          - Core Service integration
├── logger.ts        - Winston logger
├── redis.ts         - Redis client stub
└── utils.ts         - Utility functions
```

### 2. API Endpoints

Both versions use the same QuintoAndar API:
- Base URL: `https://apigw.prod.quintoandar.com.br`
- Count Endpoint: `/house-listing-search/v2/search/count`
- Coordinates Endpoint: `/cached/house-listing-search/v2/search/coordinates`
- Listings Endpoint: `/cached/house-listing-search/v2/search`

### 3. City Coordinates

Both versions include the same 10 Brazilian cities:
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

### 4. Data Transformation

**Python**: Returned `BrazilListing` model with Brazilian-specific fields

**TypeScript**: Transforms to `StandardProperty` format with:
- Standardized fields (title, price, bedrooms, etc.)
- Country-specific fields in `country_specific` object:
  ```typescript
  {
    neighborhood: string;
    condo_fee: number;
    total_monthly: number;
    property_type_br: string;
  }
  ```

### 5. Property Type Mapping

Both versions normalize Brazilian property types:

| Brazilian | Standard |
|-----------|----------|
| apartamento | apartment |
| casa | house |
| kitnet | apartment |
| studio | apartment |
| cobertura | apartment |
| sobrado | house |
| terreno | land |
| comercial | commercial |

### 6. Business Context

Both support two modes:
- **RENT** (default) - Rental properties
- **SALE** - Properties for sale

### 7. Features Added in TypeScript Version

1. **Type Safety**: Full TypeScript types for API responses and transformations
2. **Core Service Integration**: Direct integration with Landomo Core Service API
3. **Structured Logging**: Winston-based logging with levels (info, warn, error, debug)
4. **Better Error Handling**: Try-catch blocks with detailed error logging
5. **Rate Limiting**: Configurable delays with `randomDelay()` utility
6. **Multi-City Support**: Built-in iteration over multiple cities
7. **Progress Tracking**: Logs progress as `offset/total` listings processed
8. **Configuration Management**: Environment-based configuration with dotenv

### 8. Code Comparison

**Python Example**:
```python
def search(self, city: str, state: str = "SP", business_context: str = "RENT",
           page: int = 1, page_size: int = 20) -> SearchResult:
    offset = (page - 1) * page_size
    params = self._build_listings_params(
        city=city, state=state, business_context=business_context,
        offset=offset, page_size=page_size
    )
    
    with httpx.Client(timeout=self.timeout) as client:
        response = client.get(
            f"{self.BASE_API}{self.COORDINATES_ENDPOINT}",
            params=params, headers=self.headers
        )
        response.raise_for_status()
        data = response.json()
```

**TypeScript Equivalent**:
```typescript
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
      city, state, businessContext, offset,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

## Testing

**Python**:
```bash
python quintoandar_scraper.py
```

**TypeScript**:
```bash
npm start              # Run in production mode
npm run dev            # Run with auto-reload
npm run type-check     # Verify TypeScript types
npm test               # Run tests
```

## Performance Considerations

1. **Async/Await**: TypeScript version uses modern async/await throughout
2. **Rate Limiting**: Configurable delays prevent API throttling
3. **Pagination**: Both versions handle pagination, TS version processes 100 items per page by default
4. **Error Recovery**: TS version continues on individual listing failures

## Future Improvements

1. **@landomo/core Package**: Replace local `core.ts` stub with published package
2. **Redis Integration**: Implement actual Redis-based deduplication
3. **Detailed Scraping**: Add second phase to fetch full property details
4. **Proxy Support**: Add proxy rotation for increased throughput
5. **Tests**: Add unit tests for transformer and scraper logic
6. **Monitoring**: Add metrics collection for scraping performance

## Deployment

The TypeScript version includes GitHub Actions workflows:
- `.github/workflows/test.yml` - Run tests on PRs
- `.github/workflows/deploy.yml` - Deploy on merge to main

## Repository

**GitHub**: https://github.com/landomo-com/landomo-brazil-quintoandar

## Success Metrics

- ✅ TypeScript compilation passes without errors
- ✅ All 10 Brazilian cities supported
- ✅ API endpoints match Python version
- ✅ Data transformation to StandardProperty format
- ✅ Core Service integration ready
- ✅ Git repository created and pushed
- ✅ README documentation complete
