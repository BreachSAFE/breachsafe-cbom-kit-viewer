/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

const { createHash } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { expect, test } = require("@playwright/test");

const baseUrl = process.env.CBOM_VIEWER_BASE_URL;
const keycloakCbomPath = resolve(__dirname, "../resources/keycloak-cbom.json");
const emptyCbom = Buffer.from(
  '{"bomFormat":"CycloneDX","specVersion":"1.7","serialNumber":"urn:uuid:0c1c36d5-e9aa-45a0-a78a-01f1b5656f09","version":1,"components":[]}'
);

if (!baseUrl) {
  throw new Error("CBOM_VIEWER_BASE_URL is required");
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "sample CBOM file" }).click();
  await expect(
    page.getByText("103 cryptographic assets found.").first()
  ).toBeVisible();
});

function artifactMessage(source, filename = "scan.cdx.json") {
  return {
    type: "breachsafe.cbom.load.v1",
    artifact: {
      filename,
      mediaType: "application/json",
      encoding: "base64",
      byteLength: source.length,
      sha256: createHash("sha256").update(source).digest("hex"),
      data: source.toString("base64"),
    },
  };
}

async function postFromParent(
  page,
  message,
  trusted = true,
  origin = "same-origin"
) {
  await page.evaluate(
    ({ payload, trustedSource, messageOrigin }) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: payload,
          origin:
            messageOrigin === "same-origin"
              ? window.location.origin
              : messageOrigin,
          source: trustedSource ? window.parent : null,
        })
      );
    },
    { payload: message, trustedSource: trusted, messageOrigin: origin }
  );
}

test("prints every CBOM asset and restores the interactive page", async ({
  page,
}) => {
  const rows = page.locator("tbody tr");
  const saveButton = page.getByRole("button", { name: "Save as PDF" });
  const downloadButton = page.getByRole("button", { name: "Download CBOM" });

  await expect(rows).toHaveCount(10);
  await page.evaluate(() => {
    window.cbomPrintTest = { calls: 0, rows: 0 };
    window.print = () => {
      window.cbomPrintTest.calls += 1;
      window.cbomPrintTest.rows = document.querySelectorAll("tbody tr").length;
    };
  });

  await saveButton.click();

  await expect
    .poll(() => page.evaluate(() => window.cbomPrintTest))
    .toEqual({ calls: 1, rows: 103 });
  await expect(rows).toHaveCount(10);

  const saveBox = await saveButton.boundingBox();
  const downloadBox = await downloadButton.boundingBox();
  expect(saveBox).not.toBeNull();
  expect(downloadBox).not.toBeNull();
  expect(saveBox.width).toBe(downloadBox.width);
  expect(saveBox.height).toBe(downloadBox.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBe(0);

  await page.emulateMedia({ media: "print" });
  await expect(saveButton).toBeHidden();
  await expect(downloadButton).toBeHidden();
  await expect(page.getByRole("button", { name: "Start over" })).toBeHidden();
  await expect(page.locator(".bx--pagination")).toBeHidden();
});

test("restores pagination when browser printing fails", async ({ page }) => {
  const rows = page.locator("tbody tr");

  await page.evaluate(() => {
    window.print = () => {
      throw new Error("simulated print failure");
    };
  });
  await page.getByRole("button", { name: "Save as PDF" }).click();

  await expect(rows).toHaveCount(10);
});

test("downloads the exact embedded CBOM artifact and preserves its filename", async ({
  page,
}) => {
  const source = Buffer.from(
    String.raw`{
  "bomFormat": "CycloneDX",
  "specVersion": "1.7",
  "serialNumber": "urn:uuid:0c1c36d5-e9aa-45a0-a78a-01f1b5656f09",
  "version": 1,
  "components": [{
    "type": "cryptographic-asset",
    "bom-ref": "crypto/algorithm/aes-128-gcm",
    "name": "AES\u005f128\u005fGCM",
    "cryptoProperties": {
      "assetType": "algorithm",
      "algorithmProperties": {"primitive": "block-cipher"}
    }
  }]
}
`
  );

  await postFromParent(page, artifactMessage(source));
  await expect(page.getByText("1 cryptographic asset found.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CBOM" }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe("scan.cdx.json");
  expect(await readFile(await download.path())).toEqual(source);
});

test("rejects malformed artifact metadata without retaining stale results", async ({
  page,
}) => {
  const message = artifactMessage(emptyCbom);
  message.artifact.byteLength += 1;

  await postFromParent(page, message);

  await expect(page.getByRole("button", { name: "sample CBOM file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CBOM" })).toHaveCount(0);
});

test("rejects digest mismatches and unsafe artifact filenames", async ({ page }) => {
  const invalidMessages = [
    artifactMessage(emptyCbom),
    artifactMessage(emptyCbom, "../scan.cdx.json"),
    artifactMessage(emptyCbom, "scan\n.cdx.json"),
    artifactMessage(emptyCbom, ""),
    artifactMessage(emptyCbom, "CON.json"),
    artifactMessage(emptyCbom, "scan?.cdx.json"),
  ];
  invalidMessages[0].artifact.sha256 = "0".repeat(64);

  for (const message of invalidMessages) {
    await postFromParent(page, message);
    await expect(page.getByRole("button", { name: "sample CBOM file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CBOM" })).toHaveCount(0);
  }
});

test("rejects an embedded artifact from an untrusted source or origin", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start over" }).click();
  await postFromParent(page, artifactMessage(emptyCbom), false);

  await expect(page.getByRole("button", { name: "sample CBOM file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CBOM" })).toHaveCount(0);

  await postFromParent(
    page,
    artifactMessage(emptyCbom),
    true,
    "https://untrusted.example"
  );
  await expect(page.getByRole("button", { name: "sample CBOM file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CBOM" })).toHaveCount(0);
});

test("preserves exact bytes and filename for a standalone file upload", async ({
  page,
}) => {
  const source = await readFile(keycloakCbomPath);

  await page.getByRole("button", { name: "Start over" }).click();
  await page.locator('input[type="file"]').setInputFiles(keycloakCbomPath);
  await expect(
    page.getByText("103 cryptographic assets found.").first()
  ).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CBOM" }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe("keycloak-cbom.json");
  expect(await readFile(await download.path())).toEqual(source);
});
