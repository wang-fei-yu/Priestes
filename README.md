# 把普瑞赛斯留在桌面上

<p align="center">
  <strong>「博士，不准忘记我。」</strong>
</p>
牢普太可爱啦！普瑞赛斯是对的！
角色是《明日方舟》里的普瑞赛斯——那个等了预言家一万三千年的前文明语言学家。把她放在桌面上，单击她会闹脾气，双击可以跟她聊天，拖拽能任意挪位置。窗口全透明，宠物之外的地方不挡鼠标。

> 普瑞赛斯的角色形象来自 B 站 UP 主 **屑天使 DDD**，已获得授权使用。

---

## 环境准备

在开始之前，你的电脑需要安装以下工具。如果你之前装过了可以跳过对应的步骤。

### 安装 Node.js

1. 打开 https://nodejs.org
2. 下载左边的 LTS 版本（标有"Recommended for Most Users"的那个）
3. 双击安装包，一路点 Next，全部用默认选项即可
4. 装完之后验证一下：按 `Win + R`，输入 `cmd`，回车打开命令行窗口，输入：

```
node -v
```

如果看到类似 `v20.x.x` 这样的版本号，说明安装成功。

### 安装 Rust

1. 打开 https://www.rust-lang.org/tools/install
2. 下载 `rustup-init.exe`，双击运行
3. 会弹出一个命令行窗口，输入 `1`（Standard installation），回车
4. 安装完成后关闭窗口。打开一个新的 cmd 窗口，输入：

```
rustc --version
```

如果看到版本号，说明安装成功。

### 安装 Microsoft C++ Build Tools

Tauri 在 Windows 上编译必须要有这个。从上一步装完 Rust 之后，你的电脑上可能已经有了。先验证一下：在 cmd 里输入：

```
where cl.exe
```

如果没有输出任何东西，说明还没装，按下面的步骤来：

1. 打开 https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. 点击"下载生成工具"，双击运行安装器
3. 在"工作负荷"标签页里，勾选"使用 C++ 的桌面开发"
4. 右边检查一下"Windows 10 SDK"或"Windows 11 SDK"是否勾上了
5. 点右下角"安装"，等它跑完

装好之后重新打开一个 cmd，再跑 `where cl.exe`，应该能返回路径了。

---

## 部署步骤

### 第一步：下载项目

从 GitHub 仓库页面点击绿色的 "Code" 按钮，选 "Download ZIP"，把 zip 文件下载到电脑上。

下载完成后，右键点 zip 文件 -> "全部解压缩"，选一个你方便找的位置（比如直接解压到 D 盘根目录），解压后会得到一个文件夹，名字大概是 `Priestes-main` 或 `pupu-main`。

后面假设你把这个文件夹放在了 `D:\pupu`，如果你的实际路径不同，替换一下就行。

### 第二步：打开命令行并切换到项目目录

按 `Win + R`，输入 `cmd`，回车。在命令行窗口里输入：

```
cd /d D:\pupu
```

> 如果你解压的文件夹在别的位置，把 `D:\pupu` 换成你的实际路径。

确认已经切到了正确的目录，输入 `dir` 回车，应该能看到 `package.json`、`src` 文件夹这些东西。

### 第三步：安装项目依赖

```
npm install
```

这一步会根据网速花两三分钟。它会下载 Next.js、React、Tauri CLI 等项目需要的所有包，全部装到 `node_modules` 文件夹里。这段时间别关命令行窗口。

装完之后如果看到 `added xxx packages` 没有红色的 error，就说明成功了。

### 第四步：配置 API 密钥

聊天功能需要调用大模型 API。配置文件需要你手动编辑。

**4.1 复制配置文件**

在命令行里输入：

```
copy .env.example .env
```

这一步会把模板文件复制一份出来作为你的正式配置。

**4.2 编辑 .env 文件**

用文件资源管理器打开 `D:\pupu`，找到 `.env` 这个文件。右键 -> "打开方式" -> 选择"记事本"。

你会看到三行内容：

```
API_BASE_URL=https://api.deepseek.com/v1
API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
API_MODEL=deepseek-chat
```

你需要把 `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` 替换成你自己的 API 密钥。

怎么获取 API 密钥？推荐用 DeepSeek（国内可以直接访问，价格便宜）：

