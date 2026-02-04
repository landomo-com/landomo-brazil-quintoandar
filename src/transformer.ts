import { StandardProperty } from './core';
import { config } from './config';

/**
 * Transform QuintoAndar data to StandardProperty format
 */
export function transformToStandard(parsed: any): StandardProperty {
  // Normalize property type
  const propertyType = normalizePropertyType(parsed.propertyType);

  // Build standard property object
  const standardProperty: StandardProperty = {
    // Basic Information
    title: parsed.title,
    price: parsed.price,
    currency: 'BRL',
    property_type: propertyType,
    transaction_type: parsed.transactionType as 'sale' | 'rent',

    // Location
    location: {
      address: parsed.address,
      city: parsed.city,
      country: config.country,
      state: undefined, // QuintoAndar doesn't provide state in response
      postal_code: undefined,
      coordinates:
        parsed.latitude && parsed.longitude
          ? {
              lat: parsed.latitude,
              lon: parsed.longitude,
            }
          : undefined,
    },

    // Details
    details: {
      bedrooms: parsed.bedrooms,
      bathrooms: parsed.bathrooms,
      sqm: parsed.totalAreaM2,
      rooms: parsed.bedrooms, // Total rooms not provided, use bedrooms as estimate
    },

    // Features & Amenities
    features: [],
    amenities: {
      has_parking: parsed.parkingSpaces > 0,
      has_balcony: false, // Not provided in basic API response
      has_garden: false, // Not provided in basic API response
      has_pool: false, // Not provided in basic API response
    },

    // Country-Specific Fields for Brazil
    country_specific: {
      // QuintoAndar specific fields
      neighborhood: parsed.neighborhood,
      condo_fee: parsed.condoFee,
      total_monthly: parsed.totalMonthly, // For rentals: rent + condo + IPTU
      property_type_br: parsed.propertyType, // Original Brazilian property type
    },

    // Media
    images: parsed.images || [],
    description: undefined, // Basic API doesn't include full description

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
