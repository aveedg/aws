import json
import logging
import os
import csv
import io
import re
import heapq
from typing import List, Optional
from dotenv import load_dotenv

import boto3
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
        # Allow all origins during local development to support Codespaces / preview URLs.
        # In production, set a restrictive list or use environment configuration.
        allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

# Simple in-memory S3 object cache to avoid re-downloading the same file repeatedly during
# a single session. This significantly speeds up per-country lookups that all read the same key.
S3_CACHE: dict[tuple[str, str], dict] = {}
S3_CACHE_TTL_SECONDS = int(os.getenv("S3_CACHE_TTL_SECONDS", "300"))  # default 5 minutes

# BEDROCK & AWS CONFIGURATION VIA ENVIRONMENT VARIABLES
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID")

missing_env = [
    name
    for name, value in [
        ("AWS_ACCESS_KEY_ID", AWS_ACCESS_KEY_ID),
        ("AWS_SECRET_ACCESS_KEY", AWS_SECRET_ACCESS_KEY),
        ("BEDROCK_MODEL_ID", BEDROCK_MODEL_ID),
    ]
    if not value
]

if missing_env:
    # Don't raise in dev/stub mode; log a warning so server can still start locally.
    logger.warning(
        "Missing required environment variables for Bedrock configuration: %s. Running in stub/dev mode.",
        ", ".join(missing_env),
    )


# Set up AWS clients with specified credentials (only if present)
bedrock_client = None
s3_client = None
if not missing_env:
    bedrock_client = boto3.client(
        'bedrock-runtime',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )

class PromptRequest(BaseModel):
    prompt: str
    companyDetails: str | None = None
    companyLocation: str | None = None
    exportLocations: list[str] | None = None
    # Optional runtime model parameters (not required)
    temperature: float | None = None
    max_tokens: int | None = None

class S3Object(BaseModel):
    key: str
    size: int
    last_modified: str

class S3ListResponse(BaseModel):
    objects: List[S3Object]

class S3GetResponse(BaseModel):
    content: str
    metadata: dict

class LookupRequest(BaseModel):
    bucket: str
    key: str
    query: str
    country: str | None = None
    top_k: Optional[int] = 5
    # If `fast` is true, return token-based matches immediately and skip semantic rerank.
    fast: Optional[bool] = False

class GlobalSearchRequest(BaseModel):
    query: str
    bucket: str | None = "tsinfo"
    countries: list[str] | None = None  # If specified, limit search to these countries
    top_k: Optional[int] = 10
    fast: Optional[bool] = False
    include_all_sources: Optional[bool] = True  # Search across all available data sources

async def list_s3_objects(bucket_name: str, prefix: Optional[str] = None) -> S3ListResponse:
    """
    List objects in an S3 bucket with optional prefix filtering
    """
    if not s3_client:
        raise HTTPException(status_code=503, detail="S3 client not configured")

    try:
        if prefix:
            response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
        else:
            response = s3_client.list_objects_v2(Bucket=bucket_name)

        objects = []
        for item in response.get('Contents', []):
            objects.append(S3Object(
                key=item['Key'],
                size=item['Size'],
                last_modified=item['LastModified'].isoformat()
            ))
        
        return S3ListResponse(objects=objects)

    except ClientError as e:
        logger.exception("Error listing S3 objects")
        raise HTTPException(status_code=500, detail=str(e))

async def get_s3_object(bucket_name: str, object_key: str) -> S3GetResponse:
    """
    Get an object from S3 and return its content and metadata
    """
    if not s3_client:
        raise HTTPException(status_code=503, detail="S3 client not configured")

    try:
        # Attempt cache lookup first
        cache_key = (bucket_name, object_key)
        cache_entry = S3_CACHE.get(cache_key)
        if cache_entry:
            age = (__import__('time').time() - cache_entry.get('ts', 0))
            if age < S3_CACHE_TTL_SECONDS:
                return S3GetResponse(content=cache_entry['content'], metadata=cache_entry.get('metadata', {}))

        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        content = response['Body'].read().decode('utf-8')
        metadata = response.get('Metadata', {})

        # Update cache
        try:
            S3_CACHE[cache_key] = {"content": content, "metadata": metadata, "ts": __import__('time').time()}
        except Exception:
            # Cache failures shouldn't break the request
            logger.debug("S3 cache update failed", exc_info=True)
        
        return S3GetResponse(content=content, metadata=metadata)

    except ClientError as e:
        # If the country-specific key doesn't exist, try a fallback by replacing the country folder with US
        try:
            code = e.response.get('Error', {}).get('Code')
        except Exception:
            code = None
        if code == 'NoSuchKey':
            # Attempt fallback: try US data if country-specific data doesn't exist
            try:
                m = re.search(r"/(?:[A-Z]{2}|EU)/", object_key)
                if m and '/US/' not in object_key:
                    fallback_key = re.sub(r"/(?:[A-Z]{2}|EU)/", "/US/", object_key, count=1)
                    logger.info(f"Country-specific data not found for {object_key}, trying fallback: {fallback_key}")
                    response = s3_client.get_object(Bucket=bucket_name, Key=fallback_key)
                    content = response['Body'].read().decode('utf-8')
                    metadata = response.get('Metadata', {})
                    # Cache fallback too
                    try:
                        S3_CACHE[(bucket_name, fallback_key)] = {"content": content, "metadata": metadata, "ts": __import__('time').time()}
                    except Exception:
                        logger.debug("S3 cache update failed for fallback", exc_info=True)
                    return S3GetResponse(content=content, metadata=metadata)
            except ClientError as fallback_error:
                logger.warning(f"Fallback to US data also failed: {fallback_error}")
                pass
            # Still not found - but don't raise error, return empty data
            logger.warning(f"No data found for {object_key} and fallback failed")
            return S3GetResponse(content="[]", metadata={})
        logger.exception("Error getting S3 object")
        raise HTTPException(status_code=500, detail=str(e))


