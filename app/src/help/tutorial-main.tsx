import { createRoot } from 'react-dom/client';
import { TutorialPage } from './TutorialPage';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';

void initAnalytics({ page_type: 'tutorial', page_group: 'help' });
void captureLeadAttribution();
void startWebVitalsTracking('tutorial');

createRoot(document.getElementById('root')!).render(<TutorialPage />);
