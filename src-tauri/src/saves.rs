//! The desktop save as files in <app data>/saves, the primary store (design/notes/platform.md 4.8): save.json, written
//! through a temporary file, fsync and rename; three rotating backups; unreadable saves kept under their own names. One writer
//! thread writes the latest save it was given, so a burst of actions costs one write.
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Runtime, State, WebviewWindow};

const SAVE: &str = "save.json";
const BACKUPS: usize = 3;
/// A backup is taken on the first write of each run and then at most this often.
const BACKUP_INTERVAL: Duration = Duration::from_secs(10 * 60);
const UNREADABLE_PREFIX: &str = "unreadable-";

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Unreadable {
    pub name: String,
    pub text: String,
}

/// What the page reads at start.
#[derive(Serialize, Debug)]
pub struct SaveFiles {
    pub save: Option<String>,
    pub unreadable: Vec<Unreadable>,
}

/// Writes `text` to `path` through `<path>.tmp`: write, fsync, rename, then fsync the folder where that is possible.
pub fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    let mut file = File::create(&temporary)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, path)?;
    #[cfg(unix)]
    if let Some(folder) = path.parent() {
        File::open(folder)?.sync_all()?;
    }
    Ok(())
}

/// The save folder.
#[derive(Clone)]
pub struct SaveFolder {
    dir: PathBuf,
}

impl SaveFolder {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn backup(&self, n: usize) -> PathBuf {
        self.dir.join(format!("backup-{n}.json"))
    }

    pub fn read(&self) -> io::Result<SaveFiles> {
        let save = match fs::read(self.dir.join(SAVE)) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        Ok(SaveFiles { save, unreadable: self.unreadable()? })
    }

    fn unreadable(&self) -> io::Result<Vec<Unreadable>> {
        let Ok(entries) = fs::read_dir(&self.dir) else { return Ok(Vec::new()) };
        let mut kept = Vec::new();
        for entry in entries {
            let name = entry?.file_name().to_string_lossy().into_owned();
            if name.starts_with(UNREADABLE_PREFIX) && name.ends_with(".json") {
                let text = String::from_utf8_lossy(&fs::read(self.dir.join(&name))?).into_owned();
                kept.push(Unreadable { name, text });
            }
        }
        kept.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(kept)
    }

    /// Whether the newest backup is missing or older than BACKUP_INTERVAL.
    fn backup_due(&self) -> bool {
        let modified = fs::metadata(self.backup(1)).and_then(|meta| meta.modified());
        modified.map_or(true, |time| SystemTime::now().duration_since(time).map_or(true, |age| age >= BACKUP_INTERVAL))
    }

    /// Shifts the backups and copies the current save into backup-1: save.json itself always stays in place.
    fn rotate(&self) -> io::Result<()> {
        let current = self.dir.join(SAVE);
        if !current.exists() {
            return Ok(());
        }
        for n in (1..BACKUPS).rev() {
            if self.backup(n).exists() {
                fs::rename(self.backup(n), self.backup(n + 1))?;
            }
        }
        write_atomic(&self.backup(1), &fs::read_to_string(&current).unwrap_or_default())
    }

    /// Replaces save.json; `first` (the run's first write) always takes a backup of the save it replaces.
    pub fn write(&self, text: &str, first: bool) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        if first || self.backup_due() {
            self.rotate()?;
        }
        write_atomic(&self.dir.join(SAVE), text)
    }

    /// Keeps an unreadable save under `name`, which the page chose (unreadable-<time>-<n>.json); never overwrites one.
    pub fn keep_unreadable(&self, name: &str, text: &str) -> io::Result<()> {
        let valid = name.starts_with(UNREADABLE_PREFIX) && name.ends_with(".json") && !name.contains(['/', '\\', ':', '\0']);
        if !valid || name.contains("..") {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, format!("not an unreadable-save name: {name}")));
        }
        fs::create_dir_all(&self.dir)?;
        let path = self.dir.join(name);
        if path.exists() {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, name.to_string()));
        }
        write_atomic(&path, text)
    }
}

