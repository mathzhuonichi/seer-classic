//! The game's files through Tauri's own protocol, so the page keeps its origin (tauri://localhost, on Windows
//! http://tauri.localhost) and with it the storage of earlier versions: the embedded code build (index.html, assets/, ruffle/)
//! first, then the payload under <resource dir>/public. A path that is in neither is answered 404, not with Tauri's index.html.
use std::borrow::Cow;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, Assets, Manager, Runtime};

/// The payload directory beside the executable, known once the app has its resource directory.
#[derive(Default)]
pub struct PublicDir(OnceLock<PathBuf>);

impl PublicDir {
    /// The payload's root: `public` in the resource directory (Contents/Resources on macOS, the exe's folder on Windows).
    pub fn root(&self) -> Option<&Path> {
        self.0.get().map(PathBuf::as_path)
    }

    fn set(&self, root: &Path) {
        if let Ok(canonical) = root.canonicalize() {
            let _ = self.0.set(canonical);
        }
    }

    pub fn resolve(&self, url_path: &str) -> Option<PathBuf> {
        resolve(self.root()?, url_path)
    }
}

/// Percent-decodes a request's URL path; None when it is not UTF-8.
pub fn decode(url_path: &str) -> Option<String> {
    percent_encoding::percent_decode_str(url_path).decode_utf8().ok().map(Cow::into_owned)
}

/// The file below `root` (canonical) that a decoded URL path names, or None. Rejects NUL, backslashes, colons (Windows drive
/// letters and streams), `..` and paths that are absolute after the leading slash; the canonical file (links resolved) must
/// lie inside `root` and be a regular file.
pub fn resolve(root: &Path, url_path: &str) -> Option<PathBuf> {
    if url_path.contains(['\0', '\\', ':']) {
        return None;
    }
    let relative = url_path.strip_prefix('/').unwrap_or(url_path);
    if relative.starts_with('/') {
        return None;
    }
    let mut file = root.to_path_buf();
    for segment in relative.split('/') {
        match segment {
            "" | "." => {}
            ".." => return None,
            name => file.push(name),
        }
    }
    let canonical = file.canonicalize().ok()?;
    (canonical != root && canonical.starts_with(root) && canonical.is_file()).then_some(canonical)
}

/// The page itself, which Tauri serves as index.html.
fn is_page(path: &str) -> bool {
    matches!(path, "" | "/" | "/index.html")
}

/// Assets that read the payload after the embedded build.
pub struct GameAssets<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    public: Arc<PublicDir>,
}

impl<R: Runtime> GameAssets<R> {
    pub fn new(embedded: Box<dyn Assets<R>>, public: Arc<PublicDir>) -> Self {
        Self { embedded, public }
    }

    /// The embedded files' URL paths (`/index.html`, `/assets/…`), for the 404 decision.
    pub fn embedded_paths(&self) -> HashSet<String> {
        self.embedded.iter().map(|(key, _)| key.into_owned()).collect()
    }
}

impl<R: Runtime> Assets<R> for GameAssets<R> {
    fn setup(&self, app: &App<R>) {
        self.embedded.setup(app);
        if let Ok(resources) = app.path().resource_dir() {
            self.public.set(&resources.join("public"));
        }
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        self.embedded.get(key).or_else(|| std::fs::read(self.public.resolve(key.as_ref())?).ok().map(Cow::Owned))
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.embedded.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.embedded.csp_hashes(html_path)
    }
}

/// Holds nothing: stands in for the embedded assets while GameAssets takes them over.
pub struct EmptyAssets;

impl<R: Runtime> Assets<R> for EmptyAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }

    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// Whether Tauri's answer to `url_path` is the file itself rather than its index.html fallback.
pub fn serves_file(url_path: &str, embedded: &HashSet<String>, public: &PublicDir) -> bool {
    decode(url_path).is_some_and(|path| is_page(&path) || embedded.contains(&path) || public.resolve(&path).is_some())
}

