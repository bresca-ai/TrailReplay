import { createRoot } from 'react-dom/client';
import '../index.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import { ReleasePage } from './ReleasePage';

createRoot(document.getElementById('root')!).render(<ReleasePage />);
