import json
import logging
import os
import csv
import io
import re
from typing import List, Optional
from dotenv import load_dotenv

import boto3
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
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        content = response['Body'].read().decode('utf-8')
        metadata = response.get('Metadata', {})
        
        return S3GetResponse(content=content, metadata=metadata)

    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            raise HTTPException(status_code=404, detail=f"Object {object_key} not found")
        logger.exception("Error getting S3 object")
        raise HTTPException(status_code=500, detail=str(e))


def parse_s3_content_and_match(content: str, query: str, top_k: int = 5):
    """
    Parse S3 object content (JSON, JSONL, or CSV) and return top_k records that best match the query.
    Matching is a simple token-based substring match across all string fields.
    Returns a list of {record, score} sorted by score desc.
    """
    # normalize query tokens
    tokens = [t.lower() for t in re.findall(r"\w{2,}", query)]
    if not tokens:
        return []

    records = []

    # Try parsing JSON (array or object)
    parsed = None
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
        parsed = None

    # If JSON parsing failed, try JSONL (one JSON per line)
    if not records:
        lines = [l for l in content.splitlines() if l.strip()]
        jsonl_records = []
        for line in lines:
            try:
                jsonl_records.append(json.loads(line))
            except Exception:
                jsonl_records = []
                break
        if jsonl_records:
            records = jsonl_records

    # If still empty, try CSV parsing
    if not records:
        try:
            reader = csv.DictReader(io.StringIO(content))
            records = [row for row in reader]
        except Exception:
            records = []

    # Score records
    scored = []
    for rec in records:
        # flatten record into a single searchable string
        if isinstance(rec, dict):
            combined = " ".join([str(v) for v in rec.values() if v is not None]).lower()
        else:
            combined = str(rec).lower()

        score = 0
        for t in tokens:
            # count occurrences as simple score
            score += combined.count(t)

        if score > 0:
            scored.append({"record": rec, "score": score})

    # sort by score desc
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]

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
            "You are an expert export compliance assistant. Answer concisely and clearly. "
            "When appropriate, list actionable steps and ask clarifying questions."
        )

        user_prompt = req.prompt.strip()
        # Combine system, context, and user prompt into a single message string
        combined = "\n\n".join([system_instructions, "Context:", "\n".join(parts), "User request:", user_prompt])
        return combined

    prompt_text = build_prompt(request)

    # Allow callers to override temperature / max_tokens via the request (or fall back to defaults)
    temperature = request.temperature if request.temperature is not None else 0.2
    max_tokens = request.max_tokens if request.max_tokens is not None else 1000

    # The Bedrock Messages API expects user messages in `messages` and a top-level
    # system/instruction parameter (if used) rather than a message with role="system".
    # We already incorporate system instructions into `prompt_text`, so only send a
    # user message here to avoid validation errors.
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt_text}],
            },
        ],
        # Model generation controls (may be model-specific)
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
        # If record is dict, search values for the country string
        if isinstance(rec, dict):
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

# Only run tests if script is run directly (not through uvicorn)
if __name__ == "__main__":
    import asyncio
    
    print("Running tests...")
    asyncio.run(test_ai_check())
    print("\nRunning S3 tests...")
    asyncio.run(test_s3_operations())

# To run server: uvicorn main:app --reload
# To test locally: python3 main.py