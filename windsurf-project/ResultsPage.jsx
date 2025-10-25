import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
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
          <p className="text-sm text-gray-400 text-center mb-6">Click a country to toggle its highlight.</p>
          <WorldMap
            selectedCountries={highlightedCountries}
            availableCountries={formData.exportLocations}
            onCountryClick={handleToggleCountry}
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

export default ResultsPage
