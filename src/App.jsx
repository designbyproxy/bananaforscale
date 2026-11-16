import { useEffect, useMemo, useRef, useState } from 'react'
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

// Funny-named towns in the lower 48, so any pair is drivable. Each one was
// checked against Photon to resolve to the right town and state.
const FUNNY_PLACES = [
  'Boring, OR', 'Hell, MI', 'Truth or Consequences, NM', 'Accident, MD',
  'Toad Suck, AR', 'Monkeys Eyebrow, KY', 'Why, AZ', 'Peculiar, MO',
  'Cut and Shoot, TX', 'Happy, TX', 'Ding Dong, TX', 'Embarrass, MN',
  'Bird-in-Hand, PA', 'Hot Coffee, MS', 'Two Egg, FL', 'Santa Claus, IN',
  'Whynot, NC', 'Uncertain, TX', 'Okay, OK', 'Smackover, AR', 'Zzyzx, CA',
  'Waterproof, LA', 'Pie Town, NM', 'Humptulips, WA', 'Burnt Corn, AL',
  'Tightwad, MO', 'Hopeulikit, GA', 'Kill Devil Hills, NC', 'Frankenstein, MO',
  'Normal, IL', 'Zap, ND', 'Slaughter Beach, DE', 'Gripe, AZ', 'Oddville, KY',
  'Possum Trot, KY', 'Bowlegs, OK', 'Dinosaur, CO', 'Loveladies, NJ', 'Bigfoot, TX',
]

function randomPlacePair() {
  const a = Math.floor(Math.random() * FUNNY_PLACES.length)
  let b = Math.floor(Math.random() * (FUNNY_PLACES.length - 1))
  if (b >= a) b++
  return [FUNNY_PLACES[a], FUNNY_PLACES[b]]
}

const UNIT_META = Object.fromEntries(UNITS.map(u => [String(u.meters), u]))
const DEFAULT_UNIT = UNITS.find(u => u.name === 'bananas')

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
  const params = new URLSearchParams({ q, limit: '5' })
  const res = await fetch(`https://photon.komoot.io/api/?${params}`)
  if (!res.ok) throw new Error('Location lookup is unavailable right now — try again in a moment.')
  const { features = [] } = await res.json()
  // Photon has no country filter, so prefer a US match when the query ends in a state code
  const match = US_STATES.has(last)
    ? features.find(f => f.properties.countrycode === 'US') || features[0]
    : features[0]
  if (!match) throw new Error(`Couldn't find "${q}" — try being more specific.`)
  const [lng, lat] = match.geometry.coordinates
  return { lat, lng }
}

