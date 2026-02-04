import { StandardProperty } from './core';
import { config } from './config';

/**
 * Transform QuintoAndar data to StandardProperty format
 */
export function transformToStandard(parsed: any): StandardProperty {
  // Handle both old and new API formats
  const isForSale = parsed.forSale || parsed.salePrice > 0;
  const transactionType = isForSale ? 'sale' : 'rent';
  const price = isForSale ? parsed.salePrice : parsed.rent;

  // Normalize property type
  const propertyType = normalizePropertyType(parsed.type || parsed.propertyType);

  // Parse amenities
  const amenities = parsed.amenities || [];
  const hasBalcony = amenities.some((a: string) => a.includes('VARANDA') || a.includes('BALCON'));
  const hasPool = amenities.some((a: string) => a.includes('PISCINA') || a.includes('POOL'));
  const hasGarden = amenities.some((a: string) => a.includes('JARDIM') || a.includes('GARDEN'));

  // Get coordinates
  const lat = parsed.location?.lat || parsed.latitude;
  const lon = parsed.location?.lon || parsed.longitude;

  // Get images
  const images: string[] = [];
  if (parsed.imageList && Array.isArray(parsed.imageList)) {
    images.push(...parsed.imageList.map((img: string) =>
      `https://cdn.quintoandar.com.br/img/${img}`
    ));
  } else if (parsed.coverImage) {
    images.push(`https://cdn.quintoandar.com.br/img/${parsed.coverImage}`);
  } else if (parsed.images) {
    images.push(...parsed.images);
  }

  // Build title
  const title = parsed.title ||
    `${parsed.type || 'Imóvel'} em ${parsed.neighbourhood || parsed.neighborhood || parsed.city || ''}`;

  // Build standard property object
  const standardProperty: StandardProperty = {
    // Basic Information
    title: title.trim(),
    price: price ? Number(price) : undefined,
    currency: 'BRL',
    property_type: propertyType,
    transaction_type: transactionType,

    // Location
    location: {
      address: parsed.address,
      city: parsed.city,
      country: config.country,
      state: undefined, // QuintoAndar doesn't provide state in response
      postal_code: undefined,
      coordinates: lat && lon ? { lat, lon } : undefined,
    },

    // Details
    details: {
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      sqm: parsed.area || parsed.totalAreaM2,
      rooms: parsed.bedrooms, // Total rooms not provided, use bedrooms as estimate
    },

    // Features & Amenities
    features: amenities,
    amenities: {
      has_parking: (parsed.parkingSpaces || 0) > 0,
      has_balcony: hasBalcony,
      has_garden: hasGarden,
      has_pool: hasPool,
    },

    // Country-Specific Fields for Brazil
    country_specific: {
      // QuintoAndar specific fields
      neighborhood: parsed.neighbourhood || parsed.neighborhood,
      region_name: parsed.regionName,
      condo_fee: parsed.condominium || parsed.condoFee,
      iptu_plus_condo: parsed.iptuPlusCondominium,
      total_monthly: parsed.totalCost || parsed.totalMonthly, // For rentals: rent + condo + IPTU
      property_type_br: parsed.type || parsed.propertyType, // Original Brazilian property type
      is_furnished: parsed.isFurnished || false,
      has_elevator: parsed.hasElevator || false,
      visit_status: parsed.visitStatus,
      active_special_conditions: parsed.activeSpecialConditions || [],
    },

    // Media
    images,
    description: undefined, // API doesn't include full description

    // Metadata
    url: parsed.url,
    status: 'active',
  };

  return standardProperty;
}

/**
 * Normalize Brazilian property types to standard types
 */
function normalizePropertyType(brType: string | undefined): string {
  if (!brType) return 'other';

  const typeMap: Record<string, string> = {
    apartamento: 'apartment',
    casa: 'house',
    kitnet: 'apartment', // Small studio apartment
    studio: 'apartment',
    flat: 'apartment',
    condominio: 'apartment',
    cobertura: 'apartment', // Penthouse
    sobrado: 'house', // Townhouse/duplex
    chacara: 'land', // Small farm/ranch
    fazenda: 'land', // Farm/ranch
    terreno: 'land',
    comercial: 'commercial',
    sala: 'commercial', // Commercial room
    loja: 'commercial', // Store
    galpao: 'commercial', // Warehouse
  };

  const normalized = typeMap[brType.toLowerCase()];
  return normalized || 'other';
}
