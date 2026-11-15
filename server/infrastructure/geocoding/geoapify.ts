import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'
import type { HotelLocationResult } from '@contracts/hotel-location-search'
import { db } from '../database/client'

const maxDailyRequests = 3000
const areaTypes = new Set(['street', 'suburb', 'district', 'postcode', 'city', 'county', 'state', 'country'])
const locationSchema = z.object({
  formatted: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  result_type: z.string().optional(),
  datasource: z.object({ attribution: z.string().trim().min(1).max(200) })
})

async function reserveRequest(configuredLimit: string) {
  const limit = Number(configuredLimit)
  if (!/^\d+$/.test(configuredLimit) || !Number.isSafeInteger(limit) || limit < 0 || limit > maxDailyRequests) {
    throw createError({ statusCode: 503, statusMessage: 'Address service limit is invalid' })
  }
  // One atomic reservation across organizations and app processes using this database.
  const result = await db.execute(sql`
    INSERT INTO geoapify_daily_usage (day, requests, last_request_at)
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1, clock_timestamp()
    WHERE ${limit} > 0
    ON CONFLICT (day) DO UPDATE SET
      requests = geoapify_daily_usage.requests + 1,
      last_request_at = clock_timestamp()
    WHERE geoapify_daily_usage.requests < ${limit}
      AND geoapify_daily_usage.last_request_at <= clock_timestamp() - interval '250 milliseconds'
    RETURNING day
  `)
  if (!result.length) throw createError({ statusCode: 429, statusMessage: 'Address service limit reached' })
}

export async function geoapifyLocations(
  operation: 'search' | 'reverse',
  query: Record<string, string | number>,
  config: { geoapifyApiKey: string; geoapifyDailyRequestLimit: string },
  locale: string
): Promise<HotelLocationResult[]> {
  const apiKey = config.geoapifyApiKey.trim()
  if (!apiKey) throw createError({ statusCode: 503, statusMessage: 'Address search is unavailable' })
  await reserveRequest(config.geoapifyDailyRequestLimit)
  const limit = operation === 'search' ? 5 : 1
  let results
  try {
    const payload = await $fetch(`https://api.geoapify.com/v1/geocode/${operation}`, {
      query: {
        ...query, format: 'json', lang: locale, limit, apiKey,
        ...(operation === 'search' ? { bias: 'countrycode:none' } : {})
      },
      timeout: 6000,
      retry: 0,
      redirect: 'error'
    })
    results = z.object({ results: z.array(z.unknown()) }).parse(payload).results
  } catch {
    // The original error URL contains the server API key.
    throw createError({ statusCode: 502, statusMessage: 'Address service is unavailable' })
  }
  return results.slice(0, limit).flatMap(result => {
    const parsed = locationSchema.safeParse(result)
    if (!parsed.success) return []
    const { formatted: address, lat, lon, datasource, result_type } = parsed.data
    return [{ address, latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)), attribution: datasource.attribution, area: areaTypes.has(result_type ?? '') }]
  })
}
