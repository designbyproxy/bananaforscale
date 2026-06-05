import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

function sampleCoords(coords, count) {
  if (coords.length <= count) return coords
  const step = (coords.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => coords[Math.round(i * step)])
}

function BoundsFitter({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords && coords.length > 0) {
      map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] })
    }
  }, [coords, map])
  return null
}

const EMOJI_BADGE_PX = 30 // spacing target between emoji centers

function RouteMarkers({ coords, distMeters, routeEmoji }) {
  const map = useMap()
  const [count, setCount] = useState(20)

  function recalc() {
    const zoom = map.getZoom()
    const lat = map.getCenter().lat
    const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom)
    const routePixels = distMeters / metersPerPixel
    setCount(Math.max(4, Math.min(80, Math.round(routePixels / EMOJI_BADGE_PX))))
  }

  useEffect(() => { recalc() }, [coords, distMeters])
  useMapEvents({ zoomend: recalc })

  return sampleCoords(coords, count).map((pos, i) => (
    <Marker key={i} position={pos} icon={routeIcon(routeEmoji)} />
  ))
}

function pinIcon(emoji) {
  return L.divIcon({
    html: `<div style="font-size:30px;filter:drop-shadow(2px 2px 0 rgba(0,0,0,0.4));line-height:1">${emoji}</div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  })
}

function routeIcon(emoji) {
  return L.divIcon({
    html: `<div style="font-size:16px;line-height:1;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.22)">${emoji}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export default function MapView({ routeData, routeEmoji }) {
  const { coords, distMeters, origin, dest, fromVal, toVal } = routeData || {}

  return (
    <MapContainer
      center={[45.5051, -122.675]}
      zoom={7}
      className="map-container"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      {coords && (
        <>
          <RouteMarkers coords={coords} distMeters={distMeters} routeEmoji={routeEmoji} />
          <Marker position={[origin.lat, origin.lng]} icon={pinIcon('📍')}>
            <Popup><b>From:</b> {fromVal}</Popup>
          </Marker>
          <Marker position={[dest.lat, dest.lng]} icon={pinIcon('🏁')}>
            <Popup><b>To:</b> {toVal}</Popup>
          </Marker>
          <BoundsFitter coords={coords} />
        </>
      )}
    </MapContainer>
  )
}
