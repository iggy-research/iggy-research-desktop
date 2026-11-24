mod git;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)] // na macOS bez single-instance
    let mut builder = tauri::Builder::default();

    // Linux/Windows: drugie uruchomienie (np. z linku iggyresearch://auth?code=…) przekazuje link do działającej
    // aplikacji; na macOS system robi to sam. Wtyczka musi być zarejestrowana jako pierwsza.
    #[cfg(any(target_os = "linux", windows))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            // Linux (AppImage, dev) i Windows: schemat trzeba zarejestrować w systemie przy starcie
            #[cfg(any(target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![git::git_sync])
        .run(tauri::generate_context!())
        .expect("error while running Iggy Research");
}
