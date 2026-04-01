"""Utility helpers extracted from main.py.

Keep these utilities type-agnostic to avoid circular imports with models.
"""
from __future__ import annotations

import io
import token
import tokenize
import re
import json
from typing import Any

HARDCODED_MODEL_ANSWERS = {
    "add_in_range": "def add_in_range(start, stop):\n"
    "    total = 0\n"
    "    while start <= stop:\n"
    "        total += start\n"
    "        start += 1\n"
    "    return total",
}


def _get_model_answer_for_task(task: Any) -> str | None:
    """Return a teacher-facing hard-coded model answer for known exercises.

    The `task` object is expected to have `id` and/or `title` attributes.
    """
    try:
        if getattr(task, "id", None) == 1:
            return HARDCODED_MODEL_ANSWERS["add_in_range"]

        task_title = (getattr(task, "title", "") or "").strip().lower()
        return HARDCODED_MODEL_ANSWERS.get(task_title)
    except Exception:
        return None


def _clean_mistake_code(code: str) -> str:
    """Return a display-friendly version of submitted code.

    Normalizes line endings, strips leading/trailing blank lines and trims
    trailing whitespace from each line.
    """
    normalized_lines = [line.rstrip() for line in code.replace("\r\n", "\n").replace("\r", "\n").split("\n")]

    while normalized_lines and not normalized_lines[0].strip():
        normalized_lines.pop(0)
    while normalized_lines and not normalized_lines[-1].strip():
        normalized_lines.pop()

    return "\n".join(normalized_lines)


def _mistake_code_fingerprint(code: str) -> tuple:
    """Build a grouping key that ignores whitespace-only differences.

    Attempts to tokenize the code and returns a tuple of (token.type, token.string)
    excluding whitespace/indentation tokens. Falls back to splitting on whitespace
    if the tokenizer fails.
    """
    cleaned_code = _clean_mistake_code(code)
    if not cleaned_code:
        return tuple()

    try:
        tokens = tokenize.generate_tokens(io.StringIO(cleaned_code).readline)
        return tuple(
            (current_token.type, current_token.string)
            for current_token in tokens
            if current_token.type not in {
                token.INDENT,
                token.DEDENT,
                token.NEWLINE,
                tokenize.NL,
                tokenize.ENDMARKER,
            }
        )
    except (IndentationError, SyntaxError, tokenize.TokenError):
        return tuple(cleaned_code.split())


def generate_slug(text: str) -> str:
    """Generate a URL-friendly slug from text.

    Converts to lowercase, replaces spaces with hyphens, removes special characters.
    """
    slug = text.lower()
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def has_user_added_own_code(submitted_code: str, task_code_blocks: dict) -> bool:
    """Check if submitted code has user-added content beyond just the given blocks.

    This mirrors the logic previously embedded in main.py. It supports both the
    old format (blocks as list of strings) and the newer dict-based block format.
    """
    if not submitted_code.strip():
        return False

    blocks = task_code_blocks.get("blocks", []) if isinstance(task_code_blocks, dict) else []
    if not blocks:
        return True

    if isinstance(blocks[0], str):
        return True

    submitted_lines = [line.strip() for line in submitted_code.strip().split('\n') if line.strip()]

    given_blocks = [block for block in blocks if isinstance(block, dict) and block.get("given", False)]

    if len(submitted_lines) > len(given_blocks):
        return True

    if len(submitted_lines) < len(given_blocks):
        return False

    for submitted_line, given_block in zip(submitted_lines, given_blocks):
        expected_empty = given_block.get("code", "").replace("___", "").strip()
        submitted_clean = submitted_line.replace(" ", "")
        expected_clean = expected_empty.replace(" ", "")

        if submitted_clean != expected_clean:
            return True

    return False


__all__ = [
    "_get_model_answer_for_task",
    "_clean_mistake_code",
    "_mistake_code_fingerprint",
    "generate_slug",
    "has_user_added_own_code",
]
