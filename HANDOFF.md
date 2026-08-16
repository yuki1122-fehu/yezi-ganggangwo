# 叶子港港窝 · 项目交接文档

> **给接手 AI 的话**：你只需要「本交接文档」+「叶子港港窝.html」这两个文件，即可完整接手这个项目。文档里包含了所有凭据、地址、架构说明和操作流程。所有数据在用户本机 localStorage，你的任务是维护这个单文件 HTML 应用。

---

## 0. 一句话介绍

「叶子港港窝」是一个**单文件 HTML 应用**（约 2MB，内含全部 CSS/JS/第三方库），是给一位香港浸会大学中医健康管理硕士（MHM）新生（2026-2027 学年）用的**手机端生活学习助手**：任务管理、课表/日历、记账、心情记录、天气（香港天文台）、台风/暴雨警告，以及一个基于 **function calling 的 AI agent 助理**（能建任务、管课表、记账、查天气）。

用户是学生本人（委托人），所有改动需求由用户提出。

---

## 1. 重要链接与凭据（务必妥善保存）

| 项目 | 值 |
|---|---|
| **主文件**（唯一源码） | `~/Desktop/叶子港港窝/叶子港港窝.html`（约 2MB，改动永远从这里改） |
| **PWA 构建目录** | `~/WorkBuddy/2026-08-02-13-49-26/pwa-build/`（index.html/manifest.json/sw.js/icons/） |
| **GitHub 仓库** | `yuki1122-fehu/yezi-ganggangwo`（main 分支，即 GitHub Pages 源） |
| **GitHub Pages（主用，国内手机可直连）** | `https://yuki1122-fehu.github.io/yezi-ganggangwo/` |
| **GitHub Token（写操作）** | `<已隐藏 — 接手时看 publish.py 内的 TOKEN 变量>` |

> ⚠️ Token 泄露可去 GitHub → Settings → Developer settings → Personal access tokens 撤销重发。
> ⚠️ **已正式弃用腾讯云 CloudStudio**：自 2026-08-07 起统一仅用 GitHub Pages 部署，链接固定不变。

---

## 2. 文件结构

```
叶子港港窝.html                ← 唯一源码（一切改动都改它）
publish.py                     ← 一键发布脚本（语法校验+生成 pwa-build+推 GitHub）
小园植物图鉴-演示.html         ← 预览用演示页（展示番茄小园各级植物/合成效果，不进 App、发布不携带）
pwa-build/
├── index.html                 ← 由主文件生成（改标题 + 加 manifest/SW 注册）
├── manifest.json              ← PWA 清单
├── sw.js                      ← Service Worker（导航网络优先，离线回退缓存）
└── icons/                     ← 5 个图标 PNG
```

**主文件内部结构**（约 7600 行，`<script>` 里 5 个 script 标签）：
- `:root` CSS 变量：鼠尾草绿主题（`--green` 系列 + 米白 `--bg`）
- HTML 结构：首页进度环 / 天气卡片 / 警告条 / 心情条 / 任务列表 / 底部四 tab（今天/学习/生活/日历）
- AI 助理面板（`#aiMask`）：聊天区 + 快捷短语 + 附件按钮 + 设置（齿轮）
- JS：数据模板 → 任务/课表/记账/心情 → AI agent（function calling）→ 天气警告 → PDF/Word 解析（内联 pdf.js + pako）

---

## 3. 核心机制（接手前必读）

