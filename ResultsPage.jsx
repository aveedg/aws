import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useMemo, useEffect } from 'react'
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'
import WorldMap, { normalizeCountryName } from './WorldMap'

function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const formData = location.state?.formData
  const initialCountries = useMemo(() => {
    if (!formData?.exportLocations) return []
    return formData.exportLocations.map(normalizeCountryName)
  }, [formData])

  const [highlightedCountries, setHighlightedCountries] = useState(initialCountries)

  const handleToggleCountry = (displayName, normalizedName) => {
    const key = normalizedName ?? normalizeCountryName(displayName)
    setHighlightedCountries(prev => (
      prev.includes(key)
        ? prev.filter(c => c !== key)
        : [...prev, key]
    ))
  }

  if (!formData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Data Found</h1>
          <button
            onClick={() => navigate('/')}
            className="bg-indigo-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition duration-200"
          >
            Go Back to Form
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f0f] via-[#181818] to-[#202020] py-12 px-4 sm:px-6 lg:px-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-100 mb-8 text-center">Submission Successful!</h1>

        {/* World Map at the top */}
        <div className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 mb-8 border border-[#2a2a2a]">
          <h2 className="text-2xl font-bold text-gray-100 mb-4 text-center">Export Locations</h2>
          <p className="text-sm text-gray-400 text-center mb-6">Export locations (map is view-only on this page).</p>
          <WorldMap
            selectedCountries={highlightedCountries}
            availableCountries={formData.exportLocations}
            // Render map as non-interactive on results page
            onCountryClick={undefined}
            selectedColor="#3EA6FF"
            selectedHoverColor="#67B6FF"
            availableColor="#2c2c2c"
            availableHoverColor="#3a3a3a"
            defaultColor="#2c2c2c"
            defaultHoverColor="#3a3a3a"
          />
        </div>

        <div className="space-y-6 mb-8">
          {formData.exportLocations.map(country => (
            <div key={country} className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 border border-[#2a2a2a]">
              <h2 className="text-2xl font-bold text-gray-100 mb-6 text-center border-b border-[#2f2f2f] pb-3">
                {country}
              </h2>

              <div className="space-y-4 mt-6">
                <div className="border-b border-[#2f2f2f] pb-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-1">Company Location</h3>
                  <p className="text-lg text-gray-100">{formData.companyLocation}</p>
                </div>

                <div className="pb-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-1">Company Details</h3>
                  <div className="text-lg text-gray-100 space-y-2">
                    {formData.companyDetails.split('\n').map((line, index) => (
                      <p key={`${country}-detail-${index}`}>{line}</p>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Tariffs & Products for {country}</h3>
                  <LookupBox
                    initialQuery={formData.companyDetails ?? ''}
                    initialBucket={formData.s3Bucket ?? 'tsinfo'}
                    initialKeyPath={formData.s3Key ?? 'trade-data/normal/US/Oct15.2025.jsonl'}
                    country={country}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 text-white py-3 px-20 rounded-lg font-semibold hover:bg-red-700 transition duration-200 shadow-lg"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  )
}

function LookupBox({ initialQuery = '', initialBucket = 'tsinfo', initialKeyPath = 'trade-data/normal/US/Oct15.2025.jsonl', country = null }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [topK, setTopK] = useState(5)
  const [bucket, setBucket] = useState(initialBucket)
  const [keyPath, setKeyPath] = useState(initialKeyPath)

  const doLookup = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)
    try {
    const resp = await fetch(`${API_BASE_URL}/api/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, key: keyPath, query, top_k: topK, country })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || 'Lookup failed')
      }
      const data = await resp.json()
      const matches = data.matches ?? []
      setResults(matches)
      // kick off summarization of matches for an average user
      if (matches.length > 0) {
        summarizeMatches(matches)
      } else {
        setSummary(null)
        setSummaryError(null)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function summarizeMatches(matches) {
    setSummaryLoading(true)
    setSummary(null)
    setSummaryError(null)
    try {
      // Build a concise text block of the matches to send to the model
      const lines = matches.slice(0, topK).map((m, i) => {
        const rec = m.record
        if (rec && typeof rec === 'object') {
          // pick up to 5 fields for context
          const entries = Object.entries(rec).slice(0, 5).map(([k, v]) => `${k}: ${v}`)
          return `${i + 1}. ${entries.join('; ')}`
        }
        return `${i + 1}. ${String(rec)}`
      }).join('\n')

      const prompt = `You are a helpful assistant. Summarize the following matched tariff/product records for a non-technical, average user. Keep the summary short (3-6 sentences), highlight the most relevant items, and give a plain-language recommendation if applicable.\n\nMatches:\n${lines}\n\nProvide a concise, easy-to-read summary:`

      const resp = await fetch(`${API_BASE_URL}/api/bedrock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, temperature: 0.2, max_tokens: 300 })
      })

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || 'Summarization failed')
      }

      const data = await resp.json()
      setSummary(data.result ?? String(data))
    } catch (err) {
      console.error('Summary error', err)
      setSummaryError(err.message || String(err))
    } finally {
      setSummaryLoading(false)
    }
  }

  // Simple heuristic: auto-run lookup only when the initial query looks like it contains
  // tariff/product intent (keywords or numeric codes). Otherwise wait for user to press Lookup.
  const shouldAutoRun = (q) => {
    if (!q) return false
    const lower = q.toLowerCase()
    const keywords = ['tariff', 'tariff code', 'hs', 'hs code', 'product', 'code']
    for (const k of keywords) {
      if (lower.includes(k)) return true
    }
    // if query contains a number sequence (likely a tariff code), auto-run
    if (/[0-9]{2,}/.test(q)) return true
    return false
  }

  useEffect(() => {
    // If a country is provided, auto-run the lookup for that country immediately
    if (country) {
      const combined = initialQuery ? `${initialQuery} ${country}` : country
      setQuery(combined)
      doLookup()
      return
    }

    if (initialQuery && shouldAutoRun(initialQuery)) {
      setQuery(initialQuery)
      doLookup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, country])

  const renderRecord = (rec) => {
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      return (
        <div className="space-y-1 text-sm text-gray-100">
          {Object.entries(rec).map(([k, v]) => (
            <div key={k}><span className="font-medium text-gray-300">{k}:</span> <span className="ml-2">{String(v)}</span></div>
          ))}
        </div>
      )
    }
    return <div className="text-sm text-gray-100">{String(rec)}</div>
  }

  return (
    <div className="space-y-4">
      <form onSubmit={doLookup} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input value={bucket} onChange={(e) => setBucket(e.target.value)} className="col-span-1 bg-[#121212] text-gray-200 px-3 py-2 rounded-lg border border-[#303030]" />
          <input value={keyPath} onChange={(e) => setKeyPath(e.target.value)} className="col-span-2 bg-[#121212] text-gray-200 px-3 py-2 rounded-lg border border-[#303030]" />
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-[#303030] rounded-lg focus:ring-2 focus:ring-indigo-500 bg-[#121212] text-gray-100"
          placeholder="Type tariff codes, product descriptions, or other keywords to search the dataset"
        />

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Top K</label>
          <input type="number" min={1} max={50} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-20 px-2 py-1 rounded bg-[#121212] border border-[#303030] text-gray-100" />
          <button type="submit" disabled={loading} className="ml-auto bg-indigo-600 text-white py-2 px-4 rounded-lg">
            {loading ? 'Searching…' : 'Lookup'}
          </button>
        </div>
      </form>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {results && (
        <div className="mt-3 space-y-3">
          <h4 className="text-lg font-semibold">Matches ({results.length})</h4>
          {summaryLoading && <div className="text-sm text-gray-300">Summarizing results...</div>}
          {summaryError && <div className="text-sm text-red-400">Summary error: {summaryError}</div>}
          {summary && (
            <div className="bg-[#0f1720] p-4 rounded border border-[#222] text-sm text-gray-100">
              <h5 className="font-semibold text-gray-200 mb-2">Summary for an average user</h5>
              <div className="whitespace-pre-wrap">{summary}</div>
            </div>
          )}

          {results.length === 0 && <div className="text-sm text-gray-300">No matches found.</div>}
          {results.map((m, idx) => (
            <div key={idx} className="bg-[#141414] p-3 rounded border border-[#2a2a2a]">
              <div className="text-sm text-gray-400 mb-2">Score: {m.score}</div>
              <div>{renderRecord(m.record)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResultsPage
