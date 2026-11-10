import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/App';
import App from './App';
import ErrorBoundary, { reloadOnce } from './components/ErrorBoundary';
import './styles.css';
import './home.css';
import './boutique.css';
import './nav.css';

addEventListener('vite:preloadError', e => { if (reloadOnce()) e.preventDefault() }); // a page chunk missing after a release: reload once

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider><App /></AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
