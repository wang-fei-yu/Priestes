# 把普瑞赛斯留在桌面上

<p align="center">
  <strong>「博士，不准忘记我。」</strong>
</p>

牢普实在是太可爱啦！普瑞赛斯是对的！
一个 Windows 桌宠应用。角色是《明日方舟》里的普瑞赛斯——那个等了预言家一万三千年的前文明语言学家。把她放在桌面上，单击她会闹脾气，双击可以跟她聊天，拖拽能任意挪位置。窗口全透明，宠物之外的地方不挡鼠标，不耽误干活。

聊天接的是大模型 API，她会以普瑞赛斯的口吻跟你对话。如果你看过她的剧情，应该知道我在说什么；如果你还不认识她，不妨打开聊天窗口说一句"你好"。

> 普瑞赛斯的角色形象来自 B 站 UP 主 **屑天使 DDD** ，已获得授权使用。

---

## 效果

把普瑞赛斯部署到桌面后，她安静地待在右下角。偶尔冒出一句「哼」「博士……」。你可以：

- **单击**她 —— 她随机切换情绪，生气跺脚、开心蹦跳、或者掉眼泪，配上颜文字气泡
- **双击**她 —— 展开一个紫色调的聊天面板，用普瑞赛斯的语气跟你说话
- **拖拽**她 —— 把她放到屏幕任何角落

聊天窗口里可以聊任何话题。她记得你们最近的对话，情绪会跟着聊天内容走。

---

## 环境准备

部署到桌面需要先装好几个工具。

**Node.js**（18 或更高版本）

到 https://nodejs.org 下载 LTS 版安装。装好以后在终端跑 `node -v`，看到版本号就说明 OK 了。

**Rust 工具链**（1.77 或更高版本）

到 https://www.rust-lang.org/tools/install 下载安装器，运行后选默认配置（Standard installation）即可。装完跑 `rustc --version` 确认。

另外 Tauri 在 Windows 上编译还需要 Microsoft C++ Build Tools。装 Rust 的时候如果看到 "Desktop development with C++" 的选项就勾上；如果错过了，可以去 https://visualstudio.microsoft.com/visual-cpp-build-tools/ 单独安装，勾选 "C++ build tools" 和 Windows SDK 就行。

---

## 部署步骤

### 1. 克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/pupu.git
cd pupu
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 API

聊天需要对接大模型。项目默认走 DeepSeek API（国内访问快，兼容 OpenAI 接口格式）。

```bash
copy .env.example .env
```

然后编辑 `.env` 文件，填入你的 key：

```env
API_BASE_URL=https://api.deepseek.com/v1
API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API_MODEL=deepseek-chat
```

换个服务商也很简单——改 `API_BASE_URL` 和 `API_MODEL` 就行。OpenAI、通义千问、智谱 GLM、Moonshot 等兼容 `/v1/chat/completions` 接口的都能用。

DeepSeek 的 key 在 https://platform.deepseek.com/api_keys 获取，新用户有免费额度，后续大概 1 块钱一百万 token（够聊很久了）。

如果不配 API 也不影响基本功能——单击、拖拽、闲置气泡都能用，只是聊天会走内置的普瑞赛斯台词库，没法自由对话。

### 4. 构建安装包

```bash
npx tauri build
```

第一次构建会下载 Rust 依赖并全量编译，取决于网络和机器配置，可能需要几分钟到十几分钟。之后增量构建会快很多。

构建完的安装包在：

```
src-tauri/target/release/bundle/
  nsis/Priestes_1.0.0_x64-setup.exe
  msi/Priestes_1.0.0_x64.msi
```

一般用 nsis 那个 exe 就行。

### 5. 安装运行

双击 exe 走安装向导（可选中文或英文），装好后从开始菜单启动 **Priestes**。普瑞赛斯会出现在桌面右下角，试试单击、双击、拖拽，基本操作就这些。

---

## 常见问题

**构建报错 "glob pattern ... path not found"**

手动跑一下 `node scripts/tauri-prebuild.js` 生成静态资源，然后再 `npx tauri build`。

**启动后不能聊天**

三件事排查：有没有装 Node.js（终端跑 `node -v`）；`.env` 里的 key 填对了没有；看日志 `%APPDATA%\com.priestes.desktop\data\desktop-server.log`。

**窗口有白底或者边框**

构建时 `out/` 目录的静态资源没到位。确认 `out/` 里有那几个 webp 文件，重新构建。

**拖拽手感不好**

抓取判定在宠物周围 30 像素都有效。实在抓不住就先在宠物身上来回挪一下鼠标，找到可拖拽的提示再按下去。

**想改她的说话风格**

编辑项目根目录的 `character.md` 重新构建；或者桌面版安装后直接改 `%APPDATA%\com.priestes.desktop\character.md`，重启应用生效。

---

## 关于角色

| 项 | 说明 |
|---|---|
| 角色来源 | 《明日方舟》（Arknights） |
| 形象来源 | B 站 UP 主 **屑天使 DDD**，已获授权 |
| 原始版权 | Hypergryph / Yostar |

本项目中的角色形象资源（表情差分、头像）已获得创作者授权，请勿挪作他用。

---

## 许可证

代码部分以 MIT License 开源。