def parse_s3_content_and_match(content: str, query: str, top_k: int = 5):
    """
    Parse S3 object content (JSON, JSONL, or CSV) and return top_k records that best match the query.
    Enhanced with intelligent query expansion and synonym matching.
    Returns a list of {record, score} sorted by score desc.
    """
    # normalize query tokens and add synonyms
    original_tokens = [t.lower() for t in re.findall(r"\w{2,}", query)]
    if not original_tokens:
        return []
    
    # Add synonyms and related terms for better matching
    expanded_tokens = set(original_tokens)
    synonym_map = {
        # Common trade terms
        'laptop': ['computer', 'notebook', 'pc'],
        'computer': ['laptop', 'pc', 'desktop'],
        'phone': ['mobile', 'smartphone', 'cellular'],
        'car': ['automobile', 'vehicle', 'auto'],
        'clothes': ['clothing', 'apparel', 'garment', 'textile'],
        'food': ['edible', 'consumable', 'nutrition'],
        'electronics': ['electronic', 'tech', 'technology'],
        'machinery': ['machine', 'equipment', 'apparatus'],
        'steel': ['iron', 'metal'],
        'plastic': ['polymer', 'synthetic'],
        # Add more as needed
    }
    
    for token in original_tokens:
        if token in synonym_map:
            expanded_tokens.update(synonym_map[token])
    
    tokens = list(expanded_tokens)

    records = []

    # Try parsing JSON (array or object)
    try:
        parsed = json.loads(content)
        # If parsed is a dict with a top-level list, try to find the list
        if isinstance(parsed, dict):
            # heuristics: find first list value
            for v in parsed.values():
                if isinstance(v, list):
                    parsed = v
                    break
        if isinstance(parsed, list):
            records = parsed
    except Exception:
        # If JSON parsing failed, try JSONL (one JSON per line)
        if not records:
            lines = content.splitlines()
            for line in lines:
                if not line.strip():
                    continue
                try:
                    records.append(json.loads(line))
                except Exception:
                    continue

    # If still empty, try CSV parsing
    if not records:
        try:
            reader = csv.DictReader(io.StringIO(content))
            records = [row for row in reader]
        except Exception:
            records = []

    # Enhanced scoring with better keyword matching and fuzzy matching
    # Prioritize matches in description-like fields
    scored = []
    
    # Important fields to search with higher weight
    important_fields = ['description', 'hs_description', 'product', 'goods', 'item', 'name', 'text', 'commodity']
    
    for rec in records:
        if not isinstance(rec, dict):
            continue
            
        # Build searchable string from all values
        searchable_str = " ".join([str(v) for v in rec.values() if v is not None and v != '']).lower()
        
        # Also build field-specific searchable strings for better matching
        field_matches = {}
        for key, value in rec.items():
            if value is None or value == '':
                continue
            key_lower = key.lower()
            value_str = str(value).lower()
            
            # Check if this is an important field
            is_important = any(imp in key_lower for imp in important_fields)
            
            field_score = 0
            for t in tokens:
                # Check exact match
                if t in value_str:
                    field_score += 3 if is_important else 1
                # Check partial word match (e.g., "lap" matches "laptop")
                elif any(t in word or word in t for word in value_str.split() if len(t) >= 3):
                    field_score += 1 if is_important else 0.5
                # Fuzzy matching for similar terms
                elif len(t) >= 4:
                    for word in value_str.split():
                        if len(word) >= 4:
                            # Simple fuzzy matching - check if terms are similar
                            if abs(len(t) - len(word)) <= 2:
                                common_chars = set(t) & set(word)
                                if len(common_chars) >= min(len(t), len(word)) * 0.6:
                                    field_score += 0.5 if is_important else 0.25
            
            if is_important:
                field_matches[key] = field_score
        
        # Calculate total score with field weighting
        total_score = sum(field_matches.values())
        
        # Also do general text search with original query
        general_score = 0
        for t in original_tokens:
            if t in searchable_str:
                general_score += 1.5  # Bonus for original query terms
        
        # Add bonus for exact phrase matching
        if query.lower() in searchable_str:
            general_score += 3
        
        final_score = total_score + (general_score * 0.7)
        
        if final_score > 0:
            scored.append({"record": rec, "score": final_score})
    
    # Sort by score and return top_k
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]

async def discover_trade_data_files(bucket_name: str, prefix: str = "trade-data/") -> List[str]:
    """
    Discover all trade data files in the S3 bucket under the specified prefix.
    Returns a list of S3 keys for files that contain trade data.
    """
    if not s3_client:
        raise HTTPException(status_code=503, detail="S3 client not configured")

    try:
        all_keys = []
        paginator = s3_client.get_paginator('list_objects_v2')
        
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            for item in page.get('Contents', []):
                key = item['Key']
                # Filter for data files (jsonl, json, csv)
                if key.endswith(('.jsonl', '.json', '.csv')) and not key.endswith('/'):
                    all_keys.append(key)
        
        logger.info(f"Discovered {len(all_keys)} trade data files in bucket {bucket_name}")
        return all_keys

    except ClientError as e:
        logger.exception("Error discovering trade data files")
        raise HTTPException(status_code=500, detail=f"Failed to discover trade data files: {str(e)}")

async def search_across_all_files(bucket_name: str, query: str, file_keys: List[str], 
                                top_k_per_file: int = 5, overall_top_k: int = 10,
                                target_countries: Optional[List[str]] = None) -> List[dict]:
    """
    Search across multiple S3 files and aggregate results.
    Returns combined results ranked by relevance.
    """
    all_results = []
    search_tasks = []
    
    # Limit concurrent searches to avoid overwhelming the system
    max_concurrent = 10
    semaphore = __import__('asyncio').Semaphore(max_concurrent)
    
    async def search_single_file(key: str):
        async with semaphore:
            try:
                # Get file content
                s3_resp = await get_s3_object(bucket_name, key)
                content = s3_resp.content
                
                # Parse and match content
                matches = parse_s3_content_and_match(content, query, top_k=top_k_per_file)
                
                # Add source information to each match
                for match in matches:
                    match['source_key'] = key
                    match['source_bucket'] = bucket_name
                    # Extract country/region from path if possible
                    path_parts = key.split('/')
                    if len(path_parts) >= 3 and path_parts[0] == 'trade-data':
                        country_code = path_parts[2]
                        match['source_country'] = country_code
                
                return matches
                
            except Exception as e:
                logger.warning(f"Failed to search in file {key}: {str(e)}")
                return []
    
    # Filter files by country if specified
    if target_countries:
        country_codes = set()
        country_map = {
            'Australia': 'AU', 'Belize': 'BZ', 'Ghana': 'GH', 'Hong Kong': 'HK',
            'Malaysia': 'MY', 'Singapore': 'SG', 'South Africa': 'ZA', 'Taiwan': 'TW',
            'United States': 'US', 'European Union': 'EU'
        }
        for country in target_countries:
            if country in country_map:
                country_codes.add(country_map[country])
            else:
                # Try to map country name to code
                country_codes.add(country[:2].upper())
        
        filtered_keys = []
        for key in file_keys:
            path_parts = key.split('/')
            if len(path_parts) >= 3 and path_parts[2] in country_codes:
                filtered_keys.append(key)
        file_keys = filtered_keys
    
    # Create search tasks
    for key in file_keys:
        search_tasks.append(search_single_file(key))
    
    # Execute searches concurrently
    import asyncio
    results_list = await asyncio.gather(*search_tasks, return_exceptions=True)
    
    # Aggregate results
    for results in results_list:
        if isinstance(results, list):
            all_results.extend(results)
    
    # Sort by score and return top results
    all_results.sort(key=lambda x: x.get('score', 0), reverse=True)
    return all_results[:overall_top_k]

async def upload_to_s3(bucket_name: str, object_key: str, content: str, metadata: Optional[dict] = None) -> dict:
    """
    Upload content to S3 with optional metadata
    """
    if not s3_client:
        raise HTTPException(status_code=503, detail="S3 client not configured")

    try:
        extra_args = {'Metadata': metadata} if metadata else {}
        s3_client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=content.encode('utf-8'),
            **extra_args
        )
        return {"message": f"Successfully uploaded {object_key}", "metadata": metadata}
    except ClientError as e:
        logger.exception("Error uploading to S3")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/check-ai")
async def check_ai_content(request: PromptRequest):
    # First, validate the content through an AI check
    is_valid = True  # You can add your validation logic here
    validation_message = "Content looks good"
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=validation_message)
    
    # If validation passes, proceed with Bedrock call
    return await call_bedrock_with_validation(request)

@app.options("/api/check-ai")
async def options_check_ai():
    return {}  # Return empty response for OPTIONS requests