#[derive(Default)]
struct Queue {
    /// The latest save not yet written and its number.
    pending: Option<(u64, String)>,
    submitted: u64,
    /// The newest save number written, and the newest that failed with its error.
    written: u64,
    failed: Option<(u64, String)>,
    busy: bool,
}

/// The writer thread and its queue of one.
pub struct SaveWriter {
    queue: Mutex<Queue>,
    changed: Condvar,
}

impl SaveWriter {
    pub fn start(folder: SaveFolder) -> Arc<Self> {
        let writer = Arc::new(Self { queue: Mutex::new(Queue::default()), changed: Condvar::new() });
        let thread = writer.clone();
        std::thread::Builder::new()
            .name("save-writer".into())
            .spawn(move || thread.run(&folder))
            .expect("the save writer thread");
        writer
    }

    fn run(&self, folder: &SaveFolder) {
        let mut first = true;
        loop {
            let (number, text) = {
                let mut queue = self.queue.lock().unwrap();
                while queue.pending.is_none() {
                    queue = self.changed.wait(queue).unwrap();
                }
                queue.busy = true;
                queue.pending.take().unwrap()
            };
            let result = folder.write(&text, first);
            first &= result.is_err();
            let mut queue = self.queue.lock().unwrap();
            queue.busy = false;
            match result {
                Ok(()) => queue.written = number,
                Err(error) => {
                    log::error!("save write failed: {error}");
                    queue.failed = Some((number, error.to_string()));
                }
            }
            self.changed.notify_all();
        }
    }

    /// Queues `text` in place of any save still waiting; returns its number.
    pub fn submit(&self, text: String) -> u64 {
        let mut queue = self.queue.lock().unwrap();
        queue.submitted += 1;
        let number = queue.submitted;
        queue.pending = Some((number, text));
        self.changed.notify_all();
        number
    }

    /// Waits until save `number`, or a later one, is on disk; the error of the write that failed for it otherwise.
    pub fn wait(&self, number: u64) -> Result<(), String> {
        let mut queue = self.queue.lock().unwrap();
        loop {
            if queue.written >= number {
                return Ok(());
            }
            if let Some((failed, error)) = &queue.failed {
                if *failed >= number {
                    return Err(error.clone());
                }
            }
            queue = self.changed.wait(queue).unwrap();
        }
    }

    /// Waits until nothing is waiting or being written (before a read, and when the app quits).
    pub fn drain(&self) {
        let mut queue = self.queue.lock().unwrap();
        while queue.pending.is_some() || queue.busy {
            queue = self.changed.wait(queue).unwrap();
        }
    }
}

/// The save folder and its writer, managed by the app.
pub struct SaveState {
    folder: SaveFolder,
    writer: Arc<SaveWriter>,
}

impl SaveState {
    pub fn open(dir: PathBuf) -> Self {
        let folder = SaveFolder::new(dir);
        Self { writer: SaveWriter::start(folder.clone()), folder }
    }

    /// Finishes the write in progress and the one waiting (the app is quitting).
    pub fn drain(&self) {
        self.writer.drain();
    }
}

/// Runs blocking file work off the main thread.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())?
}

/// The save files, once any write still waiting is on disk (a reload reads what the last page wrote).
#[tauri::command]
pub async fn read_save(state: State<'_, SaveState>) -> Result<SaveFiles, String> {
    let (folder, writer) = (state.folder.clone(), state.writer.clone());
    blocking(move || {
        writer.drain();
        folder.read().map_err(|error| error.to_string())
    })
    .await
}

/// Hands the save to the writer; resolves once it, or a later save, is on disk.
#[tauri::command]
pub async fn write_save(state: State<'_, SaveState>, text: String) -> Result<(), String> {
    let number = state.writer.submit(text);
    let writer = state.writer.clone();
    blocking(move || writer.wait(number)).await
}

#[tauri::command]
pub async fn keep_unreadable_save(state: State<'_, SaveState>, name: String, text: String) -> Result<(), String> {
    let folder = state.folder.clone();
    blocking(move || folder.keep_unreadable(&name, &text).map_err(|error| error.to_string())).await
}