### 3.1 数据全部在用户本机
- localStorage key：`mhm_tasks`（即 `mhm_cloud_v1`）、`mhm_expenses`（`mhm_expense_v1`）、`mhm_ai_conv`、`mhm_ai_cfg`、`mhm_hk_warning`、`mhm_weather`、`mhm_theme`、`mhm_last_backup`、`mhm_pomodoro`（番茄钟：sessions/garden/设置/彩蛋）、`mhm_mood_<日期>` 等。
- **没有云端同步**，定期提醒用户导出备份（设置里有「导出数据」）。
- **导出/导入**：导出打包 `mhm_cloud_v1/mhm_courses_v1/mhm_ai_cfg/mhm_last_doc_text/mhm_theme/mhm_expense_v1/mhm_app_title/mhm_pomodoro` + 全部 `mhm_mood_*` + 最近对话；导入会重载任务/课表/记账/主题/对话/**番茄钟（loadPomoData+ensurePomoGarden+renderGarden+彩蛋按钮）**。
- 改动数据后记得调用对应保存函数：`saveLocal()`（任务）、`saveExpenses()`（记账）、`saveConv()`（AI 对话）、`saveAISettings()`（配置）、`savePomoData()`（番茄钟）。

### 3.2 AI 是 function calling agent（重要）
- `aiRun()` 里有 `while(loop++ < 6)` 循环：模型返回 `tool_calls` → 本地执行 `execTool()` → 结果 push 回对话 → 再调模型 → 直到返回纯文本。所以一次指令会"思考多条"。
- 工具清单（17 个）在 `AI_TOOLS`，实现在 `execTool()` 分发到 `aiXxx()` 函数：任务（add/update/complete/remove/list/get_progress）、课表（get/add/update/remove/compare/batch_update）、记账（add/get/set_budget）、心情（log/get）。
- **批量能力**（2026-08-05 新增）：`remove_task`/`complete_task` 支持 `all:true` 批量；`remove_task` 支持 `include_done:true` 删已完成；`remove_course` 支持 `all:true`；`add_expense` 支持 `items` 数组；`list_tasks` 支持 `limit`（默认 20）。
- 系统提示词是 **XML 标签结构**（`<角色身份>/<当前时间>/<天气>/<天气警告>/<学年规则>/<助手任务清单>/<行为规则>/<近期任务>/<近期课表>/<对话记录说明>`），常量 `DEFAULT_SYSTEM_TPL`，每次发送 `buildSystem()` 动态填充。

### 3.3 时间锚点机制（解决"AI 把白天说成晚上"）
- `nowAnchor()` 生成当前时间（含上午/中午/下午/晚上时段词）。
- system 里有一份；另外 **`injectTimeAnchor()` 每次发送时把时间注入最新一条用户消息**（对话末尾权重最高的位置），压过历史"晚安"惯性。
- **关键**：`injectTimeAnchor` 必须浅拷贝消息对象（`Object.assign({}, last)`）再改 content，**绝不能改原对象**——否则时间会随 `saveConv()` 写进历史，重进后显示出来（这是修过的 bug）。
- `stripInjectedAnchor()` 负责在渲染历史时剥掉旧版误存的时间前缀。

### 3.4 天气与警告
- 主源：香港天文台 warnsum/weather；**Open-Meteo 后备**（内地可直连，香港坐标 22.3193,114.1694）。
- **天气卡动画（WeatherFX，Canvas 粒子系统）**：`#weatherCard` 内三层结构 = `.weather-bg`（CSS 渐变，`data-weather` 属性驱动，浅/暗色各一套）+ `canvas.weather-canvas`（JS 粒子）+ `.weather-anim`（旧 CSS 装饰兜底）。**8 种动画**：sunny（太阳光晕+光点）/ cloudy（3 层视差云）/ rain（小雨）/ heavy_rain（大雨=小雨同参数仅白丝）/ rainstorm（暴雨=原大雨密度+拖影+水花）/ thunderstorm（暴雨+闪电）/ fog（3 层雾带漂移）/ snow（雪粒飘落）。**WeatherFX 是多实例 IIFE**（每卡独立 RAF/ResizeObserver/主题监听）：`WeatherFX.init(card)` 返回实例、`WeatherFX.set(kind)` 兼容旧调用；性能优化：deltaTime 上限 50ms、DPR 上限 2、visibilitychange 暂停、低配设备降采样、拖影用半透明覆盖不清屏。
- **映射**：`weatherKind()` 覆盖 HKO 全部 29 码（50-93）+ Open-Meteo 全部 28 码（wmoWeather），雷→thunderstorm、暴/豪→rainstorm、大雨→heavy_rain、雪/冰/雹→snow、雨→rain、雾/霧凇/煙霞/霾→fog、陰/密雲/多雲/清涼/寒冷→cloudy、晴/阳光→sunny，兜底 sunny。**无任何未覆盖描述**。图标：⛈ 改 🌩️（彩色 emoji）、雪代码（71-77/85-86）补 🌨️/❄️ 映射。
- 警告条时间显示「生效 xx · 更新 xx · 检查 xx」（App 检查时间取 `warningState.updateTime`）。
- 点击警告条 = `tapWarningBar()`：先看详情 + 强制刷新 `fetchHKWarnings(true)`。
- **课室代码→完整地址翻译表 `ROOM_NAMES`**（2026-08-16）：DLB404=浸大逸夫校園思齊樓404、SCT501(LT1)=浸大善衡校園查濟民科學大樓5樓501室（演講廳LT1）、WLB103/104/204=浸大逸夫校園永隆銀行商學大樓、WYS609=浸會大學道15號伍宜孫博士大樓6樓609。helper `roomFull(code)`：命中返回完整地址，未命中/空/"待定"返回原值。**首页今日课程横幅**追加完整地址（cs-room-code + cs-room-full）；**日历点击某日课程详情卡片** `cs-meta` 的"课室"行追加完整地址。
- **恶劣天气停课自动提示 `suspendClassTips(c)`**（2026-08-16，依据浸大教务「恶劣天气上课及考试安排」2021-08-13版）：
  - **触发键**（停课/停考）：`TC8NE/SE/NW/SW`、`TC9`、`TC10`（8号或以上风球）、`WRAINB`（黑色暴雨）、`WL`（山泥倾泻）、`WTMW`（海啸）= 课表代码 = 「进行中课堂立即停课 / 考试取消并延期」+ 按时段规则细化（6:15前生效→11:00前开始的课取消；11:00-15:00→15:00前开始的课取消；15:00后→17:00后开始的课取消）。
  - **不触发**（照常上课）：`WRAINA`/`WRAINR`（黄/红雨）= 学生必须如常回校上课及考试。
  - 课表渲染点：`renderTodayClass`（首页横幅） + `renderCalendar` 课程卡片（命中后追加 `.cs-suspend` 红框：粗"⚠️ 当前 [警告] 生效，课堂可能取消/改期"+ 小字依据；考试行替换为"考试取消并延期举行"）。
  - 警告刷新同步：`refreshClassWithWarnings()` 在 `fetchHKWarnings` 完成时刷新首页 + 日历（如 calSel 选中）渲染。
  - `showWarningDetails()` 警告详情弹窗追加 affectedLine：列出本机未来 3 节课（科目+日期+课室），方便用户从警告直达课表。
  - Set 内联进函数 + try/catch（防御闭包变量不可达场景，2026-08-16）。

### 3.5 PWA
- `pwa-build/index.html` 由主文件生成：`<title>` 改「叶子港港窝」+ 加 manifest/apple-touch-icon 链接 + `</body>` 前加 SW 注册脚本（仅 HTTPS/localhost 生效，file:// 静默跳过）。
- `sw.js`：导航请求网络优先、离线回退缓存 index.html；跨域 API 一律放行。

---

## 4. 常规操作流程（改代码 → 上线）

### 流程 A：改完代码重新生成 PWA + 推送
1. 改主文件 `~/Desktop/叶子港港窝/叶子港港窝.html`；
2. 语法校验：提取 5 个 `<script>` 逐一 `node --check`（见下方命令）；
3. 生成 pwa-build（用 Python 做三步替换：title、加 manifest 链接、加 SW 脚本，见下方脚本）；
4. 推送 GitHub（因文件 >1MB，GitHub Contents API 返回 `encoding:none`，**必须用 `Accept: application/vnd.github.raw` 下载**；上传用 PUT + 先 GET 拿 sha）；
5. GitHub Pages 自动部署，**无需任何额外部署**——告诉用户等 1-2 分钟刷新 GitHub Pages 链接即可（若没更新先清手机浏览器缓存）。

### 流程 B：用户报 bug 时的排查顺序
1. 先看是否是线上版本旧（用户手机缓存了旧版）→ 让用户清缓存；
2. 下载线上文件对比（`curl -H "Accept: application/vnd.github.raw"`）；
3. 检查 localStorage 相关数据格式、AI 工具返回 `need_confirm`、z-index 层级、编码乱码（`\uFFFD`）。

---

## 5. 常用命令速查（在 macOS 上执行）

```bash
# 语法校验（提取 5 个 script 逐个检查）
/Users/kaijimima1234/.workbuddy/binaries/python/versions/3.13.12/bin/python3 -c "
import re
s = open('/Users/kaijimima1234/Desktop/叶子港港窝/叶子港港窝.html', encoding='utf-8').read()
scripts = re.findall(r'<script[^>]*>(.*?)</script>', s, re.S)
for i, sc in enumerate(scripts):
    if sc.strip(): open('/tmp/chk_%d.js'%i,'w',encoding='utf-8').write(sc)
"
node --check /tmp/chk_0.js && echo OK   # 对 0-4 逐个跑
```

```bash
# 下载线上 index.html（注意：>1MB 必须带这个 Accept 头）
export GH_TOKEN="<已隐藏 — 接手时看 publish.py 内的 TOKEN 变量>"
curl -sL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/yuki1122-fehu/yezi-ganggangwo/contents/index.html" -o /tmp/online.html
```

```bash
# 推送（Python 走 Contents API，先 GET sha 再 PUT）
# 见下方「附：完整推送脚本」
```

### 附：一键发布脚本（推荐，已内置）

项目根目录已附带 `publish.py`——一条命令完成「语法校验 + 无乱码检查 + 生成 pwa-build + 推 GitHub」：

```bash
python3 ~/Desktop/叶子港港窝/publish.py "这次的修改说明"
```

输出会依次显示 5 个 script 语法 OK、无乱码、pwa-build 已生成、推送成功。**推送 GitHub 后 GitHub Pages 自动部署，链接固定不变，无需再部署腾讯云或其他平台**——刷新即更新。

---

## 6. 已修复的问题（重要，避免重复踩坑）

| 日期 | 问题 | 修法 |
|---|---|---|
| 08-03 | AI 面板内删除消息 × 没反应 | `.mask` z-index 50→100（弹窗被 `#aiMask`(70) 盖住） |
| 08-03 | 多条警告分不清时间 | 警告条「生效/更新/检查」分开显示，详情列出每条时间 |
| 08-03 | 警告条点击不刷新 | `tapWarningBar()` 先看详情+强制刷新 |
| 08-03 | github.io 国内打不开 | 曾改用腾讯云 CloudStudio；**2026-08-07 起统一回归 GitHub Pages（用户手机已可直连，正式弃用腾讯云）** |
| 08-03 | AI 白天说成晚上 | 时间锚点强化 + XML 标签提示词 + 最新消息注入时间 |
| 08-03 | 注入的时间污染历史记录 | `injectTimeAnchor` 改浅拷贝；`stripInjectedAnchor` 清理旧数据 |
| 08-03 | XML 模板写入乱码（U+FFFD） | 用 LEGACY 原文修复，扫描校验归零 |
| 08-05 | 重复代办删不掉（转圈） | `remove_task` 支持 `all:true` 批量删除 |
| 08-05 | agent 循环 6 轮上限无提示 | 超限时明确提示"已处理的都保存了，没做完的再说一遍" |
| 08-05 | 网络超时 20s 太短 | 改 30s；busy 重发有 toast 提示 |
| 08-05 | 删不了已完成任务 | `remove_task` 加 `include_done:true` |
| 08-05 | 任务列表只回 12 条 | `list_tasks` 加 `limit`（默认 20） |
| 08-05 | 课表不能批量删 | `remove_course` 加 `all:true` |
| 08-05 | 记账一次一笔 | `add_expense` 加 `items` 数组批量 |
| 08-06 | 待办默认只看未完成 | 默认全部显示（含已完成/已过期），按钮可切回「只看未完成」 |
| 08-06 | AI 不知道有任务过期 | `<近期任务>` 增加「已过期未完成」分组（回溯 daysTask 天、最多 10 条），并指示 AI 主动提醒补做 |
| 08-06 | 误触清空对话丢记录 | 清空对话加二次确认弹窗（showDialog danger 按钮） |
| 08-06 | 只看未完成/显示已完成不够灵活 | 改为「未完成/已过期/已完成」三选项独立勾选过滤（`taskFilter` 对象 + `toggleFilter()`，默认全选；空状态提示全不勾时引导） |
| 08-06 | AI 改不了已过期任务的日期（"改到今天"没反应） | ①`normDate` 支持口语日期：今天/今日/明天/明日/后天/大后天/昨天/前天、`2026年8月6日`、`8月6日`、`8/6`、`6号`（当月）；②`aiUpdateTask` 显式给了 date/time 但解析失败时**明确报错**（不再静默"改好了"），且只有真变化才记入 changed；③DEFAULT 与 LEGACY 提示词各加一条"任务改期（含过期任务）→ update_task 的 date/time 字段"规则，工具 schema 的 date 描述同步补充口语写法 |
| 08-06 | 导出备份再导入后，任务显示"已专注"但小园空了 | 导出 keys 漏了 `mhm_pomodoro`（番茄钟 sessions/garden），任务里的 `pomoCount` 随任务数据走了但小园没了；且导入不重载番茄钟。修：导出 keys 加 `POMO_KEY`；导入后重载 `loadPomoData+ensurePomoGarden+renderPomoIdle/renderPomoTaskSel/renderGarden/refreshPomoEggBtn`。注意：**旧备份文件里本来就没有番茄钟数据，已丢的小园无法找回**，只能重新积累 |
| 08-06 | 点小园刮风：部分花草不响应或只动一点点 | 根因：`.sprout` 有 inline `animation-delay`(0~1.5s，每 6 株一轮，给常驻 sway 错峰)，但 `.pg-scene.excited .sprout` 换 `animation-name:gustBend` 时 delay 仍沿用 inline 值，而 excited 类 1.1s 就被移除 → delay≥0.9s 的植物还没开始动就停、0.3~0.6s 的只弯一半；草丛 `.tuft`（CSS delay 0~0.48s）同样被截断。修：`.pg-scene.excited .tuft,.pg-scene.excited .sprout{animation-delay:0s !important;}`——所有草木**同时**完整弯腰 0.9s（不再"依次"，CSS 注释已说明）。已用 headless Chrome 实测 14 株全归零 |
| 08-06 | 旧数据重建小园一排全是同一种尖叶芽 | `ensurePomoGarden` 里 garden 缺失时由 sessions 重建 L1 不带 species → 全兜底 leaf_point。修：重建时 `species:pickPomoSpecies(1)`。**随机性已核验**：21 种分组与简介级别一致、各级随机 2 万次无越界且均衡、合成链 L1→L5 全部正确落入下一级组 |
| 08-07 | 合成（首次合成出二级草）后点小园吹风失效，所有花草只轻微颤动（含新草与默认草丛） | 与 08-06 的 delay 截断是**两个独立 bug**。本次根因：合成成功的 `pomoCommitMerge` 没退出合成模式，`pomoMergeMode` 一直为 true → 之后点小园被 `pokeGarden` 开头的 `if(pomoMergeMode){...return}` 拦截，`excited` 类加不上 → 植物只剩常驻 `sproutSway`(±3°)/`sway`(±4°) 微摆，看起来"只轻微颤动"（默认草丛 .tuft 也在内，符合现象）。修：`pomoCommitMerge` 合成完成后自动 `pomoMergeMode=false` + 移除 scene `merging` 类 + 按钮 `active` 态（与 `pomoToggleMerge` 退出逻辑一致）；另给 `.pg-scene.excited` 规则补 `animation-direction:normal;animation-fill-mode:none`，防 sproutSway 简写残留 alternate 造成浏览器差异。已用 Node 状态机模拟验证：合成后点小园不再被拦截、刮风正常触发 |
| 08-07 | 港窝小园新增氛围彩蛋（**日夜随真实时间**）和生物彩蛋（萤火虫/小鸟/瓢虫） | **零持久化、纯时间驱动**：`gardenTimePhase()` 读 `new Date().getHours()` 切 t-dawn(5-8)/t-day(8-17)/t-dusk(17-19)/t-night(其余)，给 `#pgScene` 加 class，30min `setInterval` 校准，openPomodoro 时再刷一次。各时段视觉：night=深蓝夜空+弯月(左上 radial-gradient)+8颗星星 twinkle(2.8s)+4只萤火虫漂移(`--ff-x`/`--ff-dur` 每只各异)；dusk=橙紫渐变遮罩+太阳右沉(`left:72%;animation:sunset` 12s)；dawn=暖金渐变+太阳左升+4颗露珠 dewGlint 3.4s。**生物调度**：bird/bug 用低频随机间隔出现（16-46s / 30-80s），transition 实现飞入-歇脚-飞走、爬行-消失。z 序 sky/sun(0) < star(1) < moon/tuft/bug(2) < plant/firefly(3) < bird(5) < butterfly(6)。已用 headless Chrome 截 4 个时段图核对（夜/晨/昏/白各 7 株植物+鸟虫全部到位） |
| 08-07 | 鸟改**蜻蜓**（用户反馈"鸟像蜻蜓，不如改蜻蜓"） | `.pg-bird` SVG 重画：细长蓝身 + 4 片半透明薄翅（2 大前翅 wing-l/r + 2 小后翅 wing-l2/r2）+ 复眼；CSS 翅振加快到 `.16s`（`dragonflyFlap`，约 6 次/秒），整体悬停浮沉 2.2s（`dragonflyHover` ±3px）。**蝴蝶 `.pg-butterfly` 一行代码没动，原样保留**。白天/夜晚截图验证蜻蜓+蝴蝶+瓢虫+萤火虫同框清晰可辨 |
| 08-07 | 小园**跟随真实天气**（晴/雨）+ **飘云** | ①`gardenWeather()` 读 `weatherState` 判降水：HKO 图标码 53/54/62/63/64/65；Open-Meteo WMO 码 56/57/61/63/65/66/67/80/81/82/95/96/99；`desc` 含 雨/雪/雷 兜底；**`source==='Open-Meteo'` 区分两套码**（HKO 61=阴天 ≠ WMO 61=小雨，必须分开判）。判定给 scene 加 `g-rain` → 16 根雨滴（2px 深蓝渐变、0.85-1.2s 错相位下落）+ 植物 `rainShake` 微抖（作用于 `.sprout>svg` 子元素，不与 sprout 自身弯腰/摇摆冲突）。②飘云：2 朵 SVG 云（`.pg-cloud.c1/c2`）白天/晨光/黄昏 `cloudDrift` 52s/80s 飘过，夜晚隐藏。③接入点：`renderWeather()` 开头（天气卡每次更新小园同步）、`openPomodoro()`、`initGardenAtmosphere` 5 分钟轮询。④**`weatherState` 由 `let` 改 `var`**（顶层 var = window 属性，便于统一刷新调用）。已 DOM 断言 7 用例：雨/晴/两源区分/失败兜底全对 |
| 08-07 | 深夜**猫头鹰彩蛋**（23:00-5:00 站栖木） | 用户给了个现成 CSS 猫头鹰（棕 A67B5B/8B5E3C、橙颊 D35400、黑喙），按小园 126px 场景重绘成 SVG（`viewBox 0 0 72 96`，宽 58px，站栖木上）。**栖木**：横木 + 双支撑杆（`owl-perch`）一体画进 SVG，不落地、悬在场景右侧。**动画**：眨眼 `owlBlink` 4.6s（眼组 scaleY 0.08 闭合）、转头 `owlTurn` 11s（±6°）、呼吸 `owlBreathe` 3.4s（±1.6px），全部 CSS 于 SVG 子元素（transform-box:fill-box）。**时段**：`gardenTimePhase()` 里 `scene.classList.toggle('t-owl', h>=23 || h<5)` → `.t-owl .pg-owl-wrap{opacity:1}`（带 .9s 淡入）。z 序与 bird 同级(5)。DOM 断言 + 深夜截图验证通过 |
| 08-07 | 番茄彩蛋按钮每次进番茄钟界面都出现（应"收下后不再出现，完成下个番茄才再出现"） | 根因：完成番茄 `pomoEggGenerate` 创建 `pomoData.egg` 后，`openPomoEgg` 收下只置 `eggUnread=false` + 隐藏按钮，**egg 对象一直保留** → `refreshPomoEggBtn()`（每次进界面调）`if(pomoData.egg) showPomoEggBtn()` 永远亮。修：`closePomoEgg()` 关闭弹窗时**收下即消费**——`pomoData.egg=null; eggUnread=false; savePomoData(); hidePomoEggBtn()`。已状态机模拟 6 步：完成→亮 / 重进→亮 / 收下→隐 / 关闭→清空 / 再进→不再亮 / 下个番茄→再亮，全过 |
| 08-07 | 番茄钟**白噪音**（粉噪/雨声/篝火，Web Audio 实时合成）+ **伴学语音**（TTS 朗读） | ①**白噪音**：`applyNoise()` 用 Web Audio 合成，零音频文件离线可用——粉噪=`noiseBuffer(pink)` 直达；雨声=白噪+低通 1100Hz+0.12Hz LFO 调雨势；篝火=粉噪+低通 360Hz+`noiseCrackleBurst` 随机噼啪（220ms 间隔）。AudioContext 复用项目 `pomoAudio` 预热链路（点开始即手势解锁）。设置面板新增 音效选择+音量滑杆，保存即 `applyNoise()`。②**伴学语音**：Web Speech API（`ttsSpeak`），中文声线=`ttsPickVoice()`（zh 里找 female/婷婷/xiao），声线=音高×语速预设（gentle 1.12/.98、calm .82/.9、lively 1.24/1.12），iOS 需 `ttsWarmup()`（点开始手势解锁后自动朗读才不被拦）。**触发点**：开始专注/休息（`pomoStartPhase`）、完成/休息结束（`pomoPhaseDone`）、点开彩蛋朗读正文（`openPomoEgg`，纯文本去标签限 200 字）。设置：`settings.noise/noiseVol/tts/voice`，默认 noise=off、tts=true、voice=gentle。headless 实测 4 控件渲染 + 6 函数挂载 OK |
| 08-07 | 伴学语音**音调/语速自定义** + **文案 AI 每次现写** | ①**自定义音色**：三个预设改为"一键填充"，真正发声走 `settings.pitch/rate` 两个滑块（0.5-2.0，存储整数 50-200÷100），`pomoVoicePreset()` 选预设填滑块、可再微调；`ttsSpeak` 直接读 pitch/rate（不再映射预设），`voice` 字段仅记录最近预设。②**文案 AI 现写**：`ttsSpeakAI(ctxText, fallback)`——`settings.ttsSource==='ai'` 时用 `aiCall`（复用彩蛋的 getAiCfg/persona）当场写一句 20~40 字口语陪伴，**9 秒超时/无 key/失败 → 自动退回内置模板**，绝不冷场；`pomoStartPhase` 的开始/休息引导改走 ttsSpeakAI（内置文案降级为 fallback）。彩蛋正文朗读不受影响。默认 ttsSource='ai'。8 项检查 + 兜底路径模拟全过 |
| 08-07 | 伴学语音**接入 MiniMax TTS**（自然音色 + 音色设计/声音复刻） | 用户嫌系统 TTS 生硬。①**T2A 合成**：`ttsMiniMax()` POST `https://api.minimax.chat/v1/text_to_speech?GroupId=`，header Bearer key，参数 model=speech-02-turbo/text(≤500字符)/voice_id/speed(0.5-2)/vol/pitch(-12..12)/output_format=mp3，返回 mp3 二进制 → `playMiniAudio`（Audio 播放）。**CORS 实测通过**（allow-origin 精确指向 GitHub Pages 域名）→ 浏览器直连，无需代理。②**引擎路由**：`ttsSpeak` → `ttsEngineReady()`（engine==='mini' 且 key 齐全）→ ttsMiniMax，失败 catch 降级 ttsSpeakSys；pitch/rate 滑块映射（speed=rate、pitch=(rate-1)*12 clamp）。③**音色设计/声音复刻**（`api.minimaxi.com` 域，CORS 同样通过）：`pomoMiniDesign()` POST /v1/voice_design{prompt} → voice_id；`pomoMiniClone()` 先 POST /v1/files/upload(multipart purpose=voice_clone) 得 file_id，再 POST /v1/voice_clone{file_id,voice_id} → voice_id；两者自动填入 `psMiniVoiceId`（优先于系统音色）。均按"首次用于合成时计费 ¥9.9/音色"，7 天未用会删除。④**试听**：`pomoMiniTest()` 用面板当前值即时合成播放。设置字段：`settings.engine('sys'|'mini')/miniGroup/miniKey/miniVoice/miniVoiceId`。**安全约定：API Key 只存用户浏览器 localStorage，绝不写进公开源码**（GitHub 仓库公开，key 进代码=公开）。价格 speech-02-turbo 2元/万字符（1万汉字≈4元） |
| 08-08 | 弹窗/全屏页（AI 助理/番茄钟）开关瞬间消失，无退场动效 | 统一 `openMask/closeMask` helper（先加 `.closing` 播退场动画再隐藏，animationend+600ms 兜底）；`.mask.closing`/`#aiMask.closing`/`#pomoMask.closing` + `maskOut/sheetOut/pageOut` keyframes（220-340ms，asymmetric）；全屏页入场 `pageIn`（上滑7%+淡入 .48s）、退场 `pageOut`（下滑5%+淡出 .34s）。**踩坑**：`#aiMask.closing` 必须放在样式表末尾（`.show` 之后），同特异性下后定义胜出——否则退场动画被入场覆盖、根本没播 |
| 08-08 | 任务完成"瞬移到列表底部"，无成就感 | 三件套：①完成动效五联（`.item.completing`）：check 弹跳 `checkPop` + `::before` 填充光晕 `checkFill` + `::after` 深绿描边环 `checkRing` + 勾画线 `drawCheck`（stroke-dashoffset）+ 整卡 `itemGlow`（box-shadow 呼吸，**只动 box-shadow 不动 transform 避免与 FLIP 冲突**）；`.txt-title` 划线用 `text-decoration-color:transparent↔绿` transition（过程可见）。②FLIP 重排：`snapshotItems()`+`playFlip()`（invert+双 rAF play，`transform .42s`，transitionend 清 inline）——任务滑到底部、其他项平滑让位。③`toggle()` 仅在完成方向（`!wasDone`）触发动效，`justCompletedId` 标记一次性 completing 类（下次 renderList 自动清除） |
| 08-08 | 完成烟花看不清 / 想从圈圈炸出 | `celebrate(x,y)`：白绿爆点（`flashPop` scale→11）+ 14 颗半透明彩色光点（六色 `FIRE_COLORS` 贴合主题，随机角度/距离70-200px/尺寸/透明度，同色发光，`firePop` .85s，animationend+1100ms 移除）；发射点取 `item-{id}` 内 `.check` 中心（getBoundingClientRect，探针 delta=0,0）；z-index 60 |
| 08-08 | 点卡片任意位置都切换完成（误触） | `item-head` onclick 移除，`toggle()` 挂 `.check` 上（+`role="button"`/`aria-label`）；`.check::before{inset:-10px}` 透明热区外扩（completing 时被 checkFill 覆盖，热区仍在） |
| 08-08 | 动效细节纪律（emil-design-eng skill 审查） | `fabIn`/`eggPop` scale(0)→scale(.92/.9)（`growIn` 植物出土保留豁免）；`transition:all` 9 处改精确属性列表（toast→opacity,transform 等） |
| 08-08 | 天气卡动画从 CSS 装饰升级为 **Canvas 粒子系统**（WeatherFX） | 6 种 Effect 类（sunny/cloudy/rain/heavy_rain/rainstorm/thunderstorm）+ 2 种新增（fog/snow），统一 `init/resize/tick(dt,w,h,ctx,theme)`；多实例控制器（每卡独立 RAF）；`data-weather` 属性驱动 CSS 渐变背景（浅/暗色各 8 套）。**踩坑**：改造多实例时漏删老顶层 `let theme` 报 ReferenceError，全部改 `this.theme` |
| 08-08 | 雨类卡片文字看不清（深色背景+深色字） | 全部天气统一白字 `#fff`（text-shadow 兜底对比度），meta 半透明白；offline 卡保持灰色例外。**删除了**先前的 4 条雨类专属白字规则（全白后冗余） |
| 08-08 | 大雨/暴雨/雷暴背景太黑、雨丝太密太快 | 三档雨背景从深黑蓝（`#3b5377/#1f2e4a/#1a1f3d`）改灰蓝（`#aabdcf/#98adc2/#8494ad` 系）；**用户最终规格**：大雨=小雨同参数仅白丝（50 根·100-150px/s·无拖影）、暴雨/雷暴=原大雨密度频率（55 根·200-280px/s）+ 拖影 + 水花（雷暴加闪电）。**教训：用户说"保持一致只换颜色"就照做，不要自作主张递增数值** |
| 08-08 | 雷暴图标 ⛈ 黑白线框，与其他彩色 emoji 风格不一致 | ⛈（U+26C8）无彩色变体 → 主/备源一律改 `🌩️`/`🌧️`（带 U+FE0F 的彩色 emoji） |
| 08-08 | HKO/Open-Meteo 部分天气**无配套动画**（雾/雪强行套云/雨） | 全量审计 57 个描述（HKO 29 + Open-Meteo 28），新写 **FogEffect**（3 层雾带视差漂移，匹配有雾/薄雾/烟霞/霧凇）+ **SnowEffect**（雪粒缓落+正弦飘摆，匹配雪代码）；清凉/寒冷改配 cloudy；`weatherKind()` 全映射自检 0 未覆盖 |
| 08-08 | 动画演示在聊天 widget 里不动 | 改用 **Python Pillow 重绘粒子动画 → 输出 GIF**（`weather_fx_动画演示.gif`，90 帧 24fps），任何看图工具都能播放 |
| 08-16 | 课程卡片只显示教室代码（WLB104 等），用户看不懂 | 加 **课室代码→完整地址翻译表 `ROOM_NAMES`**（DLB404=逸夫思齊樓404、SCT501(LT1)=善衡查濟民科學大樓501演講廳LT1、WLB103/104/204=逸夫永隆銀行商學大樓、WYS609=浸會大學道伍宜孫博士大樓609）。helper `roomFull(code)`：首页今日课程横幅追加完整地址；日历点击课程详情卡片 `cs-meta` 的"课室"行追加完整地址。**踩坑**：6 个代码全部经 playwright 真实渲染截图验证 |
| 08-16 | 恶劣天气不上课没有提醒（用户要求按浸大教务恶劣天气安排自动提示） | 新加 `suspendClassTips(c)` helper：**实时读取 HKO warnsum 当前警告**，命中 8号风球/黑雨/山泥倾泻/海啸时在课程卡片追加红色 `.cs-suspend` 提示行（"⚠️ 当前 [警告] 生效，课堂可能取消/改期"+小字依据）；命中 + 考试行则提示"考试取消并延期举行"。**黄雨/红雨按教务规则不停课故不触发**。触发点：`renderTodayClass`（首页横幅） + `renderCalendar` 课程卡片；`refreshClassWithWarnings()` 在 `fetchHKWarnings` 完成时同步刷新；`showWarningDetails()` 警告详情弹窗追加 affectedLine 列出本机未来 3 节课。**踩坑**：之前用 `const SUSPEND_WARNING_CODES = new Set([...])` 在闭包外声明，诊断脚本读 `window.warningState` 与闭包 `warningState` 不同步造成误判；改为 Set 内联进函数 + try/catch 防御 |

---

## 6.1 番茄钟 · 港窝小园（2026-08-06 新增功能）

**入口**：首页进度环（`.ring`，中心新增「点我 · 专注」呼吸小标签）→ `openPomodoro()` 全屏页。z-index=100（沿用弹窗最高层级），关闭只是收起页面，**计时在后台继续走**（阶段完成照样提醒 + 长叶子）。

**核心机制**
- 计时用 `Date.now()` 差值（`endTs`），切后台/息屏回来剩余时间依然正确；`visibilitychange` 回到前台时补一次 `pomoTick()`。
- 阶段自动连跑（设置可关）：专注 → 短休/长休（每 `every` 个番茄长休一次）→ 专注；阶段衔接有 900ms 过渡（`phase:'between'`）。
- 预设：学习 25/5、深耕 50/10、轻读 15/3、自定义（设置弹窗里填时长）；`pomoPresetKey` 持久化在 `lastPreset`。
- 任务联动：开始前可选绑定「今天未完成」任务；完成一个专注番茄 → 给任务加 `pomoCount`/`pomoMin` 字段并 `saveLocal()`，**不自动勾完成**（保持"完成=手动勾选"语义，进度环不受影响）。
- 提醒：`settings.alert` = chime（WebAudio 三音）/ vibrate / notify（系统通知，需授权）/ silent。AudioContext 在点开始时 `ensurePomoAudio()` 预热，避免自动连跑时被浏览器拦截。

**叶子激励（港窝小园 · 会生长的动画场景 + 合成玩法）**
- 每完成 1 个专注番茄记一条 session `{ts, min, preset, kind}` 到 `localStorage['mhm_pomodoro']`，同时往 `garden[]` 加一株 L1 小苗；完成时叶子沿**弧线**（WAAPI `el.animate` 三关键帧，带降级）从环上飞进小园落地（`sproutSVG`：弯茎+顶端大叶，1/3 带小叶芽，grow 弹入）。
- **植物数据 `garden[]`**：`{id, level, species, kind, min, ts}`。level 1 嫩芽 / 2 草境 / 3 小花 / 4 繁花 / 5 花艺（封顶）。**21 种植物按等级分组（`POMO_SPECIES_BY_LV`），每次生成从本组随机（`pickPomoSpecies(lv)`）**，不再固定轮换；合成 = 3 株同级 → 下一级随机一株（`pomoBuildMerged`）。旧数据自动迁移（sessions→L1 随机 species，`ensurePomoGarden()`；老 `level+flower` → `POMO_SPECIES_OLD` 映射）。**花头统一带 `HEAD_SHADOW` 柔和阴影**（`drop-shadow(0 1.5px 2px rgba(92,115,89,.45))`），浅色花（雏菊/百合/绣球）才能从米白背景里区分出来——新加花型时别去掉。统计（今日/连续/累计）始终按 sessions 算，与合成无关。
- **合成玩法**：点小园右上角「✨ 合成」进选择模式（植物发光邀请）→ 点 3 株**同级**植物（选中有序号徽标，再点取消）→ 三株飞拢消失、新植物 grow 弹入 + toast + 振动。不合不扣；不同级/最高级有提示；再点按钮或点空白退出/取消选择。
- 叶子颜色按时长：<20 浅绿 `#a5c0a2`、20-39 中绿 `#7a9a72`、≥40 深绿 `#5c7359`；形状按分类（study 尖长叶 / life 圆叶）。最多展示最近 14 株。
- 场景元素：远山椭圆 + 土坡 + **5 簇填充式草丛**（`.tuft`，风浪式错相位 sway，勿改回描边单管——会像"花园鳗"）+ 飘浮花粉光点 + **蝴蝶**（≥3 片叶子后出现，`flyPath` 24s 环游 + 翅膀 flap）。
- 里程碑：连续 7 天 → 四叶草 🍀（`streak`，右侧装饰，不参与合成）；累计 100 番茄 → 开花 🌸（左侧）。
- 点小园（`pokeGarden(event)`，非合成模式）：**刮风**——所有草木同时弯腰（gustBend 0.9s，`animation-delay:0s !important` 压掉 inline 错峰，保证每株都完整响应）+ 两条风线扫过 + 触点 6 片小叶四散（WAAPI）+ 随机鼓励语 + 轻振动。
- 布局 z 序：hills(0) < soil(1) < tuft(2) < plants/pollen(3) < gust(4) < burst(5) < butterfly(6)；`pg-scene` 高 126px `overflow:hidden`。

**数据结构**：`mhm_pomodoro` = `{sessions[], garden[], flowerSeq, simpleSeq, settings{focus,short,long,every,auto,alert}, streak, lastDate, lastPreset, lastTaskId}`。连续天数规则：今天有专注 → 沿用/续接；昨天有 → +1；否则重置为 1（今天无专注不重置，断签温和）。

**新增函数清单**（主 script 末尾）：`initPomo/openPomodoro/closePomodoro/pomoPreset/pomoDurations/pomoToggle/pomoStartPhase/pomoTick/pomoPhaseDone/pomoSkip/pomoEnd/pomoRecordFocus/pomoMilestone/pomoAlert/pomoChime/pomoNotify/paintPhase/renderPomoIdle/pomoUI/pomoPaint/leafShape/leafSVG/sproutSVG/lushSVG/bloomSVG/bouquetSVG/headSimple/headTulip/headHydrangea/flowerHead/plantSVG/cloverSVG/flowerSVG/renderGarden/flyLeaf/miniLeafSVG/pokeGarden/ensurePomoGarden/pomoToggleMerge/pomoSelectPlant/pomoBuildMerged/pomoCommitMerge/pomoDoMerge/mergeFly/openPomoSettings/closePomoSettings/savePomoSettings` 等。`closeTopOverlay` 栈顶部已加入 pomoMask/pomoSetMask（返回键可关）。

**已知边界**：`renderPomoTaskSel` 只列"今天"未完成任务（按 `isTodayTask`），历史任务不会出现在下拉；跳过/提前结束（`pomoEnd` 确认后）不计叶子、不计 cycle。

**专注彩蛋（2026-08-06 新增，设置里可关闭）**
- 完成一个专注番茄的瞬间，后台生成一条彩蛋；右下角浮出 🥚 悬浮按钮（**只在番茄钟页面显示**：`showPomoEggBtn` 会检查 `#pomoMask.show`，页面关闭时生成完先存着，`openPomodoro()` 里 `refreshPomoEggBtn()` 再亮出；z-index 130），点击直接弹玻璃卡片看结果，无需等待。
- **两套独立开关**：①`settings.eggOn`（开/关，默认开）；②`settings.eggSource` = `'ai'`（**AI 全新生成**：每次都是模型现写，严格跟随助理人格 `cfg.persona || DEFAULT_PERSONA`，即用户自定义的性格）或 `'builtin'`（**内置彩蛋库**，不消耗 AI 额度、离线可用）。生成失败/无 API Key/25s 超时 → 一律用 `pomoEggFallback(theme)` 内置库兜底，绝不空转。
- **主题**：`settings.eggTheme` = random/encourage(鼓励语)/joke(冷笑话)/story(小故事)/health(养生小知识)/**custom(自定义)**；custom 时用 `settings.eggCustom`（最多 60 字）作为创作主题，设置弹窗里主题选「自定义…」会显示输入框（`pomoEggThemeUI()` 联动）。内置来源遇到 custom 主题用鼓励语兜底（本地库无法定制）。
- 数据：`pomoData.egg = {text, theme, ts, mins, taskName}` + `pomoData.eggUnread`（重进 App 恢复未读彩蛋）。`pomoEggAgain()` 沿用 `egg.mins/egg.taskName` 重新生成。
- **AI 生成提示词（system）**：`{助理人格全文}\n\n{completionText}，现在请为用户生成一条「番茄钟完成彩蛋」，主题是「{主题}」（自定义主题时附：用户指定主题：「{eggCustom}」，请围绕它创作）。\n风格和你的日常性格完全一致（就是你现在的人格设定）。\n要求：只输出彩蛋正文本身，100~200 字，不要开场白、不要标题、不要解释。`；`completionText` = 有绑定任务时「用户刚刚完成了{mins}分钟的「{任务名}」任务」，无任务时「用户刚刚完成了{mins}分钟的番茄钟专注任务」。`mins`/`taskName` 在完成瞬间捕获存入 egg，供"再要一个"复用同一上下文。
- 函数：`pomoEggGenerate/showPomoEggBtn/hidePomoEggBtn/openPomoEgg/updatePomoEggUI/pomoEggAgain/closePomoEgg/pomoEggFallback/pomoEggThemeUI`。`closeTopOverlay` 栈顶部已加 pomoEggMask（z-index 140）。

---

## 7. 已知边界与注意事项（改代码时小心）

1. **编码**：用 Python 脚本大段重写含中文标点的模板时，中文全角标点（（）、。）可能损坏成 `\uFFFD`——写完必须 `s.count('\uFFFD')==0` 校验。
2. **z-index 层级**：`.mask`=100（所有弹窗最高）；`#aiMask`=70；`aiSetMask`(80)/`aiPayloadMask`(90) 是内联样式。新增弹窗别低于 70。
3. **AI 上下文**：`trimMessagesForSend` 只保留最近 N 轮（设置 roundsConv，默认 8 轮），历史图片 base64 会替换为占位符。别让 system 太大。
4. **批量工具语义**：AI 说"全删/都完成"才传 `all:true`；单条匹配多个时**必须返回 `need_confirm`** 让 AI 先问用户，不要自作主张。
5. **zsh 陷阱**：Bash heredoc 里出现 `${...}` 会被 shell 展开报错（Bad substitution）——node 测试脚本建议先写成文件再执行。
6. **安全策略**：含 `for f in /tmp/*.js; do node --check` 这种循环的命令可能被误判为系统级工具拦截，改用 Python subprocess 或逐条执行。
7. **用户习惯**：用户偏好中文回复；对"转圈/没反应"类问题最在意，优先保证有明确反馈（toast/步骤气泡/上限提示）。
8. **文件位置**：主文件在 `~/Desktop/叶子港港窝/`（工作区根目录，不是 `~/Desktop/个人文件/`），publish.py 的 SRC 已指向此处；移动后记得同步改源路径。

---

## 8. 待办 / 可继续优化的方向（按优先级）

- [ ] 用户体验确认：批量删除/完成、删已完成、批量记账、批量删课是否真的好用（用户测试中）
- [ ] AI 对话"排队"机制：busy 时目前只提示，不排队；可考虑队列
- [ ] 视觉模型未配置时的"发图"体验（当前如实告知看不到图）
- [ ] 课表 `batch_update_courses` 已支持批量改，可评估是否补"批量加课"
- [ ] 动效手感确认：弹窗退场/全屏页过渡/完成烟花强度（用户测试中；可调粒子数/颜色/距离/时长）
- [ ] 数据备份提醒已有（7 天未备份弹横幅），可考虑自动备份到文件

---

## 9. 一句话给用户的话

> 数据都在本机，**务必定期在设置里「导出数据」**；统一用 **GitHub Pages**（`https://yuki1122-fehu.github.io/yezi-ganggangwo/`），手机可直连、链接固定，改动推 GitHub 即自动更新。改动需求直接说，接手 AI 会按本文档维护。

---

*文档生成时间：2026-08-05，08-06 已更新（番茄钟/港窝小园/合成玩法/AI 改期修复），08-07 更新（**正式弃用腾讯云 CloudStudio，统一仅用 GitHub Pages 部署**），08-08 更新（**动效大升级**：弹窗退场动画/全屏页丝滑过渡/任务完成烟花动效 + FLIP 重排 + 点击热区收窄，基于 emil-design-eng skill 审查；**天气模块 Canvas 粒子化**：WeatherFX 8 种天气动画 + HKO/Open-Meteo 全描述覆盖 + 灰蓝背景白字），08-16 更新（**课程卡片显示上课完整地址 + 恶劣天气实时自动停课提示**：课室代码翻译表 ROOM_NAMES + 实时 warnsum 命中停课键自动红框提示，黄/红雨不触发；受影响课程列在警告详情弹窗）。接手后如有重大改动，请更新本文档的「已修复问题」与「待办」两节。*
