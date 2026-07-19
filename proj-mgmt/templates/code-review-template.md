# Code Review Report

## 📌 Review Metadata
*   **Date**: {timestamp}
*   **Reviewer**: Code Reviewer Agent
*   **Branch/Commit**: {branch-or-commit}
*   **Status**: {PASSED / FAILED}

---

## 🔍 Core Guidelines Evaluation

| Guideline | Status (PASS / WARN / FAIL) | Review Findings |
| :--- | :---: | :--- |
| **1. Type Safety (No `any`)** | | Checks for explicit or implicit `any` usage. All variables, parameters, and returns must be strictly typed. |
| **2. SOLID Principles** | | Verifies that classes have a single responsibility, modules are open for extension/closed for modification, etc. |
| **3. Domain-Driven Design (DDD)** | | Assesses separation between business domain logic, application state, and presentation/render layers. |
| **4. Small Functions & Files** | | Ensures functions are concise (ideally <30 lines) and files are modular (ideally <250 lines). |
| **5. Intuitive Documentation** | | Verifies that complex math, rendering, and logic branches are documented with clear TS docstrings or comments. |

---

## 📝 Detailed File-by-File Review

### `{file_path}`
*   **Verdict**: {PASS / WARN / FAIL}
*   **Line Recommendations**:
    *   **Line {num}**: {Issue description and recommended replacement}

---

## 🏆 Final Verdict
**[ APPROVED / REQUIRES_WORK ]**
