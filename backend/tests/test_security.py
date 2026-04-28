"""bcrypt + JWT 헬퍼."""

import uuid

import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret!")
    assert verify_password("s3cret!", h)
    assert not verify_password("wrong", h)


def test_token_roundtrip():
    user_id = uuid.uuid4()
    token = create_access_token(str(user_id))
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)


def test_token_invalid_raises():
    with pytest.raises(ValueError):
        decode_access_token("not.a.token")
