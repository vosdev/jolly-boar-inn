import { getConfig, type InstanceConfig } from './api'

let loading: Promise<InstanceConfig> | null = null

/** `/api/config`, fetched once per page for every caller; a failure is tried again next call. */
export function loadConfig(): Promise<InstanceConfig> {
  loading ??= getConfig().catch((failure: unknown) => {
    loading = null
    throw failure
  })
  return loading
}

/** How long a room stays open, in hours, or null where the server could not say. */
export async function roomHours(): Promise<number | null> {
  return loadConfig().then(
    (config) => config.room_ttl_hours,
    () => null,
  )
}

/** For tests: forget the config fetched so far. */
export function clearConfigCache(): void {
  loading = null
}
