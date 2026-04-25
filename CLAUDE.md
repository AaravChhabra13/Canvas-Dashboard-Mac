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
- App uses iCal feed as primary data source
- iCal feed does not provide Canvas assignment URLs — clicking assignments
  does not open Canvas yet, this is fixed in Phase 4
- electron-store always needs a name field: new Store({ name: 'app-store' })
- Always fix bugs in source files in electron/ and src/ only
- Tailwind v4 syntax: use @import "tailwindcss" not @tailwind directives
- postcss.config.js must use @tailwindcss/postcss as the plugin

## Completed phases
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- Phase 3 COMPLETE — dark/light mode, mark as done, menu bar badge,
  frosted glass, personal tasks, course filter tabs, hide old overdue
- Phase 3.1 COMPLETE — full liquid glass UI/UX upgrade, aurora background,
  animated assignment rows, course color coding, overdue/today color labels,
  clear overdue button, settings as animated page, course drill-down

## Phase 4 — Authentication and moving off VS Code (PLANNED)
Goals:
- Implement Canvas GraphQL API using browser session cookie
  (UW blocks PAT tokens so session cookie is the only option)
- GraphQL endpoint: https://canvas.uw.edu/api/graphql
- This gives us real Canvas assignment URLs so clicking rows opens Canvas
- Add session cookie input field in settings panel
- Fall back to iCal if GraphQL request fails
- Get the app running as a standalone .app outside of VS Code
  (unsigned build via electron-builder for personal use)
- Right-click tray icon to quit instead of closing terminal

## Phase 5 — Shipping (PLANNED)
Goals:
- Polish and bug fixes pass
- Code sign and notarize with Apple Developer ID for distribution
- Build universal binary (Apple Silicon + Intel) via electron-builder
- Write README for other UW students
- Optional open-source release on GitHub

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.