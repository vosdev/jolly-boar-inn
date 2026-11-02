import { describe, expect, it } from 'vitest'

import pin from '../../../data/map.json'
import { flipRow, tileAt, tileUrl, toLatLng, toWorld } from './map'

describe('the map grid', () => {
  it('finds the tile that holds a game tile', () => {
    expect(tileAt({ x: 2965, y: 3380 }, 2)).toEqual({ x: 46, row: 52 })
    expect(tileAt({ x: 2965, y: 3380 }, 1)).toEqual({ x: 23, row: 26 })
    expect(tileAt({ x: 2965, y: 3380 }, -1)).toEqual({ x: 5, row: 6 })
  })

  it('names a tile under the pinned cache', () => {
    expect(tileUrl(2, 46, 52)).toBe(`/map/${pin.cache_id}/clean/2/0_46_52.png`)
    expect(tileUrl(-3, 0, 0)).toBe(`/map/${pin.cache_id}/clean/-3/0_0_0.png`)
  })

  it('flips a row between Leaflet and the files', () => {
    // At zoom 2, y 3380 is pixel -13520 in Leaflet: row -53, and row 52 in the files.
    expect(flipRow(-53)).toBe(52)
    expect(flipRow(flipRow(-53))).toBe(-53)
  })

  it('takes a game tile to Leaflet and back', () => {
    const [lat, lng] = toLatLng({ x: 2965, y: 3380 })
    expect(toWorld({ lat, lng })).toEqual({ x: 2965, y: 3380 })
  })

  it('reads the tile under a point anywhere inside it', () => {
    expect(toWorld({ lat: 3380.99, lng: 2965.01 })).toEqual({ x: 2965, y: 3380 })
  })
})
