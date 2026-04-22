# Python Rules

Rules for Python projects. Imported by the main CLAUDE.md.

---

## Import Order

```python
import stdlib_module          # 1. Standard library

import third_party_module     # 2. Third-party packages

from app.module import thing  # 3. Local imports
```

Blank line between each group. No wildcard imports (`from x import *`).

---

## Type Hints

- All function signatures must include parameter types and return type.
- Use `X | None` over `Optional[X]` (Python 3.10+).
- Use `list[str]` over `List[str]` (Python 3.9+).
- Complex types deserve a type alias with a descriptive name.

---

## Naming

| Target | Convention | Example |
|--------|-----------|---------|
| Functions/variables | `snake_case` | `get_user_data` |
| Classes | `PascalCase` | `UserProfile` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Bool variables | `is_` / `has_` prefix | `is_valid`, `has_permission` |
| Private | `_` prefix | `_internal_helper` |
| Collections | Plural nouns | `results`, `users` |

**Function names must start with a verb.** The verb clarifies intent — the reader knows whether the function reads, mutates, creates, or decides.

| Purpose | Verbs | Example |
|---------|-------|---------|
| Read / retrieve | `get_`, `fetch_`, `load_`, `read_`, `find_` | `get_user`, `fetch_orders` |
| Create | `create_`, `build_`, `make_`, `generate_` | `create_session`, `build_query` |
| Update / mutate | `update_`, `set_`, `apply_`, `merge_` | `update_profile`, `set_flag` |
| Delete | `delete_`, `remove_`, `clear_` | `delete_cache`, `remove_item` |
| Transform | `parse_`, `format_`, `convert_`, `normalize_` | `parse_date`, `format_price` |
| Validate / check | `validate_`, `check_`, `ensure_`, `verify_` | `validate_input`, `ensure_exists` |
| Decide (bool return) | `is_`, `has_`, `should_`, `can_` | `is_valid()`, `has_access()` |
| Handle / process | `handle_`, `process_`, `run_`, `execute_` | `handle_event`, `process_batch` |

Avoid noun-only function names (`user_data()`, `config()`) — rename to `get_user_data()`, `load_config()`.

---

## Async

- Use `async/await` for I/O-bound operations (network, file, DB).
- CPU-bound work stays synchronous or uses `ProcessPoolExecutor`.
- Never mix blocking calls inside async functions without `run_in_executor`.

---

## Data Validation

- Use **Pydantic** models for API request/response validation.
- Use **dataclasses** for internal data structures without validation needs.
- Never trust raw user input — validate at the API boundary.

---

## Dependencies

```
requirements.txt          # Production only
requirements-dev.txt      # Dev/test — first line: -r requirements.txt
```

- Dockerfile installs `requirements.txt` only.
- Virtual environment: `.venv/`, included in `.gitignore`.
- Prefer `uv pip install -r requirements.txt` for speed. Fallback to `pip install -r requirements.txt` if `uv` is unavailable.

---

## Code Style

- Follow PEP 8. Enforce with `ruff` or `black`.
- Max line length: project convention (88 for black, 120 common alternative).
- One blank line between functions, two blank lines between top-level definitions.
- Avoid nested functions deeper than 2 levels — extract to helper.
