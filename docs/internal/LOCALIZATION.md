# Interface localization

Supported language codes live in `app/src/i18n/languages.ts`. Both application settings and the translation registry use this type. Add a locale to the registry and language labels in `translations.ts`; the editor and help-page selectors populate automatically.

The Taiwan locale is `zh-TW`, displayed as **正體中文（台灣）**. `zhTW.ts` contains editor messages, while `zhTWHelp.ts` contains tutorials and GPX download guidance. Both use `LocaleMessages` to require the complete English key structure at compile time. Keep these translations independent of the English fallback so omissions fail checks.

Use Taiwanese wording consistently:

| Concept | Preferred wording |
| --- | --- |
| File / save | 檔案／儲存 |
| Import / export | 匯入／匯出 |
| Video / image / frame | 影片／圖片／影格 |
| Route / recorded track / point | 路線／軌跡／軌跡點 |
| Timeline / trim | 時間軸／裁切 |
| Elevation / ascent / descent | 海拔／爬升／下降 |
| Annotation / keyframe | 標註／關鍵影格 |
| Settings / default / load | 設定／預設／載入 |

Preserve brands, filenames, file formats, code identifiers, units, and interpolation tokens such as `{count}` and `{{count}}`. Translate instructions around external platform menu labels while retaining the original label when it helps users find the control.

An explicit saved language wins over browser preferences. Browser tags `zh-TW` and `zh-Hant` (including script subtags) select Taiwan Chinese; generic `zh` and explicit Simplified Chinese tags do not. Regional versions of existing European languages still match their base language.

System Traditional Chinese fonts back the interface, canvas exports, and MapLibre ideographs. Chinese map cards and cover titles wrap without requiring spaces. Common outdoor icon search terms are in `components/annotations/pinheadTerms/zh-TW.json`; English icon queries continue to work.

Run `npm --prefix app run test:run` and `npm --prefix app run build` after changing messages. Translation tests check key parity, interpolation tokens, accidental English copy in the Taiwan locale, and language selection. Component tests cover switching languages, while layout and project tests cover Chinese wrapping and saved-project round trips.
