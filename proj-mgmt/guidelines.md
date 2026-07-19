# Enterprise Coding & Architecture Guidelines

This document details the guidelines for all future development passes. The orchestrator, implementors, QA agents, and code reviewers must follow and enforce these rules.

---

## 🛡️ 1. Type Safety (No `any`)
*   **Rule**: Explicit or implicit `any` types are strictly prohibited.
*   **Requirement**: Define TypeScript interfaces, types, or record mappings. For dynamic dictionaries, use generic shapes like `Record<string, unknown>`, `Record<string, number>`, or specific types instead of `any`.
*   **Target**: Eliminate all legacy `any` definitions in physics and utility files.

## 🧱 2. SOLID Principles
*   **Single Responsibility (SRP)**: Each class or function should have a single purpose.
    *   *Example*: Do not mix physics force calculations directly with rendering calls or state mutation.
*   **Open/Closed (OCP)**: Code should be open for extension but closed for modification.
    *   *Example*: Use factories to introduce new shapes without changing the main loop.
*   **Interface Segregation (ISP)**: Avoid fat interfaces; break them into smaller, clients-specific ones.
*   **Dependency Inversion (DIP)**: High-level modules should not depend on low-level modules. Depend on abstractions/interfaces.

## 🗺️ 3. Domain-Driven Design (DDD)
*   **Separation of Concerns**:
    *   **Domain Model**: Pure logic (e.g. cosine similarity math, dictionary lookup mechanics) in `src/utils/` or `/domain/`.
    *   **Infrastructure / Presentation**: Rendering layout (p5 canvas, rendering methods) and physics integration (Matter.js body creation) in `/physics/` or `/infrastructure/`.
    *   **Application State**: State stores (MobX) mapping user interaction, game levels, scoring, and UI views.
*   **Shared DTOs**: All data transferred between client and future server must use typed contracts located in `/shared`.

## 📏 4. Small Functions & Files
*   **Function Length**: Functions should do one thing and remain small (ideally < 30 lines).
*   **File Length**: Limit files to a maximum of 250 lines. Large files (like the current `CollisionHandler.ts` at 285 lines) must be refactored into smaller, logically grouped files.

## 📖 5. Intuitive Documentation
*   **TSDoc / JSDoc**: Document classes and non-obvious functions using standard TSDoc formats.
*   **Comments**: Explain *why* a complex logic branches or mathematical formula is chosen, not just *what* the code does.
