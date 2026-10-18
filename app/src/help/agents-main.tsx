import { createRoot } from 'react-dom/client';
import { AgentsPage } from './AgentsPage';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';

void initAnalytics({ page_type: 'agents', page_group: 'help' });
void captureLeadAttribution();
void startWebVitalsTracking('agents');

createRoot(document.getElementById('root')!).render(<AgentsPage />);
