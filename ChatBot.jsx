import { useState } from 'react'

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8003'

function ChatBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { text: "Hi! I'm Terri, your trade data assistant. How can I help you today?", sender: 'terri' }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    const userMessage = inputValue.trim()
    setMessages(prev => [...prev, { text: userMessage, sender: 'user' }])
    setInputValue('')
    setIsTyping(true)

    try {
      // Analyze the user's question and provide intelligent responses
      const response = await getIntelligentResponse(userMessage)
      setMessages(prev => [...prev, { text: response, sender: 'terri' }])
    } catch (error) {
      console.error('ChatBot error:', error)
      setMessages(prev => [...prev, { 
        text: "I'm sorry, I'm having trouble connecting to the trade database right now. Please try again later.", 
        sender: 'terri' 
      }])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage()
    }
  }

  const getIntelligentResponse = async (userMessage) => {
    const message = userMessage.toLowerCase()

    // Check for HS code related questions
    if (message.includes('hs code') || message.includes('harmonized system') || message.includes('classification')) {
      const product = extractProductFromMessage(userMessage)
      if (product) {
        try {
          const hsCodes = await lookupHSCodes(product)
          if (hsCodes && hsCodes.length > 0) {
            let response = `Sure thing! Here are some HS codes I found for "${product}":\n\n`
            hsCodes.slice(0, 3).forEach((hs, index) => {
              response += `${index + 1}. **${hs.code}** - ${hs.description}\n`
            })
            response += `\nThese codes are what customs uses to classify goods internationally. The right one depends on the specific details of your product - things like materials, size, etc.`
            return response
          }
        } catch (error) {
          console.error('HS code lookup failed:', error)
        }
      }
      return "I can help you find HS codes for your products! Just tell me what you're exporting (like 'laptops', 'shoes', 'steel pipes', etc.) and I'll look up the relevant codes."
    }

    // Check for tariff/duty related questions
    if (message.includes('tariff') || message.includes('duty') || message.includes('tax') || message.includes('cost') || message.includes('export')) {
      const product = extractProductFromMessage(userMessage)
      const country = extractCountryFromMessage(userMessage)
      
      if (product) {
        try {
          let searchQuery = product
          if (country) {
            searchQuery += ` ${country}`
          }
          
          const response = await searchTariffData(searchQuery, country)
          return response
        } catch (error) {
          console.error('Tariff search failed:', error)
        }
      }
      
      return "I can help you research tariffs and duties for your exports! Tell me what product you're exporting and which country you're interested in, and I'll search our trade database for relevant information."
    }

    // Check for country-specific questions
    if (message.includes('country') || extractCountryFromMessage(userMessage)) {
      const country = extractCountryFromMessage(userMessage)
      if (country) {
        return `I'd be happy to help you with trade information for ${country}! What specific aspect are you interested in - tariffs, regulations, HS codes, or export procedures?`
      }
    }

    // General trade questions
    if (message.includes('trade') || message.includes('export') || message.includes('import')) {
      return "I'm your trade data assistant! I can help you with:\n\n• Finding HS codes for product classification\n• Researching tariff rates and duties\n• Understanding export requirements\n• Analyzing trade regulations\n\nWhat specific trade question can I help you with today?"
    }

    // Default helpful responses
    const defaultResponses = [
      "Hey there! I'm your trade data buddy. I can help dig up HS codes, check tariff rates, and answer questions about export regulations. What's on your mind?",
      "Happy to help with your international trade questions! Whether it's HS codes, duty rates, or export procedures, just let me know what you need.",
      "Trade stuff can be tricky, but I'm here to make it easier. Ask me about tariffs, product classifications, or anything else related to global commerce!",
      "Got questions about exporting? I'm your go-to for HS codes, tariff information, and trade regulations. Fire away!"
    ]
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)]
  }

  const lookupHSCodes = async (query) => {
    const response = await fetch(`${API_BASE_URL}/api/lookup-hs-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: 5 })
    })
    
    if (response.ok) {
      const data = await response.json()
      return data.hs_codes || []
    }
    throw new Error('HS code lookup failed')
  }

  const searchTariffData = async (query, country = null) => {
    const requestBody = {
      bucket: 'tsinfo',
      key: country ? `trade-data/normal/${getCountryCode(country)}/Oct15.2025.jsonl` : 'trade-data/normal/US/Oct15.2025.jsonl',
      query,
      top_k: 5,
      fast: true
    }
    
    if (country) {
      requestBody.country = country
    }

    const response = await fetch(`${API_BASE_URL}/api/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    if (response.ok) {
      const data = await response.json()
      const results = data.matches || []
      
      if (results && results.length > 0) {
        // Generate more conversational response
        let response = `Hey, I found some tariff info for "${query}"`
        if (country) response += ` going to ${country}`
        response += `. Here are a couple of relevant HS codes I pulled up:\n\n`
        
        results.slice(0, 2).forEach((result, index) => {
          const record = result.record
          if (record && typeof record === 'object') {
            const hsCode = record.HS_Code || record.hs_code || 'N/A'
            const description = record.description || record.product || 'N/A'
            const rate = record.tariff_rate || record.duty_rate || record.rate || 'Not specified'
            
            const ordinal = index === 0 ? 'First' : 'Second'
            response += `${ordinal} one is ${hsCode}`
            if (description !== 'N/A') {
              response += ` - ${description}`
            } else {
              response += ` - though I don't have the description handy right now`
            }
            if (rate !== 'Not specified') {
              response += ` (tariff rate: ${rate})`
            }
            response += `.\n`
          }
        })
        
        response += `\nKeep in mind this is just preliminary data from our database. For the most up-to-date and accurate tariff rates, you'll definitely want to check with official customs authorities or a licensed broker.`
        
        return response
      }
    }
    throw new Error('Tariff search failed')
  }

  const extractProductFromMessage = (message) => {
    // Simple product extraction - look for common product keywords
    const productKeywords = ['shoes', 'laptops', 'computers', 'steel', 'pipes', 'clothing', 'cars', 'automobiles', 'machinery', 'electronics', 'food', 'chemicals', 'pharmaceuticals', 'textiles', 'furniture', 'toys', 'books']
    
    const lowerMessage = message.toLowerCase()
    for (const product of productKeywords) {
      if (lowerMessage.includes(product)) {
        return product
      }
    }
    
    // Try to extract anything in quotes
    const quotedMatch = message.match(/"([^"]+)"/) || message.match(/'([^']+)'/)
    if (quotedMatch) {
      return quotedMatch[1]
    }
    
    return null
  }

  const extractCountryFromMessage = (message) => {
    const countries = ['china', 'united states', 'usa', 'canada', 'mexico', 'japan', 'germany', 'france', 'uk', 'united kingdom', 'italy', 'spain', 'brazil', 'india', 'south korea', 'australia', 'singapore', 'hong kong', 'taiwan', 'vietnam', 'thailand', 'malaysia', 'indonesia', 'philippines', 'european union', 'eu']
    
    const lowerMessage = message.toLowerCase()
    for (const country of countries) {
      if (lowerMessage.includes(country)) {
        return country === 'usa' ? 'united states' : country
      }
    }
    
    return null
  }

  const getCountryCode = (country) => {
    const countryMap = {
      'united states': 'US',
      'china': 'CN',
      'canada': 'CA',
      'mexico': 'MX',
      'japan': 'JP',
      'germany': 'DE',
      'france': 'FR',
      'uk': 'GB',
      'united kingdom': 'GB',
      'italy': 'IT',
      'spain': 'ES',
      'brazil': 'BR',
      'india': 'IN',
      'south korea': 'KR',
      'australia': 'AU',
      'singapore': 'SG',
      'hong kong': 'HK',
      'taiwan': 'TW',
      'vietnam': 'VN',
      'thailand': 'TH',
      'malaysia': 'MY',
      'indonesia': 'ID',
      'philippines': 'PH'
    }
    
    return countryMap[country.toLowerCase()] || 'US'
  }

  return (
    <>
      {/* Chat Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        {/* Text Bubble */}
        <div className="bg-white text-gray-800 px-3 py-2 rounded-lg shadow-lg mr-2 relative">
          <div className="text-sm font-medium">Chat with Terri</div>
          {/* Speech bubble pointer */}
          <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 rotate-45 w-3 h-3 bg-white"></div>
        </div>
        
        {/* Chat Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 overflow-hidden border-4 border-green-500"
        >
          <img 
            src="/image2.png" 
            alt="Terri" 
            className="w-16 h-16 object-cover object-center"
          />
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 w-80 h-96 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg shadow-xl z-40 flex flex-col">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg flex items-center">
            <div className="w-10 h-10 rounded-full mr-3 overflow-hidden">
              <img 
                src="/image2.png" 
                alt="Terri" 
                className="w-12 h-12 object-cover object-center"
              />
            </div>
            <div>
              <h3 className="font-semibold">Terri</h3>
              <p className="text-xs text-blue-100">Trade Data Assistant</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-sm px-2 py-1 rounded-lg text-xs leading-tight ${
                  message.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#2a2a2a] text-gray-100'
                }`}>
                  {message.text.split('\n').map((line, lineIndex) => (
                    <div key={lineIndex} className={lineIndex > 0 ? 'mt-1' : ''}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#2a2a2a] text-gray-100 px-3 py-2 rounded-lg text-sm">
                  <div className="flex items-center space-x-1">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="ml-2 text-gray-400">Terri is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-[#2a2a2a] p-3">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask Terri a question..."
                className="flex-1 px-3 py-2 bg-[#121212] border border-[#303030] rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ChatBot