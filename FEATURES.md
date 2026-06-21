# PlannrAI - Features & Walkthrough

PlannrAI is a "Lived-In" Intelligence system designed to optimize personal scheduling through understanding, regulation, and narrative reflection. It is not just a calendar; it is a proactive agent that manages time, energy, and goals.

## 1. Core Intelligence Layer

### A. The Agent Orchestrator
The brain of the system uses a multi-agent architecture to process natural language and intent:
- **Planner Agent**: Decomposes requests (e.g., "Gym at 5") into structured intent.
- **Regulator Agent**: Modifies the response based on your **Emotional State** (e.g., if you are "Overwhelmed", it restricts options to 2 and uses direct language).
- **Scheduler Agent**: Algorithms that find the best slots while respecting energy and constraints.
- **Validator Agent**: Safety check that ensures no impossible schedules (overlaps, time travel) are applied.

### B. State Engine (The Mirror)
The system infers your state in real-time without asking:
- **Physical**: Energy Level (1-5), inferred from load and history.
- **Emotional**: States like `Overwhelmed`, `Burnt`, `Motivated`, `Avoidant`.
- **Logic**: 
    - High Completion + Positive Sentiment = `Motivated`
    - High Missed Blocks + Negative Sentiment = `Overwhelmed`

### C. Anticipation (The Silent Prep)
The system looks ahead to "Tomorrow" silently.
- If tomorrow is overloaded or has conflict, a subtle **Anticipation Banner** appears on the Dashboard.
- It never interrupts, only warns.

---

## 2. Key Features

### 📅 The Dashboard (Home)
- **Daily Nexus**: Your immediate "Now", "Next", and "Later".
- **Reality Intake**: A unified input for Brain Dumps, Quick Adds, and Status Updates.
- **Ambient Pulse**: Background visuals that reflect your energy level.

### 🧠 Mindspace
- **Smart intake**: Type anything ("I need to workout more", "Call Mom").
- **Extraction**: The AI extracts Tasks, Habits, or Goal constraints.
- **Application**: AI proposes changes directly (Preview -> Apply/Undo) with a 10-second transactional undo barrier.

### 🤖 Donna - Super Intelligence Performance Coach
- **Contextual Chat**: Knows your schedule, energy, and recent history (anchored to your exact local client timezone and sleep-cycle logic).
- **Execution Engine**: Directives are classified by complexity. Simple tasks (e.g., adding a block, removing an event) use an `AUTO_EXECUTE` mutation ledger with a plain English description of what was done. Complex requests use `PROPOSE_OPTIONS`, generating distinct choices allowing the user to select the preferred path.
- **Conflict Prevention**: Built-in `ConflictService` traps schedule collisions or overlapping blocks, triggering a silent LLM recalculation retry before ever showing an invalid option to the user.

### 📖 Narrative Weekly Review
A reflection tool that avoids gamification.
- **Reality**: "Planned vs Actual" text (no scores).
- **Patterns**: Identifies exactly 3 friction patterns (e.g., "Overscheduled Mornings").
- **One Lever**: Suggests **ONE** executable change (e.g., "Reduce goal minutes by 20%").
    - Note: The Weekly Review is currently kept isolated and is not ingested into the AI Coach context to maintain scope separation.

### 🎯 Goal Engine
- **Smart Distribution**: Goals ("Read 3x/week") are auto-scheduled based on your "Best Windows" (learned from history).
- **Displacement**: Goals can push "Flexible" blocks out of the way, but yield to "Anchors".
- Note: Habit Stacks and Goals operate independently from the primary AI Coach inference pipeline for now.

---

## 3. Technology Stack

- **Frontend**: Next.js 14 (App Router), React, Framer Motion, Tailwind CSS.
- **Backend**: Supabase (PostgreSQL), Next.js Server Actions.
- **AI**: Groq API (Llama 3.3 70B) for fast, structured inference.
- **State**: Persistent `user_state` and `user_context` (Memory).

---

## 4. How to Use

1.  **Onboarding**: Set your "Baseline" (Sleep, Meals, Energy).
2.  **Planning**: Use the **Goals** to add tasks. The AI will schedule them.
3.  **Living**: Check the **Dashboard** for what's next. Mark blocks as Done/Missed.
4.  **Regulating**: If you feel overwhelmed, tell the Coach ("I'm swamped"). The **Regulator** will shift the AI to "Recovery Mode" and help you cut tasks.
5.  **Reviewing**: Once a week, check the **Weekly Review** to tweak your system with "One Lever".
