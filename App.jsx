import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'

function App() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    companyDetails: '',
    companyLocation: '',
    exportLocations: []
  })
  const [claudePrompt, setClaudePrompt] = useState('')
  const [claudeAnswer, setClaudeAnswer] = useState('')
  const [claudeLoading, setClaudeLoading] = useState(false)
  const [claudeError, setClaudeError] = useState(null)
  const [claudeDebug, setClaudeDebug] = useState('')

  const allCountries = [
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
    'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
    'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
    'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
    'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
    'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon',
    'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
    'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
    'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait',
    'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
    'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
    'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru',
    'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
    'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
    'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
    'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
    'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
    'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey',
    'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu',
    'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
  ]

  const detailPrompts = [
    'Company name',
    'Company size',
    'What does your company sell',
    'How do you sell your products',
    'Where do you buy your products from'
  ]

  const exportCountries = [
    'Australia',
    'Belize',
    'European Union',
    'Ghana',
    'Hong Kong',
    'Malaysia',
    'Singapore',
    'South Africa',
    'Taiwan',
    'United States'
  ]

  const europeanUnionMembers = [
    'Austria',
    'Belgium',
    'Bulgaria',
    'Croatia',
    'Cyprus',
    'Czech Republic',
    'Denmark',
    'Estonia',
    'Finland',
    'France',
    'Germany',
    'Greece',
    'Hungary',
    'Ireland',
    'Italy',
    'Latvia',
    'Lithuania',
    'Luxembourg',
    'Malta',
    'Netherlands',
    'Poland',
    'Portugal',
    'Romania',
    'Slovakia',
    'Slovenia',
    'Spain',
    'Sweden'
  ]

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const toggleExportLocation = (country) => {
    setFormData(prev => {
      const next = new Set(prev.exportLocations)
      const euMembersSet = new Set(europeanUnionMembers)

      if (country === 'European Union') {
        const allMembersSelected = europeanUnionMembers.every(member => next.has(member))

        if (allMembersSelected && next.has('European Union')) {
          europeanUnionMembers.forEach(member => next.delete(member))
          next.delete('European Union')
        } else {
          europeanUnionMembers.forEach(member => next.add(member))
          next.add('European Union')
        }
      } else {
        if (next.has(country)) {
          next.delete(country)
        } else {
          next.add(country)
        }

        if (euMembersSet.has(country)) {
          const allMembersNowSelected = europeanUnionMembers.every(member => next.has(member))

          if (allMembersNowSelected) {
            next.add('European Union')
          } else {
            next.delete('European Union')
          }
        }
      }

      return {
        ...prev,
        exportLocations: Array.from(next)
      }
    })
  }

  const handleQuickSearch = () => {
    if (!formData.companyDetails.trim()) {
      alert('Please enter a product to search for')
      return
    }
    // Navigate with a flag to indicate global search mode
    navigate('/results', { 
      state: { 
        formData: { 
          ...formData, 
          initialQuery: formData.companyDetails,
          exportLocations: formData.exportLocations.length > 0 ? formData.exportLocations : ['Global Search']
        },
        globalSearchMode: true
      } 
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.exportLocations.length === 0) {
      alert('Please select at least one export location for country-specific search')
      return
    }
    // Navigate for country-specific search - explicitly set globalSearchMode to false
    navigate('/results', { 
      state: { 
        formData: { 
          ...formData, 
          initialQuery: formData.companyDetails 
        },
        globalSearchMode: false  // Explicitly set to false for country-specific search
      } 
    })
  }

  // Navigation is manual — user must click the Create button to go to results.

  const handleClaudeSubmit = async (e) => {
    console.log('submitted!')
    setClaudeDebug('submitted!')
    setTimeout(() => setClaudeDebug(''), 1500)
    e.preventDefault()
    
    if (!claudePrompt.trim()) {
      return
    }

    setClaudeLoading(true)
    setClaudeError(null)
    setClaudeAnswer('')

    try {
      // First, check the content through the AI validation endpoint
      const response = await fetch(`${API_BASE_URL}/api/check-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: claudePrompt,
          companyDetails: formData.companyDetails,
          companyLocation: formData.companyLocation,
          exportLocations: formData.exportLocations
        })
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail ?? 'AI validation failed')
      }

      // If validation passes, we get the response directly (endpoint handles both validation and Bedrock call)
      const data = await response.json()
      setClaudeAnswer(data.result)
    } catch (error) {
      console.error('Error:', error)
      setClaudeError(error.message)
    } finally {
      setClaudeLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f0f] via-[#181818] to-[#202020] py-12 px-4 sm:px-6 lg:px-8 text-gray-100">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 border border-[#2a2a2a] space-y-10">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-100 mb-2">Trade Data Search</h1>
            <h2 className="text-xl text-gray-300 mb-1">Search tariff and trade data across the entire database</h2>
            <h3 className="text-lg text-gray-400">Find product tariffs, duties, and trade regulations</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="mainInput" className="block text-sm font-medium text-gray-200 mb-2">
                Enter your product to search for tariffs and trade data
              </label>
              <input
                id="mainInput"
                name="mainInput"
                type="text"
                value={formData.companyDetails}
                onChange={e => setFormData(prev => ({ ...prev, companyDetails: e.target.value }))}
                required
                className="w-full px-4 py-3 border border-[#303030] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200 outline-none bg-[#121212] text-gray-100 placeholder:text-gray-500"
                placeholder="e.g., laptops, steel pipes, clothing, automobiles..."
              />
              <p className="text-xs text-gray-400 mt-1">
                The system will search across the entire trade database for relevant tariff information
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Export Locations (Select one or more)
              </label>
              <div className="border border-[#303030] rounded-lg max-h-64 overflow-y-auto bg-[#121212]">
                {exportCountries.map(country => (
                  <div
                    key={country}
                    onClick={() => toggleExportLocation(country)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[#2a2a2a] cursor-pointer border-b border-[#1f1f1f] last:border-b-0 transition duration-150"
                  >
                    <span className="text-gray-100">{country}</span>
                    {formData.exportLocations.includes(country) && (
                      <svg
                        className="w-5 h-5 text-green-400"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleQuickSearch}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#1f1f1f] transition duration-200 transform hover:scale-[1.02]"
              >
                Quick Global Search
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[#1f1f1f] text-gray-400">or</span>
                </div>
              </div>
              
              <button
                type="submit"
                className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#1f1f1f] transition duration-200 transform hover:scale-[1.02]"
              >
                Search by Country
              </button>
            </div>
          </form>

          {/* Removed: separate Ask Claude section. Single input drives Claude analysis on submit */}
        </div>
      </div>
    </div>
  )
}

export default App