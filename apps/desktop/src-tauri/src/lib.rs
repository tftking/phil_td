/// The desktop app is a window around the web client; all game logic lives
/// in the client (offline modes) or on the game server (online play).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Poker TD");
}
