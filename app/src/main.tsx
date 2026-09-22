import { startProductAnalytics } from '@/utils/productAnalytics'
import { useAppStore } from '@/store/useAppStore'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from '@/utils/analytics'
import { startWebVitalsTracking } from '@/utils/performance'

void initAnalytics({ page_type: 'app', page_group: 'product' });
void startWebVitalsTracking();
const stopProductAnalytics = startProductAnalytics(useAppStore);
if (import.meta.hot) import.meta.hot.dispose(stopProductAnalytics);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
