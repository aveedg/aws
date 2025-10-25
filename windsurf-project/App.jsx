import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

function App() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    companyDetails: '',
    companyLocation: '',
    exportLocations: []
  })

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

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (formData.exportLocations.length === 0) {
      alert('Please select at least one export location')
      return
    }
    console.log('Form submitted:', formData)
    navigate('/results', { state: { formData } })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f0f] via-[#181818] to-[#202020] py-12 px-4 sm:px-6 lg:px-8 text-gray-100">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#1f1f1f] rounded-2xl shadow-xl p-8 border border-[#2a2a2a]">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-100 mb-2">Project</h1>
            <h2 className="text-xl text-gray-300 mb-1">What our company does:</h2>
            <h3 className="text-lg text-gray-400">Use cases:</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="companyLocation" className="block text-sm font-medium text-gray-200 mb-2">
                Company Location
              </label>
              <select
                id="companyLocation"
                name="companyLocation"
                value={formData.companyLocation}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border border-[#303030] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200 outline-none bg-[#121212] text-gray-100 cursor-pointer"
              >
                <option value="">Select a country</option>
                {allCountries.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-200 mb-2">Please include the following details:</h4>
              <ul className="mb-3 ml-4 list-disc text-sm text-gray-300 space-y-1">
                {detailPrompts.map(prompt => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
              <label htmlFor="companyDetails" className="sr-only">Company Details</label>
              <textarea
                id="companyDetails"
                name="companyDetails"
                value={formData.companyDetails}
                onChange={handleInputChange}
                placeholder="Provide your company details here"
                required
                rows="6"
                className="w-full px-4 py-3 border border-[#303030] rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200 outline-none bg-[#121212] text-gray-100 placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Export Locations (Select one or more)
              </label>
              <div className="border border-[#303030] rounded-lg max-h-64 overflow-y-auto bg-[#121212]">
                {exportCountries.map(country => (
                  <div
                    key={country}
                    onClick={() => {
                      const isSelected = formData.exportLocations.includes(country)
                      if (isSelected) {
                        setFormData(prev => ({
                          ...prev,
                          exportLocations: prev.exportLocations.filter(c => c !== country)
                        }))
                      } else {
                        setFormData(prev => ({
                          ...prev,
                          exportLocations: [...prev.exportLocations, country]
                        }))
                      }
                    }}
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

            <button
              type="submit"
              className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#1f1f1f] transition duration-200 transform hover:scale-[1.02]"
            >
              Create
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
