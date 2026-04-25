# Canvas Dashboard Mac

## What this is
A macOS menu bar app that fetches assignments from the UW Canvas LMS
and displays them in a dropdown panel.

## PRD
Full product requirements are in canvas_dashboard_PRD.docx in this folder.
Read it to understand what the app should do from a user perspective.

## TRD
Full technical spec is in canvas_dashboard_TRD.docx in this folder.
Read it before making any decisions about architecture or implementation.

## Stack
- Electron 30 + Node.js 20
- React 18 + TypeScript
- Tailwind CSS + Vite
- electron-store, keytar, axios, ical.js, node-cron
- framer-motion, date-fns, lucide-react (added in Phase 3.1)

## Critical - do not touch these files ever
- vite.config.ts
- package.json (especially do not add or remove the "type" field)
- tsconfig.json

## Current status
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- Phase 3 COMPLETE — dark/light mode, mark as done, menu bar badge count,
  frosted glass panel, personal tasks, course filter tabs, hide old overdue
- Phase 3.1 COMPLETE — liquid glass design, animated rows, course drill-down, relative time footer

## Important notes
- UW Canvas does NOT allow personal access tokens — REST API is blocked
- App uses iCal feed as primary data source permanently
- electron-store requires a name field when initialized —
  always pass name: "app-store" or name: "token" to new Store()
- Do not read or search dist-electron/ for bugs — always fix source files
  in the electron/ folder only

## Phase 3.1 — UI/UX upgrade (COMPLETE)
Reference app: canvas-companion-main/ at project root.

What was built:
1. Liquid glass design — CSS variables + .glass, .glass-inset, .aurora, .text-gradient
   classes in src/index.css; aurora background + glass panel applied to Panel.tsx
2. Animated assignment rows — framer-motion motion.div with opacity+y stagger animation;
   always-visible checkbox; hover ExternalLink icon (lucide-react)
3. Course tab with drill-down — Assignments/Courses top tabs; Courses tab shows
   cards with total/overdue/upcoming + chevron; clicking drills into that course
4. Footer — date-fns formatDistanceToNowStrict for relative time; Clear N overdue button

## Phase 2.1 — Canvas GraphQL (PLANNED)
- Use https://canvas.uw.edu/api/graphql with browser session cookie
- Fetch submission status, points possible, assignment type
- Fall back to iCal if GraphQL fails
- Add session cookie input in settings panel

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.