import type { LanguageCode } from '@/i18n/languages';

type HomeCopy = { title: string; description: string; privacy: string; how: string; steps: string[]; guides: string; tutorial: string; guide: string; landing: string; pageTitles: string[]; };
export const HOME_TRANSLATIONS: Record<Exclude<LanguageCode, 'en'>, HomeCopy> = {
  es: {
    title: 'Convierte un archivo GPX en un vídeo de ruta en 3D',
    description: 'TrailReplay es una herramienta gratuita y de código abierto para corredores, ciclistas y senderistas. Importa una ruta GPX o KML, reprodúcela en un mapa 3D y exporta un vídeo con estadísticas, desnivel, fotos y anotaciones.',
    privacy: 'Las rutas se procesan en tu navegador: no necesitas cuenta, subida de archivos ni instalación.',
    how: 'Cómo funciona', steps: ['Importa uno o varios archivos GPX o KML.', 'Elige el mapa, el terreno 3D, la cámara y el estilo de la ruta.', 'Añade estadísticas, perfil de elevación, fotos y anotaciones.', 'Exporta un vídeo MP4 o WebM en formato horizontal, cuadrado o vertical.'],
    guides: 'Guías', tutorial: 'Cómo convertir un archivo GPX en vídeo', guide: 'Cómo importar una ruta', landing: 'Crear un vídeo de ruta', pageTitles: ['Cámara cinematográfica', 'Vídeos de rutas de Strava', 'Vídeos de rutas de Garmin', 'Animador GPX', 'Vídeos de rutas de ciclismo', 'Vídeos de rutas de carrera'],
  },
  ca: {
    title: 'Converteix un fitxer GPX en un vídeo de ruta en 3D',
    description: 'TrailReplay és una eina gratuïta i de codi obert per a corredors, ciclistes i excursionistes. Importa una ruta GPX o KML, reprodueix-la en un mapa 3D i exporta un vídeo amb estadístiques, desnivell, fotos i anotacions.',
    privacy: 'Les rutes es processen al navegador: no cal cap compte, pujada de fitxers ni instal·lació.',
    how: 'Com funciona', steps: ['Importa un o diversos fitxers GPX o KML.', 'Tria el mapa, el terreny 3D, la càmera i l’estil de la ruta.', 'Afegeix estadístiques, perfil d’elevació, fotos i anotacions.', 'Exporta un vídeo MP4 o WebM en format horitzontal, quadrat o vertical.'],
    guides: 'Guies', tutorial: 'Com convertir un fitxer GPX en vídeo', guide: 'Com importar una ruta', landing: 'Crea un vídeo de ruta', pageTitles: ['Càmera cinematogràfica', 'Vídeos de rutes de Strava', 'Vídeos de rutes de Garmin', 'Animador GPX', 'Vídeos de rutes de ciclisme', 'Vídeos de rutes de córrer'],
  },
  de: {
    title: 'Eine GPX-Datei in ein 3D-Routenvideo verwandeln',
    description: 'TrailReplay ist ein kostenloses Open-Source-Werkzeug für Laufende, Radfahrende und Wandernde. Importiere eine GPX- oder KML-Strecke, spiele sie auf einer 3D-Karte ab und exportiere ein Video mit Statistiken, Höhenprofil, Fotos und Anmerkungen.',
    privacy: 'Die Strecken werden lokal im Browser verarbeitet: kein Konto, kein Upload und keine Installation.',
    how: 'So funktioniert es', steps: ['Importiere eine oder mehrere GPX- oder KML-Dateien.', 'Wähle Karte, 3D-Gelände, Kamera und Streckenstil.', 'Füge Statistiken, Höhenprofil, Fotos und Anmerkungen hinzu.', 'Exportiere ein MP4- oder WebM-Video im Quer-, Quadrat- oder Hochformat.'],
    guides: 'Anleitungen', tutorial: 'Eine GPX-Datei in ein Video umwandeln', guide: 'Eine Route importieren', landing: 'Ein Routenvideo erstellen', pageTitles: ['Filmische Kamera', 'Strava-Routenvideos', 'Garmin-Routenvideos', 'GPX-Animator', 'Radroutenvideos', 'Laufstreckenvideos'],
  },
  fr: {
    title: 'Transformez un fichier GPX en vidéo de parcours 3D',
    description: 'TrailReplay est un outil gratuit et open source pour les coureurs, cyclistes et randonneurs. Importez un parcours GPX ou KML, animez-le sur une carte 3D et exportez une vidéo avec statistiques, dénivelé, photos et annotations.',
    privacy: 'Les parcours sont traités localement dans votre navigateur, sans compte, transfert de fichier ni installation.',
    how: 'Comment ça marche', steps: ['Importez un ou plusieurs fichiers GPX ou KML.', 'Choisissez la carte, le terrain 3D, la caméra et le style du parcours.', 'Ajoutez statistiques, profil altimétrique, photos et annotations.', 'Exportez une vidéo MP4 ou WebM au format paysage, carré ou vertical.'],
    guides: 'Guides', tutorial: 'Transformer un fichier GPX en vidéo', guide: 'Importer un parcours', landing: 'Créer une vidéo de parcours', pageTitles: ['Caméra cinématique', 'Vidéos de parcours Strava', 'Vidéos de parcours Garmin', 'Animation GPX', 'Vidéos de parcours cyclistes', 'Vidéos de parcours de course'],
  },
  'zh-TW': {
    title: '將 GPX 檔案轉換為 3D 路線影片',
    description: 'TrailReplay 是提供跑者、騎士與健行者使用的免費開源工具。匯入 GPX 或 KML 路線，在 3D 地圖上重播，並匯出包含統計數據、海拔、照片與標註的影片。',
    privacy: '路線會在瀏覽器中本機處理，不需要帳號、上傳檔案或安裝程式。',
    how: '使用方式', steps: ['匯入一個或多個 GPX 或 KML 檔案。', '選擇地圖、3D 地形、攝影機與路線樣式。', '加入統計數據、海拔圖、照片與標註。', '匯出橫向、方形或直向的 MP4 或 WebM 影片。'],
    guides: '使用指南', tutorial: '如何將 GPX 檔案轉成影片', guide: '如何匯入路線', landing: '製作路線影片', pageTitles: ['電影感攝影機', 'Strava 路線影片', 'Garmin 路線影片', 'GPX 路線動畫', '自行車路線影片', '跑步路線影片'],
  },
};