/// A web resource handler that turns Tauri's index.html fallback for a missing file into a 404, so the loaders see the
/// missing file as missing.
pub fn not_found_handler(
    embedded: HashSet<String>,
    public: Arc<PublicDir>,
) -> impl Fn(Request<Vec<u8>>, &mut Response<Cow<'static, [u8]>>) + Send + Sync + 'static {
    move |request, response| {
        if !serves_file(request.uri().path(), &embedded, &public) {
            *response.status_mut() = StatusCode::NOT_FOUND;
            response.headers_mut().insert(header::CONTENT_TYPE, header::HeaderValue::from_static("text/plain"));
            *response.body_mut() = Cow::Borrowed(b"not found");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A payload root with portraits/1.png, a file beside the root and (on Unix) a link that leaves the root.
    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("seer-public-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let root = base.join("public");
        fs::create_dir_all(root.join("portraits")).unwrap();
        fs::write(root.join("portraits/1.png"), b"png").unwrap();
        fs::write(root.join("portraits/a b.png"), b"space").unwrap();
        fs::write(base.join("secret.txt"), b"secret").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(base.join("secret.txt"), root.join("portraits/link.png")).unwrap();
        (root.canonicalize().unwrap(), base)
    }

    #[test]
    fn resolves_files_inside_the_root() {
        let (root, _) = fixture("inside");
        assert_eq!(resolve(&root, "/portraits/1.png"), Some(root.join("portraits/1.png")));
        assert_eq!(resolve(&root, "portraits//./1.png"), Some(root.join("portraits/1.png")));
        assert_eq!(resolve(&root, &decode("/portraits/a%20b.png").unwrap()), Some(root.join("portraits/a b.png")));
    }

    #[test]
    fn rejects_paths_that_leave_the_root_or_are_not_files() {
        let (root, _) = fixture("outside");
        for path in ["/../secret.txt", "/portraits/../../secret.txt", "//etc/passwd", "/", "", "/portraits", "/missing.png"] {
            assert_eq!(resolve(&root, path), None, "{path}");
        }
        #[cfg(unix)]
        assert_eq!(resolve(&root, "/portraits/link.png"), None);
        assert_eq!(resolve(&root, &decode("/%2e%2e/secret.txt").unwrap()), None);
        assert_eq!(decode("/%ff.png"), None);
    }

    #[test]
    fn rejects_windows_style_paths() {
        let (root, _) = fixture("windows");
        for path in [
            "/C:/Windows/win.ini",
            "C:\\Windows\\win.ini",
            "/portraits\\1.png",
            "/..\\secret.txt",
            "/\\\\server\\share\\file",
            "/portraits/1.png:stream",
            "/portraits/1.png\0",
        ] {
            assert_eq!(resolve(&root, path), None, "{path:?}");
        }
        assert_eq!(resolve(&root, &decode("/C%3A/Windows/win.ini").unwrap()), None);
        assert_eq!(resolve(&root, &decode("/..%5csecret.txt").unwrap()), None);
    }

    #[test]
    fn only_missing_files_get_the_not_found_answer() {
        let (root, _) = fixture("handler");
        let public = PublicDir::default();
        public.set(&root);
        let embedded: HashSet<String> = ["/index.html".to_string(), "/assets/index.js".to_string()].into();
        for served in ["/", "/index.html", "/assets/index.js", "/portraits/1.png", "/portraits/a%20b.png"] {
            assert!(serves_file(served, &embedded, &public), "{served}");
        }
        for missing in ["/portraits/2.png", "/assets/missing.js", "/../secret.txt", "/%ff"] {
            assert!(!serves_file(missing, &embedded, &public), "{missing}");
        }
        let handler = not_found_handler(embedded, Arc::new(public));
        let mut response = Response::new(Cow::Borrowed(&b"<html>"[..]));
        handler(Request::builder().uri("tauri://localhost/portraits/2.png").body(Vec::new()).unwrap(), &mut response);
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let mut response = Response::new(Cow::Borrowed(&b"png"[..]));
        handler(Request::builder().uri("http://tauri.localhost/portraits/1.png?v=2").body(Vec::new()).unwrap(), &mut response);
        assert_eq!(response.status(), StatusCode::OK);
    }
}
