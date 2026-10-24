import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/App';
import App from './App';
import './styles.css';
import './home.css';
import './boutique.css';
import './nav.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider><App /></AppProvider>
    </BrowserRouter>
  </StrictMode>
);
