import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useMemo, useEffect } from 'react'
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'
import WorldMap, { normalizeCountryName } from './WorldMap'

// Map countries to their S3 key paths
function getCountryKeyPath(country) {
  const countryCodeMap = {
    'Australia': 'AU',
    'Belize': 'BZ',
    'Ghana': 'GH',
    'Hong Kong': 'HK',
    'Malaysia': 'MY',
    'Singapore': 'SG',
    'South Africa': 'ZA',
    'Taiwan': 'TW',
    'United States': 'US',
    'European Union': 'EU',
    // Individual EU countries
    'Austria': 'EU',
    'Belgium': 'EU',
    'Bulgaria': 'EU',
    'Croatia': 'EU',
    'Cyprus': 'EU',
    'Czech Republic': 'EU',
    'Denmark': 'EU',
    'Estonia': 'EU',
    'Finland': 'EU',
    'France': 'EU',
    'Germany': 'EU',
    'Greece': 'EU',
    'Hungary': 'EU',
    'Ireland': 'EU',
    'Italy': 'EU',
    'Latvia': 'EU',
    'Lithuania': 'EU',
    'Luxembourg': 'EU',
    'Malta': 'EU',
    'Netherlands': 'EU',
    'Poland': 'EU',
    'Portugal': 'EU',
    'Romania': 'EU',
    'Slovakia': 'EU',
    'Slovenia': 'EU',
    'Spain': 'EU',
    'Sweden': 'EU'
  }
  
  const code = countryCodeMap[country] || 'US'
  return `trade-data/normal/${code}/Oct15.2025.jsonl`
}

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
          {formData.exportLocations.map((country, idx) => (
            <div key={country} className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 border border-[#2a2a2a]">
              <h2 className="text-2xl font-bold text-gray-100 mb-6 text-center border-b border-[#2f2f2f] pb-3">
                {country}
              </h2>

              <div className="space-y-4 mt-6">
                <div className="pt-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Product: {formData.companyDetails || 'No product specified'}</h3>
                  <LookupBox
                    initialQuery={formData.initialQuery ?? formData.companyDetails ?? ''}
                    initialBucket={formData.s3Bucket ?? 'tsinfo'}
                    initialKeyPath={getCountryKeyPath(country)}
                    country={country}
                    autoDelay={idx * 250}
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

function LookupBox({ initialQuery = '', initialBucket = 'tsinfo', initialKeyPath = 'trade-data/normal/US/Oct15.2025.jsonl', country = null, autoDelay = 0 }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [topK] = useState(5)
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
        body: JSON.stringify({ bucket, key: keyPath, query, top_k: topK, country, fast: true })
      })
      
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        const errorDetail = body.detail || 'No data available'
        
        // If it's a 404 or "not found" type error, just show empty results
        if (resp.status === 404 || errorDetail.includes('not found') || errorDetail.includes('No such')) {
          setResults([])
          setSummary(null)
          setSummaryError(null)
          return
        }
        
        // For other errors, log but don't show to user
        console.error('Lookup error:', errorDetail)
        setResults([])
        setSummary(null)
        setSummaryError(null)
        return
      }
      
      const data = await resp.json()
      const matches = data.matches ?? []
      setResults(matches)
      
      // Skip AI summarization for faster results - show raw data immediately
      // Uncomment the lines below if you want to re-enable summarization
      // if (matches.length > 0) {
      //   summarizeMatches(matches)
      // } else {
      //   setSummary(null)
      //   setSummaryError(null)
      // }
      setSummary(null)
      setSummaryError(null)
    } catch (err) {
      console.error(err)
      // Don't show error to user, just show empty results
      setResults([])
      setSummary(null)
      setSummaryError(null)
    } finally {
      setLoading(false)
    }
  }

  async function summarizeMatches(matches, retries = 2) {
    setSummaryLoading(true)
    setSummary(null)
    setSummaryError(null)
    
    const attemptSummarization = async (attempt) => {
      try {
        // Build a concise text block of the matches to send to the model
        const lines = matches.slice(0, topK).map((m, i) => {
          const rec = m.record
          if (rec && typeof rec === 'object') {
            // include only primitive fields to avoid [object Object]
            const entries = Object.entries(rec)
              .filter(([_, v]) => v !== null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
              .slice(0, 6)
              .map(([k, v]) => `${k}: ${v}`)
            return `${i + 1}. ${entries.join('; ')}`
          }
          return `${i + 1}. ${String(rec)}`
        }).join('\n')

        const prompt = `You are a helpful international trade expert. Analyze the following tariff/product records and provide a clear, actionable summary for someone exporting to ${country || 'the selected location'}. 

Focus on:
- Tariff rates and duty information
- Key product classifications and codes
- Important trade restrictions or requirements
- Practical implications for the exporter

Keep it concise (4-8 sentences) and user-friendly.\n\nTariff Records:\n${lines}\n\nSummary:`

        const resp = await fetch(`${API_BASE_URL}/api/bedrock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, temperature: 0.0, max_tokens: 300 })
        })

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}))
          const errorMsg = body.detail || 'Summarization failed'
          
          // Check if it's a throttling error
          if (errorMsg.includes('ThrottlingException') || errorMsg.includes('Too many requests') || errorMsg.includes('rate limit')) {
            throw new Error('THROTTLE')
          }
          throw new Error(errorMsg)
        }

        const data = await resp.json()
        return data.result ?? String(data)
      } catch (err) {
        console.error('Summary error', err)
        
        // If throttling and we have retries left, wait and retry
        if (err.message === 'THROTTLE' && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000) // Exponential backoff, max 8s
          console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          return attemptSummarization(attempt + 1)
        }
        
        throw err
      }
    }

    try {
      const result = await attemptSummarization(0)
      setSummary(result)
      setSummaryError(null)
    } catch (err) {
      const errorMsg = err.message || String(err)
      // Don't show throttling errors as critical - just indicate service is busy
      if (errorMsg.includes('ThrottlingException') || errorMsg.includes('Too many requests') || errorMsg.includes('rate limit') || errorMsg === 'THROTTLE') {
        setSummaryError('Service temporarily busy. Showing raw results instead.')
        
        // Create a simple manual summary from the top result as fallback
        const topMatch = matches[0]?.record
        if (topMatch && typeof topMatch === 'object') {
          const keyFields = ['HS_Code', 'hs_code', 'description', 'rate', 'duty_rate', 'product', 'tariff_rate', 'country']
          const relevantData = Object.entries(topMatch)
            .filter(([k]) => {
              const key = k.toLowerCase()
              return keyFields.some(f => key.includes(f.toLowerCase()))
            })
            .slice(0, 5)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
          
          if (relevantData) {
            setSummary(`Found tariff information: ${relevantData}`)
          }
        }
      } else {
        setSummaryError(errorMsg)
      }
      // Don't block the UI - let the raw results show through
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
    // Auto-run lookup; combine query with country and stagger the call
    const combined = country ? (initialQuery ? `${initialQuery} ${country}` : country) : initialQuery
    const trimmed = (combined || '').trim()
    if (trimmed) {
      setQuery(trimmed)
      const t = setTimeout(() => doLookup(), autoDelay)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, country, autoDelay])

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

  const renderTopResult = (result) => {
    if (!result || !result.record) return null
    const rec = result.record
    
    if (typeof rec === 'object' && !Array.isArray(rec)) {
      // Fields to exclude (duty_type, duty_value, rates, and object fields)
      const excludedFields = ['duty_type', 'duty_value', 'rates', 'object', 'imposing_country', 'affected_countries', 'effective_from', 'hs_level', 'unit_of_quantity', 'indent', 'source_bucket', 'source_key']
      
      // Fields to prioritize showing
      const priorityFields = ['HS_Code', 'hs_code', 'description', 'product', 'tariff_rate', 'duty_rate']
      
      // Filter and prioritize fields
      const availableFields = Object.entries(rec).filter(([k, v]) => {
        const key = k.toLowerCase()
        
        // Skip excluded fields
        if (excludedFields.some(field => key.includes(field.toLowerCase()))) {
          return false
        }
        
        // Skip null/undefined/empty values
        if (v === null || v === undefined || v === '') {
          return false
        }
        
        // Skip object types that show as [object Object]
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return false
        }
        
        return true
      }).map(([k, v]) => {
        const key = k.toLowerCase()
        // Prioritize important fields
        const priority = priorityFields.some(f => key.includes(f.toLowerCase())) ? 1 : 0
        return { key: k, value: v, priority }
      }).sort((a, b) => b.priority - a.priority)
      
      if (availableFields.length === 0) {
        return null
      }
      
      // Show top 6 fields
      const fieldsToShow = availableFields.slice(0, 6)
      
      return (
        <div className="space-y-2 text-sm">
          {fieldsToShow.map(({ key, value }) => (
            <div key={key} className="flex justify-between py-1 border-b border-gray-700">
              <span className="text-gray-400">{key}:</span> 
              <span className="text-gray-200">{String(value)}</span>
            </div>
          ))}
        </div>
      )
    }
    
    return <div className="text-sm text-gray-300">{String(rec)}</div>
  }

  return (
    <div className="space-y-4">
      {/* Show the query as plain text, not editable */}
      <div className="bg-[#181818] border border-[#222] rounded p-3 mb-2">
        <span className="text-xs text-gray-400">Query:</span>
        <div className="text-base text-gray-100 mt-1">{query}</div>
      </div>

      {(loading || (results === null && !error)) && (
        <div className="text-sm text-gray-400">Loading...</div>
      )}

      {results && results.length > 0 && (
        <div className="mt-3 space-y-3">
          {summaryLoading && (
            <div className="bg-[#0f1720] p-4 rounded border border-[#222]">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span className="text-sm text-gray-300">Analyzing tariff data...</span>
              </div>
            </div>
          )}
          {summaryError && (
            <div className="bg-yellow-900/20 p-3 rounded border border-yellow-500/50 text-sm text-yellow-300">
              <div className="flex items-center">
                <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{summaryError}</span>
              </div>
            </div>
          )}
          {summary && (
            <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 p-5 rounded-lg border border-blue-500/30">
              <h5 className="font-semibold text-blue-300 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Tariff Analysis Summary
              </h5>
              <div className="whitespace-pre-wrap text-gray-100 leading-relaxed">{summary}</div>
            </div>
          )}

          {/* Show key details from the top result */}
          {!summary && (
            <div className="bg-[#1a1a2e] p-4 rounded border border-[#2a2a2e]">
              <h5 className="text-sm font-semibold text-gray-300 mb-2">Key Information:</h5>
              {renderTopResult(results[0])}
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="bg-[#2a2a2a] p-5 rounded-lg border border-[#333] text-center mt-3">
          <p className="text-sm text-gray-300">No tariff data available for this product and location.</p>
          <p className="text-xs text-gray-400 mt-2">This location may not have tariff data in our database.</p>
        </div>
      )}

      {results && results.length === 0 && !loading && (
        <div className="bg-[#2a2a2a] p-5 rounded-lg border border-[#333] text-center mt-3">
          <p className="text-sm text-gray-300">No tariff matches found for this product and location.</p>
          <p className="text-xs text-gray-400 mt-2">Try refining your product search terms.</p>
        </div>
      )}
    </div>
  )
}

export default ResultsPage
