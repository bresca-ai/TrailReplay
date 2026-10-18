import { createRoot } from 'react-dom/client';
import { GpxDownloadGuidePage } from './GpxDownloadGuidePage';
import '../index.css';
import { captureLeadAttribution, initAnalytics } from '@/utils/analytics';
import { startWebVitalsTracking } from '@/utils/performance';

void initAnalytics({ page_type: 'gpx_guide', page_group: 'help' });
void captureLeadAttribution();
void startWebVitalsTracking('gpx_guide');

createRoot(document.getElementById('root')!).render(<GpxDownloadGuidePage />);
