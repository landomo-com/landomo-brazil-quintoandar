import dotenv from 'dotenv';
import { CityCoordinates } from './types';

dotenv.config();

export const config = {
  // Landomo Core Service
  apiUrl: process.env.LANDOMO_API_URL || 'https://core.landomo.com/api/v1',
  apiKey: process.env.LANDOMO_API_KEY || '',

  // Scraper Identity
  portal: 'quintoandar',
  country: 'brazil',

  // QuintoAndar API
  baseApiUrl: 'https://apigw.prod.quintoandar.com.br',
  countEndpoint: '/house-listing-search/v2/search/count',
  coordinatesEndpoint: '/cached/house-listing-search/v2/search/coordinates',
  listingsEndpoint: '/cached/house-listing-search/v2/search',

  // Scraper Behavior
  debug: process.env.DEBUG === 'true',
  requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '5000'), // Increased from 1000 to 5000ms
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5'),
  pageSize: parseInt(process.env.PAGE_SIZE || '100'),
  businessContext: (process.env.BUSINESS_CONTEXT || 'RENT') as 'RENT' | 'SALE',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },

  // Optional: Scraper Database (Tier 1)
  scraperDb: {
    host: process.env.SCRAPER_DB_HOST,
    port: parseInt(process.env.SCRAPER_DB_PORT || '5432'),
    database: process.env.SCRAPER_DB_NAME,
    user: process.env.SCRAPER_DB_USER,
    password: process.env.SCRAPER_DB_PASSWORD,
  },

  // Optional: Proxy
  proxy: {
    url: process.env.PROXY_URL,
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  },
};

// City coordinates for major Brazilian cities
export const CITY_COORDS: Record<string, CityCoordinates> = {
  'sao-paulo-sp-brasil': {
    lat: -23.55052,
    lng: -46.633309,
    viewport: { north: -23.4, south: -23.75, east: -46.3, west: -46.85 },
  },
  'rio-de-janeiro-rj-brasil': {
    lat: -22.9068,
    lng: -43.1729,
    viewport: { north: -22.75, south: -23.1, east: -43.0, west: -43.8 },
  },
  'belo-horizonte-mg-brasil': {
    lat: -19.9167,
    lng: -43.9345,
    viewport: { north: -19.75, south: -20.05, east: -43.8, west: -44.1 },
  },
  'curitiba-pr-brasil': {
    lat: -25.4284,
    lng: -49.2733,
    viewport: { north: -25.3, south: -25.6, east: -49.15, west: -49.4 },
  },
  'porto-alegre-rs-brasil': {
    lat: -30.0346,
    lng: -51.2177,
    viewport: { north: -29.9, south: -30.2, east: -51.0, west: -51.35 },
  },
  'brasilia-df-brasil': {
    lat: -15.7942,
    lng: -47.8822,
    viewport: { north: -15.6, south: -16.0, east: -47.7, west: -48.1 },
  },
  'salvador-ba-brasil': {
    lat: -12.9714,
    lng: -38.5014,
    viewport: { north: -12.85, south: -13.1, east: -38.35, west: -38.65 },
  },
  'fortaleza-ce-brasil': {
    lat: -3.7172,
    lng: -38.5433,
    viewport: { north: -3.6, south: -3.9, east: -38.4, west: -38.7 },
  },
  'recife-pe-brasil': {
    lat: -8.0476,
    lng: -34.877,
    viewport: { north: -7.95, south: -8.15, east: -34.8, west: -35.0 },
  },
  'campinas-sp-brasil': {
    lat: -22.9099,
    lng: -47.0626,
    viewport: { north: -22.8, south: -23.0, east: -46.9, west: -47.2 },
  },
};

// Validate required config
if (!config.apiKey) {
  console.warn('WARNING: LANDOMO_API_KEY not set - will not send to Core Service');
}
