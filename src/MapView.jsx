import { Fragment, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const US_BOUNDS = [[24.4, -124.8], [49.4, -66.9]] // contiguous US

// Fit bounds, leaving room for the floating search panel so it doesn't cover them.
// Desktop: panel sits top-left, so pad the left. Mobile: panel spans the bottom.
function fitAroundPanel(map, bounds, panelRef, pad) {
  map.invalidateSize() // container may have been measured before layout settled
  let topLeft = [pad, pad]
  let bottomRight = [pad, pad]
  const panel = panelRef?.current?.getBoundingClientRect()
  const box = map.getContainer().getBoundingClientRect()
  if (panel && panel.width > 0) {
    if (panel.width < box.width * 0.6) topLeft = [panel.right - box.left + pad, pad]
    else bottomRight = [pad, box.bottom - panel.top + pad]
  }
  map.fitBounds(bounds, { paddingTopLeft: topLeft, paddingBottomRight: bottomRight })
}

// Start on the whole lower 48; zoom to the route once there is one.
function BoundsFitter({ coords, panelRef }) {
  const map = useMap()
  useEffect(() => {
    const hasRoute = coords?.length > 0
    const bounds = hasRoute ? L.polyline(coords).getBounds() : L.latLngBounds(US_BOUNDS)
    // Routes get extra margin so pins and icons stay clear of the edges
    const pad = hasRoute ? 40 : 12
    const frame = requestAnimationFrame(() => fitAroundPanel(map, bounds, panelRef, pad))
    return () => cancelAnimationFrame(frame)
  }, [coords, map, panelRef])
  return null
}

const MAX_ZOOM = 19          // closest zoom the map allows (OSM tiles stop here)
const MIN_SEGMENT_PX = 48    // a segment is never drawn shorter than this on screen
const MAX_SEGMENTS = 250     // safety cap on segments rendered at once
const SEGMENT_COLORS = ['#F5C100', '#3B1F00'] // --banana-dark / --brown

function metersPerPixel(zoom, lat) {
  return (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom)
}

// 1-2-5 ladder: smallest of 1, 2, 5, 10, 20, 50, ... that is >= x
function niceCeil(x) {
  if (x <= 1) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(x)))
  for (const m of [1, 2, 5, 10]) if (m * mag >= x * (1 - 1e-9)) return m * mag
  return 10 * mag
}

const fmtCompact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function fmtDistance(m) {
  if (m >= 1000) return `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: m >= 10000 ? 0 : 1 })} km`
  return `${m.toLocaleString(undefined, { maximumFractionDigits: m >= 10 ? 0 : 1 })} m`
}

// Cumulative distance at each route vertex, scaled so the total matches OSRM's
// distance (the number shown in the result card).
function buildCumulative(coords, distMeters) {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + L.latLng(coords[i - 1]).distanceTo(L.latLng(coords[i])))
  }
  const scale = cum[cum.length - 1] > 0 ? distMeters / cum[cum.length - 1] : 1
  return cum.map(d => d * scale)
}

// Index of the last vertex whose cumulative distance is <= d
function vertexBefore(cum, d) {
  let lo = 0, hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid - 1
  }
  return Math.min(lo, cum.length - 2)
}

