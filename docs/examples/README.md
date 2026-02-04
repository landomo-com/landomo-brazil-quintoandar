# Development Examples

This folder contains development scripts and examples used during the creation of the QuintoAndar scraper.

---

## Files

### Scraper Evolution

#### `scraper.ts` (V1 - Original)

**Purpose**: Original scraper using coordinates endpoint only

**What it does**:
- Uses `/search/coordinates` endpoint for listing discovery
- Attempts to get all data from coordinates response
- Single-phase approach

**Status**: Deprecated - replaced by V3

**Issue**: Coordinates endpoint only returns minimal data (id, location), not complete property details

---

#### `scraper-v2.ts` (V2 - Nearby Endpoint)

**Purpose**: Second iteration using nearby endpoint for details

**What it does**:
- Phase 1: Discover IDs via coordinates endpoint
- Phase 2: Fetch details via `/nearby` endpoint

**Status**: Deprecated - replaced by V3

**Issue**: Nearby endpoint returns similar properties, not exact property match

---

### Development Tools

#### `reverse-engineer.ts`

**Purpose**: Reverse engineer QuintoAndar's API using Playwright stealth

**What it does**:
- Navigates to a property page
- Intercepts network requests
- Captures API calls made by the website
- Used to discover the yellow-pages detail endpoint

**Status**: Development tool - not for production use

**How it was used**:
- Discovered `/nearby` endpoint returns similar properties
- Discovered `/yellow-pages/v2/search` endpoint returns exact property details
- Helped understand API structure and parameters

---

### `find-detail-endpoint.ts`

**Purpose**: Test and validate the yellow-pages detail endpoint

**What it does**:
- Fetches a single property using the yellow-pages endpoint
- Validates the response structure
- Tests field availability

**Status**: Development tool - not for production use

**Output example**:
```json
{
  "id": 894910935,
  "rent": 900,
  "bedrooms": 1,
  "bathrooms": 1,
  "area": 30,
  "city": "Brasília",
  "imageList": [12 images]
}
```

---

### `test-geo-grid.ts`

**Purpose**: Quick test of geo grid scraper with remote areas

**What it does**:
- Tests first 10 grid cells
- Validates grid generation logic
- Checks for API connectivity

**Status**: Development test - use `npm run test:geo` instead

**Note**: First 10 cells are in remote southern Brazil (mostly empty)

---

### `test-geo-major-cities.ts`

**Purpose**: Test geo grid scraper with major city areas

**What it does**:
- Tests 5 major cities (São Paulo, Rio, Brasília, Belo Horizonte, Porto Alegre)
- Validates grid scraper finds properties
- Checks deduplication logic

**Status**: Development test - use `npm run test:geo-cities` instead

**Results**:
- São Paulo: 203 IDs
- Rio de Janeiro: 4,212 IDs
- Brasília: 104 IDs
- Belo Horizonte: 652 IDs
- Total: 5,171 unique IDs

---

## Usage

These files are preserved for reference and can be run for development purposes:

```bash
# Reverse engineer API (requires Playwright)
npx tsx docs/examples/reverse-engineer.ts

# Test detail endpoint
npx tsx docs/examples/find-detail-endpoint.ts

# Test geo grid (first 10 cells)
npx tsx docs/examples/test-geo-grid.ts

# Test geo grid (major cities)
npx tsx docs/examples/test-geo-major-cities.ts
```

**Recommended**: Use the production commands instead:
- `npm run test:integration` - Full integration test
- `npm run test:geo-cities` - Geo grid test with major cities

---

## Development Workflow Reference

These files demonstrate the development workflow used:

1. **Reverse engineer** → Find API endpoints
2. **Test endpoints** → Validate data structure
3. **Create scraper** → Implement production scraper
4. **Test comprehensively** → Integration tests
5. **Document** → Create DATA-EXTRACTION-MAPPING.md

This workflow can be reused for other portals.

---

**Note**: These are development tools. Production scrapers are:
- `src/scraper-v3.ts` (city-based)
- `src/scraper-geo-grid.ts` (geographic grid)
- `src/test-integration.ts` (integration test)
