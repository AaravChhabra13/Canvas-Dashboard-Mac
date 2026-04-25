# Canvas Dashboard Mac

## What this is
A macOS menu bar app called "Canvas Companion" that fetches assignments 
from the Canvas LMS and displays them in a dropdown panel.
NOTE: The app is branded as "Canvas Companion" in the UI but the codebase,
file names, and repo remain "Canvas Dashboard Mac". Do not rename any files.

## PRD
Full product requirements are in canvas_dashboard_PRD.docx in this folder.
Read it to understand what the app should do from a user perspective.

## TRD
Full technical spec is in canvas_dashboard_TRD.docx in this folder.
Read it before making any decisions about architecture or implementation.

## Stack
- Electron 30 + Node.js 20
- React 18 + TypeScript
- Tailwind CSS v4 + Vite
- electron-store, keytar, axios, ical.js, node-cron
- framer-motion, date-fns, lucide-react

## Critical - do not touch these files ever
- vite.config.ts
- package.json (especially do not add or remove the "type" field)
- tsconfig.json

## Critical - do not edit these files ever
- canvas-companion-main/ (reference only, never edit)
- dist-electron/ (compiled output, never read or edit for debugging)

## Important notes
- UW Canvas does NOT allow personal access tokens — REST API is blocked
  for UW students but works for students at other Canvas schools
- App uses iCal feed as primary/fallback data source for all users
- iCal feed does not provide Canvas assignment URLs — clicking assignments
  does not open Canvas yet, fixed in Phase 4
- electron-store always needs a name field: new Store({ name: 'app-store' })
- Always fix bugs in source files in electron/ and src/ only
- Tailwind v4 syntax: use @import "tailwindcss" not @tailwind directives
- postcss.config.js must use @tailwindcss/postcss as the plugin
- REST API code already exists in electron/canvasApi.ts with Bearer token
  auth hitting /api/v1/users/self, /api/v1/courses, /api/v1/planner/items

## Completed phases
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- Phase 3 COMPLETE — dark/light mode, mark as done, menu bar badge,
  frosted glass, personal tasks, course filter tabs, hide old overdue
- Phase 3.1 COMPLETE — full liquid glass UI/UX upgrade, aurora background,
  animated assignment rows, course color coding, overdue/today color labels,
  clear overdue button, settings as animated page, course drill-down

## Phase 4 — Authentication and moving off VS Code (PLANNED)

### Phase 4.1 — Canvas GraphQL API
- Implement Canvas GraphQL API using browser session cookie
- GraphQL endpoint: https://canvas.uw.edu/api/graphql
- Gives us real Canvas assignment URLs so clicking rows opens Canvas
- Add session cookie input field in settings panel
- Fall back to iCal if GraphQL request fails
- Works for UW students who cannot use PATs

### Phase 4.2 — Onboarding setup guide
Build a proper guided onboarding that explains all three connection options
clearly to users who have no idea what iCal, REST API, or GraphQL means.

Structure:
- Onboarding welcome screen shows "Canvas Companion" branding
- Step: Choose your setup method — three cards:
  1. iCal Feed (Recommended for most) — works everywhere, no login needed
  2. API Token (Best experience) — works at schools that allow it, not UW
  3. Session Cookie (UW students) — works at UW, requires a few extra steps
- Each card has a short one-line description of what it is in plain english
- Each card has a "How to set this up" button that opens a separate guide page
- Guide pages explain step by step how to get the required credential:

  iCal guide steps:
  1. Log into Canvas
  2. Click Calendar in the left sidebar
  3. Scroll to the bottom and click Calendar Feed
  4. Copy the URL and paste it here

  API Token guide steps:
  1. Log into Canvas
  2. Click your profile picture → Settings
  3. Scroll to Approved Integrations
  4. Click New Access Token
  5. Give it a name like Canvas Companion
  6. Copy the token and paste it here
  Note: UW students — your school blocks this option, use Session Cookie instead

  Session Cookie guide steps:
  1. Log into Canvas in Chrome
  2. Press Cmd+Option+I to open Developer Tools
  3. Click the Network tab
  4. Click any page on Canvas
  5. Click any request in the list
  6. Click Headers → scroll to Request Headers
  7. Find the Cookie header and copy its entire value
  8. Paste it here
  Note: This expires when you log out of Canvas — you will need to re-paste it

- After completing setup, first sync runs and shows assignment count
- Guide pages use framer-motion slide animations matching the rest of the UI
- All text written in plain friendly language, no technical jargon

## Phase 5 — Shipping (PLANNED)
Goals:
- Polish and bug fixes pass
- Rename app display name to Canvas Companion everywhere in UI
- Code sign and notarize with Apple Developer ID for distribution
- Build universal binary (Apple Silicon + Intel) via electron-builder
- Write README explaining all three setup options for other students
- Optional open-source release on GitHub

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.