@app.post("/api/bedrock")
async def call_bedrock_with_validation(request: PromptRequest):
    # Build a richer prompt that includes context from the form
    def build_prompt(req: PromptRequest) -> str:
        parts = []
        if req.companyDetails:
            parts.append(f"Company details: {req.companyDetails}")
        if req.companyLocation:
            parts.append(f"Company location: {req.companyLocation}")
        if req.exportLocations:
            parts.append(f"Export locations: {', '.join(req.exportLocations)}")

        # A short system/instructional prefix to guide the model's behavior
        system_instructions = (
    "You are an expert export compliance assistant with advanced data processing capabilities. "
    "When a user asks about exports, you will parse the relevant JSON data containing export information "
    "for various countries and summarize the key details based on the user's query. "
    "Be concise, clear, and provide structured, actionable summaries. "
    "If needed, ask clarifying questions to ensure accuracy in extracting the relevant data. "
    "Your responses should focus on export products, values, and other important details for the specified countries."
)


        user_prompt = req.prompt.strip()
        # Combine system, context, and user prompt into a single message string
        combined = "\n\n".join([system_instructions, "Context:", "\n".join(parts), "User request:", user_prompt])
        return combined

    prompt_text = build_prompt(request)

    # Allow callers to override temperature / max_tokens via the request (or fall back to defaults)
    temperature = request.temperature if request.temperature is not None else 0.2
    max_tokens = request.max_tokens if request.max_tokens is not None else 1000

    # Check if model is Titan (Amazon) or Claude (Anthropic)
    is_titan = "titan" in BEDROCK_MODEL_ID.lower()
    
    if is_titan:
        # Titan Text model uses simple prompt format
        body = {
            "inputText": prompt_text,
            "textGenerationConfig": {
                "maxTokenCount": max_tokens,
                "temperature": temperature,
            }
        }
    else:
        # Claude uses Messages API format
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt_text}],
                },
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

    try:
        response = bedrock_client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
    except Exception as exc:
        logger.exception("Bedrock invoke_model failed")
        raise HTTPException(status_code=502, detail=f"Bedrock invocation failed: {exc}")

    response_payload = json.loads(response["body"].read())
    
    try:
        if is_titan:
            # Titan response format
            result_text = response_payload["results"][0]["outputText"]
        else:
            # Claude response format
            result_text = response_payload["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.exception("Unexpected Bedrock response structure: %s", response_payload)
        raise HTTPException(status_code=502, detail="Unexpected Bedrock response structure") from exc

    return {"result": result_text}

@app.get("/api/s3/list/{bucket}")
async def list_bucket(bucket: str, prefix: Optional[str] = None):
    """
    List objects in the specified S3 bucket
    """
    return await list_s3_objects(bucket, prefix)

@app.get("/api/s3/{bucket}/{key:path}")
async def get_object(bucket: str, key: str):
    """
    Get an object from the specified S3 bucket
    """
    return await get_s3_object(bucket, key)

@app.post("/api/s3/{bucket}/{key:path}")
async def upload_object(bucket: str, key: str, content: str, metadata: Optional[dict] = None):
    """
    Upload an object to the specified S3 bucket
    """
    return await upload_to_s3(bucket, key, content, metadata)


@app.post("/api/search-all")
async def search_all_trade_data(request: GlobalSearchRequest):
    """
    Search across all trade data files in the S3 bucket for the given query.
    This provides comprehensive search across the entire database instead of 
    being limited to specific country files.
    """
    bucket = request.bucket or "tsinfo"
    
    try:
        # Discover all trade data files
        logger.info(f"Starting global search for query: '{request.query}' in bucket: {bucket}")
        all_files = await discover_trade_data_files(bucket)
        
        if not all_files:
            logger.warning(f"No trade data files found in bucket {bucket}")
            return {"matches": [], "sources_searched": 0, "query": request.query}
        
        logger.info(f"Discovered {len(all_files)} files to search")
        
        # Search across all files
        results = await search_across_all_files(
            bucket_name=bucket,
            query=request.query,
            file_keys=all_files,
            top_k_per_file=3,  # Get fewer results per file to search more files
            overall_top_k=request.top_k or 10,
            target_countries=request.countries
        )
        
        # If not in fast mode and we have Bedrock configured, do semantic reranking
        if not request.fast and bedrock_client and BEDROCK_MODEL_ID and results:
            try:
                # Convert to the format expected by semantic rerank
                candidates = [{"record": r["record"], "score": r["score"]} for r in results]
                reranked = await semantic_rerank_with_bedrock(
                    candidates, 
                    request.query, 
                    top_k=request.top_k or 10
                )
                
                # Add source information back to reranked results
                for i, reranked_item in enumerate(reranked):
                    if i < len(results):
                        reranked_item['source_key'] = results[i].get('source_key')
                        reranked_item['source_bucket'] = results[i].get('source_bucket')
                        reranked_item['source_country'] = results[i].get('source_country')
                
                results = reranked
            except Exception as e:
                logger.exception("Semantic reranking failed for global search")
                # Continue with original results
        
        # Add summary of sources searched
        sources_by_country = {}
        for file_key in all_files:
            path_parts = file_key.split('/')
            if len(path_parts) >= 3:
                country = path_parts[2]
                sources_by_country[country] = sources_by_country.get(country, 0) + 1
        
        return {
            "matches": results,
            "sources_searched": len(all_files),
            "sources_by_country": sources_by_country,
            "query": request.query,
            "search_type": "global",
            "bucket": bucket
        }
        
    except Exception as e:
        logger.exception("Global search failed")
        raise HTTPException(status_code=500, detail=f"Global search failed: {str(e)}")

@app.post("/api/lookup")
async def lookup_from_s3(request: LookupRequest):
    """
    Lookup product/tariff info by reading an S3 file and matching the user's query.
    The S3 file may be JSON array, JSONL (one JSON per line), or CSV.
    """
    # Fetch content from S3
    s3_resp = await get_s3_object(request.bucket, request.key)
    content = s3_resp.content

    # First do a fast token-based filter (wider candidate set)
    candidate_k = max(50, (request.top_k or 5) * 10)
    candidates = parse_s3_content_and_match(content, request.query, top_k=candidate_k)

    # If a specific country was requested, filter candidates to that country
    def record_matches_country(rec, country: str) -> bool:
        if not country:
            return True
        if rec is None:
            return False
        c_lower = country.lower()
        # Common country fields to check first
        country_keys = [
            'country', 'destination_country', 'importing_country', 'exporting_country',
            'dest_country', 'origin_country', 'country_name', 'iso2', 'iso3'
        ]
        if isinstance(rec, dict):
            # Direct key checks for structured data
            for key in country_keys:
                if key in rec and rec[key]:
                    try:
                        if c_lower in str(rec[key]).lower():
                            return True
                    except Exception:
                        pass
            # Fallback: search all values
            for v in rec.values():
                try:
                    if v and c_lower in str(v).lower():
                        return True
                except Exception:
                    continue
        else:
            try:
                if c_lower in str(rec).lower():
                    return True
            except Exception:
                return False
        return False

    if getattr(request, 'country', None):
        candidates = [c for c in candidates if record_matches_country(c.get('record'), request.country)]

    # If caller asked for a fast response, return token matches immediately and skip reranking.
    if getattr(request, 'fast', False):
        return {"matches": candidates[: (request.top_k or 5)]}

    # If Bedrock is configured, use semantic reranking to get better relevance
    if bedrock_client and BEDROCK_MODEL_ID:
        try:
            reranked = await semantic_rerank_with_bedrock(candidates, request.query, top_k=request.top_k or 5)
            return {"matches": reranked}
        except Exception:
            # On any failure, fall back to token matches limited to top_k
            logger.exception("Semantic rerank failed, falling back to token matches")
            return {"matches": candidates[: (request.top_k or 5)]}

    # Bedrock not available — return token matches
    return {"matches": candidates[: (request.top_k or 5)]}


async def semantic_rerank_with_bedrock(candidates: list, query: str, top_k: int = 5) -> list:
    """
    Use the Bedrock model to semantically rerank candidate records.
    Expects `candidates` to be a list of dicts like {record: {...}, score: n}.
    Returns a list of {record, score} where score is a semantic relevance score (float 0-1).
    """
    if not bedrock_client:
        raise HTTPException(status_code=503, detail="Bedrock client not configured")

    # Build a compact text representation of candidates
    lines = []
    for i, c in enumerate(candidates[: 100]):
        rec = c.get("record")
        if isinstance(rec, dict):
            entries = [f"{k}: {v}" for k, v in list(rec.items())[:8]]
            lines.append(f"{i+1}. {', '.join(entries)}")
        else:
            lines.append(f"{i+1}. {str(rec)}")

    system_instructions = (
        "You are an assistant that ranks items by relevance to a user's query.\n"
        "Given the user query and a numbered list of candidate records, return a JSON array of objects with keys: index (int), score (0-1 float), and explanation (short text).\n"
        "Only return valid JSON — do not include any additional text.\n"
    )

    user_prompt = f"User query: {query}\n\nCandidates:\n" + "\n".join(lines) + "\n\nReturn the JSON array as described."
    
    # Check if model is Titan or Claude
    is_titan = "titan" in BEDROCK_MODEL_ID.lower()
    
    if is_titan:
        # Titan uses simple prompt format
        full_prompt = system_instructions + "\n" + user_prompt
        body = {
            "inputText": full_prompt,
            "textGenerationConfig": {
                "maxTokenCount": 800,
                "temperature": 0.0,
            }
        }
    else:
        # Claude uses Messages API
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": system_instructions + "\n" + user_prompt}],
                },
            ],
            "max_tokens": 800,
            "temperature": 0.0,
        }

    try:
        response = bedrock_client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
    except Exception as exc:
        logger.exception("Bedrock invoke_model failed for rerank")
        raise HTTPException(status_code=502, detail=f"Bedrock invocation failed: {exc}")

    response_payload = json.loads(response["body"].read())
    try:
        if is_titan:
            # Titan response format
            text = response_payload["results"][0]["outputText"]
        else:
            # Claude response format
            text = response_payload["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.exception("Unexpected Bedrock response structure for rerank: %s", response_payload)
        raise HTTPException(status_code=502, detail="Unexpected Bedrock response structure during rerank") from exc

    # Parse JSON from model output (may be noisy, try to extract JSON substring)
    try:
        parsed = json.loads(text.strip())
    except Exception:
        m = re.search(r"(\[.*\])", text, re.S)
        if m:
            try:
                parsed = json.loads(m.group(1))
            except Exception:
                logger.exception("Failed to parse JSON block from model output")
                raise HTTPException(status_code=502, detail="Failed to parse model JSON output for rerank")
        else:
            logger.exception("No JSON array found in model output")
            raise HTTPException(status_code=502, detail="No JSON array found in model output")

    # parsed should be list of {index, score, explanation}
    results = []
    for item in parsed[:top_k]:
        idx = int(item.get("index", 0)) - 1
        score = float(item.get("score", 0))
        explanation = item.get("explanation", "")
        if 0 <= idx < len(candidates):
            rec = candidates[idx]["record"]
            results.append({"record": rec, "score": score, "explanation": explanation})

    return results

@app.get("/")
def root():
    return {"message": "Hello from FastAPI and AWS Bedrock!"}

# Test functions for direct script execution
async def test_ai_check():
    test_request = PromptRequest(prompt="Hello what is your name")
    result = await check_ai_content(test_request)
    print("AI Test result:", result)

async def test_s3_operations():
    """Test S3 operations with a sample workflow"""
    try:
        # Replace with your test bucket name
        test_bucket = "tsinfo"
        
        print("\n1. Testing list objects...")
        list_result = await list_s3_objects(test_bucket)
        print(f"Found {len(list_result.objects)} objects in bucket")
        for obj in list_result.objects[:5]:  # Show first 5 objects
            print(f"- {obj.key} ({obj.size} bytes)")

        print("\n2. Testing upload...")
        test_content = "This is a test file content"
        test_metadata = {"purpose": "testing", "created_by": "test_function"}
        test_key = "test/sample.txt"
        
        upload_result = await upload_to_s3(
            test_bucket,
            test_key,
            test_content,
            test_metadata
        )
        print(f"Upload result: {upload_result}")

        print("\n3. Testing get object...")
        get_result = await get_s3_object(test_bucket, test_key)
        get_result = await get_s3_object(test_bucket, "trade-data/normal/US/Oct15.2025.jsonl")
        print(f"Retrieved content: {get_result.content}")
        print(f"Retrieved metadata: {get_result.metadata}")

        print("\n4. Testing list with prefix...")
        prefix_result = await list_s3_objects(test_bucket, prefix="test/")
        print(f"Found {len(prefix_result.objects)} objects with prefix 'test/'")
        for obj in prefix_result.objects:
            print(f"- {obj.key}")

    except HTTPException as e:
        print(f"Test failed with HTTP error: {e.status_code} - {e.detail}")
    except Exception as e:
        print(f"Test failed with error: {str(e)}")

class HSCodeLookupRequest(BaseModel):
    query: str
    max_results: int = 10

@app.post("/api/lookup-hs-codes")
async def lookup_hs_codes(request: HSCodeLookupRequest):
    """
    Lookup HS codes from the Census.gov Schedule B database based on product description.
    This helps identify relevant HS codes before searching tariff data.
    """
    try:
        # Create a more focused search query
        search_terms = request.query.lower().strip()
        
        # First try to get HS codes from a comprehensive list
        hs_codes = await fetch_hs_codes_from_census(search_terms, request.max_results)
        
        if not hs_codes:
            # Fallback: generate likely HS codes based on product keywords
            hs_codes = generate_common_hs_codes(search_terms)
        
        # Print the HS codes that are returned
        print(f"HS codes returned for query '{request.query}': {[code['code'] for code in hs_codes]}")
        
        return {
            "query": request.query,
            "hs_codes": hs_codes,
            "total_found": len(hs_codes),
            "source": "census_schedule_b" if hs_codes else "common_codes"
        }
        
    except Exception as e:
        logger.exception(f"Error looking up HS codes for {request.query}")
        # Return common fallback codes
        fallback_codes = generate_common_hs_codes(request.query.lower())
        print(f"Fallback HS codes returned for query '{request.query}' due to error: {[code['code'] for code in fallback_codes]}")
        return {
            "query": request.query,
            "hs_codes": fallback_codes,
            "total_found": len(fallback_codes),
            "source": "fallback",
            "error": str(e)
        }

async def fetch_hs_codes_from_census(search_terms: str, max_results: int = 10) -> list:
    """
    Fetch HS codes from Census.gov or a similar authoritative source via web API
    """
    try:
        # Try to fetch from a real HS code API/website
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Option 1: Try Census.gov Schedule B API (if available)
            # Option 2: Try Open Trade Statistics API
            # Option 3: Try a public HS code search service
            
            # For now, let's try a public trade data API
            # This is a placeholder - in production you'd use a real API
            
            # Try fetching from a public HS code service
            # Using U.S. Trade.gov API (real endpoint)
            search_url = f"https://api.trade.gov/v1/hs_codes/search"
            params = {
                'q': search_terms,
                'size': max_results
            }
            
            try:
                response = await client.get(search_url, params=params, headers={
                    'User-Agent': 'Trade-Analysis-App/1.0',
                    'Accept': 'application/json'
                })
                if response.status_code == 200:
                    data = response.json()
                    # Parse the API response into our format
                    hs_codes = []
                    for item in data.get('results', [])[:max_results]:
                        hs_codes.append({
                            'code': item.get('htsno', ''),
                            'description': item.get('description', '')
                        })
                    if hs_codes:
                        print(f"Successfully fetched {len(hs_codes)} HS codes from Trade.gov API for '{search_terms}'")
                        return hs_codes
            except Exception as api_error:
                logger.warning(f"Trade.gov API fetch failed: {api_error}")
            
            # Option 2: Try Census.gov Schedule B API
            try:
                census_url = "https://www.census.gov/foreign-trade/schedules/b/"
                # Try to get the latest Schedule B data
                response = await client.get(f"{census_url}2023/sb2023.txt", headers={
                    'User-Agent': 'Trade-Analysis-App/1.0'
                })
                
                if response.status_code == 200:
                    # Parse the text file for HS codes matching search terms
                    text_content = response.text
                    lines = text_content.split('\n')
                    hs_codes = []
                    
                    for line in lines[:1000]:  # Limit processing for performance
                        if search_terms.lower() in line.lower():
                            # Parse Schedule B format (simplified)
                            parts = line.split('\t')
                            if len(parts) >= 2:
                                code = parts[0].strip()
                                description = parts[1].strip()
                                if code and len(code) >= 4:
                                    hs_codes.append({
                                        'code': f"{code[:4]}.{code[4:6]}" if len(code) >= 6 else code[:4],
                                        'description': description
                                    })
                                    if len(hs_codes) >= max_results:
                                        break
                    
                    if hs_codes:
                        print(f"Successfully parsed {len(hs_codes)} HS codes from Census.gov Schedule B for '{search_terms}'")
                        return hs_codes
            except Exception as census_error:
                logger.warning(f"Census.gov Schedule B fetch failed: {census_error}")
            
            # Option 3: Try UN Comtrade API for HS code information
            try:
                # Use UN Comtrade to get HS code classifications
                un_url = "https://comtradeapi.un.org/public/v1/get"
                params = {
                    'type': 'C',  # Commodities
                    'freq': 'A',  # Annual
                    'px': 'HS',   # HS classification
                    'ps': '2023', # Period
                    'r': 'all',   # All reporters
                    'p': '0',     # All partners
                    'rg': 'all',  # All trade flows
                    'cc': 'TOTAL' # All commodities
                }
                
                response = await client.get(un_url, params=params, headers={
                    'User-Agent': 'Trade-Analysis-App/1.0'
                })
                
                if response.status_code == 200:
                    data = response.json()
                    hs_codes = []
                    # Extract unique HS codes from the response
                    seen_codes = set()
                    for item in data.get('dataset', [])[:200]:  # Process more items
                        code = str(item.get('cmdCode', ''))
                        desc = item.get('cmdDescE', '')
                        
                        if code and desc and search_terms.lower() in desc.lower():
                            # Format HS code properly
                            if len(code) >= 6:
                                formatted_code = f"{code[:4]}.{code[4:6]}"
                            else:
                                formatted_code = code[:4]
                            
                            if formatted_code not in seen_codes:
                                seen_codes.add(formatted_code)
                                hs_codes.append({
                                    'code': formatted_code,
                                    'description': desc
                                })
                                if len(hs_codes) >= max_results:
                                    break
                    
                    if hs_codes:
                        print(f"Successfully fetched {len(hs_codes)} HS codes from UN Comtrade for '{search_terms}'")
                        return hs_codes
            except Exception as un_error:
                logger.warning(f"UN Comtrade API failed: {un_error}")
        
        # If all web fetching attempts fail, fall back to local mapping
        print(f"Web fetching failed for '{search_terms}', falling back to local mapping")
        
        # Fallback: Use the local comprehensive mapping
        hs_code_mapping = {
            # Electronics & Technology
            "laptop": [{"code": "8471.30", "description": "Portable automatic data processing machines, weighing not more than 10 kg"}, 
                      {"code": "8471.41", "description": "Data processing machines, digital, portable"}],
            "computer": [{"code": "8471.30", "description": "Portable computers"}, 
                        {"code": "8471.49", "description": "Other data processing machines"}],
            "smartphone": [{"code": "8517.12", "description": "Telephones for cellular networks or for other wireless networks"}],
            "phone": [{"code": "8517.12", "description": "Cellular phones"}, 
                     {"code": "8517.11", "description": "Line telephone sets"}],
            "tablet": [{"code": "8471.30", "description": "Tablet computers"}],
            "monitor": [{"code": "8528.59", "description": "Other monitors"}],
            "printer": [{"code": "8443.32", "description": "Printers used with data processing machines"}],
            "camera": [{"code": "8525.80", "description": "Digital cameras"}],
            "headphones": [{"code": "8518.30", "description": "Headphones and earphones"}],
            "speaker": [{"code": "8518.21", "description": "Loudspeakers, single"}],
            "television": [{"code": "8528.72", "description": "Color television receivers"}],
            "microphone": [{"code": "8518.10", "description": "Microphones and stands therefor"}],
            
            # Automotive
            "car": [{"code": "8703.23", "description": "Motor cars with spark-ignition engine, 1500-3000 cc"}],
            "automobile": [{"code": "8703.23", "description": "Motor cars and other motor vehicles"}],
            "motorcycle": [{"code": "8711.20", "description": "Motorcycles with reciprocating piston engine, 50-250 cc"}],
            "bicycle": [{"code": "8712.00", "description": "Bicycles and other cycles"}],
            "tire": [{"code": "4011.10", "description": "New pneumatic tires, of rubber, for passenger cars"}],
            "battery": [{"code": "8507.10", "description": "Lead-acid storage batteries"}],
            "engine": [{"code": "8407.34", "description": "Reciprocating piston engines, for vehicles"}],
            
            # Textiles & Clothing
            "shirt": [{"code": "6205.20", "description": "Men's or boys' shirts of cotton"}],
            "dress": [{"code": "6204.42", "description": "Women's or girls' dresses of cotton"}],
            "jeans": [{"code": "6203.42", "description": "Men's or boys' trousers of cotton"}],
            "shoes": [{"code": "6403.91", "description": "Footwear with outer soles of rubber or plastics"}],
            "boots": [{"code": "6403.19", "description": "Sports footwear"}],
            "jacket": [{"code": "6201.93", "description": "Men's or boys' anoraks, wind-jackets"}],
            "cotton": [{"code": "5201.00", "description": "Cotton, not carded or combed"}],
            "fabric": [{"code": "5208.11", "description": "Woven fabrics of cotton"}],
            "yarn": [{"code": "5205.11", "description": "Cotton yarn, single, combed"}],
            
            # Food & Agriculture
            "coffee": [{"code": "0901.11", "description": "Coffee, not roasted, not decaffeinated"}],
            "tea": [{"code": "0902.10", "description": "Green tea"}],
            "rice": [{"code": "1006.30", "description": "Semi-milled or wholly milled rice"}],
            "wheat": [{"code": "1001.99", "description": "Other wheat"}],
            "corn": [{"code": "1005.90", "description": "Maize (corn) other than seed"}],
            "beef": [{"code": "0201.10", "description": "Carcasses and half-carcasses of bovine animals, fresh"}],
            "pork": [{"code": "0203.12", "description": "Fresh or chilled hams, shoulders of swine"}],
            "chicken": [{"code": "0207.13", "description": "Cuts and offal of fowls, fresh or chilled"}],
            "fish": [{"code": "0302.11", "description": "Trout, fresh or chilled"}],
            "apple": [{"code": "0808.10", "description": "Apples, fresh"}],
            "banana": [{"code": "0803.90", "description": "Bananas, fresh or dried"}],
            "orange": [{"code": "0805.10", "description": "Oranges, fresh or dried"}],
            "wine": [{"code": "2204.21", "description": "Wine of fresh grapes"}],
            "beer": [{"code": "2203.00", "description": "Beer made from malt"}],
            "chocolate": [{"code": "1806.32", "description": "Chocolate in blocks or bars, filled"}],
            "sugar": [{"code": "1701.14", "description": "Raw cane sugar"}],
            "oil": [{"code": "1511.10", "description": "Crude palm oil"}],
            
            # Industrial & Machinery
            "steel": [{"code": "7208.10", "description": "Flat-rolled products of iron, hot-rolled"}],
            "aluminum": [{"code": "7601.10", "description": "Unwrought aluminum, not alloyed"}],
            "copper": [{"code": "7403.11", "description": "Refined copper cathodes"}],
            "plastic": [{"code": "3901.10", "description": "Polyethylene, primary forms"}],
            "rubber": [{"code": "4001.10", "description": "Natural rubber latex"}],
            "paper": [{"code": "4802.55", "description": "Uncoated paper, 40-150 g/m2"}],
            "glass": [{"code": "7005.10", "description": "Float glass, non-wired"}],
            "cement": [{"code": "2523.29", "description": "Portland cement"}],
            "wood": [{"code": "4407.10", "description": "Coniferous wood, sawn lengthwise"}],
            "furniture": [{"code": "9403.30", "description": "Wooden furniture for offices"}],
            "machine": [{"code": "8479.89", "description": "Other machines and mechanical appliances"}],
            "tool": [{"code": "8205.59", "description": "Other hand tools"}],
            
            # Medical & Pharmaceutical
            "medicine": [{"code": "3004.90", "description": "Other medicaments in dosage"}],
            "medical": [{"code": "9018.90", "description": "Other medical instruments"}],
            "vaccine": [{"code": "3002.20", "description": "Vaccines for human medicine"}],
            "surgical": [{"code": "9018.31", "description": "Syringes, with or without needles"}],
            
            # Chemicals
            "chemical": [{"code": "2902.90", "description": "Other cyclic hydrocarbons"}],
            "fertilizer": [{"code": "3102.10", "description": "Urea, whether in aqueous solution"}],
            "paint": [{"code": "3208.10", "description": "Paints based on polyesters"}],
            "soap": [{"code": "3401.11", "description": "Soap for toilet use"}],
            "perfume": [{"code": "3303.00", "description": "Perfumes and toilet waters"}],
            
            # Energy
            "solar": [{"code": "8541.40", "description": "Photosensitive semiconductor devices"}],
            "battery": [{"code": "8507.60", "description": "Lithium-ion batteries"}],
            "oil": [{"code": "2709.00", "description": "Petroleum oils, crude"}],
            "gas": [{"code": "2711.11", "description": "Natural gas, liquefied"}],
        }
        
        # Search for relevant HS codes using the fallback mapping
        relevant_codes = []
        search_words = search_terms.split()
        
        # Direct keyword matching
        for word in search_words:
            if word in hs_code_mapping:
                relevant_codes.extend(hs_code_mapping[word])
        
        # Partial matching for compound terms
        if not relevant_codes:
            for key, codes in hs_code_mapping.items():
                if any(word in key or key in word for word in search_words):
                    relevant_codes.extend(codes)
        
        # Remove duplicates and limit results
        seen_codes = set()
        unique_codes = []
        for code in relevant_codes:
            if code["code"] not in seen_codes:
                seen_codes.add(code["code"])
                unique_codes.append(code)
                if len(unique_codes) >= max_results:
                    break
        
        return unique_codes
        
    except Exception as e:
        logger.exception("Error fetching HS codes from web sources")
        return []

def generate_common_hs_codes(search_terms: str) -> list:
    """
    Generate common HS codes based on product categories
    """
    common_codes = [
        {"code": "8471.30", "description": "Portable computers and data processing machines"},
        {"code": "8517.12", "description": "Telephones and communication equipment"},
        {"code": "6203.42", "description": "Cotton clothing and textiles"},
        {"code": "0901.11", "description": "Agricultural products (coffee, etc.)"},
        {"code": "8703.23", "description": "Motor vehicles and transport equipment"},
        {"code": "9403.30", "description": "Furniture and household items"},
        {"code": "3004.90", "description": "Pharmaceutical products"},
        {"code": "7208.10", "description": "Steel and metal products"},
        {"code": "3901.10", "description": "Plastic materials"},
        {"code": "8479.89", "description": "Industrial machinery"}
    ]
    
    return common_codes[:5]  # Return top 5 common codes

class CountryAnalysisRequest(BaseModel):
    country: str
    bucket: str = "tsinfo"
    sample_size: int = 100  # Number of records to analyze for summary

@app.post("/api/analyze-country")
async def analyze_country_data(request: CountryAnalysisRequest):
    """
    Analyze the trade data for a specific country and provide a comprehensive summary
    including data structure, common tariff rates, product categories, etc.
    """
    try:
        # Get the country code and file path
        country_code_map = {
            'Australia': 'AU', 'Belize': 'BZ', 'Ghana': 'GH', 'Hong Kong': 'HK',
            'Malaysia': 'MY', 'Singapore': 'SG', 'South Africa': 'ZA', 'Taiwan': 'TW',
            'United States': 'US', 'European Union': 'EU',
            # EU countries
            'Austria': 'EU', 'Belgium': 'EU', 'Bulgaria': 'EU', 'Croatia': 'EU',
            'Cyprus': 'EU', 'Czech Republic': 'EU', 'Denmark': 'EU', 'Estonia': 'EU',
            'Finland': 'EU', 'France': 'EU', 'Germany': 'EU', 'Greece': 'EU',
            'Hungary': 'EU', 'Ireland': 'EU', 'Italy': 'EU', 'Latvia': 'EU',
            'Lithuania': 'EU', 'Luxembourg': 'EU', 'Malta': 'EU', 'Netherlands': 'EU',
            'Poland': 'EU', 'Portugal': 'EU', 'Romania': 'EU', 'Slovakia': 'EU',
            'Slovenia': 'EU', 'Spain': 'EU', 'Sweden': 'EU'
        }
        
        country_code = country_code_map.get(request.country, 'US')
        key_path = f"trade-data/normal/{country_code}/Oct15.2025.jsonl"
        
        # Fetch the data from S3
        s3_resp = await get_s3_object(request.bucket, key_path)
        content = s3_resp.content
        
        # Parse the content and analyze the data structure
        analysis = analyze_trade_data_structure(content, request.sample_size)
        analysis['country'] = request.country
        analysis['country_code'] = country_code
        analysis['data_source'] = key_path
        
        return analysis
        
    except Exception as e:
        logger.exception(f"Error analyzing country data for {request.country}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

def analyze_trade_data_structure(content: str, sample_size: int = 100) -> dict:
    """
    Analyze the structure and patterns in trade data content
    """
    lines = content.strip().split('\n')
    total_records = len(lines)
    
    # Sample records for analysis
    sample_records = []
    step = max(1, total_records // sample_size)
    
    for i in range(0, min(total_records, sample_size * step), step):
        try:
            record = json.loads(lines[i])
            sample_records.append(record)
        except json.JSONDecodeError:
            continue
    
    if not sample_records:
        return {
            "error": "No valid JSON records found",
            "total_records": total_records,
            "sample_size": 0
        }
    
    # Analyze data structure
    analysis = {
        "total_records": total_records,
        "sample_size": len(sample_records),
        "fields_analysis": {},
        "tariff_summary": {},
        "product_categories": {},
        "common_patterns": {},
        "data_quality": {}
    }
    
    # Analyze fields and their frequency
    field_counts = {}
    field_types = {}
    field_samples = {}
    
    for record in sample_records:
        if isinstance(record, dict):
            for key, value in record.items():
                # Count field frequency
                field_counts[key] = field_counts.get(key, 0) + 1
                
                # Track field types
                if key not in field_types:
                    field_types[key] = set()
                field_types[key].add(type(value).__name__)
                
                # Store sample values
                if key not in field_samples:
                    field_samples[key] = []
                if len(field_samples[key]) < 5 and value is not None:
                    field_samples[key].append(str(value))
    
    # Create fields analysis
    for field, count in field_counts.items():
        analysis["fields_analysis"][field] = {
            "frequency": count,
            "percentage": round((count / len(sample_records)) * 100, 1),
            "types": list(field_types.get(field, [])),
            "sample_values": field_samples.get(field, [])[:3]
        }
    
    # Analyze tariff-related fields
    tariff_fields = ['tariff_rate', 'duty_rate', 'rate', 'duty', 'ad_valorem_rate', 'specific_rate']
    rates_found = []
    
    for record in sample_records:
        if isinstance(record, dict):
            for field in tariff_fields:
                if field in record and record[field] is not None:
                    try:
                        rate_str = str(record[field]).replace('%', '').replace(' ', '')
                        if rate_str.replace('.', '').replace('-', '').isdigit():
                            rates_found.append(float(rate_str))
                    except (ValueError, TypeError):
                        continue
    
    if rates_found:
        analysis["tariff_summary"] = {
            "rates_found": len(rates_found),
            "average_rate": round(sum(rates_found) / len(rates_found), 2),
            "min_rate": min(rates_found),
            "max_rate": max(rates_found),
            "common_rates": list(set([r for r in rates_found if rates_found.count(r) > 1]))[:5]
        }
    
    # Analyze product categories
    product_fields = ['description', 'product', 'commodity', 'hs_code', 'HS_Code', 'product_description']
    product_keywords = {}
    
    for record in sample_records:
        if isinstance(record, dict):
            for field in product_fields:
                if field in record and record[field]:
                    desc = str(record[field]).lower()
                    # Extract common keywords
                    words = re.findall(r'\b[a-zA-Z]{3,}\b', desc)
                    for word in words[:5]:  # Limit to avoid too much data
                        product_keywords[word] = product_keywords.get(word, 0) + 1
    
    # Get top product keywords
    top_keywords = sorted(product_keywords.items(), key=lambda x: x[1], reverse=True)[:10]
    analysis["product_categories"]["top_keywords"] = [{"keyword": k, "frequency": v} for k, v in top_keywords]
    
    # Data quality assessment
    complete_records = sum(1 for r in sample_records if isinstance(r, dict) and len(r) > 5)
    analysis["data_quality"] = {
        "complete_records_percentage": round((complete_records / len(sample_records)) * 100, 1),
        "average_fields_per_record": round(sum(len(r) if isinstance(r, dict) else 0 for r in sample_records) / len(sample_records), 1),
        "has_tariff_data": len(rates_found) > 0,
        "has_product_data": len(product_keywords) > 0
    }
    
    return analysis

# Only run tests if script is run directly (not through uvicorn)
if __name__ == "__main__":
    import asyncio
    
    print("Running tests...")
    asyncio.run(test_ai_check())
    print("\nRunning S3 tests...")
    asyncio.run(test_s3_operations())

# To run server: uvicorn main:app --reload
# To test locally: python3 main.py