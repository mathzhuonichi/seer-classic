//! The startup check of the payload that ships beside the executable (tools/distribution/stage_desktop_payload.py writes its
//! payload.json): it must be there, be of this app's version and hold every listed file at its listed size.
use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

pub const MANIFEST: &str = "payload.json";
/// The player's message when the check fails.
pub const INCOMPLETE: &str = "资源不完整，请重新解压或安装。";

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub version: String,
    pub files: usize,
    /// Each file's size in bytes and SHA-256, by its path below the payload root.
    pub entries: HashMap<String, (u64, String)>,
}

/// Reads the payload's manifest and checks its version: an error says what is wrong.
pub fn read(root: &Path, version: &str) -> Result<Manifest, String> {
    let text = std::fs::read_to_string(root.join(MANIFEST)).map_err(|error| format!("{MANIFEST}: {error}"))?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|error| format!("{MANIFEST}: {error}"))?;
    if manifest.version != version {
        return Err(format!("payload version {} does not match the app's {version}", manifest.version));
    }
    if manifest.files != manifest.entries.len() {
        return Err(format!("{MANIFEST} lists {} of {} files", manifest.entries.len(), manifest.files));
    }
    Ok(manifest)
}

/// Checks that every listed file exists at its listed size (a partly extracted archive fails here); an error names the
/// first missing or changed files.
pub fn check_files(root: &Path, manifest: &Manifest) -> Result<(), String> {
    const NAMED: usize = 5;
    let mut wrong: Vec<&str> = manifest
        .entries
        .iter()
        .filter(|(path, (size, _))| std::fs::metadata(root.join(path)).map_or(true, |meta| !meta.is_file() || meta.len() != *size))
        .map(|(path, _)| path.as_str())
        .collect();
    if wrong.is_empty() {
        return Ok(());
    }
    wrong.sort_unstable();
    Err(format!("{} payload files missing or changed: {}", wrong.len(), wrong[..wrong.len().min(NAMED)].join(", ")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn payload(name: &str, manifest: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("seer-payload-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("portraits")).unwrap();
        fs::write(root.join("portraits/1.png"), b"12345").unwrap();
        fs::write(root.join(MANIFEST), manifest).unwrap();
        root
    }

    const GOOD: &str = r#"{"version":"1.2.3","files":1,"bytes":5,"entries":{"portraits/1.png":[5,"ab"]}}"#;

    #[test]
    fn accepts_a_complete_payload_of_this_version() {
        let root = payload("good", GOOD);
        let manifest = read(&root, "1.2.3").unwrap();
        assert!(check_files(&root, &manifest).is_ok());
    }

    #[test]
    fn refuses_a_missing_manifest_or_another_version() {
        let root = payload("version", GOOD);
        assert!(read(&root, "1.2.4").unwrap_err().contains("1.2.3"));
        fs::remove_file(root.join(MANIFEST)).unwrap();
        assert!(read(&root, "1.2.3").unwrap_err().starts_with(MANIFEST));
        fs::write(root.join(MANIFEST), "{").unwrap();
        assert!(read(&root, "1.2.3").is_err());
    }

    #[test]
    fn refuses_missing_or_changed_files() {
        let root = payload("files", GOOD);
        let manifest = read(&root, "1.2.3").unwrap();
        fs::write(root.join("portraits/1.png"), b"1234").unwrap();
        assert!(check_files(&root, &manifest).unwrap_err().contains("portraits/1.png"));
        fs::remove_file(root.join("portraits/1.png")).unwrap();
        assert!(check_files(&root, &manifest).unwrap_err().starts_with("1 payload files"));
        let short = payload("count", r#"{"version":"1.2.3","files":2,"bytes":5,"entries":{"portraits/1.png":[5,"ab"]}}"#);
        assert!(read(&short, "1.2.3").is_err());
    }
}
