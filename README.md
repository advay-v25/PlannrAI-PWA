# PlannrAI - Neural OS for Personal Productivity

PlannrAI is a "Lived-In" Intelligence system designed to optimize personal scheduling through understanding, regulation, and narrative reflection. It is not just a calendar; it is a proactive agent that manages time, energy, and goals using a sophisticated multi-agent AI architecture.

## Key Features

* **The Dashboard**: A unified daily nexus combining your reality intake (Mindspace, Quick Adds) and ambient pulse (energy level).
* **Mindspace**: Smart task and goal intake powered by AI extraction. Proposes changes via Option Cards.
* **Donna - Super Intelligence Performance Coach**: Context-aware AI coach utilizing a robust Auto-Execute and Proposed Option dual-path execution engine. Includes silent retry on schedule collision.
* **Narrative Weekly Review**: Reflection tool that avoids gamification, suggesting actionable changes (One Lever).
* **Goal Engine**: Auto-schedules goals based on your historical "Best Windows".

## Architecture & Technology

PlannrAI relies on a robust real-time synchronization engine and a multi-agent AI setup:
* **Frontend:** Next.js 14 (App Router), React, Framer Motion, Tailwind CSS
* **Backend:** Supabase (PostgreSQL), Next.js Server Actions
* **AI:** Groq API (Llama 3.3 70B) for fast inference
* **State Management:** Zustand with custom real-time DB syncing (`useSyncStore`, `graphVersion`)
* **PWA:** Fully decoupled Service Worker architecture (`sw.js`) combining Web Push Notifications and local Precaching, completely bypassing dynamic AI inference routes to maintain offline integrity without cache poisoning.

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Setup your `.env` file with Supabase and Groq API keys.
3. Run the development server:
   ```bash
   npm run dev
   ```

## Design Philosophy

The system follows a strict, premium design language (Glassmorphism, deep purples, typography-first hierarchy) emphasizing clarity, low cognitive load, and instant understandability. See `DESIGN_SYSTEM.md` and `FEATURES.md` for more details.
