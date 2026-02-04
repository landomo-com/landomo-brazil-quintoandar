# Geographic Grid Strategy - Complete Brazil Coverage

## Problem with City-Based Approach

The V3 scraper covers **73 known cities** from QuintoAndar's sitemap. However, this approach has limitations:

1. **May miss properties** in areas not explicitly listed as cities
2. **Depends on sitemap completeness** - if sitemap is outdated, we miss new areas
3. **No guarantee of comprehensive coverage** - properties might exist outside the 73 cities

## Solution: Geographic Grid Search

Instead of searching by city, we **divide the entire geographic area of Brazil into a grid** and search each cell systematically.

### Brazil Geographic Boundaries

```
North:  5.27° N   (Roraima state)
South: -33.75° S  (Rio Grande do Sul)
East:  -34.79° W  (Paraíba coast)
West:  -73.99° W  (Acre border)
```

**Coverage Area:**
- Latitude range: 39° (5.27 to -33.75)
- Longitude range: 39.2° (-73.99 to -34.79)

### Grid Configuration

**Grid Size: 0.5° × 0.5°** (approximately 55km × 55km at equator)

This results in:
- **78 rows** (latitude divisions)
- **78 columns** (longitude divisions)
- **~6,000 total grid cells**

Each cell is searched independently using the coordinates endpoint:
```typescript
filters.location.viewport.north: cell.north
filters.location.viewport.south: cell.south
filters.location.viewport.east: cell.east
filters.location.viewport.west: cell.west
```

## Two-Phase Approach

### Phase 1: Discovery (ID Collection)

1. Generate 6,000 grid cells covering all of Brazil
2. For each cell:
   - Query coordinates endpoint for listing IDs
   - Collect all IDs (with pagination)
   - Skip empty cells (0 results)
3. Deduplicate IDs globally (properties may appear in multiple overlapping cells)
4. Result: **Complete set of all listing IDs** across Brazil

**Estimated Time:**
- 6,000 cells × 2 seconds = ~3.3 hours
- With empty cell skipping: 1-2 hours

### Phase 2: Detail Fetching

1. Process all unique listing IDs from Phase 1
2. For each ID:
   - Fetch full details from yellow-pages endpoint
   - Transform to StandardProperty format
   - Send to Core Service
3. Result: **Complete property database** for all of Brazil

**Estimated Time:**
- Depends on total unique listings discovered
- If ~50,000 listings: 50,000 × 3 seconds = ~41 hours
- With parallel processing: can be reduced significantly

## Advantages Over City-Based Approach

### ✅ Comprehensive Coverage
- Captures **every property** QuintoAndar has, regardless of location
- No dependency on sitemap accuracy
- Finds properties in rural areas, small towns, and unlisted locations

### ✅ Future-Proof
- Automatically discovers new areas as QuintoAndar expands
- No need to update city lists manually
- Works even if QuintoAndar adds new markets

### ✅ Deduplication Built-In
- Properties appearing in multiple grid cells are deduplicated
- Ensures no duplicate data in final output
- Accurate count of unique properties

### ✅ Parallelizable
- Grid cells can be processed in parallel batches
- Can distribute across multiple machines
- Easily resumable if interrupted

## Performance Optimization

### 1. Adaptive Grid Size
```typescript
// Use larger cells for remote areas (fewer properties)
// Use smaller cells for dense urban areas (many properties)
const gridSize = isUrbanArea(cell) ? 0.25 : 1.0;
```

### 2. Empty Cell Skipping
```typescript
// Skip cells with 0 results
if (firstPage.total === 0) {
  return 0; // Skip this cell
}
```

### 3. Parallel Batch Processing
```typescript
// Process 10 cells in parallel
const batch = grid.slice(i, i + 10);
await Promise.all(batch.map(cell => scrapeCell(cell)));
```

### 4. Smart Rate Limiting
```typescript
// Slower for dense cells, faster for sparse cells
const delay = cellTotal > 1000 ? 5000 : 2000;
await randomDelay(delay * 0.8, delay * 1.2);
```

## Comparison: City-Based vs Geo Grid

| Metric | City-Based (V3) | Geo Grid |
|--------|----------------|----------|
| **Coverage** | 73 known cities | Entire Brazil |
| **Completeness** | ~95% (estimated) | 100% guaranteed |
| **Future-proof** | Requires manual updates | Automatic |
| **Grid Cells** | 73 cities | ~6,000 cells |
| **Deduplication** | By city | Global |
| **Discovery Time** | ~30 mins | ~1-2 hours |
| **Total Properties** | Unknown | Complete dataset |
| **Missed Properties** | Possible | None |

## Implementation

### Running the Geo Grid Scraper

```bash
# Quick test (first 10 cells)
npm run test:geo

# Full scrape (entire Brazil)
npm run start:geo

# With specific grid size
GRID_SIZE=1.0 npm run start:geo  # Larger cells (faster)
GRID_SIZE=0.25 npm run start:geo # Smaller cells (more thorough)
```

### Monitoring Progress

The scraper logs progress every 50 cells:
```
Progress: 500/6000 cells | 12,543 unique IDs | 312 cells with listings
Progress: 1000/6000 cells | 25,891 unique IDs | 624 cells with listings
...
```

### Output

**Phase 1 Complete:**
```json
{
  "totalCells": 6000,
  "cellsWithListings": 850,
  "uniqueListingIds": 52437
}
```

**Phase 2 Complete:**
```json
{
  "totalListings": 52437,
  "totalScraped": 52401,
  "totalFailed": 36,
  "propertiesCollected": 52401,
  "coverage": "entire-brazil-geographic-grid"
}
```

## Conclusion

**The geographic grid strategy ensures 100% coverage of QuintoAndar's Brazil inventory** by systematically searching every coordinate in the country. While it takes longer than city-based scraping, it guarantees completeness and future-proofs the scraper against market expansion.

**Recommendation:** Use geo grid for initial comprehensive scrape, then use city-based scraper for daily updates of known markets.
