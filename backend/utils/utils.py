import io
import re
import token
import tokenize

def _clean_mistake_code(code: str) -> str:
    normalized_lines = []
    for line in code.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        # Drop comment-only lines
        if stripped.startswith("#"):
            continue
        # Strip trailing semicolons and trailing whitespace
        normalized_lines.append(line.rstrip().rstrip(";"))

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

    _IGNORED_TOKEN_TYPES = {
        token.INDENT,
        token.DEDENT,
        token.NEWLINE,
        token.COMMENT,
        tokenize.NL,
        tokenize.ENDMARKER,
    }
    _IGNORED_OPS = {";"}

    try:
        tokens = tokenize.generate_tokens(io.StringIO(cleaned_code).readline)
        result = []
        for current_token in tokens:
            if current_token.type in _IGNORED_TOKEN_TYPES:
                continue
            if current_token.type == token.OP and current_token.string in _IGNORED_OPS:
                continue
            if current_token.type == token.NAME and current_token.string == "print":
                continue
            if current_token.type == token.STRING:
                # Normalize quote style: treat 'x' and "x" as the same
                normalized = current_token.string.replace("'", '"')
                result.append((current_token.type, normalized))
                continue
            result.append((current_token.type, current_token.string))
        return tuple(result)
    except (IndentationError, SyntaxError, tokenize.TokenError):
        words = cleaned_code.split()
        return tuple(w for w in words if w not in {"print", ";"})


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
    "_clean_mistake_code",
    "_mistake_code_fingerprint",
    "generate_slug",
    "has_user_added_own_code",
]
