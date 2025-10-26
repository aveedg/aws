#!/usr/bin/env python3
"""
Test script for the enhanced trade data search system.
"""
import json
import requests
import sys

API_BASE_URL = "http://127.0.0.1:8002"

def test_global_search():
    """Test the new global search endpoint."""
    # Test 1: Basic global search
    print("🔍 Testing global search for 'laptop'...")
    payload = {
        "query": "laptop",
        "bucket": "tsinfo",
        "top_k": 5,
        "fast": True
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/search-all", json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Global search successful!")
            print(f"   - Found {len(data.get('matches', []))} matches")
            print(f"   - Searched {data.get('sources_searched', 0)} sources")
            print(f"   - Countries: {list(data.get('sources_by_country', {}).keys())}")
            
            # Show first result if available
            if data.get('matches'):
                first_match = data['matches'][0]
                print(f"   - Top result score: {first_match.get('score', 'N/A')}")
                if 'source_country' in first_match:
                    print(f"   - From: {first_match['source_country']}")
        else:
            print(f"❌ Global search failed with status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Global search error: {str(e)}")

    # Test 2: Country-filtered search
    print("\n🔍 Testing country-filtered search for 'steel' in US...")
    payload = {
        "query": "steel",
        "bucket": "tsinfo",
        "countries": ["United States"],
        "top_k": 3,
        "fast": True
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/search-all", json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Country-filtered search successful!")
            print(f"   - Found {len(data.get('matches', []))} matches")
            print(f"   - Searched {data.get('sources_searched', 0)} sources")
            print(f"   - Countries: {list(data.get('sources_by_country', {}).keys())}")
        else:
            print(f"❌ Country-filtered search failed with status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Country-filtered search error: {str(e)}")

def test_traditional_lookup():
    """Test the enhanced traditional lookup endpoint."""
    print("\n🔍 Testing traditional lookup for US data...")
    payload = {
        "bucket": "tsinfo",
        "key": "trade-data/normal/US/Oct15.2025.jsonl",
        "query": "computer",
        "top_k": 3,
        "fast": True
    }
    
    try:
        response = requests.post(f"{API_BASE_URL}/api/lookup", json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Traditional lookup successful!")
            print(f"   - Found {len(data.get('matches', []))} matches")
        else:
            print(f"❌ Traditional lookup failed with status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Traditional lookup error: {str(e)}")

def test_health_check():
    """Test basic server health."""
    print("🏥 Testing server health...")
    try:
        response = requests.get(f"{API_BASE_URL}/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Server is healthy: {data.get('message', 'OK')}")
        else:
            print(f"❌ Server health check failed with status {response.status_code}")
    except Exception as e:
        print(f"❌ Server health check error: {str(e)}")

def main():
    """Run all tests."""
    print("🚀 Testing Enhanced Trade Data Search System")
    print("=" * 50)
    
    test_health_check()
    test_global_search()
    test_traditional_lookup()
    
    print("\n" + "=" * 50)
    print("✨ Test completed!")
    
    print("\n📋 Summary of Enhancements:")
    print("  • Global database search across all trade data files")
    print("  • Intelligent query expansion with synonyms")
    print("  • Fuzzy matching for product names")
    print("  • Concurrent search across multiple sources")
    print("  • Enhanced result ranking and source attribution")
    print("  • Dual-mode frontend (Global + Country-specific)")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        sys.exit(1)