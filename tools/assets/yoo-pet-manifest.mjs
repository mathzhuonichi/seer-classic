/** YooAsset pet manifest reader, adapted from Nattsu39/seer-pet-viewer (MIT). */
export class BytesReader {
  /** @param {Uint8Array} data */
  constructor(data) {
    this.data = data;
    this.offset = 0;
  }

  /** @returns {number} */
  byte() {
    return this.data[this.offset++];
  }

  /** @returns {boolean} */
  boolean() {
    return this.byte() !== 0;
  }

  /** @returns {number} */
  ushort() {
    const v = this.data[this.offset] | (this.data[this.offset + 1] << 8);
    this.offset += 2;
    return v;
  }

  /** @returns {number} */
  int() {
    const v =
      (this.data[this.offset] |
        (this.data[this.offset + 1] << 8) |
        (this.data[this.offset + 2] << 16) |
        (this.data[this.offset + 3] << 24)) >>>
      0;
    this.offset += 4;
    return v;
  }

  /** @returns {number} */
  uint() {
    return this.int() >>> 0;
  }

  /** @returns {bigint} */
  long() {
    const lo = this.uint();
    const hi = this.uint();
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  /** @returns {string} */
  text() {
    const len = this.ushort();
    if (len === 0) return "";
    const bytes = this.data.subarray(this.offset, this.offset + len);
    this.offset += len;
    return new TextDecoder().decode(bytes);
  }

  /** @returns {number[]} */
  intList() {
    const count = this.ushort();
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(this.int());
    }
    return list;
  }
}

/** Parse dotted format version. */
function parseVersion(version) {
  return version.split(".").map((p) => Number(p) || 0);
}

/** Compare format version tuples. */
function versionGt(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

/** Read official pet manifest tables from little-endian YooAsset bytes. */
export function parseNewseerManifest(data) {
  const reader = new BytesReader(data);
  reader.uint();

  const fileVersion = reader.text();
  const verParts = parseVersion(fileVersion);

  reader.boolean(); // EnableAddressable

  if (versionGt(verParts, [1, 4, 16])) {
    reader.boolean(); // LocationToLower
    reader.boolean(); // IncludeAssetGUID
  }

  reader.int(); // OutputNameType
  const packageName = reader.text();
  const packageVersion = reader.text();

  const assetCount = reader.int();
  const assets = [];
  for (let i = 0; i < assetCount; i++) {
    assets.push({
      assetPath: reader.text(),
      bundleId: reader.int(),
      dependIds: reader.intList(),
    });
  }

  const bundleCount = reader.int();
  const bundles = [];
  for (let i = 0; i < bundleCount; i++) {
    const bundleName = reader.text();
    if (versionGt(verParts, [1, 5, 1])) {
      reader.uint(); // UnityCRC
    }
    const fileHash = reader.text();
    reader.text(); // FileCRC
    const fileSize = reader.long();
    reader.boolean(); // IsRawFile
    reader.byte(); // LoadMethod
    reader.intList(); // Reference IDs; this format has no intervening tags
    bundles.push({
      bundleName,
      fileHash,
      fileSize,
    });
  }

  return {
    fileVersion,
    packageName,
    packageVersion,
    assets,
    bundles,
  };
}
