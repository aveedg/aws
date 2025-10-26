import json
import logging
import os
from dotenv import load_dotenv

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


# Set up Bedrock client with specified credentials (only if present)
bedrock_client = None
if not missing_env:
    bedrock_client = boto3.client(
        'bedrock-runtime',
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

@app.get("/")
def root():
    return {"message": "Hello from FastAPI and AWS Bedrock!"}

# Quick test function for direct script execution
async def test_ai_check():
    test_request = PromptRequest(prompt="Hello what is your name")
    result = await check_ai_content(test_request)
    print("Test result:", result)

# Only run test if script is run directly (not through uvicorn)
if __name__ == "__main__":
    import asyncio
    asyncio.run(test_ai_check())

# To run server: uvicorn main:app --reload
# To test locally: python3 main.py