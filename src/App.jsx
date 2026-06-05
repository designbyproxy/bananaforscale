import { useState, useMemo } from 'react'
import MapView from './MapView'

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

const UNITS = [
  { meters: 0.03,    label: '🐜 Ants (1.2 in)',               name: 'ants',            emoji: '🐜', slipPun: "Even an ant colony can't build a road across that." },
  { meters: 0.1778,  label: '🍌 Bananas (7 in)',               name: 'bananas',         emoji: '🍌', slipPun: "You slipped up — literally. No road across that ocean!" },
  { meters: 0.46,    label: '🐈 House Cats (18 in)',           name: 'house cats',      emoji: '🐈', slipPun: "Even a cat with nine lives can't swim that. And they hate water." },
  { meters: 1.70,    label: '🧍 Average Humans (5\'7")',       name: 'average humans',  emoji: '🧍', slipPun: "Even the most average human cannot walk on water." },
  { meters: 3.7,     label: '🐅 Bengal Tigers (12 ft)',        name: 'Bengal Tigers',   emoji: '🐅', slipPun: "Bengal Tigers can swim. There's still no road though." },
  { meters: 5.5,     label: '🦒 Giraffes (18 ft)',             name: 'giraffes',        emoji: '🦒', slipPun: "Even a giraffe can't stretch its neck that far!" },
  { meters: 12.3,    label: '🦖 T-Rexes (40 ft)',             name: 'T-Rexes',         emoji: '🦖', slipPun: "A T-Rex can't swim. Arms too short to paddle." },
  { meters: 30,      label: '🐋 Blue Whales (98 ft)',          name: 'blue whales',     emoji: '🐋', slipPun: "You'd need an actual blue whale for this one." },
  { meters: 56.1,    label: '🚀 Space Shuttles (184 ft)',      name: 'Space Shuttles',  emoji: '🚀', slipPun: "Houston, we have a problem. No road found." },
  { meters: 91.44,   label: '🏈 Football Fields (100 yd)',     name: 'football fields', emoji: '🏈', slipPun: "Incomplete pass — the ocean intercepted!" },
  { meters: 330,     label: '🗼 Eiffel Towers (1,083 ft)',     name: 'Eiffel Towers',   emoji: '🗼', slipPun: "C'est impossible! Even the Eiffel Tower can't bridge that gap." },
  { meters: 828,     label: '🏗️ Burj Khalifas (2,717 ft)',    name: 'Burj Khalifas',   emoji: '🏗️', slipPun: "Not even the world's tallest building can bridge that gap." },
  { meters: 8849,    label: '🏔️ Mount Everests (29,032 ft)',  name: 'Mount Everests',  emoji: '🏔️', slipPun: "You've peaked too soon — no road across that ocean." },
]

