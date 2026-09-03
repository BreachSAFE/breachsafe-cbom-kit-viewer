/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

export const MAX_CBOM_ARTIFACT_BYTES = 50 * 1024 * 1024;

const DEFAULT_CBOM_FILENAME = "cbom.json";
const textDecoder = new TextDecoder("utf-8", {fatal: true});
const textEncoder = new TextEncoder();

export function validateCbomFilename(filename) {
  const characters = typeof filename === "string" ? Array.from(filename) : [];
  const hasControlCharacter =
    characters.some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    });
  const basename = typeof filename === "string" ? filename.split(".")[0] : "";
  const isWindowsDevice = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(
    basename
  );
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    characters.length > 255 ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    /[<>:"|?*]/.test(filename) ||
    hasControlCharacter ||
    isWindowsDevice ||
    filename.endsWith(".") ||
    filename.endsWith(" ")
  ) {
    throw new Error("Invalid CBOM artifact filename");
  }
  return filename;
}

function checkedBytes(sourceBytes) {
  const bytes = new Uint8Array(sourceBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CBOM_ARTIFACT_BYTES) {
    throw new Error("CBOM artifact size is outside the supported range");
  }
  return bytes;
}

export function createCbomArtifact(cbom, filename, sourceBytes) {
  const bytes = sourceBytes
    ? checkedBytes(sourceBytes)
    : checkedBytes(textEncoder.encode(JSON.stringify(cbom, null, 2)));
  return {
    filename: validateCbomFilename(filename || DEFAULT_CBOM_FILENAME),
    bytes,
  };
}

export function parseCbomArtifact(sourceBytes, filename) {
  const artifact = createCbomArtifact(null, filename, sourceBytes);
  const cbom = JSON.parse(textDecoder.decode(artifact.bytes));
  if (!cbom || !Array.isArray(cbom.components)) {
    throw new Error("CBOM artifact must contain a components array");
  }
  return {artifact, cbom};
}
