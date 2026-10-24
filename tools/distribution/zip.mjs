/**
 * A ZIP writer for the browser package (pack_browser.mjs), readable by Windows Explorer and macOS Archive Utility: UTF-8 names
 * (general purpose bit 11, so 启动游戏-Windows.bat keeps its name on a Chinese or English Windows), Unix modes in the external
 * attributes (the .command and the macOS node stay executable), deflate where it saves space and stored bytes otherwise. It
 * deliberately writes no ZIP64: an archive over 65,535 entries or 4 GiB is refused instead.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

/** The classic ZIP limits; past them an archive needs ZIP64. */
export const MAX_ENTRIES = 0xffff, MAX_BYTES = 0xffffffff;
const LOCAL_HEADER = 0x04034b50, CENTRAL_HEADER = 0x02014b50, END_OF_CENTRAL = 0x06054b50;
const STORED = 0, DEFLATED = 8;
/** Version 2.0 (deflate) needed to extract; made by Unix (3), so the external attributes carry the file mode. */
const VERSION_NEEDED = 20, MADE_BY_UNIX = (3 << 8) | VERSION_NEEDED;
const UTF8_NAMES = 0x0800;
const LOCAL_SIZE = 30, CENTRAL_SIZE = 46, END_SIZE = 22;
/** A regular file's type bits in a Unix mode. */
const REGULAR_FILE = 0o100000;
/** Bytes that are already compressed: deflating them again only costs time. */
const COMPRESSED = /\.(png|webp|jpe?g|gif|gz|m4a|mp3|woff2)$/i;

/** MS-DOS time and date of `date` (local time, two-second steps; 1980 at the earliest). */
function dosTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()};
}

/**
 * Writes `entries` ({name, source, mode}: the name inside the archive with `/` separators, the file to read, its Unix mode) to
 * `target` in order, all dated `date`. Returns {entries, bytes, stored, deflated}.
 */
export function writeZip(target, entries, date = new Date()) {
  if (entries.length > MAX_ENTRIES) throw new Error(`${entries.length} entries: past ${MAX_ENTRIES} a ZIP needs ZIP64, which this writer refuses`);
  const out = fs.openSync(target, 'w'), central = [], when = dosTime(date);
  let offset = 0, deflated = 0;
  const write = buffer => { fs.writeSync(out, buffer); offset += buffer.length; };
  try {
    for (const {name, source, mode} of entries) {
      const data = fs.readFileSync(source), packed = COMPRESSED.test(name) ? null : zlib.deflateRawSync(data, {level: 9});
      const method = packed && packed.length < data.length ? DEFLATED : STORED, body = method === DEFLATED ? packed : data;
      if (method === DEFLATED) deflated++;
      const fileName = Buffer.from(name, 'utf8'), crc = zlib.crc32(data);
      if (offset + LOCAL_SIZE + fileName.length + body.length > MAX_BYTES) throw new Error(`${name}: the archive would pass 4 GiB (ZIP64 refused)`);
      const header = Buffer.alloc(LOCAL_SIZE);
      header.writeUInt32LE(LOCAL_HEADER, 0);
      header.writeUInt16LE(VERSION_NEEDED, 4);
      header.writeUInt16LE(UTF8_NAMES, 6);
      header.writeUInt16LE(method, 8);
      header.writeUInt16LE(when.time, 10);
      header.writeUInt16LE(when.date, 12);
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(body.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(fileName.length, 26);
      central.push({fileName, header, mode, offset});
      write(header);
      write(fileName);
      write(body);
    }
    const start = offset;
    for (const {fileName, header, mode, offset: at} of central) {
      const record = Buffer.alloc(CENTRAL_SIZE);
      record.writeUInt32LE(CENTRAL_HEADER, 0);
      record.writeUInt16LE(MADE_BY_UNIX, 4);
      header.copy(record, 6, 4, 28);
      record.writeUInt32LE(((REGULAR_FILE | mode) << 16) >>> 0, 38);
      record.writeUInt32LE(at, 42);
      write(record);
      write(fileName);
    }
    if (offset + END_SIZE > MAX_BYTES) throw new Error('the central directory would pass 4 GiB (ZIP64 refused)');
    const end = Buffer.alloc(END_SIZE);
    end.writeUInt32LE(END_OF_CENTRAL, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - start, 12);
    end.writeUInt32LE(start, 16);
    write(end);
  } finally {
    fs.closeSync(out);
  }
  return {entries: central.length, bytes: offset, stored: central.length - deflated, deflated};
}

/** Reads `length` bytes of an open file at `position`. */
function readAt(descriptor, position, length) {
  const buffer = Buffer.alloc(length);
  fs.readSync(descriptor, buffer, 0, length, position);
  return buffer;
}

/** The central directory of a ZIP written here, read from its end: [{name, flags, method, crc, compressed, size, mode, offset}]. */
export function readZipDirectory(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const end = readAt(descriptor, fs.fstatSync(descriptor).size - END_SIZE, END_SIZE);
    if (end.readUInt32LE(0) !== END_OF_CENTRAL) throw new Error(`${file}: no end of central directory where expected`);
    const count = end.readUInt16LE(10), directory = readAt(descriptor, end.readUInt32LE(16), end.readUInt32LE(12)), entries = [];
    for (let at = 0, index = 0; index < count; index++) {
      if (directory.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error(`${file}: central record ${index} is damaged`);
      const length = directory.readUInt16LE(at + 28);
      entries.push({name: directory.toString('utf8', at + CENTRAL_SIZE, at + CENTRAL_SIZE + length), flags: directory.readUInt16LE(at + 8),
        method: directory.readUInt16LE(at + 10), crc: directory.readUInt32LE(at + 16), compressed: directory.readUInt32LE(at + 20),
        size: directory.readUInt32LE(at + 24), mode: directory.readUInt32LE(at + 38) >>> 16 & 0o7777, offset: directory.readUInt32LE(at + 42)});
      at += CENTRAL_SIZE + length + directory.readUInt16LE(at + 30) + directory.readUInt16LE(at + 32);
    }
    return entries;
  } finally {
    fs.closeSync(descriptor);
  }
}
