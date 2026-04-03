import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getFirebaseApp } from './services/firebase';

if (import.meta.env.VITE_FIREBASE_PROJECT_ID) {
  getFirebaseApp();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);