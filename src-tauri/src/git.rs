//! Synchronizacja biblioteki przez Git (alternatywa bez serwera Iggy): commit, pull --rebase, push.
use std::path::Path;
use std::process::Command;

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| format!("Nie można uruchomić git ({e}). Czy Git jest zainstalowany?"))?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    if out.status.success() { Ok(text.trim().to_string()) } else { Err(text.trim().to_string()) }
}

#[tauri::command]
pub async fn git_sync(root: String, remote: Option<String>, message: String) -> Result<String, String> {
    let root = Path::new(&root);
    if !root.is_dir() {
        return Err("Katalog biblioteki nie istnieje.".into());
    }
    let mut log = Vec::new();
    if !root.join(".git").exists() {
        git(root, &["init", "-b", "main"])?;
        log.push("Utworzono repozytorium.".to_string());
    }
    let ignore = root.join(".gitignore");
    if !ignore.exists() {
        std::fs::write(&ignore, ".iggy/\n.DS_Store\n").map_err(|e| e.to_string())?;
    }
    let remote = remote.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
    if let Some(url) = &remote {
        match git(root, &["remote", "get-url", "origin"]) {
            Ok(cur) if cur == *url => {}
            Ok(_) => { git(root, &["remote", "set-url", "origin", url.as_str()])?; }
            Err(_) => { git(root, &["remote", "add", "origin", url.as_str()])?; }
        }
    }
    git(root, &["add", "-A"])?;
    match git(root, &["commit", "-m", message.as_str()]) {
        Ok(_) => log.push("Zapisano zmiany (commit).".into()),
        Err(e) if e.contains("nothing to commit") || e.contains("nic do złożenia") => log.push("Brak lokalnych zmian.".into()),
        Err(e) => return Err(e),
    }
    if remote.is_some() || git(root, &["remote", "get-url", "origin"]).is_ok() {
        let branch = git(root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        let has_remote_branch = git(root, &["ls-remote", "--heads", "origin", branch.as_str()]).map(|o| !o.is_empty())?;
        if has_remote_branch {
            if let Err(e) = git(root, &["pull", "--rebase", "--autostash", "origin", branch.as_str()]) {
                let _ = git(root, &["rebase", "--abort"]);
                return Err(format!("Konflikt przy pobieraniu zmian — rozwiąż go w terminalu (git pull).\n{e}"));
            }
            log.push("Pobrano zmiany.".into());
        }
        git(root, &["push", "-u", "origin", branch.as_str()])?;
        log.push("Wysłano zmiany.".into());
    } else {
        log.push("Brak zdalnego repozytorium — zmiany są tylko lokalnie.".into());
    }
    Ok(log.join(" "))
}
