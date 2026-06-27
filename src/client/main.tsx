import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';
import { App } from './App.js';
import { AndroidApp } from './runtime/AndroidApp.js';
import { detectRuntimeTarget } from './runtime/runtime-target.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {detectRuntimeTarget() === 'android' ? <AndroidApp /> : <App />}
  </StrictMode>,
);
