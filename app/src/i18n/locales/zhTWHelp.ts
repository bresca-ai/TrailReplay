import type { help as englishHelp } from './enHelp';
import type { LocaleMessages } from '../languages';

export const help = {
  agents: {
    eyebrow: 'AI 代理工具', title: '讓 AI 代理工具編排重播，你只要拖入資料夾。',
    description: '手動標記二十個補給站，或為十天的 GPX 排序並分配播放時間，往往需要反覆操作。你可以直接向 AI 代理工具描述需求，讓它在路線檔案旁建立一份編排設定，再將資料夾拖入這裡，交給地圖完成定位。',
    headerAction: '手動操作教學', stepLabel: '第 {number} 步', copy: '複製', copied: '已複製',
    steps: {
      ask: { title: '向代理工具說明需求', body: '用日常語言描述你要的內容，例如賽事網頁上的補給站、住宿的山屋或每天的順序。請它先閱讀 trailreplay.com/llms.txt，了解檔案格式。' },
      write: { title: '產生編排設定', body: '代理工具會在 GPX 旁儲存一份簡短的 JSON，以公里數描述位置，例如「6.5 公里處的補給站」。不必填入座標，應用程式會自行解析。' },
      drop: { title: '拖入資料夾', body: '同時選取編排設定與 GPX 檔案，拖入 TrailReplay。路線、順序、時間、地標與文字都會一起載入，隨時可以播放。' },
    },
    prompt: {
      badge: '複製這段內容', title: '給代理工具的指令', intro: '只要能閱讀網頁並寫入檔案的程式開發代理工具即可使用。以下指令足以產生可用的編排設定。', label: '提示詞',
      body: '請閱讀 https://trailreplay.com/llms.txt 及其中連結的格式規格，再依照我接下來的描述，為這個資料夾中的 GPX 檔案建立 recipe.json。不要自行計算座標，請以公里數定位，交由應用程式解析。設定影片匯出前，請先詢問我要不要在影片開頭顯示 1 秒的設計封面；等我回答後，再設定 includeCover。若我要使用照片封面，請在 photoSlots 中填入圖片檔名，並將圖片與編排設定放在一起。',
      note: '接著說明實際需求，例如賽事網頁上的補給站、住宿的山屋，或大爬升路段的文字說明。',
    },
    camera: {
      title: '使用與網站一致的鏡頭距離', description: '後方跟隨模式不直接使用地圖縮放值。編排設定與網站滑桿使用相同的距離刻度，0 是最遠視角，100 是最近視角。',
      table: { preset: '網站預設', value: '編排設定值', result: '效果' },
      presets: { far: { label: '遠', body: '後方跟隨模式的最廣視角。' }, medium: { label: '中', body: '均衡的預設視角。' }, close: { label: '近', body: '鏡頭更靠近標記。' }, veryClose: { label: '非常近', body: '後方跟隨模式的最近視角。' } },
      stopsLabel: '滑桿的有效刻度：', stopsBody: '0、11、22、33、49.5、66、83、100。數值越小越遠，越大越近。', rulesTitle: '代理工具應該填入哪個鏡頭設定？',
      rules: {
        preset: { title: '優先使用具名預設', body: '使用 followBehindPreset，填入 far、medium、close 或 very-close。匯入時會自動同步對應的數值刻度。' },
        level: { title: '需要精確刻度時才填入數值', body: '需要八個滑桿刻度之一時，可設定 followBehindZoomLevel。其他數值會吸附到最接近的有效刻度。' },
        zoom: { title: '區分兩種縮放尺度', body: 'cameraSettings.zoom 不是後方跟隨距離。自訂運鏡的關鍵影格使用 8–20 的地圖縮放值，匯入後須到「地圖與鏡頭」中設定。' },
      },
    },
    examples: {
      title: '適合交給代理工具的兩種工作', intro: '以下兩份編排設定皆可實際執行，而且完全不需要座標。',
      race: { badge: '有補給站的賽事', title: '將每個補給站放在正確的公里位置', problem: '賽事網頁以公里數列出補給站。手動設定得逐一在地圖上找位置、加入標註並填寫內容；代理工具可以讀取網頁，一次寫好全部設定。', result: '每個補給站會成為一張資訊卡，在跑者接近時浮現、通過後淡出，讓觀眾感受到沿途經過的站點。' },
      trip: { badge: '十天的旅行', title: '十個檔案，依序安排播放時間', problem: '十天健行會產生十份 GPX，要整理順序，還得決定每天在畫面上播放多久。若逐一手動設定，35 公里和 8 公里的一天可能被分配相同時間。', result: '依各檔案的時間戳記排序，按距離分配播放時間，再依每天結束與隔天開始的位置，標記每個住宿地點。' },
    },
    check: { badge: '核對編排結果', title: '你可以直接檢查代理工具的成果', body: '拖入資料夾後，TrailReplay 會列出所有定位項目：位於路線的第幾公里、在畫面上顯示幾秒，以及項目出現時與移動標記的距離。', note: '最後一項距離應該只有幾公尺。若距離過遠，代表出現時間對應到錯誤的路段，應用程式會在播放前提醒。' },
    sources: {
      badge: '取得檔案', title: '代理工具也能協助取得路線', intro: '開始前不一定要備妥 GPX。你可以請代理工具依序嘗試以下來源，前兩種不需要額外費用。',
      url: { label: '公開連結', body: '賽事主辦單位與社團常在網站提供 GPX。只要告知賽事名稱，代理工具通常就能找到檔案。' },
      folder: { label: '你已有的資料夾', body: '例如「下載」資料夾或旅行資料夾。代理工具可讀取現有檔案，依時間戳記整理每天的順序。' },
      export: { label: '你申請的資料備份', body: 'Strava 和 Garmin 可透過電子郵件提供完整活動紀錄，其中可能包含 GPX、FIT 與 TCX。TrailReplay 可讀取 GPX、KML 和 FIT，只有 TCX 需要先轉換。' },
      session: { label: '你自己的瀏覽器', body: '能操作瀏覽器的代理工具，可以在你已登入的頁面點選「匯出 GPX」。這適合少量活動，不適合一次處理數百筆。' },
      boundary: '代理工具不應要求你的密碼、繞過付費或隱私設定，也不應在登入後大量擷取資料。如果平台要求本人操作，它應告訴你要點選哪個按鈕。', guideLink: '各平台匯出步驟 →',
    },
    resources: { title: '提供給代理工具的資源', intro: '將這些連結交給代理工具即可。所有資訊都在同一個網站，不需安裝或註冊帳號。', llms: '入門入口：了解 TrailReplay，以及如何用編排設定取代手動點選。', spec: '完整編排格式、自動產生的項目，以及容易影響重播效果的錯誤。', example: '一份真實賽事從起點到終點的完整編排設定。' },
  },
  common: { backToApp: '返回應用程式', builtBy: '由 Bresca 製作', openApp: '開啟 TrailReplay', github: 'GitHub', builtForLabel: '適用情境', builtForValue: '有故事的路線', builtForBody: '在瀏覽器中完成匯入、樣式設定、敘事與匯出。', bestWithLabel: '建議使用', bestWithValue: '資料完整的 GPX', bestWithBody: '具備時間戳記與海拔的軌跡，能讓重播效果更完整。' },
  tutorial: {
    eyebrow: '操作教學', title: '跟著實際流程學會 TrailReplay', description: '這份指南介紹目前 TrailReplay 的操作流程：匯入軌跡、編排旅程、加入媒體、預覽匯出範圍，以及錄製完整的重播影片。', headerAction: 'GPX 指南', agentsAction: '代理工具指南', importRouteEyebrow: '匯入路線', importRouteTitle: '如何匯入路線', importRouteIntro: '選擇 Strava 或 Wikiloc，再依步驟將路線帶入 TrailReplay。',
    quickStart: { badge: '快速開始', step1: '開啟 TrailReplay，匯入範例賽事，或自己的 GPX、KML、FIT 檔案。', step2: '檢查側邊欄中的旅程順序，視需要加入交通路段。', step3: '設定地圖樣式、鏡頭、統計資訊、圖示及媒體出現時間。', step4: '完整播放路線，確認配速與照片出現時間。', step5: '開啟「製作輸出」，預覽裁切範圍並錄製成品影片。' },
    stravaImport: { title: '更快將 Strava 活動匯入 TrailReplay', body: '將 GPX 指南中的 TrailReplay 書籤加入書籤列。在 Strava 活動頁點選書籤，即可於新分頁開啟 TrailReplay，並直接將活動載入編輯器。', link: '設定 Strava 匯入書籤' },
    sampleRoutesBadge: '加泰隆尼亞範例路線', needGpxGuide: '需要先匯出自己的 GPX 嗎？', whyFilesTitle: '為什麼選擇這兩份檔案？', whyFilesBody: '它們適合測試第一次完整預覽時，最需要確認的功能。', bestFirstPassTitle: '建議先試的內容',
    caminsUseLabel: "Camins d'Her 適合測試", caminsUseBody: '地形對比、較大幅度的運鏡，以及山地路線上的統計資訊與匯出範圍是否平衡。', pedalsUseLabel: 'Pedals de Foc 適合測試', pedalsUseBody: '長距離配速、全程路線視角，以及點位密集的耐力活動 GPX 在重播和匯出時的效果。',
    camera: {
      title: '選擇適合的鏡頭', description: '每種模式都能呈現不同的路線特色。先從簡單模式開始，需要安排鏡頭時再切換至自訂運鏡。',
      modes: { overview: { title: '全景', body: '讓完整路線保持在畫面內。' }, follow: { title: '俯視跟隨', body: '以移動標記為畫面中心。' }, followBehind: { title: '後方跟隨', body: '以較低且傾斜的角度追隨路線。' }, cinematic: { title: '自訂運鏡', body: '沿時間軸設定鏡頭，並在各鏡頭之間平順移動。' } },
      videoLabel: '自訂運鏡教學影片', videoTitle: '使用自訂運鏡編排重播', videoDescription: '移到指定時間、調整視角、儲存關鍵影格，再重複操作。TrailReplay 會在播放時銜接鏡頭移動。', openVideo: '直接開啟影片',
    },
    elevation: {
      title: '海拔剖面圖的兩種用法', description: '預設顯示全程剖面圖。也可開啟動態路段，讓主要爬升與下降有更大的顯示空間。',
      default: { badge: '預設', title: '觀看完整路線', body: '標準剖面圖呈現全程海拔變化，移動標記與已完成區域會顯示目前的路線進度。' },
      dynamic: { badge: '選用', title: '聚焦主要地形', body: '動態路段會偵測持續爬升與下降，在剖面圖上標記，並在播放到該路段時平順放大。' },
      howToTitle: '開啟並調整動態路段', tips: { enable: { title: '開啟聚焦模式', body: '開啟「樣式」，啟用「海拔剖面圖」，再開啟「動態路段」。' }, play: { title: '自動聚焦', body: '按下播放，剖面圖便會從全程視角移入偵測到的爬升或下降路段，匯出影片也會保留相同效果。' }, edit: { title: '暫停後微調', body: '拖曳路段兩端的把手以調整範圍；使用 ＋ 並點選剖面圖可新增路段，使用 × 可移除。' } },
    },
    watchExportsTitle: '觀看實際匯出成果', watchExportsBody: '以下範例皆透過 TrailReplay 的匯出流程錄製。', coversTitle: 'TrailReplay 目前提供的功能', coversDescription: '側邊欄的六個面板對應主要功能。你可以依順序操作，也能直接跳到想調整的項目。', recommendedFirstRunTitle: '第一次使用建議',
    firstRun: { importLabel: '1. 匯入', importBody: '若想先熟悉介面，可使用其中一份範例 GPX。', styleLabel: '2. 樣式', styleBody: '錄製前，先在「樣式」、「媒體」及「地圖與鏡頭」中調整重播效果。', exportLabel: '3. 匯出', exportBody: '在「製作輸出」中預覽裁切框，確認統計資訊與媒體都位於錄製範圍內。' },
    videos: { pathExport: { title: '含統計資訊的路線影片', description: '完整的路線重播，包含即時統計、海拔與適合匯出的構圖。', downloadLabel: '下載路線匯出示範' }, comparison: { title: '比較模式示範', description: '同步播放兩份 GPX，比較配速、路線選擇與時間差異。', downloadLabel: '下載比較模式示範' }, aranLandmarks: { title: '含地標的 Aran by UTMB 路線', description: '以正方形影片呈現 Aran by UTMB 賽道沿途地點與路線標註。', downloadLabel: '下載 Aran by UTMB 示範' } },
    sampleTracks: { camins: { subtitle: '來自加泰隆尼亞代表性越野賽事的技術型山地超馬。', badge: '越野超馬', highlight: '適合測試高難度山地賽道的海拔、自訂運鏡與統計資訊構圖。' }, pedals: { subtitle: '經典庇里牛斯山越野自行車環線，也是加泰隆尼亞具代表性的耐力路線。', badge: '自行車旅行／越野自行車', highlight: '適合測試長距離配速、地圖樣式，以及內容豐富的路線匯出預覽。' } },
    features: {
      routes: { title: '路線', body: '匯入 GPX、KML、FIT、已儲存的 .replay 專案，或編排設定及其路線檔案。可重新命名、排序軌跡，並加入比較軌跡，同步重播多位運動者。' },
      timeline: { title: '時間軸', body: '設定重播總長度，使用實際配速或固定配速，調整活動順序與個別播放時間，並在路線之間加入交通路段。' },
      style: { title: '樣式', body: '設定路線顏色與名稱、心率分色、自訂顏色區間、即時統計、海拔剖面圖，以及移動標記的圖示、大小、顏色與光暈。' },
      mapCamera: { title: '地圖與鏡頭', body: '選擇底圖、歷史影像、地名、滑雪道、坡度與坡向圖層、3D 地形、地圖濾鏡、地標及四種鏡頭模式。' },
      media: { title: '媒體', body: '加入照片、靜音影片片段與路線標註。可使用內嵌的 GPS 或時間戳記定位，也能手動安排位置與出現時間。' },
      generate: { title: '製作輸出', body: '儲存可編輯的 .replay 專案，匯出圖片，或製作 16:9、4:5、1:1、9:16 影片。調整版面、畫質與影格率後，即可下載或分享。' },
    },
  },
  gpxGuide: {
    eyebrow: 'GPX 指南', title: '如何將 GPX 檔案帶入 TrailReplay', description: '使用一個書籤，將 Strava 活動或 Wikiloc 路線帶入 TrailReplay；也可依手動步驟，從這些網站及其他平台下載 GPX。', headerAction: '操作教學', goodGpxTitle: '什麼樣的 GPX 檔案效果較好？', beforeExportTitle: '匯出前先確認', beforeExportBody: '幾個簡單檢查，可避免常見的匯入問題。', fastPathBadge: '快速匯入', fastPathTitle: '已經有路線檔案了嗎？直接匯入吧', fastPathBody: 'GPX 若包含時間戳記與海拔資料，TrailReplay 的效果會更好。若檔案已具備這兩項資料，就能直接匯入，再參考操作教學調整呈現效果與匯出構圖。', openTutorial: '開啟操作教學', openProvider: '開啟 {provider}', notesLabel: '注意事項', otherPlatformsTitle: '其他平台', otherPlatformsBody: '各平台的名稱可能不同，但流程通常相近：開啟活動、選擇匯出，再選 GPX。', nextStepTitle: '下一步', nextStepBody: '將路線匯入 TrailReplay 後，檢查旅程內容，再依操作教學完成第一次匯出。',
    beforeCards: { chooseGpxLabel: '支援 GPX、FIT 與 KML', chooseGpxBody: 'GPX、KML 和 FIT 都能直接匯入，只有 TCX 需要先轉換格式。', keepTimestampsLabel: '保留時間戳記', keepTimestampsBody: '時間資料完整的 GPX，能更準確呈現配速、活動時間與旅程節奏。', fullActivityLabel: '優先匯出完整活動', fullActivityBody: '只有路線的 GPX 也能使用，但實際記錄的活動通常包含更完整的時間與海拔資料。', checkPrivacyLabel: '先確認隱私設定', checkPrivacyBody: '若要匯出公開活動，請先確認分享設定，再下載或發布重播內容。' },
    importer: {
      title: '一個書籤，同時支援 Strava 與 Wikiloc', description: '只要儲存一次「傳送至 TrailReplay」書籤，它就能辨識目前網站，並在新的 TrailReplay 分頁載入路線。', intro: '同一個書籤可用於 Strava 活動或 Wikiloc 路線。選擇「自動書籤」來儲存書籤，或選擇「手動下載 GPX」查看各平台步驟。', automaticTab: '自動書籤', manualTab: '手動下載 GPX', manualIntro: '選擇路線所在的平台，再依步驟下載。',
      steps: { install: { title: '儲存匯入書籤', body: '選擇上方任一設定方式。若已有舊版 Strava 或 Wikiloc 匯入書籤，請用新版取代。' }, openPage: { title: '開啟路線', body: '在電腦版瀏覽器開啟 Strava 活動或 Wikiloc 路線，並等待地圖載入完成。Strava 需要登入，Wikiloc 不需要。' }, clickBookmark: { title: '點選「傳送至 TrailReplay」', body: '從書籤列或瀏覽器書籤選單中選取已儲存的書籤，即可在新分頁開啟 TrailReplay 並載入路線。' }, useRoute: { title: '開始編輯', body: '檢查匯入的路線，加入故事與鏡頭移動，再匯出影片。' } },
      privacyNote: '書籤會在瀏覽器中讀取路線，並在分頁之間傳遞 GPX。TrailReplay 不會將它上傳至我們的伺服器。', videoTitle: '觀看：從 Strava 或 Wikiloc 匯入', videoDescription: '示範如何儲存書籤並在兩個網站使用。影片附英文字幕，完整顯示於畫面時會自動靜音播放，可透過控制項開啟聲音。', requirements: '請使用電腦版瀏覽器，並允許開啟新的 TrailReplay 分頁。Strava 需要登入且有權存取該活動；Wikiloc 只需等待地圖載入，不必登入。',
      barSetupTitle: '使用書籤列時', barSetupBody: '將上方橘色的「傳送至 TrailReplay」按鈕拖曳至書籤列。儲存後可再次隱藏書籤列。', barShortcut: '在 Chrome 顯示或隱藏書籤列：Mac 使用 ⌘＋Shift＋B；Windows／Linux 使用 Ctrl＋Shift＋B。', hiddenSetupTitle: '習慣隱藏書籤列時', hiddenSetupBody: '點選上方的「複製書籤程式碼」。在 Chrome 開啟「書籤和清單 → 書籤管理員」，選擇「⋮ → 新增書籤」，將名稱設為「傳送至 TrailReplay」，並把程式碼貼入網址欄位。', hiddenUseBody: '在 Strava 或 Wikiloc 路線頁中，開啟 Chrome 的「書籤和清單 → 顯示所有書籤」，找到並選取已儲存的書籤。', copyButton: '複製書籤程式碼', copyHint: '將橘色按鈕拖曳至書籤列以儲存，或複製程式碼，自行建立書籤。', copied: '已複製程式碼，請貼入新書籤的網址欄位。', bottomCta: '已儲存書籤？請開啟 Strava 活動或 Wikiloc 路線，再點選書籤。', button: '傳送至 TrailReplay', dragLabel: '將「傳送至 TrailReplay」拖曳至書籤列以儲存',
    },
    providers: {
      wikiloc: {
        subtitle: '由社群分享的戶外路線', step1: '開啟想匯入的 Wikiloc 路線頁，不需要開啟個人檔案。', step2: '點選路線頁右上角的「Download」（下載）。', step3: '選擇「File」（檔案），格式選 GPX，再選「Original」（原始）以保留完整軌跡。也可視需要包含航點。', step4: '下載 GPX 檔案後，將它匯入 TrailReplay。', note1: '選擇原始軌跡，可保留最多軌跡點。', note2: '可供下載的 Wikiloc 路線會提供 GPX 或 TCX，請選擇原始軌跡以保留最多軌跡點。',
        bookmarklet: {
          walkthroughLabel: '匯入 Wikiloc 路線', walkthroughTitle: '將 Wikiloc 路線帶入 TrailReplay', manualTab: '手動', automaticTab: '自動', walkthroughIntro: '儲存一次書籤後，開啟 Wikiloc 路線並點選書籤，即可在新的 TrailReplay 分頁載入地圖上的路線。',
          steps: { install: { title: '加入匯入書籤', body: '將下方橘色的「TrailReplay Wikiloc 匯入工具」拖曳至書籤列。直接點選可複製程式碼，供手動設定。' }, openTrail: { title: '在 Wikiloc 開啟路線', body: '使用電腦版瀏覽器開啟想重播的路線頁，並等待地圖載入完成。' }, clickBookmark: { title: '點選已儲存的書籤', body: '書籤會讀取 Wikiloc 地圖上顯示的路線，並在新的 TrailReplay 分頁開啟，隨即可以編輯。' }, useRoute: { title: '開始製作重播', body: 'TrailReplay 會自動匯入路線。加入故事、鏡頭移動與媒體，再匯出影片。' } },
          privacyNote: '書籤會讀取 Wikiloc 頁面上已有的路線，在瀏覽器中轉成 GPX，再傳給 TrailReplay，不會向 Wikiloc 要求下載檔案。', videoPlaceholder: '教學影片即將推出', videoTitle: '觀看：將 Wikiloc 路線匯入 TrailReplay', videoDescription: '了解如何儲存書籤，並直接在 TrailReplay 開啟 Wikiloc 路線。', requirements: '請使用電腦版瀏覽器，等待 Wikiloc 地圖載入，並允許 Wikiloc 開啟 TrailReplay 分頁。', copyHint: '將此按鈕拖曳至書籤列。若已有舊版 Wikiloc 匯入書籤，請用新版取代。直接點選可複製程式碼，供手動設定。', copied: '已複製程式碼。請建立書籤、編輯網址，再貼上程式碼。', bottomCta: '已儲存書籤？請開啟 Wikiloc 路線，再點選書籤以匯入。', button: 'TrailReplay Wikiloc 匯入工具', dragLabel: '將「TrailReplay Wikiloc 匯入工具」拖曳至書籤列以儲存', invalidGpx: 'Wikiloc 未回傳 GPX 檔案，請確認這條路線可供下載，或改用手動下載 GPX。', simplifiedFallback: 'Wikiloc 回傳了簡化軌跡（最多 500 個點）。若要完整軌跡，請依序選擇「手動 → Download → File → GPX → Original」。',
        },
      },
      strava: {
        subtitle: '跑步、騎乘、健行等活動紀錄', step1: '登入 strava.com，並開啟想匯出的活動。', step2: '開啟右上方的三點活動選單。', step3: '選擇「Export GPX」（匯出 GPX），或選「Export Original」（匯出原始檔）取得手錶的原始記錄。', step4: '將下載的 GPX 檔案匯入 TrailReplay。', note1: '「匯出原始檔」會取得手錶記錄的檔案，通常是 .fit。TrailReplay 可直接讀取，包含每個點的時間戳記，以及心率、步頻／踏頻、功率與溫度。活動的「匯出 GPX」通常也會保留這些資料。', note2: '部分公開活動可匯出，實際情況取決於隱私設定。',
        bookmarklet: {
          title: '將 Strava 活動直接傳送至 TrailReplay', description: '將這個按鈕拖曳至瀏覽器書籤列。開啟 Strava 活動後，點選已儲存的書籤，TrailReplay 就會在新分頁開啟，並自動將 GPX 載入編輯器。', walkthroughLabel: '一鍵匯入 Strava', manualTab: '手動', automaticTab: '自動', walkthroughTitle: '從 Strava 活動到 TrailReplay 專案', walkthroughIntro: '只需加入一次書籤，之後點選一下，就能將 Strava 活動 GPX 傳入 TrailReplay，直接開始編輯。',
          steps: { install: { title: '加入匯入書籤', body: '將下方橘色的「TrailReplay Strava 匯入工具」拖曳至書籤列。直接點選可複製程式碼，供手動設定。' }, openActivity: { title: '在 Strava 開啟活動', body: '在同一個電腦版瀏覽器登入 Strava，並開啟想重播的活動。' }, clickBookmark: { title: '點選已儲存的書籤', body: 'Strava 會在新分頁開啟 TrailReplay。若 Chrome 封鎖彈出視窗，請允許 Strava 開啟視窗，再點選一次書籤。' }, useRoute: { title: '開始編輯', body: 'TrailReplay 會自動匯入 GPX。確認路線後，加入統計資訊或運鏡，再匯出影片。' } },
          privacyNote: '書籤使用你現有的 Strava 登入狀態。GPX 會在瀏覽器分頁間傳遞，並在本機解析，TrailReplay 不會將它上傳。', videoPlaceholder: '教學影片即將推出', videoTitle: '觀看：將 Strava 活動傳入 TrailReplay', videoDescription: '了解如何找到並使用活動匯入書籤，以及路線在 TrailReplay 開啟後的操作。', requirements: '需要電腦版瀏覽器、已登入 Strava、具備活動匯出權限，並允許 Strava 開啟彈出視窗。此方式不適用於 Strava 手機應用程式。', copyHint: '將此按鈕拖曳至書籤列以儲存。直接點選可複製程式碼；接著建立書籤、編輯網址，再貼上程式碼。', copied: '已複製程式碼。請建立書籤、編輯網址，再貼上程式碼。', bottomCta: '已儲存書籤？請開啟 Strava 活動，再點選書籤以匯入路線。', button: 'TrailReplay Strava 匯入工具', dragLabel: '將「TrailReplay Strava 匯入工具」拖曳至書籤列以儲存', note: '僅支援電腦版瀏覽器。你必須已登入 Strava，且有權匯出活動。TrailReplay 會在瀏覽器中解析 GPX，不會上傳至我們的伺服器。', invalidGpx: 'Strava 未回傳有效的 GPX。請確認你可以匯出這個活動，或改用一般的 GPX 下載方式。',
        },
      },
    },
    otherProviders: { garmin: '在網頁控制台開啟活動詳細資料後，匯出已完成的活動。', polar: '在訓練紀錄詳細頁尋找匯出或下載選項。', runkeeper: '使用網頁介面或帳號工具，將活動軌跡匯出為 GPX。', alltrails: '路線頁通常會提供步道路線及活動紀錄的 GPX 下載。', appleHealth: '原始應用程式若不提供 GPX，可使用第三方匯出工具。', googleFit: '無法直接匯出 GPX 時，可使用 Google Takeout 或已連結的來源應用程式。' },
    tips: { tip1: '軌跡點越多，動畫通常越平順。', tip2: '時間戳記能協助 TrailReplay 呈現符合實際的時間與配速。', tip3: '海拔資料可改善配合地形的運鏡與剖面圖效果。', tip4: '沒有時間戳記的 GPX 是路線資料，無法依時間與其他人的活動同步。建議改用「匯出原始檔」。' },
  },
} as const satisfies LocaleMessages<typeof englishHelp>;