const UNIT_META = Object.fromEntries(UNITS.map(u => [String(u.meters), u]))

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocode(q) {
  const parts = q.split(',').map(s => s.trim())
  const last = parts[parts.length - 1].toUpperCase()
  const params = new URLSearchParams({ q, format: 'json', limit: '1' })
  if (US_STATES.has(last)) params.set('countrycodes', 'us')
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'bananaforscale/1.0' },
  })
  const data = await res.json()
  if (!data.length) throw new Error(`Couldn't find "${q}" — try being more specific.`)
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export default function App() {
  const [from, setFrom] = useState('Portland, OR')
  const [to, setTo] = useState('Seattle, WA')
  const [selectedUnit, setSelectedUnit] = useState(String(UNITS[0].meters))
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [routeResult, setRouteResult] = useState(null)
  const [noRoute, setNoRoute] = useState(false)

  const displayResult = useMemo(() => {
    if (!routeResult) return null
    const { distMeters, durationSecs, fromVal, toVal } = routeResult
    const unit = UNIT_META[selectedUnit]
    const count = distMeters / parseFloat(selectedUnit)
    const countFmt = count >= 1000
      ? count.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : count.toLocaleString(undefined, { maximumFractionDigits: 1 })
    const totalMins = Math.round(durationSecs / 60)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${totalMins} min`
    const km = (distMeters / 1000).toFixed(1)
    const trailCount = Math.min(16, Math.max(1, Math.ceil(Math.log10(count) * 2)))
    return { countFmt, unit, km, durationStr, fromVal, toVal, trailCount }
  }, [routeResult, selectedUnit])

  async function handleGetRoute() {
    setError('')
    setNoRoute(false)
    setStatus('')
    if (!from.trim() || !to.trim()) {
      setError('Please enter both a start and end location!')
      return
    }
    setLoading(true)
    try {
      setStatus('📍 Looking up your locations...')
      const [origin, dest] = await Promise.all([geocode(from.trim()), geocode(to.trim())])

      setStatus('🗺️ Fetching the route...')
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
      const routeRes = await fetch(osrmUrl)
      const routeData = await routeRes.json()

      if (routeData.code !== 'Ok' || !routeData.routes?.length) {
        setRouteResult(null)
        setNoRoute(true)
        return
      }

      // OSRM routes via ferries across oceans, returning a driving distance shorter
      // than the straight-line distance. Catch that and treat it as no route.
      const straightLine = haversineMeters(origin.lat, origin.lng, dest.lat, dest.lng)
      if (routeData.routes[0].distance < straightLine * 0.9) {
        setRouteResult(null)
        setNoRoute(true)
        return
      }

      const route = routeData.routes[0]
      setNoRoute(false)
      setRouteResult({
        distMeters: route.distance,
        durationSecs: route.duration,
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        origin,
        dest,
        fromVal: from.trim(),
        toVal: to.trim(),
      })
    } catch (err) {
      setError('❌ ' + err.message)
    } finally {
      setStatus('')
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleGetRoute()
  }

  const currentUnit = UNIT_META[selectedUnit]

  return (
    <div className="app">
      <div className="bento">
        <div className="bento-controls">
          <header>
            <div className="logo">
              <span className="banana-icon">🍌</span>{' '}
              <span className="logo-banana">banana</span>{' '}
              <span className="logo-for">for</span>{' '}
              <span className="logo-scale">scale</span>
            </div>
            <div className="tagline">Because meters are deeply, profoundly boring</div>
          </header>
          <div className="card">
            <div className="form-row">
              <div className="field">
                <label>📍 From</label>
                <input
                  type="text"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Portland, OR"
                />
              </div>
              <div className="field">
                <label>🏁 To</label>
                <input
                  type="text"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Seattle, WA"
                />
              </div>
            </div>
            <button className="go-btn" onClick={handleGetRoute} disabled={loading}>
              🍌 Scale It!
            </button>
            {status && <div className="status">{status}</div>}
            {error && <div className="error-msg">{error}</div>}
          </div>

          <div className="card unit-card">
            <div className="unit-grid-label">📏 Measure in</div>
            <div className="unit-grid">
              {UNITS.map(u => (
                <button
                  key={u.meters}
                  className={`unit-btn${selectedUnit === String(u.meters) ? ' selected' : ''}`}
                  onClick={() => setSelectedUnit(String(u.meters))}
                >
                  <span className="unit-btn-emoji">{u.emoji}</span>
                  <span className="unit-btn-name">{u.name}</span>
                </button>
              ))}
            </div>
          </div>

          {noRoute && (
            <div className="no-route-card">
              <div className="no-route-splash">🌊 {currentUnit.emoji} 🌊</div>
              <div className="no-route-pun">{currentUnit.slipPun}</div>
              <div className="no-route-hint">No driving route found — try two places on the same landmass.</div>
            </div>
          )}

          {displayResult && (
            <div className="result-card">
              <div className="result-number">{displayResult.countFmt} {displayResult.unit.emoji}</div>
              <div className="result-unit">{displayResult.unit.name} long</div>
              <div className="result-meta">
                {displayResult.km} km · ~{displayResult.durationStr} drive · {displayResult.fromVal} → {displayResult.toVal}
              </div>
            </div>
          )}
        </div>

        <div className="card map-card bento-map">
          <MapView routeData={routeResult} routeEmoji={currentUnit.emoji} />
        </div>
      </div>
    </div>
  )
}
