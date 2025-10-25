"""Tests for the FastAPI Bedrock endpoint."""

from __future__ import annotations

import importlib
import json
from types import ModuleType
from typing import Generator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(name="main_module")
def main_module_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[ModuleType, None, None]:
    """Load main.py with isolated environment variables."""
    import sys

    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "test-model")

    if "main" in sys.modules:
        del sys.modules["main"]

    module = importlib.import_module("main")
    try:
        yield module
    finally:
        if "main" in sys.modules:
            del sys.modules["main"]


def test_call_bedrock_returns_decoded_body(
    main_module: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Endpoint should return decoded Bedrock response and call client correctly."""
    # Arrange environment before importing main
    main = main_module
    client = TestClient(main.app)

    mock_stream = MagicMock()
    mock_stream.read.return_value = json.dumps(
        {"content": [{"text": "Claude says hi"}]}
    ).encode()
    mock_bedrock_client = MagicMock()
    mock_bedrock_client.invoke_model.return_value = {"body": mock_stream}
    monkeypatch.setattr(main, "bedrock_client", mock_bedrock_client)

    # Act
    response = client.post("/api/bedrock", json={"prompt": "hello"})

    # Assert
    assert response.status_code == 200
    assert response.json() == {"result": "Claude says hi"}
    mock_bedrock_client.invoke_model.assert_called_once_with(
        modelId="test-model",
        contentType="application/json",
        accept="application/json",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "hello",
                            }
                        ],
                    }
                ],
                "max_tokens": 256,
            }
        ),
    )
