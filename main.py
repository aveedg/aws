import json
import logging
import os
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