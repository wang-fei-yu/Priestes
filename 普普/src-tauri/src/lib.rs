use tauri::command;
use tauri::Manager;
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 嵌入式 desktop-server.js（编译到二进制中，避免中文路径问题）
/// 源文件从 D:\普瑞赛斯\scripts\desktop-server.js 复制到 src-tauri/ 目录（无中文路径）
const DESKTOP_SERVER_JS: &str = include_str!("../desktop-server.js");

/// 嵌入式 character.md（角色设定）
const CHARACTER_MD: &str = include_str!("../character.md");

/// Global state for the Node.js server child process
struct ServerState(Mutex<Option<std::process::Child>>);

/// Open a URL in the system's default handler (browser or app via deep link)
#[command]
async fn open_music_url(url: String) -> Result<(), String> {
    // Use the `open` crate functionality via tauri-plugin-shell
    // The actual opening is done from the frontend via @tauri-apps/plugin-shell
    // This command is a fallback for environments where shell plugin isn't available
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    Ok(())
}

/// Detect installed music players on the system
#[command]
async fn detect_music_players() -> Result<Vec<MusicPlayerInfo>, String> {
    let mut players = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use std::path::Path;

        // Check common install paths for music players
        let common_paths = [
            (
                "netease",
                "网易云音乐",
                "orpheus://",
                r"C:\Program Files (x86)\Netease\CloudMusic\cloudmusic.exe",
            ),
            (
                "kugou",
                "酷狗音乐",
                "kugou://",
                r"C:\Program Files (x86)\KuGou\KGMusic\KuGou.exe",
            ),
            (
                "qqmusic",
                "QQ音乐",
                "qqmusic://",
                r"C:\Program Files (x86)\Tencent\QQMusic\QQMusic.exe",
            ),
        ];

        for (key, name, protocol, path) in common_paths {
            let installed = Path::new(path).exists();
            players.push(MusicPlayerInfo {
                key: key.to_string(),
                name: name.to_string(),
                deep_link_protocol: protocol.to_string(),
                installed,
            });
        }

        // Also check registry for NetEase Cloud Music
        if let Ok(output) = std::process::Command::new("reg")
            .args(&[
                "query",
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
                "/s",
                "/f",
                "CloudMusic",
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("CloudMusic") {
                if let Some(player) = players.iter_mut().find(|p| p.key == "netease") {
                    player.installed = true;
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On non-Windows, report all players as potentially available
        // (deep links will be tried and fail gracefully if not installed)
        players.push(MusicPlayerInfo {
            key: "netease".to_string(),
            name: "网易云音乐".to_string(),
            deep_link_protocol: "orpheus://".to_string(),
            installed: false,
        });
        players.push(MusicPlayerInfo {
            key: "kugou".to_string(),
            name: "酷狗音乐".to_string(),
            deep_link_protocol: "kugou://".to_string(),
            installed: false,
        });
        players.push(MusicPlayerInfo {
            key: "qqmusic".to_string(),
            name: "QQ音乐".to_string(),
            deep_link_protocol: "qqmusic://".to_string(),
            installed: false,
        });
    }

    Ok(players)
}

#[derive(serde::Serialize)]
struct MusicPlayerInfo {
    key: String,
    name: String,
    deep_link_protocol: String,
    installed: bool,
}

/// Search PATH and common install paths to find node.exe
fn find_node() -> Option<std::path::PathBuf> {
    // 1. Search PATH — 用 File::open 代替 exists() 避免中文路径问题
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join("node.exe");
            if std::fs::File::open(&candidate).is_ok() {
                log::info!("Found node.exe at {} (PATH)", candidate.display());
                return Some(candidate);
            }
        }
    }

    // 2. Common install paths
    let common_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];
    for path_str in &common_paths {
        let p = std::path::Path::new(path_str);
        if std::fs::File::open(p).is_ok() {
            log::info!("Found node.exe at {} (common path)", p.display());
            return Some(p.to_path_buf());
        }
    }

    // 3. User-local paths (nvm-windows, fnm, etc.)
    for var in ["APPDATA", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(var) {
            let node_dirs = [
                std::path::Path::new(&base).join("nvm"),
                std::path::Path::new(&base).join("fnm"),
            ];
            for dir in &node_dirs {
                if std::fs::read_dir(dir).is_ok() {
                    if let Ok(entries) = std::fs::read_dir(dir) {
                        let mut versions: Vec<_> = entries
                            .filter_map(|e| e.ok())
                            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                            .collect();
                        versions.sort_by_key(|e| e.file_name());
                        if let Some(latest) = versions.last() {
                            let node_exe = latest.path().join("node.exe");
                            if std::fs::File::open(&node_exe).is_ok() {
                                log::info!("Found node.exe at {} (version manager)", node_exe.display());
                                return Some(node_exe);
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Start the lightweight desktop-server.js as a background process
fn start_node_server(app: &tauri::App) -> Result<std::process::Child, String> {
    // ── 获取 app_data_dir（可写，无中文路径问题） ──
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    let data_dir = app_data_dir.join("data");
    let root_dir = app_data_dir.clone();

    // ── 将嵌入的 server 脚本和角色设定写入磁盘 ──
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("无法创建 data 目录: {}", e))?;

    let server_js_path = data_dir.join("desktop-server.js");
    std::fs::write(&server_js_path, DESKTOP_SERVER_JS)
        .map_err(|e| format!("无法写入 server 脚本: {}", e))?;

    // ── 写入 character.md（仅首次，之后不再覆盖，方便用户修改人设） ──
    let char_md_path = root_dir.join("character.md");
    if !char_md_path.exists() {
        std::fs::write(&char_md_path, CHARACTER_MD)
            .map_err(|e| format!("无法写入 character.md: {}", e))?;
    }

    // ── API 配置（从环境变量或配置文件读取） ──
    // 请参考 README.md 中的「API 配置」章节了解如何设置
    let api_key = std::env::var("API_KEY").unwrap_or_else(|_| {
        // 尝试从 api-config.json 读取（与脚本同目录）
        let config_path = root_dir.join("api-config.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(key) = cfg.get("apiKey").and_then(|v| v.as_str()) {
                    return key.to_string();
                }
            }
        }
        String::new()
    });
    let api_base_url = std::env::var("API_BASE_URL").unwrap_or_else(|_| {
        "https://api.deepseek.com/v1".to_string()
    });
    let model = std::env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| {
        "deepseek-chat".to_string()
    });

    // ── 查找 node.exe ──
    let node_path = find_node()
        .ok_or_else(|| {
            "Node.js 未找到！请从 https://nodejs.org 安装 Node.js (LTS版本)".to_string()
        })?;

    // ── 设置日志文件 ──
    let stdout_log = data_dir.join("desktop-server.log");
    let stderr_log = data_dir.join("desktop-server-err.log");
    let _ = std::fs::write(&stdout_log, "");
    let _ = std::fs::write(&stderr_log, "");

    let stdout_file = std::fs::File::create(&stdout_log)
        .map_err(|e| format!("无法创建日志文件: {}", e))?;
    let stderr_file = std::fs::File::create(&stderr_log)
        .map_err(|e| format!("无法创建错误日志文件: {}", e))?;

    // ── 启动 Node.js 进程 ──
    let mut cmd = std::process::Command::new(&node_path);
    cmd.arg(&server_js_path)
        .env("PORT", "3001")
        .env("HOST", "127.0.0.1")
        .env("API_KEY", &api_key)
        .env("API_BASE_URL", &api_base_url)
        .env("DEEPSEEK_MODEL", &model)
        .env("DATA_DIR", data_dir.to_str().unwrap_or(""))
        .stdout(stdout_file)
        .stderr(stderr_file);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let child = cmd.spawn()
        .map_err(|e| format!("无法启动 Node.js ({}): {}\n请确保已安装 Node.js：https://nodejs.org",
            node_path.display(), e))?;

    log::info!("Node.js started: {}", node_path.display());
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerState(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            } else {
                // Production mode: start the Node.js API server
                match start_node_server(app) {
                    Ok(child) => {
                        let pid = child.id();
                        log::info!("API server started with PID {}", pid);

                        let state = app.state::<ServerState>();
                        *state.0.lock().unwrap() = Some(child);

                        // Wait for the server to be ready (TCP port check, max 5s)
                        let mut server_ready = false;
                        for _ in 0..50 {
                            if std::net::TcpStream::connect("127.0.0.1:3001").is_ok() {
                                server_ready = true;
                                log::info!("API server is ready on port 3001");
                                break;
                            }
                            std::thread::sleep(std::time::Duration::from_millis(100));
                        }

                        if !server_ready {
                            // Write error flag for frontend to read
                            let data_dir = app.path().app_data_dir()
                                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                                .join("data");
                            std::fs::create_dir_all(&data_dir).ok();
                            let _ = std::fs::write(
                                data_dir.join("server_error.flag"),
                                "桌面服务器启动超时（5秒）。请检查日志文件查看错误。"
                            );
                            log::error!("API server failed to start within 5 seconds");
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to start API server: {}", e);
                        // Write error to a visible location
                        let data_dir = app.path().app_data_dir()
                            .unwrap_or_else(|_| std::path::PathBuf::from("."))
                            .join("data");
                        std::fs::create_dir_all(&data_dir).ok();
                        let _ = std::fs::write(
                            data_dir.join("server_error.flag"),
                            &format!("桌面服务器启动失败: {}", e)
                        );
                    }
                }
            }

            // Show the main window after setup is complete (window starts hidden
            // via "visible": false to avoid initial size flash before fullscreen)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_music_url, detect_music_players])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the Node.js server when the window is closed
                if let Some(mut child) = window.state::<ServerState>()
                    .0.lock().ok().and_then(|mut g| g.take())
                {
                    let _ = child.kill();
                    log::info!("API server terminated");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
