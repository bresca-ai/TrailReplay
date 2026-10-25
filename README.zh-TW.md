<p align="center">
  <img src="./docs/branding-assets/SVG/logohorizontalfondo.svg" alt="TrailReplay" width="520">
</p>

[English](./README.md) | **繁體中文（台灣）**

[![CI](https://github.com/bresca-ai/TrailReplay/actions/workflows/ci.yml/badge.svg)](https://github.com/bresca-ai/TrailReplay/actions/workflows/ci.yml)
[![授權：需標示來源](https://img.shields.io/badge/License-attribution%20required-yellow.svg)](./LICENSE)

# TrailReplay

TrailReplay 是在瀏覽器中使用的軌跡影片製作工具，適合跑步、騎自行車、健行與戶外活動。匯入 GPX、KML 或 FIT 後，即可在互動式 3D 地圖上重播路線，加入統計資訊、照片、影片片段與標註，再匯出影片或圖片。

主要程式位於 [`app/`](./app)，支援 **GPX 頭尾裁切**及 **正體中文（台灣）語系**。

線上應用程式：[trailreplay.com](https://trailreplay.com)。也可依下方說明在本機執行，或自行部署。

## 主要功能

- 匯入一份或多份 GPX、KML、FIT 檔案，在地圖上重播活動軌跡。
- 拖曳起訖把手，裁掉軌跡前段或後段，保留一段連續區間。
- 編排多條軌跡的順序與播放時間，並以交通路段連接旅程。
- 顯示距離、時間、配速、速度、心率、海拔及累積爬升等統計資訊。
- 加入照片、靜音影片片段、路線標註與地標。
- 比較多條軌跡，觀察不同活動者的配速與時間差異。
- 設定地圖樣式、3D 地形、海拔剖面圖及鏡頭關鍵影格。
- 製作影片封面、圖片，以及不同長寬比的重播影片。
- 儲存 `.replay` 專案，日後重新開啟並接續編輯。
- 使用英文、西班牙文、加泰隆尼亞文、德文、法文或正體中文（台灣）介面。

## 功能使用說明

### GPX 頭尾裁切

裁切會保留一段連續的原始記錄。例如，一條 08:00–12:00 的軌跡，可只保留 09:00–11:00 的區間。

1. 匯入軌跡，開啟「路線」分頁。
2. 點選該軌跡下方的「裁切軌跡」。英文介面的入口為 **Routes → Trim route**。
3. 拖曳左右把手調整起點與終點。地圖上的橘色路段會保留，灰色路段會移除；綠色與紅色標記分別代表新的起點與終點。
4. 確認保留的距離、時間與軌跡點數。
5. 選擇「下載 GPX」匯出選取區間，或「套用至軌跡」更新專案中的軌跡。

把手會吸附至原始記錄點，至少保留兩個連續的軌跡點，並保留這些點的時間戳記、海拔與已支援的感測資料。套用後會重新計算距離、爬升、下降與速度等統計資訊。具備完整且順序一致的時間資料時，時間軸會依實際記錄時間顯示；否則改用距離，若距離也無法使用，則依軌跡點順序選取。

**第一版的使用範圍：**

- 原始軌跡可在本次工作階段內透過「還原原始軌跡」恢復。
- 儲存的專案與下載的 GPX 僅包含目前的軌跡；關閉專案後，不會保留裁切前的還原資料。
- 專案若已有照片、影片、標註、比較軌跡、鏡頭關鍵影格或交通路段，可使用裁切預覽與 GPX 下載。若要直接套用或還原軌跡，請先移除這些內容，或在加入它們前先完成裁切，避免既有內容定位錯位。
- 下載裁切 GPX 不會覆寫你原本匯入的檔案。

### 正體中文（台灣）

在語言選單選擇 **「正體中文（台灣）」**，即可切換主介面、操作教學與 GPX 指南。路線頁下方的偏好設定與教學頁上方皆有語言選單。

- 使用「檔案、匯入、匯出、儲存、影片、軌跡點、關鍵影格」等台灣用語。
- 瀏覽器偏好語言為 `zh-TW` 或 `zh-Hant` 時，可自動選擇正體中文；手動選擇的語言會優先保留。
- 支援中文標註、封面標題換行，以及介面、地圖與匯出畫布的系統正體中文字型備援。
- 圖示搜尋支援山、水、帳篷等常用中文關鍵字，也可繼續使用英文搜尋。
- 語系設定與自行撰寫的中文標註可隨 `.replay` 專案儲存。

翻譯維護方式與用語表請參閱 [語系維護說明](./docs/internal/LOCALIZATION.md)。

## 建議操作流程

1. 選擇介面語言，再匯入活動檔案。
2. 視需要先裁切軌跡，再安排旅程順序與播放時間。
3. 設定路線樣式、地圖與鏡頭。
4. 加入照片、影片片段、地標與標註。
5. 預覽整段旅程，確認播放節奏與媒體出現時間。
6. 儲存專案，並匯出影片或圖片。

## 本機開發

建議使用 **Node.js 22**，與 CI 環境一致。在終端機執行：

```bash
git clone https://github.com/bresca-ai/TrailReplay.git
cd TrailReplay
npm --prefix app ci
npm run dev
```

啟動後，開啟終端機顯示的本機網址。

常用檢查與建置指令：

```bash
npm run lint
npm run test
npm run verify:release
npm --prefix app run build
npm run check:pages-assets
```

`npm run test` 會執行前端與 Pages Functions 的測試。正式建置輸出位於 `app/dist/`。建置完成後可執行 `npm run preview` 預覽。

若在 Windows PowerShell 遇到 `npm.ps1` 執行原則限制，可將上述指令中的 `npm` 改為 `npm.cmd`。

## 教學與示範

- [操作教學](https://trailreplay.com/tutorial.html)
- [GPX 下載指南](https://trailreplay.com/gpx-download-guide.html)
- [示範影片](https://trailreplay.com/tutorial.html#demo-videos)
- [儲存庫中的示範影片](./media/video/)

## 程式架構

| 目錄 | 用途 |
| --- | --- |
| `app/` | React、TypeScript、Vite 前端、說明頁與測試 |
| `functions/` | Cloudflare Pages Functions |
| `functions-lib/` | 伺服器端共用邏輯與測試 |
| `docs/internal/` | 功能實作與語系維護文件 |
| `docs/operations/` | 發布與維運說明 |
| `docs/branding-assets/` | 專案標誌與品牌素材 |
| `media/` | 文件與示範使用的媒體 |

地圖使用 MapLibre GL，狀態管理使用 Zustand，測試使用 Vitest 與 Testing Library。

## 作者與授權

[TrailReplay](https://github.com/bresca-ai/TrailReplay) 由 Bresca 製作。

本專案採用 [附來源標示要求的 MIT 授權](./LICENSE)。使用或修改時，請保留授權與著作權聲明，並依授權要求向終端使用者標示 TrailReplay 來源。

參與開發前請閱讀 [貢獻指南](./CONTRIBUTING.md)；安全性問題請依 [安全性政策](./SECURITY.md) 回報。部署與發布流程可參閱 [發布手冊](./docs/operations/release-runbook.md)。
