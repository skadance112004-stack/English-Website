# English Learning Application

A comprehensive full-stack English learning application built with React Router, Firebase, and Vite. This application features a robust teacher portal for course management, content generation using AI, and comprehensive student engagement tools.

## Features

- **Teacher Portal**: Create, manage, and publish language learning courses.
- **AI Content Generation**: Leverage Gemini AI to automatically generate reading passages, comprehension questions, and audio transcripts.
- **Azure TTS Integration**: Transform AI-generated or custom text into realistic neural text-to-speech audio.
- **Exercise Management**: Create reading, listening, speaking, and quiz exercises with a rich editor.
- **Course Dashboard**: Track student progress, aggregate stats, and monitor active courses.
- **Authentication**: Secure Google, Facebook, and Email/Password login flows with role-based access control.

## Technology Stack

- **Frontend**: React Router v7 (SSR), TypeScript, Vite
- **Backend/Database**: Firebase (Firestore, Storage, Authentication, Cloud Functions)
- **AI/Services**: Google Gemini API, Azure Cognitive Services (Text-to-Speech)

## Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn
- Firebase CLI (`npm install -g firebase-tools`)

### Installation
Install all root dependencies:
```bash
npm install
```

Install Cloud Functions dependencies:
```bash
cd functions
npm install
```

### Environment Configuration
Create a `.env` file in the root directory and add your Firebase configuration and API keys:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Development
Start the development server with Hot Module Replacement (HMR):
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

### Firebase Deployment
1. Ensure your functions are built:
   ```bash
   cd functions && npm run build
   ```
2. Deploy the entire application (Hosting, Functions, Firestore Rules, and Storage Rules):
   ```bash
   firebase deploy
   ```

### Validation
To run the typechecker across the project to ensure structural integrity:
```bash
npm run typecheck
```

## Architecture
- `app/`: React Router application source code.
- `app/routes/`: Route definitions and UI components.
- `app/models/`: Firebase data models and interaction logic.
- `app/service/`: Integration services (Gemini, TTS).
- `functions/src/`: Firebase Cloud Functions for backend logic (AI, TTS, processing).
- `public/`: Static assets.

---
*Built with ❤️ for global language learners.*
