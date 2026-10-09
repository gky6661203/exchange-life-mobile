# 新时代版本答案

iOS 风格的个人生活网站，主题为 AI + 薄肌 + 炒股。针对 iPhone 提供底部导航、分组列表、弹出表单和 Three.js 立体卡包。

网站：[新时代版本答案](https://exchange-life-mobile-32328.gky666.chatgpt.site)

## 功能

- 今日总览：每日计划、当天课表、运动打卡和续费提醒。
- 每日计划：学习、投资观察与日常待办，完成后保留划线状态，可取消完成。
- 课表：保留原有周课表、学校节次、教室与教师，手机在表格内横向滑动。
- 地图打卡：收藏地点和地址、标记到访或取消打卡，打开 Apple 地图查看地点。
- 薄肌日历：选择日期，记录运动分钟和感受；一天一条打卡，不允许提前打卡。没有每周训练计划。
- 每日股票：台股为默认市场，支持美股、港股与 A 股、自选列表、每日走势、行情时间及来源。数据来自 Yahoo Finance，可能延迟；五分钟缓存，失败时明确显示缓存或无法获取，不生成模拟价格。
- 我的卡包：真实 Three.js 立体证件卡、拖动旋转、切换卡片、到期日期及私人图片；无 WebGL 时保留可用的列表。
- 订阅卡包：月／季／年续费周期、金额、币种和提前提醒，记录续费后推进日期。31 日等月末日期自动适应短月份，并在之后恢复原计费日。
- 续费通知：站内通知和可导出的重复 `.ics` 日程；在 iPhone 中通过邮件附件打开并添加至日历。修改或暂停订阅后需移除旧日程再导入。站内通知在打开网站和前台同步时更新，没有后台推送或邮件发送。
- 设置：姓名、时区、默认币种、全部资料及证件原件 JSON 导出。此前保存的资料保留，导出仍包含旧模块记录。

AI 仅保留为网站主题，没有 AI 工作台或内置聊天功能。首次注册不填入个人示范资料。

## 登录和存储

使用网站自己的 Email＋密码账号。密码至少 12 个字符，以加盐 scrypt 保存；会话使用 HttpOnly Cookie，最长 30 天。每个账号的数据和图片相互隔离。目前没有邮件验证或找回密码，请保存好密码。

Sites 版本使用 Cloudflare Worker、D1 和 R2。`.openai/hosting.json` 保留原项目身份，`worker/index.ts` 为生产 API。数据库迁移位于 `drizzle/`，包含行情缓存表。

开发与自行架设版本使用同一套 Worker API 的 SQLite 适配器，默认数据库为 `data/accounts.sqlite`；旧单人数据库不会被覆写。私人数据和 `/api` 不进入 PWA 离线缓存。需要网络才能载入或保存资料。

## 本地开发

需要 Node.js 24 以上：

```sh
npm ci
npm run dev
```

打开 http://localhost:5173 并注册账号。可复制 `.env.example` 为 `.env`。检查和构建：

```sh
npm run typecheck
npm test
npm run build
npm run build:sites
```

测试使用隔离数据库。正式 Sites 包还包括 `.openai/hosting.json` 和数据库迁移。

## iPhone

在 Safari 打开网站，点「分享」→「添加到主屏幕」。界面处理屏幕安全区域，并提供手机尺寸的底部导航与表单。页面小型 Three.js 对象按需渲染，离屏或隐藏时停止绘制，切换时释放 GPU 资源。

保留的 Capacitor iOS 项目需要在 Mac 上使用 Xcode。设置 `IOS_APP_URL=https://你的站点` 后执行 `npm run ios:sync`、`npm run ios:open`。Windows 无法签署或生成可安装的 `.ipa`；本轮没有验证原生容器或实体 iPhone。

## 自行部署

设置 `NODE_ENV=production`、`APP_ORIGIN=https://你的域名` 与持久化 `DATABASE_PATH`，运行 `npm ci`、`npm run build`、`npm start`，以 HTTPS 反向代理转发至 3001 端口。也可使用现有 Docker Compose。

数据库和图片需持久保存；不要删除数据卷。备份应使用 SQLite 在线备份或停止服务后一起备份数据库及 WAL／SHM 文件。JSON 导出用于查看和留存，目前没有 JSON 还原导入。