1. 打开 https://platform.deepseek.com/api_keys
2. 注册账号并登录
3. 点击"创建 API Key"，复制生成的密钥（格式是 `sk-` 开头的一长串字符）
4. 回到记事本，把 `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` 替换成你刚复制的密钥
5. 保存并关闭

如果你用的是 OpenAI 或其他服务商，把 `API_BASE_URL` 和 `API_MODEL` 也按实际情况改掉就行。

> 不配置 API 密钥也不会不能运行。单击互动、拖拽移动这些本地功能都不受影响。只是聊天的时候她会用内置的固定台词回复你，而不是 AI 生成的内容。

### 第五步：构建安装包

回到命令行窗口（就是刚才跑 `npm install` 的那个），输入：

```
npx tauri build
```

第一次构建需要从网络下载 Rust 依赖并全量编译，根据你的网速和电脑性能，大概需要 5 到 15 分钟。这段时间命令行会不断刷各种编译信息，耐心等就行，不要关窗口。

看到 `Finished release [optimized]` 或者类似 "Build completed" 的信息，说明构建成功了。

### 第六步：找到安装包

用文件资源管理器打开这个路径：

```
D:\pupu\src-tauri\target\release\bundle\nsis\
```

里面会有一个形如 `Priestes_1.0.0_x64-setup.exe` 的文件，这就是桌面版的安装包。

### 第七步：安装并运行

双击那个 exe 文件，按照安装向导走就行。安装语言可以选简体中文。安装路径用默认的，一路下一步。

装完之后，在开始菜单里搜 "Priestes"，点击启动。普瑞赛斯会出现在桌面右下角。

操作方法：
- **单击**宠物身体——她会随机切换情绪（生气、开心、哭泣），并弹出气泡
- **双击**宠物身体——打开聊天窗口，用 AI 驱动的角色对话
- **按住拖拽**宠物——把她挪到屏幕上你喜欢的位置

---

## 常见操作

### 怎么关闭桌宠

普瑞赛斯的窗口没有标题栏和关闭按钮，退出方式如下：

1. 按 `Ctrl + Shift + Esc` 打开任务管理器
2. 在"进程"列表里找到 **Priestes**
3. 右键 -> "结束任务"

或者直接在任务管理器里找到它，选中后点右下角的"结束任务"按钮。

### 怎么设置开机自动启动

1. 按 `Win + R`，输入 `shell:startup`，回车。这会打开"启动"文件夹。
2. 在文件资源管理器里找到普瑞赛斯的安装路径（一般是 `C:\Users\你的用户名\AppData\Local\Programs\Priestes\Priestes.exe` 或你安装时选的路径），右键点击 `Priestes.exe` -> "创建快捷方式"。
3. 把创建的快捷方式拖到第一步打开的"启动"文件夹里。

搞定。以后每次开机她就会自动蹦出来了。

### 怎么改她的说话风格

编辑项目文件夹里的 `character.md`（安装之前改的话需要重新构建）。如果已经装好了，直接去这个路径找：

```
%APPDATA%\com.priestes.desktop\character.md
```

用记事本打开，按你的想法修改内容和指令，保存后重启应用生效。

---

## 常见问题

**构建时报错 "glob pattern ... path not found"**

手动跑一次静态资源生成：

```
node scripts/tauri-prebuild.js
```

然后再 `npx tauri build`。

**安装后启动，不能聊天**

逐项排查：
1. 你的电脑有没有装 Node.js（cmd 里跑 `node -v` 确认）
2. `.env` 里的 `API_KEY` 有没有填对，不能还是 `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
3. 看日志文件：在文件资源管理器地址栏输入 `%APPDATA%\com.priestes.desktop\data\`，用记事本打开 `desktop-server.log`，看里面的报错信息

**窗口有白底或者能看到边框**

大概率是构建时静态资源没生成完整。回到项目目录，先 `npm run build` 生成 `out/` 目录，确认 `out/` 里面有那几张 webp 图片，然后重新 `npx tauri build`。

---

## 关于角色

| 项 | 说明 |
|---|---|
| 角色来源 | 《明日方舟》（Arknights） |
| 形象作者 | B 站 UP 主 **屑天使 DDD**，已获授权 |
| 原始版权 | Hypergryph / Yostar |

本项目中的角色形象资源（表情差分、头像）已获得创作者授权，请勿挪作他用。

---

## 许可证

本项目代码以 MIT License 开源。
