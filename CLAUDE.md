# HarmonyApp

Expo SDK 54 + React Native 0.81 + Supabase + Gemini AI. A Zen-styled mediation and emotional wellness app.

## Agent Team

This project has a team of four specialist agents in `.claude/agents/`. For any new feature, route through the team lead:

- **`dev-lead`** — Entry point for features. Decomposes requests into backend/frontend/test tasks and delegates to the specialists below. Always use this agent for multi-domain features.
- **`backend-dev`** — Supabase schema/RLS, data access functions in `lib/`, Gemini prompts and integrations, types.
- **`frontend-dev`** — Expo Router screens, React Native components, NativeWind styling, navigation, haptics, Reanimated animations.
- **`tester`** — TypeScript typecheck, ESLint, code review against spec, manual test plan. Runs last.

**When to use the team lead:** any request that touches both backend and frontend, or that adds a new screen/feature. Say "use the dev-lead agent" or the dev-lead agent will be invoked for feature requests.

**When to go direct:** pure-backend changes (schema only, data functions) → `backend-dev`. Pure-frontend changes (styling tweak, single component) → `frontend-dev`. Verification after changes → `tester`.

## Stack

- **Routing:** Expo Router v6 (file-based under `app/`, tabs in `app/(tabs)/`)
- **Styling:** NativeWind v4 — use `className` with Tailwind, theme tokens in `tailwind.config.js` under `colors.harmony.*`
- **Database:** Supabase — single client in `lib/supabase.ts`, schema source of truth in `supabase_setup.sql`
- **AI:** Gemini — client in `lib/gemini.ts`
- **Auth:** Supabase Auth — `useAuth()` from `lib/AuthContext.tsx`, gating in `app/_layout.tsx`
- **Animation:** `react-native-reanimated` v4
- **Haptics:** `expo-haptics` (subtle: `Light`, `Selection`)

## Visual Identity (mandatory)

Source: `agent.md`. Zen minimalist style:
- **Palette:** sage (`#B2AC88`), sand (`#E6D5B8`), indigo (`#5F7ADB`) for AI accents. Never bright red or neon.
- **Shape:** `rounded-4xl` (32px) for cards/buttons. No sharp corners on interactive elements.
- **Elevation:** `shadow-zen` only.
- **Spacing:** generous — `px-6 pt-12` minimum on screens, `gap-6` between components.
- **AI thinking:** breathing-tempo (4–6s) linear gradient animation between sage and sand.

## Conventions

- Path alias `@/` → repo root (e.g. `@/lib/supabase`, `@/components/VoiceChatUI`)
- Prefer `Edit` over rewriting whole files
- No new dependencies without flagging
- No `any` types unless justified
- New tables always get RLS + policies in `supabase_setup.sql`
- New screens register in `app/_layout.tsx` or `app/(tabs)/_layout.tsx`