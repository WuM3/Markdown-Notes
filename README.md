# 个人 Markdown 云笔记

一个运行在个人 Windows 电脑上的局域网笔记网站。文档直接保存为普通 Markdown 文件，支持多级目录、所见即所得编辑、自动保存、搜索、最近文档、回收站、附件和 ZIP 导出。

## 快速开始

要求：Node.js 20 或更高版本。

```powershell
npm install
Copy-Item .env.example .env
npm run build
.\scripts\start.ps1

手动启动

npm install
npm run build
npm start

启动成功后浏览器访问：

http://localhost:3210

验证是否安装成功：

Get-ScheduledTask -TaskName PersonalMarkdownNotes


如果能看到任务，说明开机登录后会自动启动。你也可以手动启动它：

Start-ScheduledTask -TaskName PersonalMarkdownNotes


npm run dev：开发用，网页地址通常是 http://localhost:5173，后端是 3211。
npm start：正式使用，网页和 API 都在 http://localhost:3210。

```

浏览器访问：

- 本机：`http://127.0.0.1:3210`
- 其他局域网设备：使用启动日志显示的 `http://局域网IP:3210`

如果其他设备无法连接，请用管理员 PowerShell 运行：

```powershell
.\scripts\allow-firewall.ps1
```

## 开机自动运行

安装当前用户登录后的自动启动任务：

```powershell
.\scripts\install-startup.ps1
```

卸载自动启动任务：

```powershell
.\scripts\uninstall-startup.ps1
```

后台运行日志位于 `data/server.log`。

## 开发

```powershell
npm run dev
```

开发页面默认使用 `http://127.0.0.1:5173`，Vite 会把 API 请求代理到本地 Fastify 服务。

常用检查：

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## Android APP

Android APP 是局域网客户端，Markdown 和附件仍只保存在运行 Fastify 服务的电脑上。APP 与电脑必须连接同一可信局域网。

首次启动 APP 时填写电脑地址，例如：

```text
http://192.168.1.10:3210
```

地址可以省略 `http://`。连接成功后 APP 会保存最近 5 个服务器地址。导航栏中的“服务器设置”可以测试、切换或删除历史地址。

### Android 工具链

- Node.js 22 或更高版本
- JDK 21
- Android Studio 与 Android SDK
- Android SDK Platform 36、Build Tools、Platform Tools
- 最低支持 Android 7.0（API 24）

确保环境变量指向 Android SDK：

```powershell
$env:ANDROID_HOME = "E:\Android-SDK"
$env:ANDROID_SDK_ROOT = "E:\Android-SDK"
```

### 构建与安装

```powershell
npm run android:sync
npm run android:open
npm run android:debug
npm run android:test
npm run android:apk
```

仓库位于中文路径时，Android Gradle 的 JUnit worker 无法直接加载测试 classpath。`android:test` 会临时映射一个空闲 ASCII 盘符运行测试，并在结束后自动解除映射。

- Debug APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- 签名 Release APK：`android/app/build/outputs/apk/release/app-release.apk`

首次运行 `npm run android:apk` 会在本机生成 release keystore、签名属性和密码备份。这些文件已加入 `.gitignore`。请离线备份：

```text
android/app/markdown-notes-release.jks
android/signing-password.txt
```

更新 APP 时继续使用同一 keystore，并提高 `android/app/build.gradle` 中的 `versionCode`。手机允许安装未知来源应用后，可以直接打开 APK 安装；也可以使用：

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

如果 APP 无法连接，请确认电脑服务正在监听 `0.0.0.0:3210`、Windows 防火墙已放行端口，并且填写的是电脑的局域网 IPv4 地址而不是 `127.0.0.1`。

## 数据目录

默认数据保存在：

```text
data/
  notes/
    目录/
      文档.md
      .assets/
        文档ID/
          图片或附件
  .trash/
```

每篇 Markdown 文件仅在顶部增加 `id`、`title`、`createdAt` 三项 YAML frontmatter，正文仍可直接使用其他 Markdown 软件读取。

可在 `.env` 中修改：

```dotenv
HOST=0.0.0.0
PORT=3210
DATA_DIR=./data
IMAGE_LIMIT_MB=20
ATTACHMENT_LIMIT_MB=100
```

## 使用说明

- 输入 `/` 打开块插入菜单。
- 支持 H1-H5、列表、任务、引用、代码块、分割线、链接、图片和 GFM 表格。
- 顶部“插入”菜单可添加图片、附件和 Markdown alert 高亮块。
- 停止输入约 800ms 后自动保存。
- 两台设备同时修改同一文档时，后提交者会看到冲突提示，不会静默覆盖。
- “导出全部笔记”会下载包含笔记、附件和回收站的 ZIP。

## 安全与备份

本项目没有登录和 HTTPS，只应运行在可信局域网。任何能访问端口的设备都可以编辑或删除笔记。

项目不内置自动备份。建议定期使用 ZIP 导出，或直接复制整个 `DATA_DIR` 到其他磁盘。