# 交換生活 Exchange life

適合 iPhone 使用的私人交換生生活手帳，依需求文件製作繁體中文介面。包含響應式網頁、可加入主畫面的 PWA，以及已產生的 Capacitor iOS 專案。首次使用為空白資料，由你填入自己的交換資訊。

## 已實作功能

| 模組 | 用途 |
| --- | --- |
| 生活總覽 | 交換進度、近期課程、待辦事項與花費摘要 |
| 記帳預算 | 花費紀錄、分類、預算與歷史匯率換算 |
| 證件夾 | 證件資訊、到期日、圖片上傳與查看 |
| 生活清單 | 整理行前與日常待辦、標記完成狀態 |
| 我的課表 | 課程、上課時間與地點管理 |
| 匯率換算 | 參考匯率、近期走勢與換匯紀錄 |
| 地點收藏 | 收藏地址、分類與開啟地圖 |

另有個人設定、交換總結列印／另存 PDF，以及包含所有個人紀錄和證件圖片的 JSON 匯出。此版本未提供 JSON 還原匯入；證件欄位需手動輸入，尚未串接自動 OCR。

## 在電腦啟動

需要 **Node.js 24 以上版本**。在專案目錄執行：

```sh
npm ci
```

將 `.env.example` 複製為 `.env`，接著執行：

```sh
npm run dev
```

在這台電腦開啟 [http://localhost:5173](http://localhost:5173)，設定 12–256 個字元的私人密碼，再到「個人設定」填入姓名、學校、交換日期、時區、基準幣別及預算。預設不提供任何個人示範資料。

這是單人私人帳號，登入最長保持 30 天。首次密碼設定僅開放本機 localhost；也可預先在 `.env` 設定 `APP_PASSWORD`。已有花費紀錄後不能直接更換基準幣別，以免統計混用不同貨幣。

開發伺服器已監聽區域網路。先在電腦完成密碼設定，再讓 iPhone 與電腦連上相同 Wi-Fi，以 `http://電腦的區域網路IP:5173` 預覽；Windows 防火牆需允許 Node.js 接受私人網路連線。區域網路 HTTP 僅供開發預覽，安裝 PWA 和正式使用請使用 HTTPS 網址。

## 在 iPhone 使用

### Safari 加入主畫面

Sites 版本部署於 [交換生活](https://exchange-life-mobile-32328.gky666.chatgpt.site)。在 iPhone Safari 登入網站後，點「分享」→「加入主畫面」，即可從主畫面開啟手帳。網站目前為擁有者私人存取，請使用建立此網站的 OpenAI 帳戶登入。

多裝置使用同一網站與私人密碼，資料儲存在伺服器並同步；網頁會在回到前景或定期檢查時更新資料，也可點擊同步按鈕。此版本需要網路連線儲存和載入資料，不會把私人紀錄或證件圖片存入離線快取。

### Capacitor 個人 iOS 容器

專案包含 `ios/App/App.xcodeproj` 和 Swift Package Manager 配置。依 [Capacitor iOS 文件](https://capacitorjs.com/docs/ios)，需在 **Mac 上使用 Xcode 26 以上版本**，支援 **iOS 15 以上版本**。

1. 先完成 HTTPS 網站部署，並在 Mac 的 `.env` 設定 `IOS_APP_URL=https://你的網站網域`，只填 HTTPS 來源網址，不帶子路徑。
2. 在 Mac 的專案目錄執行：

   ```sh
   npm ci
   npm run ios:sync
   npm run ios:open
   ```

3. 在 Xcode 選擇 App target，設定自己的 Signing Team 與唯一的 Bundle Identifier，選取已連接的 iPhone 後執行。

`ios:sync` 會先建置網頁，再同步原生專案。原生容器透過 `server.url` 載入指定的 HTTPS 網站，使登入、API 和受保護圖片維持同一來源；本配置用於開發及個人預覽，尚未完成 App Store 上架方案與審核驗證。Windows 可以開發及產生專案檔，不能完成 Xcode 編譯、簽署或輸出可安裝的 `.ipa`。

## 部署與持久化

正式 Sites 版本使用 Cloudflare D1 保存各帳戶的手帳資料，並用 R2 保存受保護的證件圖片；每位登入者的資料以帳戶分隔。部署設定在 `.openai/hosting.json`，Worker 入口在 `worker/index.ts`，可用 `npm run build:sites` 產生 Sites 部署成品。

以下 Docker／Node.js 步驟保留給自行架設版本：

使用 Docker Compose 時，在 `.env` 填入：

```dotenv
APP_PASSWORD=請替換為自己的至少12字元強密碼
APP_ORIGIN=https://你的網站網域
```

執行：

```sh
docker compose up -d --build
```

應用程式在主機 `127.0.0.1:3001` 提供網頁與 API。由 HTTPS 反向代理轉送到此位址，公開網址需與 `APP_ORIGIN` 一致。Compose 使用 `exchange-data` volume 保存資料庫，請保留此 volume；`docker compose down -v` 會刪除資料。

也可在 Node.js 24 伺服器設定 `NODE_ENV=production`、`APP_PASSWORD`、`APP_ORIGIN` 和持久化的 `DATABASE_PATH`，再執行 `npm ci`、`npm run build`、`npm start`。生產模式會同時提供 `dist/` 網頁與 `/api`。

資料庫採用 **SQLite**，是針對單人服務對需求文件中 MySQL 建議的實作調整。部署只運行一個應用實例，資料目錄必須持久保存，不適用臨時檔案系統或各自使用不同資料庫的多副本部署。圖片也保存在資料庫中。日常可從設定匯出 JSON；完整可還原備份請使用 SQLite 線上備份功能，或停止服務後一起備份資料庫及其 WAL／SHM 檔案。

匯率來源為 [Frankfurter](https://frankfurter.dev/) 的參考匯率，可能使用最近一個交易日的資料；跨幣別記帳使用支出日期的歷史匯率，服務不可用或資料過舊時會阻止儲存，避免把不確定換算計入總額。

## 開發與驗證

技術組合：React 19、TypeScript、Vite、Tailwind CSS、Hono、Node.js 24、SQLite、Capacitor 8。

```sh
npm run typecheck
npm test
npm run build
```

測試使用隔離資料庫，不會把測試資料寫入日常手帳。驗證結果及尚待實機檢查的項目見 [docs/verification.md](docs/verification.md)，API、登入與資料保存細節見 [server/README.md](server/README.md)。
