"""S3 storage for evidence files — presigned URLs only.

The backend never proxies file bytes (docs/backend-system-architecture.md): it issues presigned
upload URLs, the frontend uploads directly to S3, and the resulting `s3://{bucket}/{key}` URL is
stored on the `evidence` row. Presigned URLs are computed locally by botocore's signer (no
network round-trip), so they're safe to call from async paths.

When `S3_EVIDENCE_BUCKET` is unset, `get_storage()` returns None and file-type evidence is
rejected with 503 `storage_not_configured`; link/testimonial evidence needs no storage.
"""

import uuid

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import Settings
from app.models.evidence import ALLOWED_CONTENT_TYPES

EVIDENCE_KEY_PREFIX = "evidence"


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.s3_evidence_bucket
        self._upload_ttl = settings.evidence_upload_ttl_seconds
        self._download_ttl = settings.evidence_download_ttl_seconds
        self._client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            config=BotoConfig(signature_version="s3v4"),
        )

    @property
    def bucket(self) -> str:
        return self._bucket

    def build_key(self, profile_id: uuid.UUID, content_type: str) -> str:
        """Deterministic, path-traversal-safe key: evidence/{profile_id}/{uuid}{ext}."""
        ext = ALLOWED_CONTENT_TYPES[content_type]
        return f"{EVIDENCE_KEY_PREFIX}/{profile_id}/{uuid.uuid4()}{ext}"

    def validate_key(self, profile_id: uuid.UUID, key: str) -> bool:
        """True if `key` looks like one we issued for this profile (no traversal, right prefix)."""
        prefix = f"{EVIDENCE_KEY_PREFIX}/{profile_id}/"
        return key.startswith(prefix) and ".." not in key and len(key) <= 512

    def file_url(self, key: str) -> str:
        """Canonical stored form of a file's location."""
        return f"s3://{self._bucket}/{key}"

    def presign_put(self, key: str, content_type: str) -> str:
        return self._client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self._bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self._upload_ttl,
        )

    def presign_get(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=self._download_ttl,
        )

    @property
    def upload_ttl_seconds(self) -> int:
        return self._upload_ttl

    @property
    def download_ttl_seconds(self) -> int:
        return self._download_ttl


def presign_get_for_file_url(storage: S3Storage, file_url: str) -> str:
    """Presigned GET from a stored `s3://bucket/key` URL (standard download TTL).

    Falls back to the stored URL when it isn't a bucket-matching s3:// URL.
    """
    if not file_url.startswith("s3://"):
        return file_url
    rest = file_url[len("s3://") :]
    bucket, _, key = rest.partition("/")
    if not key or bucket != storage.bucket:
        return file_url
    return storage.presign_get(key)


_storage: S3Storage | None = None


def get_storage(settings: Settings) -> S3Storage | None:
    global _storage
    if not settings.s3_evidence_bucket:
        return None
    if _storage is None:
        _storage = S3Storage(settings)
    return _storage