/// Where the player chose to export, or None when the dialog was cancelled.
async fn export_path<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, file_name: String) -> Result<Option<PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;
    blocking(move || {
        let chosen = app.dialog().file().set_parent(&window).set_file_name(file_name).add_filter("存档", &["json"]).blocking_save_file();
        chosen.map(|path| path.into_path().map_err(|error| error.to_string())).transpose()
    })
    .await
}

/// Exports a save where the player chooses; returns the file's path, or None when the player cancelled.
#[tauri::command]
pub async fn export_save<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, text: String, file_name: String) -> Result<Option<String>, String> {
    let Some(path) = export_path(app, window, file_name).await? else { return Ok(None) };
    let shown = path.display().to_string();
    blocking(move || write_atomic(&path, &text).map_err(|error| error.to_string())).await?;
    log::info!("save exported to {shown}");
    Ok(Some(shown))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> (SaveFolder, PathBuf) {
        let dir = std::env::temp_dir().join(format!("seer-saves-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        (SaveFolder::new(dir.clone()), dir)
    }

    #[test]
    fn a_first_start_has_no_save_and_writes_create_one() {
        let (saves, dir) = folder("first");
        let read = saves.read().unwrap();
        assert_eq!((read.save, read.unreadable), (None, vec![]));
        saves.write("{\"version\":5}", true).unwrap();
        assert_eq!(saves.read().unwrap().save.as_deref(), Some("{\"version\":5}"));
        assert!(!dir.join("save.tmp").exists() && !dir.join("backup-1.json").exists());
    }

    #[test]
    fn each_run_backs_up_the_save_it_replaces_and_keeps_three() {
        let (saves, dir) = folder("rotate");
        for (n, first) in [(1, true), (2, true), (3, true), (4, true), (5, true)] {
            saves.write(&format!("save {n}"), first).unwrap();
        }
        let backup = |n: usize| fs::read_to_string(dir.join(format!("backup-{n}.json"))).unwrap();
        assert_eq!((backup(1), backup(2), backup(3)), ("save 4".into(), "save 3".into(), "save 2".into()));
        assert!(!dir.join("backup-4.json").exists());
        // Later writes of the same run take no backup while the newest one is recent.
        saves.write("save 6", false).unwrap();
        assert_eq!(backup(1), "save 4");
        assert_eq!(saves.read().unwrap().save.as_deref(), Some("save 6"));
    }

    #[test]
    fn unreadable_saves_are_kept_listed_and_never_overwritten() {
        let (saves, _) = folder("unreadable");
        saves.keep_unreadable("unreadable-2-1.json", "{\"version\":99}").unwrap();
        saves.keep_unreadable("unreadable-1-1.json", "not json").unwrap();
        assert!(saves.keep_unreadable("unreadable-1-1.json", "again").is_err());
        for name in ["save.json", "unreadable-../save.json", "unreadable-a\\b.json", "unreadable-c:.json", "backup-1.json"] {
            assert!(saves.keep_unreadable(name, "x").is_err(), "{name}");
        }
        let names: Vec<String> = saves.read().unwrap().unreadable.into_iter().map(|kept| kept.name).collect();
        assert_eq!(names, ["unreadable-1-1.json", "unreadable-2-1.json"]);
    }

    #[test]
    fn the_writer_writes_the_latest_save_and_reports_failures() {
        let (saves, dir) = folder("writer");
        let writer = SaveWriter::start(saves);
        let last = (1..=50).map(|n| writer.submit(format!("save {n}"))).last().unwrap();
        assert_eq!(writer.wait(last), Ok(()));
        writer.drain();
        assert_eq!(fs::read_to_string(dir.join("save.json")).unwrap(), "save 50");
        // A file where the folder should be makes every write fail.
        let (blocked, blocked_dir) = folder("blocked");
        fs::write(&blocked_dir, "not a folder").unwrap();
        let failing = SaveWriter::start(blocked);
        let number = failing.submit("save".into());
        assert!(failing.wait(number).is_err());
        fs::remove_file(blocked_dir).unwrap();
    }

    #[test]
    fn atomic_writes_leave_no_temporary_file() {
        let (_, dir) = folder("atomic");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("export.json");
        write_atomic(&path, "one").unwrap();
        write_atomic(&path, "two").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        assert!(!dir.join("export.tmp").exists());
    }
}