export default function App() {
  const [initialPair] = useState(randomPlacePair)
  const [from, setFrom] = useState(initialPair[0])
  const [to, setTo] = useState(initialPair[1])
  const [selectedUnit, setSelectedUnit] = useState(null) // meters as string; null until picked
  const [pickerOpen, setPickerOpen] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const panelRef = useRef(null)
  const fromRef = useRef(null)
  const backBtnRef = useRef(null)
  const aboutRef = useRef(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [routeResult, setRouteResult] = useState(null)
  const [noRoute, setNoRoute] = useState(false)

  const displayResult = useMemo(() => {
    if (!routeResult || !selectedUnit) return null
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
    return { countFmt, unit, km, durationStr, fromVal, toVal }
  }, [routeResult, selectedUnit])

  async function handleGetRoute(e) {
    e?.preventDefault()
    setPickerOpen(false)
    if (!selectedUnit) setSelectedUnit(String(DEFAULT_UNIT.meters))
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
        setFlipped(true)
        return
      }

      // OSRM routes via ferries across oceans, returning a driving distance shorter
      // than the straight-line distance. Catch that and treat it as no route.
      const straightLine = haversineMeters(origin.lat, origin.lng, dest.lat, dest.lng)
      if (routeData.routes[0].distance < straightLine * 0.9) {
        setRouteResult(null)
        setNoRoute(true)
        setFlipped(true)
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
      setFlipped(true)
    } catch (err) {
      setError('❌ ' + err.message)
    } finally {
      setStatus('')
      setLoading(false)
    }
  }

  function handleSearchAgain() {
    setPickerOpen(false)
    setFlipped(false)
  }

  // Move focus to the side that just flipped into view
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    const t = setTimeout(() => (flipped ? backBtnRef : fromRef).current?.focus({ preventScroll: true }), 350)
    return () => clearTimeout(t)
  }, [flipped])

  // Close the unit picker on outside click or Escape
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = e => { if (!panelRef.current?.contains(e.target)) setPickerOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const currentUnit = selectedUnit ? UNIT_META[selectedUnit] : null
  const mapUnit = currentUnit || DEFAULT_UNIT

  const unitButton = (
    <button
      type="button"
      className={`unit-trigger${currentUnit ? ' has-unit' : ''}`}
      aria-haspopup="true"
      aria-expanded={pickerOpen}
      aria-label={currentUnit ? `Measure in ${currentUnit.name}. Change unit` : 'Measure in: choose a unit'}
      onClick={() => setPickerOpen(o => !o)}
    >
      {currentUnit
        ? <span className="unit-trigger-emoji">{currentUnit.emoji}</span>
        : <span className="unit-trigger-label">📏 Measure in</span>}
      <span className="unit-trigger-caret" aria-hidden="true">▾</span>
    </button>
  )

  return (
    <div className="app">
      <main className="card map-card">
        <MapView routeData={routeResult} routeUnit={mapUnit} panelRef={panelRef} />

        <div className="search-panel" ref={panelRef}>
          <div className={`flip${flipped ? ' flipped' : ''}`}>
            <div className="flip-inner">
              <form
                className="face face-front"
                onSubmit={handleGetRoute}
                inert={flipped ? '' : undefined}
                aria-hidden={flipped}
              >
                <div className="field">
                  <label htmlFor="from">📍 From</label>
                  <input
                    id="from"
                    ref={fromRef}
                    type="text"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    placeholder="e.g. Portland, OR"
                  />
                </div>
                <div className="field">
                  <label htmlFor="to">🏁 To</label>
                  <input
                    id="to"
                    type="text"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="e.g. Seattle, WA"
                  />
                </div>
                <div className="action-row">
                  {unitButton}
                  <button type="submit" className="go-btn" disabled={loading}>
                    {loading ? 'Scaling…' : 'GO 🍌'}
                  </button>
                </div>
                {status && <div className="status" role="status">{status}</div>}
                {error && <div className="error-msg" role="alert">{error}</div>}
              </form>

              <div
                className={`face face-back${noRoute ? ' no-route' : ''}`}
                inert={flipped ? undefined : ''}
                aria-hidden={!flipped}
              >
                {noRoute ? (
                  <div className="result-body">
                    <div className="no-route-splash">🌊 {mapUnit.emoji} 🌊</div>
                    <div className="no-route-pun">{mapUnit.slipPun}</div>
                    <div className="no-route-hint">No driving route found — try two places on the same landmass.</div>
                  </div>
                ) : displayResult && (
                  <div className="result-body" aria-live="polite">
                    <div className="result-number">{displayResult.countFmt} {displayResult.unit.emoji}</div>
                    <div className="result-unit">{displayResult.unit.name} long</div>
                    <div className="result-meta">
                      {displayResult.km} km · ~{displayResult.durationStr} drive<br />
                      {displayResult.fromVal} → {displayResult.toVal}
                    </div>
                  </div>
                )}
                <div className="action-row">
                  {!noRoute && unitButton}
                  <button type="button" className="back-btn" ref={backBtnRef} onClick={handleSearchAgain}>
                    ← Search again
                  </button>
                </div>
              </div>
            </div>
          </div>

          {pickerOpen && (
            <div className="unit-popover" role="dialog" aria-label="Measure in">
              <div className="unit-grid-label">📏 Measure in</div>
              <div className="unit-grid">
                {UNITS.map(u => (
                  <button
                    type="button"
                    key={u.meters}
                    className={`unit-btn${selectedUnit === String(u.meters) ? ' selected' : ''}`}
                    aria-pressed={selectedUnit === String(u.meters)}
                    onClick={() => { setSelectedUnit(String(u.meters)); setPickerOpen(false) }}
                  >
                    <span className="unit-btn-emoji">{u.emoji}</span>
                    <span className="unit-btn-name">{u.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="site-footer">
        <button type="button" className="footer-link" onClick={() => aboutRef.current?.showModal()}>
          About
        </button>
        <span aria-hidden="true">·</span>
        <a href="https://designbyproxy.com">Designed by Proxy</a>
      </footer>

      <dialog
        ref={aboutRef}
        className="about-modal"
        aria-labelledby="about-title"
        onClick={e => { if (e.target === aboutRef.current) aboutRef.current.close() }}
      >
        <div className="about-body">
          <header>
            <h1 className="logo" id="about-title">
              <span className="banana-icon">🍌</span>{' '}
              <span className="logo-banana">banana</span>{' '}
              <span className="logo-for">for</span>{' '}
              <span className="logo-scale">scale</span>
            </h1>
            <div className="tagline">Because meters are deeply, profoundly boring</div>
          </header>
          <button type="button" className="back-btn" onClick={() => aboutRef.current?.close()} autoFocus>
            Got it 🍌
          </button>
        </div>
      </dialog>
    </div>
  )
}
