import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { OverlayProvider } from './ui/overlay';
import { initRipple } from './ui/ripple';
import './styles/global.css';

initRipple();

// HashRouter: works on GitHub Pages (static hosting) without server-side rewrites.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <OverlayProvider>
        <AuthProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthProvider>
      </OverlayProvider>
    </ThemeProvider>
  </StrictMode>,
);
