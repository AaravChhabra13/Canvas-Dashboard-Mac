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

## Critical - do not touch these files ever
- vite.config.ts
- package.json (especially do not add or remove "type" field)
- tsconfig.json

## Current status
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- UW Canvas does NOT allow personal access tokens — REST API is blocked
- App uses iCal feed as primary data source permanently
- Phase 2.1 IN PROGRESS — Canvas GraphQL API using browser session cookie
- Phase 3 IN PROGRESS — polish and new features

## Known issues
- All assignments show including old overdue ones — needs filtering
- No course filter tabs
- UI is light mode only — needs full dark/light mode support

## Phase 2.1 — Canvas GraphQL API
- Use https://canvas.uw.edu/api/graphql with user's browser session cookie
- Fetch submission status, points possible, assignment type
- Fall back to iCal if GraphQL fails
- Add session cookie input field in settings panel

## Phase 3 features to build
1. Dark/light mode — respect system prefers-color-scheme everywhere
2. Manual mark as done — checkbox per row, persists in electron-store
3. Menu bar badge count — red for overdue, orange for due today, no badge if 0
4. Frosted glass panel — vibrancy: 'under-window' on dropdown BrowserWindow
5. Personal tasks — manual tasks with title and due date, stored locally
6. Course filter tabs — All tab + one tab per course at top of panel
7. Hide old overdue — collapse overdue items older than 3 days behind a toggle

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.