/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

const { expect, test } = require("@playwright/test");
const sampleCbom = require("../resources/keycloak-cbom.json");

const baseUrl = process.env.CBOM_VIEWER_BASE_URL;

if (!baseUrl) {
  throw new Error("CBOM_VIEWER_BASE_URL is required");
}

test.beforeEach(async ({ page }) => {
  page.frontendErrors = [];
  page.on("pageerror", (error) => page.frontendErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      page.frontendErrors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "sample CBOM file" }).click();
  await expect(
    page.getByText("103 cryptographic assets found.").first()
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.frontendErrors).toEqual([]);
});

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

test("keeps the header and report in one normal-flow surface", async ({
  page,
}) => {
  const header = page.locator(".bx--header");
  const report = page.locator(".result-title .bx--tile");
  const startOver = page.getByRole("button", { name: "Start over" });

  for (const width of [600, 1200, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(header).toHaveCSS("position", "static");

    const headerBox = await header.boundingBox();
    const reportBox = await report.boundingBox();
    const startOverBox = await startOver.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(reportBox).not.toBeNull();
    expect(startOverBox).not.toBeNull();
    expect(reportBox.y).toBe(headerBox.y + headerBox.height);
    expect(startOverBox.y).toBeGreaterThanOrEqual(reportBox.y);
    expect(startOverBox.y + startOverBox.height).toBeLessThanOrEqual(
      reportBox.y + reportBox.height
    );
    expect(headerBox.width).toBe(width);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      )
      .toBe(0);
  }

  await page.emulateMedia({ media: "print" });
  await expect(header).toHaveCSS("position", "static");
  const printHeaderBox = await header.boundingBox();
  const printReportBox = await report.boundingBox();
  expect(printReportBox.y).toBe(printHeaderBox.y + printHeaderBox.height);
});

test("does not append an empty line separator to an occurrence location", async ({
  page,
}) => {
  const component = structuredClone(
    sampleCbom.components.find(
      (candidate) => candidate.evidence?.occurrences?.length > 0
    )
  );
  component.name = "no-line-asset";
  component.evidence.occurrences = [
    {
      location: "tls://example.com:443",
      additionalContext: "observation=negotiated",
    },
  ];
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    serialNumber: sampleCbom.serialNumber,
    version: sampleCbom.version,
    components: [component],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "no-line" },
      window.location.origin
    );
  }, cbom);

  const row = page.locator("tbody tr").filter({ hasText: "NO-LINE-ASSET" });
  await expect(row).toContainText("example.com:443");
  await expect(row).not.toContainText("example.com:443:");
});

test("accepts optional CycloneDX root identity fields", async ({ page }) => {
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    components: [
      sampleCbom.components.find((component) => component.cryptoProperties),
    ],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "reproducible" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("1 cryptographic asset found.").first()).toBeVisible();
  expect(page.frontendErrors).toEqual([]);
});

test("names the document language and icon-only table control", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { name: "Table display settings" })
  ).toBeVisible();
});

test("keeps the header attached when hosted in an iframe", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setContent(`
    <iframe
      title="QuReddy CBOM viewer"
      src="${baseUrl}"
      style="border: 0; display: block; height: 850px; width: 100%"
    ></iframe>
  `);

  const viewer = page.frameLocator('iframe[title="QuReddy CBOM viewer"]');
  await viewer.getByRole("button", { name: "sample CBOM file" }).click();
  await expect(viewer.getByText("103 cryptographic assets found.").first()).toBeVisible();

  const iframeBox = await page.locator("iframe").boundingBox();
  const headerBox = await viewer.locator(".bx--header").boundingBox();
  const reportBox = await viewer.locator(".result-title .bx--tile").boundingBox();
  expect(iframeBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(reportBox).not.toBeNull();
  expect(headerBox.y).toBe(iframeBox.y);
  expect(reportBox.y).toBe(headerBox.y + headerBox.height);
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
  expect(page.frontendErrors.some((error) => error.includes("simulated print failure"))).toBe(
    true
  );
  page.frontendErrors = [];
});

test("keeps pagination for a normal CBOM URL", async ({ page }) => {
  await page.goto(`${baseUrl}?cbom=/api/upload/test-uid`);
  await page.getByRole("button", { name: "sample CBOM file" }).click();

  await expect(
    page.getByText("103 cryptographic assets found.").first()
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(10);
});
