# Architecture Documentation Update

## Changes Made to `/landomo/CLAUDE.md`

Updated the global Landomo architecture documentation to reflect the **scraper-side transformation principle**.

---

## Key Architectural Principles Added

### 1. Data Extraction Mapping is Scraper Responsibility

**Added Section**: "Data Extraction Mapping Documentation (REQUIRED)"

**Key Points**:
- Each scraper **must** include `DATA-EXTRACTION-MAPPING.md`
- Scrapers own portal-specific knowledge
- Core Service only accepts standardized data
- Clear separation of concerns

**Why This Matters**:
```
┌─────────────────┐
│   Scraper       │  ← Knows portal schema (QuintoAndar API structure)
│   (Edge)        │  ← Performs transformation
│                 │  ← Validates completeness
└────────┬────────┘
         │ Sends only StandardProperty
         ▼
┌─────────────────┐
│  Core Service   │  ← Knows only StandardProperty schema
│   (Core)        │  ← Does NOT know portal details
│                 │  ← Validates StandardProperty contract
└─────────────────┘
```

This enables:
- **Scalability**: Core Service doesn't need updates for 1000+ portals
- **Maintainability**: Portal changes isolated to individual scrapers
- **Quality**: Each scraper validates its own mapping
- **Clarity**: Transformation happens at the edge, not in core

---

## 2. StandardProperty Contract Documentation

**Added Section**: "StandardProperty Contract - Core Service Expectations"

**Defines**:
- **Required fields** (title, currency, property_type, transaction_type, country)
- **Recommended fields** (price, location, details, images)
- **Country-specific fields** (preserve local conventions)
- **Normalized values** (property types, currencies, countries)

**Example**:
```typescript
// Required Fields (Core Service rejects if missing)
{
  title: string;                    // REQUIRED
  currency: string;                 // REQUIRED (ISO 4217: USD, EUR, BRL)
  property_type: string;            // REQUIRED (normalized: apartment, house)
  transaction_type: 'sale' | 'rent'; // REQUIRED
  location: {
    country: string;                // REQUIRED (lowercase: brazil, australia)
  }
}
```

---

## 3. Transformer Pattern (REQUIRED)

**Added Section**: "Transformer Pattern (REQUIRED)"

**Provides**:
- Complete transformer implementation template
- Best practices for data handling
- Validation requirements
- Helper function examples

**Template Structure**:
```typescript
export function transformToStandard(raw: any): StandardProperty {
  // 1. Determine transaction type
  // 2. Extract price
  // 3. Normalize property type
  // 4. Build standardized object
  // 5. Validate required fields
  return standardized;
}
```

**Best Practices Documented**:
1. Handle missing data gracefully (optional chaining)
2. Normalize data types (Number(), parseInt())
3. Build full image URLs (CDN paths)
4. Preserve portal-specific fields (country_specific)
5. Validate required fields before sending

---

## 4. Repository Structure Updated

**Updated**: Scraper repository structure to include:
```
landomo-[country]-[portal]/
├── src/
│   ├── transformer.ts              # REQUIRED
│   └── ...
├── tests/
│   └── transformer.test.ts         # REQUIRED
└── DATA-EXTRACTION-MAPPING.md      # REQUIRED (NEW)
```

---

## Documentation Requirements for All Scrapers

### Every scraper must have:

1. **`transformer.ts`**
   - Implements `transformToStandard(raw: any): StandardProperty`
   - Validates required fields
   - Handles missing data gracefully
   - Normalizes property types, currencies, countries

2. **`DATA-EXTRACTION-MAPPING.md`**
   - Coverage summary (transaction types, property types, images)
   - Complete field mapping table
   - Property type normalization mapping
   - Integration test results
   - Sample standardized output

3. **Integration Tests**
   - Test API endpoint
   - Test transformer
   - Validate field coverage
   - Verify image extraction

### Example Reference

See `/landomo-brazil-quintoandar/DATA-EXTRACTION-MAPPING.md` for complete implementation example.

