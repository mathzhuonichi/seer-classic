/**
 * The desktop shell's own tests (src-tauri: the payload resolver with Windows-style paths, the 404 answer, the payload check,
 * the save files and their writer, the first window's size): `cargo test`. Status `needs-rust`: it needs the Rust toolchain.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root} from './_harness.mjs';

const result = spawnSync('cargo', ['test', '--manifest-path', path.join(root, 'src-tauri/Cargo.toml')], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
