# PRD - Cooperativa Turni

## Overview
Italian rescue cooperative shift management mobile app for 16 members across 3 roles.

## Members & Roles
- **Autisti** (5): Marco Rossi, Luca Bianchi, Giuseppe Verdi, Andrea Ferrari, Paolo Romano
- **Capoturno** (5): Stefano Conti (ADMIN), Francesco Esposito, Roberto Galli, Antonio Marini, Davide Ricci
- **Soccorritori** (6): Maria Russo, Giulia Costa, Sara Greco, Elena Bruno, Chiara Moretti, Anna Lombardi

## Shift Types
- **Mattina**: 08:00 - 14:00 (6h)
- **Pomeriggio**: 14:00 - 20:00 (6h)
- **Notte/Trasporti**: 20:00 - 08:00 (12h)

Each shift contains: 1 Autista + 1 Capoturno + 1 Soccorritore (3 people per shift, 9 assignments/day).

## Authentication
- Personal 4-6 digit PIN for every operator.
- Salted PBKDF2 hash on the backend; PINs are never stored in clear text.
- Bearer sessions expire after 30 days and are stored in the native secure store when available.
- Administrative mutations are enforced by the backend, not only hidden in the UI.

## Core Features
1. **User selector** (index): grid of 16 users grouped by role
2. **Home tab**: today's shift, today's team, upcoming shifts, notifications
3. **Calendar tab**: monthly view, prev/next navigation, "Tutti"/"I miei" filter, CSV export
4. **Swaps tab**: Ricevute/Inviate, accept/reject, new swap form (same role only)
5. **Profile tab**: yearly stats (shifts, hours, holidays worked), admin panel, leave requests, notifications
6. **Day detail**: 3 shift blocks with members, swap/delete actions
7. **Admin features**: auto-generate shifts (fair rotation + holiday fairness), manual create/delete, approve leaves

## Italian Holidays Tracked
Capodanno, Epifania, Liberazione, Lavoratori, Repubblica, Ferragosto, Ognissanti, Immacolata, Natale, Santo Stefano. Rotation: users who worked a holiday get priority not to work it the following year.

## Tech Stack
- **Backend**: FastAPI + MongoDB (motor), routes prefixed `/api`
- **Frontend**: Expo Router (file-based), React Native, AsyncStorage
- **Design**: Light theme, yellow (#FACC15) primary + black secondary, color-coded shifts (yellow/orange/black)

## Data Pre-seeded
- Users are created through the first-run setup wizard; no demo users are inserted automatically.
- Shifts are created manually or generated month by month by the administrator.