---

## Normalized Value Standards

### Property Types (Standardized)
```typescript
'apartment'   // Flats, units, condos
'house'       // Detached, semi-detached
'studio'      // Studio apartments
'townhouse'   // Row houses
'villa'       // Luxury homes
'penthouse'   // Top-floor luxury
'duplex'      // Two-story units
'land'        // Land only
'commercial'  // Commercial properties
'other'       // Everything else
```

### Currency Codes (ISO 4217)
```typescript
'USD'  // United States Dollar
'EUR'  // Euro
'GBP'  // British Pound
'BRL'  // Brazilian Real
'AUD'  // Australian Dollar
'JPY'  // Japanese Yen
// ... use 3-letter ISO codes
```

### Country Codes (Lowercase Full Names)
```typescript
'australia'  // NOT 'AU'
'brazil'     // NOT 'BR'
'usa'        // NOT 'US'
'uk'         // NOT 'GB'
'germany'    // NOT 'DE'
// ... use lowercase full names
```

---

## Impact on Global Architecture

### Before This Update
```
Portal → Scraper → Core Service
              ↓
         (transformation happens where?)
```

### After This Update
```
Portal → Scraper (Transforms) → Core Service (Validates)
         ├─ transformer.ts         ├─ StandardProperty schema
         ├─ Field mapping          ├─ Strict contract
         └─ DATA-EXTRACTION-       └─ No portal knowledge
            MAPPING.md
```

**Benefits**:
1. **Clear ownership**: Scrapers own transformation
2. **Strict contract**: Core Service enforces StandardProperty
3. **Documentation**: Each scraper documents its mapping
4. **Maintainability**: Portal changes isolated
5. **Quality**: Validation at source

---

## For New Scraper Development

When creating a new scraper:

1. **Start with transformation**
   - Identify portal API/HTML structure
   - Map fields to StandardProperty
   - Document in DATA-EXTRACTION-MAPPING.md

2. **Implement transformer.ts**
   - Use template from CLAUDE.md
   - Handle all portal data types
   - Validate required fields

3. **Test thoroughly**
   - Integration test (fetch → transform → send)
   - Validate 100% field coverage
   - Verify image extraction

4. **Document completely**
   - Complete field mapping table
   - Property type mappings
   - Test results with examples

5. **Send to Core Service**
   - Only send StandardProperty format
   - Core Service validates contract
   - No portal-specific data in Core

---

## QuintoAndar Scraper - Reference Implementation

The Brazil QuintoAndar scraper (`/landomo-brazil-quintoandar/`) serves as the **reference implementation**:

✅ **Complete DATA-EXTRACTION-MAPPING.md**
- 100% field coverage documented
- All 26 API fields mapped
- Complete property type mapping
- Integration test results

✅ **Robust transformer.ts**
- Handles all QuintoAndar data types
- Normalizes Brazilian property types
- Preserves country-specific fields
- Validates required fields

✅ **Integration Tests**
- Tests 3 properties end-to-end
- Validates API → Transform → Core Service
- 100% success rate

✅ **All Values Mapped**
- Transaction types: ✅ Rent & Sale
- Property types: ✅ All 9 types
- Images: ✅ All 12 images per property
- Fields: ✅ 26/26 (100%)

Use this as template for all future scrapers.

---

## Summary

**Updated**: `/landomo/CLAUDE.md` with architectural principles for global real estate data aggregation

**Added**:
1. Data extraction mapping requirements (per scraper)
2. StandardProperty contract documentation (Core Service expectations)
3. Transformer pattern template and best practices
4. Repository structure requirements (DATA-EXTRACTION-MAPPING.md)
5. Normalized value standards (property types, currencies, countries)

**Impact**: Clear separation between scraper-side transformation and core-side standardization

**Reference**: Brazil QuintoAndar scraper demonstrates complete implementation

**All scrapers must now follow this architecture for consistency and maintainability.**
