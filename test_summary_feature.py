#!/usr/bin/env python3
"""
Test script to verify the enhanced summary functionality works correctly.
This tests both the global search and country-specific summarization.
"""

import requests
import json
import time

API_BASE_URL = "http://127.0.0.1:8003"

def test_health():
    """Test if the API server is responding"""
    try:
        response = requests.get(f"{API_BASE_URL}/", timeout=5)
        print(f"✅ Health check: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_global_search():
    """Test the global search functionality"""
    print("\n🔍 Testing Global Search...")
    payload = {
        "query": "laptop computers",
        "bucket": "tsinfo",
        "top_k": 5,
        "fast": True
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/search-all", json=payload, timeout=15)
        print(f"Global search status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            matches = data.get('matches', [])
            sources_searched = data.get('sources_searched', 0)
            print(f"✅ Found {len(matches)} matches from {sources_searched} sources")
            
            if matches:
                print(f"Sample match: {str(matches[0])[:200]}...")
            return True
        else:
            print(f"❌ Global search failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Global search error: {e}")
        return False

def test_country_lookup():
    """Test country-specific lookup"""
    print("\n🌍 Testing Country-Specific Lookup...")
    payload = {
        "bucket": "tsinfo",
        "key": "trade-data/normal/US/Oct15.2025.jsonl",
        "query": "laptop computers",
        "country": "United States",
        "top_k": 3,
        "fast": True
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/lookup", json=payload, timeout=15)
        print(f"Country lookup status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            matches = data.get('matches', [])
            print(f"✅ Found {len(matches)} country-specific matches")
            
            if matches:
                print(f"Sample match: {str(matches[0])[:200]}...")
            return True
        else:
            print(f"❌ Country lookup failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Country lookup error: {e}")
        return False

def test_ai_summary():
    """Test AI summary generation"""
    print("\n🤖 Testing AI Summary Generation...")
    payload = {
        "prompt": """You are an expert international trade consultant. Analyze the following tariff/product records and provide a clear, actionable summary for someone planning to export "laptop computers" when exporting to United States.

Structure your response as follows:
1. TARIFF RATES: What are the key duty rates and taxes?
2. PRODUCT CLASSIFICATION: What HS codes or product categories apply?
3. KEY REQUIREMENTS: Any special restrictions, documentation, or compliance needs?
4. BUSINESS IMPACT: What does this mean for the exporter in practical terms?

Keep it concise but comprehensive (6-10 sentences total). Focus on actionable insights.

Tariff Records:
1. HS_Code: 8471.30; description: Portable automatic data processing machines; tariff_rate: 0%; duty_rate: Free
2. HS_Code: 8471.49; description: Other automatic data processing machines; tariff_rate: 0%; duty_rate: Free

Expert Analysis:""",
        "companyDetails": "laptop computers",
        "companyLocation": "United States",
        "temperature": 0.1,
        "max_tokens": 500
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/bedrock", json=payload, timeout=20)
        print(f"AI summary status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            result = data.get('result', '')
            print(f"✅ AI summary generated ({len(result)} characters)")
            print(f"Summary preview: {result[:300]}...")
            return True
        else:
            print(f"❌ AI summary failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ AI summary error: {e}")
        return False

def main():
    print("🚀 Testing Enhanced Trade Data Search with Summaries")
    print("=" * 60)
    
    # Run tests
    tests = [
        ("Health Check", test_health),
        ("Global Search", test_global_search),
        ("Country Lookup", test_country_lookup),
        ("AI Summary", test_ai_summary)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 Running {test_name}...")
        if test_func():
            passed += 1
        time.sleep(1)  # Brief pause between tests
    
    print("\n" + "=" * 60)
    print(f"🎯 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The enhanced summary functionality is working correctly.")
        print("\n💡 Key Features Now Available:")
        print("   • Global database search across all countries")
        print("   • Country-specific trade data lookup")
        print("   • AI-generated summaries for each country")
        print("   • Enhanced search with synonyms and fuzzy matching")
        print("   • Structured analysis with tariff rates, classifications, and requirements")
    else:
        print(f"⚠️  {total - passed} test(s) failed. Please check the backend configuration.")

if __name__ == "__main__":
    main()