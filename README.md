# Trade Data Search System - Enhanced Database Search

## Overview

This project has been significantly enhanced to provide comprehensive search capabilities across the entire trade database. The system now supports both global searches across all available data sources and targeted country-specific searches.

## Key Enhancements

### 1. Global Database Search
- **Automatic Discovery**: The system automatically discovers all trade data files in the S3 bucket
- **Comprehensive Coverage**: Searches across multiple countries and data sources simultaneously
- **Intelligent Ranking**: Results are ranked by relevance across the entire database

### 2. Enhanced Search Intelligence
- **Synonym Expansion**: Searches include related terms and synonyms (e.g., "laptop" also matches "computer", "notebook")
- **Fuzzy Matching**: Handles minor misspellings and variations in product names
- **Field Prioritization**: Important fields like product descriptions receive higher weighting
- **Phrase Matching**: Exact phrase matches receive bonus scoring

### 3. New API Endpoints

#### `/api/search-all` (New Global Search)
- Searches across all trade data files in the database
- Supports country filtering when specified
- Provides aggregated results with source information
- Returns search statistics (files searched, countries covered)

#### `/api/lookup` (Enhanced Existing)
- Improved with better scoring and fuzzy matching
- Enhanced synonym support
- Better handling of missing data files

### 4. Frontend Improvements

#### Two Search Modes:
1. **Quick Global Search**: Searches the entire database without country selection
2. **Country-Specific Search**: Focuses on selected countries with detailed breakdown

#### Enhanced User Experience:
- Real-time search across multiple data sources
- Source attribution for each result
- Search statistics and coverage information
- Responsive design with better result presentation

## Technical Architecture

### Backend (FastAPI)
- **File Discovery**: `discover_trade_data_files()` - Automatically finds all trade data files
- **Concurrent Search**: `search_across_all_files()` - Searches multiple files simultaneously with controlled concurrency
- **Enhanced Parsing**: Improved `parse_s3_content_and_match()` with synonym expansion and fuzzy matching
- **Result Aggregation**: Combines and ranks results from multiple sources

### Frontend (React)
- **GlobalSearchBox Component**: New component for comprehensive database search
- **Dual Mode Interface**: Supports both global and country-specific search flows
- **Enhanced Result Display**: Shows source information and search statistics
- **Improved UX**: Better loading states and error handling

## Search Features

### Intelligent Query Processing
- **Synonym Mapping**: Automatically expands search terms with related concepts
- **Field Weighting**: Prioritizes matches in description, product, and classification fields
- **Multi-format Support**: Handles JSON, JSONL, and CSV data formats
- **Fuzzy Matching**: Matches similar terms with character-based similarity

### Result Enhancement
- **Source Attribution**: Each result shows which data file it came from
- **Country Identification**: Automatically identifies the source country/region
- **Relevance Scoring**: Advanced scoring algorithm considering multiple factors
- **Deduplication**: Intelligent handling of similar results from different sources

## Usage Examples

### Global Search
```javascript
// Search across entire database
const response = await fetch('/api/search-all', {
  method: 'POST',
  body: JSON.stringify({
    query: "laptop computers",
    bucket: "tsinfo",
    top_k: 10,
    fast: true
  })
});
```

### Country-Filtered Search
```javascript
// Search with country focus
const response = await fetch('/api/search-all', {
  method: 'POST',
  body: JSON.stringify({
    query: "automotive parts",
    countries: ["United States", "European Union"],
    top_k: 15
  })
});
```

## Performance Optimizations

- **Concurrent Processing**: Multiple files searched simultaneously with semaphore control
- **Caching**: S3 objects cached to reduce repeated downloads
- **Fast Mode**: Option to skip AI semantic reranking for faster results
- **Controlled Concurrency**: Limits concurrent searches to prevent system overload

## Configuration

### Environment Variables
- `AWS_ACCESS_KEY_ID`: AWS access credentials
- `AWS_SECRET_ACCESS_KEY`: AWS secret credentials
- `AWS_REGION`: AWS region (default: us-east-1)
- `BEDROCK_MODEL_ID`: AI model for semantic search enhancement
- `S3_CACHE_TTL_SECONDS`: Cache duration for S3 objects (default: 300)

### Frontend Configuration
- `VITE_API_BASE_URL`: Backend API base URL (default: http://127.0.0.1:8002)

## Running the Application

### Backend
```bash
cd /home/codespace/aws-4
pip install fastapi uvicorn boto3 python-dotenv
uvicorn main:app --reload --host 0.0.0.0 --port 8002
```

### Frontend
```bash
cd /home/codespace/aws-4
npm run dev
```

The application will be available at `http://localhost:5174` with the backend API at `http://localhost:8002`.

## Search Flow

1. **User Input**: User enters product search term
2. **Query Expansion**: System expands query with synonyms and related terms
3. **File Discovery**: System discovers all relevant data files in S3
4. **Concurrent Search**: Searches multiple files simultaneously
5. **Result Aggregation**: Combines and ranks results from all sources
6. **Source Attribution**: Adds source file and country information
7. **Display**: Shows comprehensive results with search statistics

## Future Enhancements

- **Elasticsearch Integration**: For even faster full-text search
- **Machine Learning**: Enhanced synonym detection and query understanding
- **Real-time Updates**: Automatic discovery of new data files
- **Advanced Filtering**: More sophisticated filtering by date, product category, etc.
- **Export Functionality**: Export search results to CSV/Excel
- **Search History**: Save and retrieve previous searches