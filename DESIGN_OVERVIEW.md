# Todo App Design Overview

## Architecture
The application is a real-time collaborative Todo list built with SvelteKit and Firebase.

### Frontend
- **Framework**: SvelteKit
- **State Management**: A custom Redux-like store implemented using Svelte stores (`src/lib/store.ts`). It handles actions, state transitions, and real-time synchronization.
- **UI Components**: Svelte Material UI (SMUI) for a consistent Material Design look and feel.
- **Synchronization**: Uses Firebase Firestore's `onSnapshot` for real-time updates.
- **Offline Support**: IndexedDB is used to cache state locally, allowing for fast initial loads and offline availability.

### Backend
- **Database**: Firebase Firestore. Data is organized into `lists`, `actions`, and `users`.
- **Cloud Functions**: Used for background tasks like sending notifications and updating activity logs based on Firestore triggers.
- **Authentication**: Firebase Auth for user management.

### Mobile
- **Capacitor**: Used to package the web application as a native mobile app for Android and iOS.

## Testing
- **Unit/Integration**: Vitest for testing business logic and store transitions.
- **E2E**: Playwright for end-to-end testing, utilizing the Firebase Emulator for a consistent and isolated test environment.
