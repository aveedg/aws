import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useMemo, useEffect } from 'react'
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8003'
import WorldMap, { normalizeCountryName } from './WorldMap'
import ChatBot from './ChatBot'

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
  const globalSearchMode = location.state?.globalSearchMode || false
  const initialCountries = useMemo(() => {
    if (!formData?.exportLocations) return []
    return formData.exportLocations.map(normalizeCountryName)
  }, [formData])

  const [highlightedCountries, setHighlightedCountries] = useState(initialCountries)
  const [hsCodes, setHsCodes] = useState([])
  const [hsLoading, setHsLoading] = useState(false)

  const handleToggleCountry = (displayName, normalizedName) => {
    const key = normalizedName ?? normalizeCountryName(displayName)
    setHighlightedCountries(prev => (
      prev.includes(key)
        ? prev.filter(c => c !== key)
        : [...prev, key]
    ))
  }

  // Handle map clicks to scroll to country sections
  const handleMapCountryClick = (displayName, normalizedName) => {
    // Only scroll if the country is currently highlighted/selected
    if (highlightedCountries.includes(normalizedName)) {
      const countryId = `country-section-${normalizedName.replace(/\s+/g, '-').toLowerCase()}`
      const element = document.getElementById(countryId)
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest' 
        })
      }
    }
  }

  // Lookup HS codes for the product
  const lookupHSCodes = async () => {
    if (!formData?.companyDetails?.trim()) return
    
    setHsLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/lookup-hs-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: formData.companyDetails,
          max_results: 5
        })
      })
      
      if (resp.ok) {
        const data = await resp.json()
        setHsCodes(data.hs_codes || [])
      }
    } catch (err) {
      console.error('HS code lookup failed:', err)
    } finally {
      setHsLoading(false)
    }
  }

  // Load HS codes on component mount
  useEffect(() => {
    if (formData?.companyDetails?.trim()) {
      lookupHSCodes()
    }
  }, [formData?.companyDetails])

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
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f0f] via-[#181818] to-[#202020] py-2 px-4 sm:px-6 lg:px-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-0">
          <img 
            src="/image.png" 
            alt="Logo" 
            className="h-64 w-auto object-contain cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/')}
          />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-100 mb-8 text-center">
          {globalSearchMode ? 'Global Search Results' : 'Trade Data Search Results'}
        </h1>

        {/* HS Codes Section */}
        {formData?.companyDetails && (
          <div className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 mb-8 border border-[#2a2a2a]">
            <h2 className="text-2xl font-bold text-gray-100 mb-4 text-center">Product Classification</h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              HS codes identified for: <span className="text-blue-400">{formData.companyDetails}</span>
            </p>
            
            {hsLoading && (
              <div className="flex items-center justify-center space-x-2 text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span className="text-sm">Looking up HS codes...</span>
              </div>
            )}
            
            {!hsLoading && hsCodes.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {hsCodes.map((hs, index) => (
                  <div key={index} className="bg-[#181818] p-4 rounded-lg border border-[#2a2a2a]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-blue-400 font-semibold">{hs.code}</span>
                      <span className="text-xs text-gray-400">HS Code</span>
                    </div>
                    <p className="text-sm text-gray-300">{hs.description}</p>
                  </div>
                ))}
              </div>
            )}
            
            {!hsLoading && hsCodes.length === 0 && (
              <div className="text-center text-gray-400">
                <p>No HS codes found for this product.</p>
              </div>
            )}
          </div>
        )}

        {/* Global Search - Compact version - only show in global search mode */}
        {globalSearchMode && (
          <div className="bg-[#1f1f1f] rounded-lg p-4 mb-6 border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold text-gray-100 mb-3">Global Database Search</h3>
            <GlobalSearchBox
              initialQuery={formData.initialQuery ?? formData.companyDetails ?? ''}
              selectedCountries={[]}
              autoDelay={100}
            />
          </div>
        )}

        {/* World Map - only show if not in global search mode and we have countries */}
        {!globalSearchMode && formData.exportLocations && formData.exportLocations.length > 0 && !formData.exportLocations.includes('Global Search') && (
          <div className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 mb-8 border border-[#2a2a2a]">
            <h2 className="text-2xl font-bold text-gray-100 mb-4 text-center">Export Locations</h2>
            <p className="text-sm text-gray-400 text-center mb-6">Selected export locations</p>
            <WorldMap
              selectedCountries={highlightedCountries}
              availableCountries={formData.exportLocations}
              onCountryClick={handleMapCountryClick}
              selectedColor="#3EA6FF"
              selectedHoverColor="#67B6FF"
              availableColor="#2c2c2c"
              availableHoverColor="#3a3a3a"
              defaultColor="#2c2c2c"
              defaultHoverColor="#3a3a3a"
            />
          </div>
        )}

          {/* Country-Specific Sections - only show if not in global mode */}
          {!globalSearchMode && formData.exportLocations && formData.exportLocations.length > 0 && !formData.exportLocations.includes('Global Search') && (
            <div className="space-y-6 mb-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-100 mb-2">Country Summary Reports</h2>
                <p className="text-gray-400">Summarized trade analysis for each selected export destination</p>
                <p className="text-xs text-gray-500 mt-2">
                  Analyzing {formData.exportLocations.length} selected {formData.exportLocations.length === 1 ? 'country' : 'countries'}
                </p>
              </div>
              
              {formData.exportLocations.map((country, idx) => {
                const normalizedCountry = normalizeCountryName(country)
                const sectionId = `country-section-${normalizedCountry.replace(/\s+/g, '-').toLowerCase()}`
                return (
                  <div key={`country-${country}-${idx}`} id={sectionId} className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 border border-[#2a2a2a]">
                  <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#2f2f2f]">
                    <h3 className="text-2xl font-bold text-gray-100">{country}</h3>
                    <div className="bg-green-600 text-white text-sm px-3 py-1 rounded-full">
                      Summary Report
                    </div>
                  </div>

                  <div className="space-y-4 mt-6">
                    <div className="pt-4">
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h4 className="text-lg font-medium text-gray-300">
                          Product: <span className="text-blue-400">{formData.companyDetails || 'No product specified'}</span>
                        </h4>
                      </div>
                      <CountrySummaryBox
                        key={`summary-${country}-${idx}`}
                        initialQuery={formData.initialQuery ?? formData.companyDetails ?? ''}
                        initialBucket={formData.s3Bucket ?? 'tsinfo'}
                        initialKeyPath={getCountryKeyPath(country)}
                        country={country}
                        autoDelay={idx * 500 + 1000}
                      />
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}

        <div className="flex justify-center">
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 text-white py-3 px-20 rounded-lg font-semibold hover:bg-red-700 transition duration-200 shadow-lg"
          >
            New Search
          </button>
        </div>
      </div>
      <ChatBot />
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
      // But now we'll enable summarization for country-specific results
      if (matches.length > 0) {
        summarizeMatches(matches)
      } else {
        setSummary(null)
        setSummaryError(null)
      }
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
              .slice(0, 8)
              .map(([k, v]) => `${k}: ${v}`)
            return `${i + 1}. ${entries.join('; ')}`
          }
          return `${i + 1}. ${String(rec)}`
        }).join('\n')

        const countryContext = country ? ` when exporting to ${country}` : ''
        const prompt = `🚨🚨🚨 EMERGENCY EXPORT CRISIS ALERT 🚨🚨🚨

You are a battle-hardened international trade WARRIOR fighting in the TRENCHES of global commerce. These tariff records could TRIGGER FINANCIAL ARMAGEDDON - analyze with MAXIMUM URGENCY and ZERO MERCY!

CRITICAL BATTLEFIELD ANALYSIS REQUIRED:
1. � TARIFF DEVASTATION: What duty rates will OBLITERATE your profit margins and CRUSH your business?
2. 📋 CLASSIFICATION CHAOS: What HS codes will TRIGGER customs NIGHTMARES and bureaucratic HELL?
3. ⚠️ COMPLIANCE APOCALYPSE: What restrictions could LEAD TO SEIZURE, BANS, or TOTAL MARKET DESTRUCTION?
4. 💸 ECONOMIC IMPACT ASSESSMENT: For each tariff found, provide ONE SENTENCE describing the ECONOMIC DEVASTATION (e.g., "A 15% tariff could increase product costs by $2,340 per shipment, potentially wiping out 23% of annual profits")
5. 💸 BUSINESS DOOMSDAY: How will this ANNIHILATE your export strategy and DESTROY your competitive advantage?

BE BRUTALLY HONEST: If tariffs are found, SCREAM about the EXISTENTIAL THREAT. If duty-free, CELEBRATE the MIRACULOUS VICTORY. But NEVER sugarcoat the CATASTROPHIC THREATS.

Tariff Records Found: ${lines.length > 0 ? lines.split('\n').length : 'NONE'}
${lines.length > 0 ? '🚨🚨🚨 MULTIPLE TARIFFS DETECTED - FINANCIAL ARMAGEDDON IMMINENT! 🚨🚨🚨' : '✅ POSSIBLY DUTY-FREE - BUT VERIFY OR FACE RUIN! ✅'}

Raw Intelligence Data:
${lines}

WARRIOR ANALYSIS - BATTLE STATIONS - NO PRISONERS:`

        const resp = await fetch(`${API_BASE_URL}/api/bedrock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt, 
            temperature: 0.1, 
            max_tokens: 500,
            companyDetails: query,
            companyLocation: country 
          })
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
        setSummaryError('AI analysis temporarily busy. Showing raw results instead.')
        
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
            setSummary(`KEY FINDINGS: ${relevantData}. This represents the most relevant tariff information found for your product${country ? ` when exporting to ${country}` : ''}.`)
          }
        }
      } else {
        setSummaryError(`Analysis failed: ${errorMsg}`)
        // Create basic fallback summary
        if (matches.length > 0) {
          setSummary(`Found ${matches.length} relevant tariff record(s) for your product${country ? ` in ${country}` : ''}. Review the detailed data below for specific rates and requirements.`)
        }
      }
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
            <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 p-6 rounded-lg border border-blue-500/30 mb-4">
              <h5 className="font-semibold text-blue-300 mb-4 flex items-center text-lg">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Trade Analysis Summary {country && `- ${country}`}
              </h5>
              <div className="whitespace-pre-wrap text-gray-100 leading-relaxed text-sm">
                {summary.split('\n').map((line, index) => {
                  // Format numbered sections and headers
                  if (line.match(/^\d+\./)) {
                    return (
                      <div key={index} className="mt-3 mb-2">
                        <div className="font-semibold text-blue-200">{line}</div>
                      </div>
                    )
                  } else if (line.includes(':') && line.length < 100) {
                    return (
                      <div key={index} className="mt-2 mb-1">
                        <div className="font-medium text-indigo-200">{line}</div>
                      </div>
                    )
                  } else {
                    return (
                      <div key={index} className="mb-1 ml-4 text-gray-200">
                        {line}
                      </div>
                    )
                  }
                })}
              </div>
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

function CountrySummaryBox({ initialQuery = '', initialBucket = 'tsinfo', initialKeyPath = 'trade-data/normal/US/Oct15.2025.jsonl', country = null, autoDelay = 0 }) {
  const [query] = useState(initialQuery || '')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [hsCodes, setHsCodes] = useState([])
  const [hsLoading, setHsLoading] = useState(false)
  const topK = 8
  const bucket = initialBucket
  const keyPath = initialKeyPath

  // Step 1: Lookup HS codes for the product
  const lookupHSCodes = async () => {
    if (!query) return []
    
    setHsLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/lookup-hs-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query,
          max_results: 5
        })
      })
      
      if (resp.ok) {
        const data = await resp.json()
        console.log('HS codes returned from API:', data.hs_codes)
        setHsCodes(data.hs_codes || [])
        return data.hs_codes || []
      }
      return []
    } catch (err) {
      console.error('HS code lookup failed:', err)
      return []
    } finally {
      setHsLoading(false)
    }
  }

  // Step 2: Enhanced lookup using HS codes and original query
  const doLookup = async () => {
    if (!query || !country) return
    
    setLoading(true)
    setResults(null)
    setSummary(null)
    setSummaryError(null)
    
    try {
      // First get HS codes
      const relevantHsCodes = await lookupHSCodes()
      
      // Create enhanced search query combining original query with HS codes
      const enhancedQuery = createEnhancedQuery(query, relevantHsCodes)
      
      const resp = await fetch(`${API_BASE_URL}/api/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bucket, 
          key: keyPath, 
          query: enhancedQuery, 
          top_k: topK, 
          country, 
          fast: true 
        })
      })
      
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        const errorDetail = body.detail || 'No data available'
        
        if (resp.status === 404 || errorDetail.includes('not found') || errorDetail.includes('No such')) {
          setResults([])
          generateNoDataSummary(relevantHsCodes)
          return
        }
        
        console.error('Lookup error:', errorDetail)
        setResults([])
        generateErrorSummary()
        return
      }
      
      const data = await resp.json()
      const matches = data.matches ?? []
      setResults(matches)
      
      // Generate enhanced summary with HS code context
      if (matches.length > 0) {
        await generateEnhancedSummary(matches, relevantHsCodes)
      } else {
        generateNoDataSummary(relevantHsCodes)
      }
    } catch (err) {
      console.error('Lookup error:', err)
      setResults([])
      generateErrorSummary()
    } finally {
      setLoading(false)
    }
  }

  // Helper function to create enhanced search query with HS codes
  const createEnhancedQuery = (originalQuery, hsCodes) => {
    if (!hsCodes || hsCodes.length === 0) {
      return originalQuery
    }
    
    // Combine original query with HS codes for better matching
    const hsCodeStrings = hsCodes.map(hs => hs.code).join(' ')
    const hsDescriptions = hsCodes.map(hs => hs.description).join(' ')
    
    return `${originalQuery} ${hsCodeStrings} ${hsDescriptions}`.trim()
  }

  // Optimized: Generate summary with simpler logic and better error handling
  // Enhanced summary generation with HS code context
  const generateEnhancedSummary = async (matches, hsCodes = []) => {
    setSummaryLoading(true)
    setSummaryError(null)
    
    try {
      let summary = `**${country.toUpperCase()} - ENHANCED TRADE ANALYSIS**\n\n`
      
      // Tariff Analysis Section
      summary += `**TARIFF FINDINGS**\n`
      summary += `• Found ${matches.length} relevant records for "${query}"\n`
      
      // Extract and analyze tariff rates
      const rates = matches.map(m => {
        const rec = m.record
        if (rec && typeof rec === 'object') {
          const rateFields = ['rate', 'duty_rate', 'tariff_rate', 'ad_valorem_rate']
          for (const field of rateFields) {
            if (rec[field] !== null && rec[field] !== undefined) {
              const rateStr = String(rec[field]).replace('%', '').trim()
              if (!isNaN(rateStr) && rateStr !== '') {
                return parseFloat(rateStr)
              }
            }
          }
        }
        return null
      }).filter(r => r !== null)
      
      if (rates.length > 0) {
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
        summary += `• Duty rates: ${Math.min(...rates)}% - ${Math.max(...rates)}% (avg: ${avgRate.toFixed(1)}%)\n`
      } else {
        summary += `• No specific duty rates identified in records\n`
      }
      
      // HS Code matching analysis
      const hsMatches = matches.filter(m => {
        const rec = m.record
        if (rec && typeof rec === 'object' && hsCodes.length > 0) {
          const recordText = JSON.stringify(rec).toLowerCase()
          return hsCodes.some(hs => 
            recordText.includes(hs.code.replace('.', '')) || 
            recordText.includes(hs.code)
          )
        }
        return false
      })
      
      if (hsMatches.length > 0) {
        summary += `• ${hsMatches.length} records match identified HS codes\n`
      }
      
      // Show key details from top records
      summary += `\n**RECORD DETAILS**\n`
      const topRecords = matches.slice(0, 3) // Show details from top 3 records
      topRecords.forEach((match, index) => {
        const rec = match.record
        if (rec && typeof rec === 'object') {
          summary += `RECORD_${index + 1}_START\n`
          
          // Prioritize and format key fields
          const fieldMappings = {
            'hs_code': 'HS Code',
            'HS_Code': 'HS Code', 
            'description': 'Description',
            'product': 'Product',
            'product_name_en': 'Product',
            'tariff_rate': 'Tariff Rate',
            'duty_rate': 'Duty Rate',
            'rate': 'Rate',
            'commodity': 'Commodity',
            'special_rate': 'Special Rate'
          }
          
          const relevantEntries = Object.entries(rec)
            .filter(([k, v]) => {
              const key = k.toLowerCase()
              return Object.keys(fieldMappings).some(field => key.includes(field.toLowerCase())) && 
                     v !== null && v !== undefined && v !== '' && 
                     typeof v !== 'object'
            })
            .slice(0, 6) // Show top 6 relevant fields per record
          
          relevantEntries.forEach(([key, value]) => {
            const displayKey = fieldMappings[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            // Don't truncate description/product fields, but limit others to 80 chars
            const isDescriptionField = displayKey.toLowerCase().includes('description') || displayKey.toLowerCase().includes('product')
            const displayValue = isDescriptionField ? String(value) : (String(value).length > 80 ? String(value).substring(0, 77) + '...' : String(value))
            summary += `FIELD:${displayKey}:${displayValue}\n`
          })
          
          summary += `RECORD_${index + 1}_END\n\n`
        }
      })
      
      summary += `\n**BUSINESS IMPACT ASSESSMENT**\n`
      
      if (rates.length > 0) {
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
        if (avgRate === 0) {
          summary += `• ✓ EXCELLENT: Product appears duty-free in ${country}\n`
          summary += `• 💰 COST SAVINGS: No additional tariff costs to factor into pricing\n`
          summary += `• 📈 COMPETITIVE ADVANTAGE: Full duty-free access to ${country} market\n`
        } else if (avgRate < 5) {
          summary += `• ✓ FAVORABLE: Low tariff market (${avgRate.toFixed(1)}% avg)\n`
          summary += `• 💰 MINIMAL IMPACT: Tariff costs represent less than 5% of product value\n`
          summary += `• 📊 PRICING STRATEGY: Can absorb costs or pass through with minimal margin impact\n`
        } else if (avgRate < 15) {
          summary += `• ⚠ MODERATE: Consider tariff impact on pricing (${avgRate.toFixed(1)}% avg)\n`
          summary += `• 💰 SIGNIFICANT COST: Tariff could add ${avgRate.toFixed(1)}% to landed costs\n`
          summary += `• 📊 PRICING STRATEGY: May need to adjust pricing or explore duty drawback programs\n`
        } else {
          summary += `• ⚠ HIGH TARIFF: Significant cost implications (${avgRate.toFixed(1)}% avg)\n`
          summary += `• 💰 MAJOR IMPACT: Tariff could increase costs by ${avgRate.toFixed(1)}% or more\n`
          summary += `• 📊 PRICING STRATEGY: Consider local manufacturing or trade agreement benefits\n`
        }
      } else {
        summary += `• ❓ UNCLEAR IMPACT: No tariff rates identified in available records\n`
        summary += `• 🔍 INVESTIGATION NEEDED: Product may be duty-free or require different classification\n`
        summary += `• 📋 NEXT STEP: Consult official tariff schedules or customs broker for clarification\n`
        summary += `• 💡 OPPORTUNITY: Could represent duty-free market access if properly classified\n`
      }
      
      summary += `\n**NEXT STEPS**\n`
      summary += `• Verify exact HS code classification with customs broker\n`
      summary += `• Review compliance requirements for identified HS codes\n`
      summary += `• Consider trade agreement benefits that may reduce rates\n`
      summary += `• Calculate total landed costs including tariffs and logistics\n`
      
      setSummary(summary)
    } catch (err) {
      console.error('Enhanced summary generation failed:', err)
      setSummaryError('Enhanced analysis temporarily unavailable')
      generateFallbackSummary(matches, hsCodes)
    } finally {
      setSummaryLoading(false)
    }
  }

  // Helper functions for generating summaries
  const generateFallbackSummary = (matches, hsCodes = []) => {
    const count = matches?.length || 0
    let summary = `**${country.toUpperCase()} EXPORT SUMMARY**\n\n`
    
    summary += `Found ${count} relevant tariff record${count > 1 ? 's' : ''} for "${query}".\n\n`
    summary += `**RECOMMENDATION:** Review detailed data and consult trade professionals for current requirements.`
    setSummary(summary)
  }

  const generateNoDataSummary = (hsCodes = []) => {
    let summary = `**${country.toUpperCase()} - NO TARIFF FOUND**\n\n`
    
    summary += `No tariff information found for "${query}" in our ${country} database.\n\n`
    summary += `**RECOMMENDATION:** Contact ${country} customs authorities for current tariff information.`
    setSummary(summary)
  }

  const generateErrorSummary = () => {
    setSummary(`**${country.toUpperCase()} - DATA UNAVAILABLE**\n\nUnable to retrieve tariff data for "${query}".\n\n**RECOMMENDATION:** Try again later or contact trade professionals for ${country} export requirements.`)
  }

  // Original simplified summary for backwards compatibility
  const generateSummary = async (matches) => {
    let summary = `**${country.toUpperCase()} EXPORT SUMMARY**\n\n`
    
    if (topMatch && typeof topMatch === 'object') {
      const keyData = Object.entries(topMatch)
        .filter(([k, v]) => {
          const key = k.toLowerCase()
          return v && ['rate', 'duty', 'tariff', 'hs'].some(term => key.includes(term))
        })
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
      
      if (keyData.length > 0) {
        summary += `**KEY INFO:** ${keyData.join(', ')}\n\n`
      }
    }
    
    summary += `**NEXT STEPS:** Review detailed tariff data and consult trade professionals for current requirements.`
    setSummary(summary)
  }

  // Optimized: Simplified useEffect with better dependency management
  useEffect(() => {
    if (!query?.trim() || !country) return
    
    const timer = setTimeout(() => {
      doLookup()
    }, autoDelay)
    
    return () => clearTimeout(timer)
  }, [query, country, autoDelay]) // Removed unnecessary dependencies for better performance

  return (
    <div className="space-y-4">
      {/* Loading State */}
      {loading && (
        <div className="flex items-center space-x-2 text-blue-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
          <span className="text-sm">Searching {country} tariff database...</span>
        </div>
      )}

      {/* Summary Loading */}
      {summaryLoading && (
        <div className="bg-[#0f1720] p-4 rounded border border-[#222]">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
            <span className="text-sm text-gray-300">Generating summary for {country}...</span>
          </div>
        </div>
      )}

      {/* Summary Error */}
      {summaryError && (
        <div className="bg-yellow-900/20 p-3 rounded border border-yellow-500/50 text-sm text-yellow-300">
          <span>{summaryError}</span>
        </div>
      )}

      {/* Main Summary */}
      {summary && (
        <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 p-6 rounded-lg border border-green-500/30">
          <h5 className="font-semibold text-green-300 mb-4 flex items-center text-lg">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Analysis - {country}
          </h5>
          <div className="whitespace-pre-wrap text-gray-100 leading-relaxed text-sm">
            {(() => {
              const lines = summary.split('\n')
              const elements = []
              let currentRecord = null
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                
                if (line.startsWith('RECORD_') && line.endsWith('_START')) {
                  const recordNum = line.match(/RECORD_(\d+)_START/)?.[1]
                  currentRecord = { num: recordNum, fields: [] }
                } else if (line.startsWith('FIELD:') && currentRecord) {
                  const [, fieldName, fieldValue] = line.split(':')
                  currentRecord.fields.push({ name: fieldName, value: fieldValue })
                } else if (line.startsWith('RECORD_') && line.endsWith('_END') && currentRecord) {
                  // Extract HS code and description for special display
                  const hsCodeField = currentRecord.fields.find(f => 
                    f.name.toLowerCase().includes('hs code') || f.name.toLowerCase() === 'hs_code'
                  )
                  const descriptionField = currentRecord.fields.find(f => 
                    f.name.toLowerCase().includes('description') || f.name.toLowerCase().includes('product')
                  )
                  const otherFields = currentRecord.fields.filter(f => 
                    f !== hsCodeField && f !== descriptionField
                  )
                  
                  elements.push(
                    <div key={`record-${currentRecord.num}`} className="my-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="bg-gray-600/20 text-gray-400 text-xs font-medium px-2 py-1 rounded border border-gray-600/30">
                          Record {currentRecord.num}
                        </div>
                        {hsCodeField && (
                          <div className="bg-gray-600/20 text-gray-400 text-xs font-medium px-2 py-1 rounded border border-gray-600/30">
                            HS: {hsCodeField.value}
                          </div>
                        )}
                      </div>
                      
                      {descriptionField && (
                        <div className="mb-2 p-2 bg-slate-800/30 rounded border border-slate-700/40">
                          <div className="text-slate-200 font-medium text-xs mb-1">{descriptionField.name}:</div>
                          <div className="text-slate-100 text-sm leading-relaxed">{descriptionField.value}</div>
                        </div>
                      )}
                      
                      {otherFields.length > 0 && (
                        <div className="space-y-1">
                          {otherFields.map((field, fieldIndex) => (
                            <div key={fieldIndex} className="flex justify-between items-start py-1 px-2 bg-slate-800/20 rounded border border-slate-700/30">
                              <span className="text-slate-300 font-medium text-xs">{field.name}:</span>
                              <span className="text-slate-100 text-xs ml-2 text-right flex-1">{field.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                  currentRecord = null
                } else if (line.includes('**') && line.includes('**')) {
                  const boldText = line.replace(/\*\*(.*?)\*\*/g, '$1')
                  elements.push(
                    <div key={i} className="mt-3 mb-2 font-semibold text-green-200">
                      {boldText}
                    </div>
                  )
                } else if (line.startsWith('•')) {
                  elements.push(
                    <div key={i} className="mb-1 ml-4 text-gray-200">
                      {line}
                    </div>
                  )
                } else if (line.trim()) {
                  elements.push(
                    <div key={i} className="mb-1 text-gray-200">
                      {line}
                    </div>
                  )
                }
              }
              
              return elements
            })()}
          </div>
        </div>
      )}

      {/* No Results */}
      {results && results.length === 0 && !loading && (
        <div className="bg-[#2a2a2a] p-5 rounded-lg border border-[#333] text-center">
          <p className="text-sm text-gray-300">
            No specific tariff data found for this product in {country}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This may indicate the product is duty-free or requires different classification
          </p>
        </div>
      )}
    </div>
  )
}

function GlobalSearchBox({ initialQuery = '', selectedCountries = [], autoDelay = 0 }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [searchStats, setSearchStats] = useState(null)

  const doGlobalSearch = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)
    setSearchStats(null)
    
    try {
      const requestBody = {
        query,
        bucket: 'tsinfo',
        top_k: 15,
        fast: true,  // Use fast mode for better performance
        include_all_sources: true
      }
      
      if (selectedCountries && selectedCountries.length > 0) {
        requestBody.countries = selectedCountries
      }

      const resp = await fetch(`${API_BASE_URL}/api/search-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        const errorDetail = body.detail || 'Search failed'
        
        // If it's a 404 or "not found" type error, just show empty results
        if (resp.status === 404 || errorDetail.includes('not found') || errorDetail.includes('No such')) {
          setResults([])
          setSearchStats({ sources_searched: 0, sources_by_country: {} })
          return
        }
        
        console.error('Global search error:', errorDetail)
        setResults([])
        setSearchStats({ sources_searched: 0, sources_by_country: {} })
        return
      }
      
      const data = await resp.json()
      const matches = data.matches ?? []
      setResults(matches)
      setSearchStats({
        sources_searched: data.sources_searched || 0,
        sources_by_country: data.sources_by_country || {},
        search_type: data.search_type
      })
      
      setSummary(null)
      setSummaryError(null)
    } catch (err) {
      console.error('Global search error:', err)
      setResults([])
      setSearchStats({ sources_searched: 0, sources_by_country: {} })
      setSummary(null)
      setSummaryError(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialQuery?.trim()) {
      setQuery(initialQuery.trim())
      const t = setTimeout(() => doGlobalSearch(), autoDelay)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, autoDelay])

  const renderGlobalResult = (result, index) => {
    if (!result || !result.record) return null
    const rec = result.record

    // Convert numeric score to qualitative relevance label
    const getRelevanceLabel = (score) => {
      if (!score) return { label: 'Unknown', color: 'text-gray-400', bgColor: 'bg-gray-600' }
      if (score >= 0.8) return { label: 'High Relevance', color: 'text-green-300', bgColor: 'bg-green-600' }
      if (score >= 0.6) return { label: 'Good Match', color: 'text-blue-300', bgColor: 'bg-blue-600' }
      if (score >= 0.4) return { label: 'Moderate', color: 'text-yellow-300', bgColor: 'bg-yellow-600' }
      return { label: 'Low Relevance', color: 'text-red-300', bgColor: 'bg-red-600' }
    }

    const relevance = getRelevanceLabel(result.score)
    
    if (typeof rec === 'object' && !Array.isArray(rec)) {
      // Fields to exclude
      const excludedFields = ['duty_type', 'duty_value', 'rates', 'object', 'imposing_country', 'affected_countries', 'effective_from', 'hs_level', 'unit_of_quantity', 'indent']
      
      // Fields to prioritize
      const priorityFields = ['HS_Code', 'hs_code', 'description', 'product', 'tariff_rate', 'duty_rate', 'commodity']
      
      const availableFields = Object.entries(rec).filter(([k, v]) => {
        const key = k.toLowerCase()
        
        if (excludedFields.some(field => key.includes(field.toLowerCase()))) {
          return false
        }
        
        if (v === null || v === undefined || v === '') {
          return false
        }
        
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return false
        }
        
        return true
      }).map(([k, v]) => {
        const key = k.toLowerCase()
        const priority = priorityFields.some(f => key.includes(f.toLowerCase())) ? 1 : 0
        return { key: k, value: v, priority }
      }).sort((a, b) => b.priority - a.priority)
      
      if (availableFields.length === 0) {
        return null
      }
      
      const fieldsToShow = availableFields.slice(0, 8)
      
      return (
        <div key={index} className="bg-[#181818] p-4 rounded-lg border border-[#2a2a2a] mb-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">#{index + 1}</span>
              {result.source_country && (
                <span className="bg-gray-600 text-white text-xs px-2 py-1 rounded">{result.source_country}</span>
              )}
            </div>
            <div className="text-xs text-gray-400">
              <span className={`${relevance.color} font-medium`}>{relevance.label}</span>
            </div>
          </div>

          {/* Main product info */}
          <div className="mb-3">
            {(rec.hs_code || rec.HS_Code) && (
              <div className="text-lg font-semibold text-green-400 mb-2">
                HS Code: {rec.hs_code || rec.HS_Code}
              </div>
            )}

            {(rec.product_name_en || rec.description || rec.product) && (
              <div className="text-gray-200 text-sm leading-relaxed mb-2">
                {rec.product_name_en || rec.description || rec.product}
              </div>
            )}
          </div>

          {/* Tariff Cost Information - Only show if tariff data exists */}
          {(rec.tariff_rate || rec.duty_rate || rec.special_rate || rec.duty_value || rec.unit_of_quantity) && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-300 mb-2 flex items-center">
                <span className="mr-2">💰</span>
                Tariff Cost Analysis
              </div>

              {/* Primary Tariff Rates */}
              <div className="grid grid-cols-1 gap-2 text-xs mb-3">
                {rec.tariff_rate && (
                  <div className="bg-gradient-to-r from-red-900/30 to-red-800/30 border border-red-700/50 text-red-200 px-3 py-2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Base Tariff Rate:</span>
                      <span className="font-bold text-lg">{rec.tariff_rate}</span>
                    </div>
                  </div>
                )}
                {rec.duty_rate && rec.duty_rate !== rec.tariff_rate && (
                  <div className="bg-gradient-to-r from-orange-900/30 to-orange-800/30 border border-orange-700/50 text-orange-200 px-3 py-2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Applied Duty Rate:</span>
                      <span className="font-bold text-lg">{rec.duty_rate}</span>
                    </div>
                  </div>
                )}
                {rec.special_rate && (
                  <div className="bg-gradient-to-r from-yellow-900/30 to-yellow-800/30 border border-yellow-700/50 text-yellow-200 px-3 py-2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Special/Preferential Rate:</span>
                      <span className="font-bold text-lg">{rec.special_rate}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Cost Details */}
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {rec.duty_value && (
                  <div className="bg-purple-900/20 text-purple-300 px-2 py-2 rounded border border-purple-700/30">
                    <div className="text-center">
                      <div className="font-medium">Duty Value</div>
                      <div className="font-semibold text-sm">{rec.duty_value}</div>
                    </div>
                  </div>
                )}
                {rec.unit_of_quantity && (
                  <div className="bg-blue-900/20 text-blue-300 px-2 py-2 rounded border border-blue-700/30">
                    <div className="text-center">
                      <div className="font-medium">Per Unit</div>
                      <div className="font-semibold text-sm">{rec.unit_of_quantity}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cost Impact Calculator */}
              {(rec.tariff_rate || rec.duty_rate) && (
                <div className="bg-gradient-to-r from-gray-800/60 to-gray-700/60 border border-gray-600/50 rounded-lg p-3">
                  <div className="flex items-center mb-2">
                    <span className="text-yellow-400 mr-2">📊</span>
                    <span className="text-xs font-semibold text-yellow-400">Cost Impact Analysis</span>
                  </div>

                  <div className="space-y-2 text-xs text-gray-300">
                    <div className="flex justify-between">
                      <span>Tariff Type:</span>
                      <span className="font-medium">
                        {(rec.tariff_rate || rec.duty_rate)?.includes('%') ? 'Percentage-based' : 'Fixed amount'}
                      </span>
                    </div>

                    <div className="border-t border-gray-600/50 pt-2 mt-2">
                      <div className="text-yellow-300 font-medium mb-1">💡 Pro Tip:</div>
                      <div className="text-gray-400 text-xs leading-relaxed">
                        {rec.unit_of_quantity
                          ? `Tariff applied per ${rec.unit_of_quantity.toLowerCase()}. Higher volumes may qualify for reduced rates.`
                          : 'Consult HS code classification for accurate duty assessment.'
                        }
                      </div>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-700/30 rounded px-2 py-1 mt-2">
                      <div className="text-blue-300 font-medium text-xs">Recommended Action:</div>
                      <div className="text-blue-200 text-xs">Get professional customs clearance quote</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }
    
    return (
      <div key={index} className="bg-[#181818] p-4 rounded-lg border border-[#2a2a2a] mb-4">
        <div className="text-sm text-gray-300">{String(rec)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center space-x-2 text-blue-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
          <span className="text-sm">Searching entire trade database...</span>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 p-5 rounded-lg border border-green-500/30">
            <h5 className="font-semibold text-green-300 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Global Search Results ({results.length} matches found) - AI Ranked by Relevance
            </h5>
            <div className="max-h-96 overflow-y-auto">
              {results.map((result, index) => renderGlobalResult(result, index))}
            </div>
          </div>
        </div>
      )}

      {!results && !loading && searchStats && searchStats.sources_searched === 0 && (
        <div className="bg-[#2a2a2a] p-5 rounded-lg border border-[#333] text-center mt-3">
          <p className="text-sm text-gray-300">No trade data sources found in the database.</p>
          <p className="text-xs text-gray-400 mt-2">The database may be empty or temporarily unavailable.</p>
        </div>
      )}

      {results && results.length === 0 && !loading && searchStats && searchStats.sources_searched > 0 && (
        <div className="bg-[#2a2a2a] p-5 rounded-lg border border-[#333] text-center mt-3">
          <p className="text-sm text-gray-300">No matches found across {searchStats.sources_searched} data sources.</p>
          <p className="text-xs text-gray-400 mt-2">Try using different search terms or check spelling.</p>
        </div>
      )}
    </div>
  )
}

export default ResultsPage