function pointAt(coords, cum, d) {
  const i = vertexBefore(cum, d)
  const span = cum[i + 1] - cum[i]
  const t = span > 0 ? Math.min(1, Math.max(0, (d - cum[i]) / span)) : 0
  const [a, b] = [coords[i], coords[i + 1]]
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function pathBetween(coords, cum, d0, d1) {
  const path = [pointAt(coords, cum, d0)]
  for (let i = vertexBefore(cum, d0) + 1; i < cum.length && cum[i] < d1; i++) path.push(coords[i])
  path.push(pointAt(coords, cum, d1))
  return path
}

// Which segment indices touch the (padded) viewport
function visibleSegmentIndices(coords, cum, bounds, segLen) {
  const total = cum[cum.length - 1]
  const lastIdx = Math.ceil(total / segLen) - 1
  const idx = new Set()
  const s = bounds.getSouth(), n = bounds.getNorth(), w = bounds.getWest(), e = bounds.getEast()
  for (let i = 0; i < coords.length - 1; i++) {
    const [aLat, aLng] = coords[i], [bLat, bLng] = coords[i + 1]
    if (Math.max(aLat, bLat) < s || Math.min(aLat, bLat) > n || Math.max(aLng, bLng) < w || Math.min(aLng, bLng) > e) continue
    const from = Math.floor(cum[i] / segLen)
    const to = Math.min(lastIdx, Math.floor(cum[i + 1] / segLen))
    for (let k = from; k <= to; k++) {
      idx.add(k)
      if (idx.size > MAX_SEGMENTS) return [...idx].sort((a, b) => a - b)
    }
  }
  return [...idx].sort((a, b) => a - b)
}

function ScaleLegend({ text }) {
  const map = useMap()
  const [el] = useState(() => L.DomUtil.create('div', 'scale-legend'))
  useEffect(() => {
    const control = L.control({ position: 'topright' })
    control.onAdd = () => el
    control.addTo(map)
    return () => control.remove()
  }, [map, el])
  useEffect(() => { el.textContent = text; el.style.display = text ? '' : 'none' }, [el, text])
  return null
}

function RouteSegments({ coords, distMeters, unit }) {
  const map = useMap()
  const cum = useMemo(() => buildCumulative(coords, distMeters), [coords, distMeters])
  const [view, setView] = useState(null)

  // The finest scale is fixed by the closest zoom: at MAX_ZOOM a segment must still
  // be MIN_SEGMENT_PX wide, so no unit ever gets split finer than that.
  const midLat = coords[Math.floor(coords.length / 2)][0]
  const floorCount = niceCeil((MIN_SEGMENT_PX * metersPerPixel(MAX_ZOOM, midLat)) / unit.meters)

  function recalc() {
    const target = (MIN_SEGMENT_PX * metersPerPixel(map.getZoom(), map.getCenter().lat)) / unit.meters
    const perIcon = Math.max(floorCount, niceCeil(target))
    const segLen = perIcon * unit.meters
    const indices = visibleSegmentIndices(coords, cum, map.getBounds().pad(0.5), segLen)
    setView({ perIcon, segLen, indices })
  }

  useEffect(() => { recalc() }, [cum, unit.meters])
  useMapEvents({ zoomend: recalc, moveend: recalc })

  if (!view) return null
  const { perIcon, segLen, indices } = view
  const total = cum[cum.length - 1]
  const badge = perIcon > 1 ? `×${fmtCompact.format(perIcon)}` : ''
  const legend = perIcon > 1
    ? `Each ${unit.emoji} = ${perIcon.toLocaleString()} ${unit.name} · ${fmtDistance(segLen)}`
    : `Each ${unit.emoji} is life-size · ${fmtDistance(segLen)}`

  return (
    <>
      <ScaleLegend text={legend} />
      {indices.map(k => {
        const d0 = k * segLen
        const d1 = Math.min((k + 1) * segLen, total)
        const partial = d1 - d0 < segLen * 0.999
        const key = `${perIcon}-${k}`
        return (
          <Fragment key={key}>
            <Polyline
              positions={pathBetween(coords, cum, d0, d1)}
              pathOptions={{ color: SEGMENT_COLORS[k % 2], weight: 6, opacity: partial ? 0.5 : 0.9, lineCap: 'butt' }}
              interactive={false}
            />
            <Marker
              position={pointAt(coords, cum, (d0 + d1) / 2)}
              icon={routeIcon(unit.emoji, badge, partial)}
              interactive={false}
            />
          </Fragment>
        )
      })}
    </>
  )
}

function pinIcon(emoji) {
  return L.divIcon({
    html: `<div style="font-size:30px;filter:drop-shadow(2px 2px 0 rgba(0,0,0,0.4));line-height:1">${emoji}</div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  })
}

const routeIconCache = new Map()
function routeIcon(emoji, badge, partial) {
  const cacheKey = `${emoji}|${badge}|${partial}`
  if (!routeIconCache.has(cacheKey)) {
    routeIconCache.set(cacheKey, L.divIcon({
      html: `<div class="route-icon${partial ? ' partial' : ''}"><span>${emoji}</span>${badge ? `<b>${badge}</b>` : ''}</div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    }))
  }
  return routeIconCache.get(cacheKey)
}

export default function MapView({ routeData, routeUnit, panelRef }) {
  const { coords, distMeters, origin, dest, fromVal, toVal } = routeData || {}

  return (
    <MapContainer
      bounds={US_BOUNDS}
      maxZoom={MAX_ZOOM}
      preferCanvas
      zoomControl={false}
      className="map-container"
    >
      <ZoomControl position="bottomright" />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={MAX_ZOOM}
      />
      <BoundsFitter coords={coords} panelRef={panelRef} />
      {coords && (
        <>
          <RouteSegments coords={coords} distMeters={distMeters} unit={routeUnit} />
          <Marker position={[origin.lat, origin.lng]} icon={pinIcon('📍')}>
            <Popup><b>From:</b> {fromVal}</Popup>
          </Marker>
          <Marker position={[dest.lat, dest.lng]} icon={pinIcon('🏁')}>
            <Popup><b>To:</b> {toVal}</Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  )
}
