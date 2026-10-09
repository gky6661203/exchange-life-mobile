# 驗證紀錄

更新日期：2026-09-07。

## 已確認

- `npm run build` 通過：TypeScript 檢查及 Vite 生產建置成功。
- `npm test` 通過：26 項測試，涵蓋權限、輸入驗證、資料持久化、歷史匯率換算、並行更新／刪除、時區及包含圖片的匯出。測試使用隔離資料庫。
- `npm audit`：0 個已知漏洞；Capacitor 的 Xcode 工具相依 UUID 已覆寫至修補版本。
- Chromium 實際操作通過：登入、記帳、待辦新增／勾選、證件圖片轉檔／上傳／查看、課程新增、地點收藏／打卡、雙向匯率換算、個人設定儲存與首頁快速記帳。
- 已檢查 390px 與 320px 手機視窗及 1440px 桌面視窗；窄螢幕課表可在容器內橫向滑動，頁面沒有整體橫向溢出。
- 瀏覽器 JSON 下載包含實際測試紀錄及 1 份證件原圖，不含密碼或登入憑證；交換總結輸出為 1 頁 A4 PDF，已渲染檢查。
- `npm run dev:server` 啟動成功；`npx cap sync ios` 完成網頁資源與 Swift Package Manager 同步。
- CodeGraph 已建立索引：33 個程式檔案。
- 已產生 Capacitor iOS 專案，採用 Swift Package Manager；網站網址透過 `IOS_APP_URL` 設定。
- `npm run build:sites` 通過；Cloudflare Worker、D1 migration、R2 綁定及 Sites 部署封裝已完成。
- Sites Worker 本機驗證通過：帳戶辨識、個人設定、清單新增、資料重新讀取與 JSON 匯出；390px 手機視窗可正常開啟及操作。

## 尚未完成的環境驗證

- 未在實體 iPhone Safari 或 WebKit 上驗證；螢幕適配、照片選取／拍照、分享、列印、加入主畫面仍需實機檢查。
- 未在 Mac／Xcode 上完成建置與簽署，尚未產生經驗證的 `.ipa`，未進行 TestFlight 或 App Store 發布。
- Sites 正式網址已部署，但仍需使用者在實體 iPhone 登入後完成相機／照片選取、加入主畫面與跨裝置同步驗收。

## 部署後驗收步驟

1. 在 iPhone Safari 登入 HTTPS 網站，再加入主畫面，確認可重新開啟並保持登入。
2. 填入個人設定，新增一筆記帳、一個清單項目、一堂課和一個地點，重新整理後確認資料仍在。
3. 上傳證件圖片，確認預覽、替換和刪除；在未登入的瀏覽器確認無法讀取受保護圖片。
4. 在第二台裝置登入相同網站，確認新增及修改會同步；中斷網路時確認介面提示，恢復連線後重新同步。
5. 匯出 JSON，確認包含紀錄與圖片；開啟交換總結，使用列印功能另存 PDF。
6. 重新啟動部署服務，確認原有資料保留，再驗證資料庫備份可還原至獨立測試環境。

以上步驟中的實體 iPhone、第二台裝置與備份還原仍待驗收；瀏覽器手機尺寸和本機 Sites Worker 流程已完成。

## 2026-10-09: accounts, iOS interface and Three.js wallet

- Added site-owned Email/password registration and login; shared password entry is removed from the active interface and API.
- Account security tests pass: normalized duplicate Email, salted password hashes, hashed Secure/HttpOnly sessions, logout/expiry, CSRF, failed-login limiting, and cross-account record/photo/export isolation.
- Confirmed registration (201), authenticated status, logout (204) and login (200) in the local Cloudflare workerd runtime using the deployment build and D1 migrations.
- Browser QA at 390×844 and 1440×1000: registration, wrong-password error, correct login, logout, Three.js canvas rendering, next-card selection and pointer rotation. No horizontal overflow on the mobile wallet.
- Card canvas pauses offscreen, respects reduced motion, caps device pixel ratio and disposes GPU resources. Accessible HTML card controls remain available without WebGL.
- Legacy Sites Email-owned records remain unchanged; an Email registration alone cannot claim them. Linking requires matching trusted Sites identity. The self-hosted account API uses a separate accounts.sqlite by default.
- Email verification and email password recovery are not provided. Physical iPhone/Safari and native Capacitor testing remain unverified.
