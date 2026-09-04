/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

const { createHash } = require("node:crypto");
const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { expect, test } = require("@playwright/test");
const sampleCbom = require("../resources/keycloak-cbom.json");
const officialCbom16 = require("./fixtures/cyclonedx/valid-cryptography-implementation-1.6.json");
const officialCbom17 = require("./fixtures/cyclonedx/valid-cryptography-implementation-1.7.json");

const schemaDirectory = join(
  __dirname,
  "..",
  "src",
  "schemas",
  "cyclonedx-1.7.1"
);
const fixtureDirectory = join(__dirname, "fixtures", "cyclonedx");
const schemaManifest = require(join(schemaDirectory, "manifest.json"));

const baseUrl = process.env.CBOM_VIEWER_BASE_URL;

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color.match(/\d+/g).slice(0, 3).map(Number).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

if (!baseUrl) {
  throw new Error("CBOM_VIEWER_BASE_URL is required");
}

test("pins the official CycloneDX schemas by SHA-256", () => {
  expect(schemaManifest.tag).toBe("1.7.1");
  expect(schemaManifest.commit).toBe(
    "b29bae660048e0ad2fbc5f2972927b442ce951c4"
  );

  for (const [name, expectedDigest] of Object.entries(schemaManifest.files)) {
    const digest = createHash("sha256")
      .update(readFileSync(join(schemaDirectory, name)))
      .digest("hex");
    expect(digest, name).toBe(expectedDigest);
  }

  for (const [name, expectedDigest] of Object.entries(
    schemaManifest.fixtures.files
  )) {
    const digest = createHash("sha256")
      .update(readFileSync(join(fixtureDirectory, name)))
      .digest("hex");
    expect(digest, name).toBe(expectedDigest);
  }
});

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
}, testInfo) => {
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

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cbom.json");
  const downloadPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(downloadPath);
  expect(statSync(downloadPath).isFile()).toBe(true);
  expect(statSync(downloadPath).size).toBeGreaterThan(0);
  expect(JSON.parse(readFileSync(downloadPath, "utf8"))).toEqual(sampleCbom);

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

test("presents endpoint evidence with endpoint semantics", async ({ page }) => {
  const componentTemplate = structuredClone(
    sampleCbom.components.find(
      (candidate) => candidate.evidence?.occurrences?.length > 0
    )
  );
  const endpoints = [
    ["tls", 443],
    ["ssh", 22],
    ["ike", 500],
    ["ldap", 389],
    ["mysql", 3306],
  ];
  const components = endpoints.map(([scheme, port]) => {
    const component = structuredClone(componentTemplate);
    component["bom-ref"] = `endpoint-${scheme}`;
    component.name = `endpoint-${scheme}`;
    component.evidence.occurrences = [
      {
        location: `${scheme}://example.com:${port}`,
        additionalContext:
          `observation=offered; evidence_type=${scheme}.algorithm; confidence=high; source=qureddy.scanners.${scheme}.probe`,
      },
    ];
    return component;
  });
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    serialNumber: sampleCbom.serialNumber,
    version: sampleCbom.version,
    metadata: {
      component: {
        type: "application",
        name: "example.com:443",
      },
    },
    components,
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "no-line" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByRole("columnheader", { name: "Observed at" })).toBeVisible();
  await expect(page.locator(".result-heading h3")).toHaveText("tls://example.com:443");

  for (const [scheme, port] of endpoints) {
    const row = page.locator("tbody tr").filter({ hasText: `ENDPOINT-${scheme.toUpperCase()}` });
    await expect(row).toContainText(`${scheme}://example.com:${port}`);
    await expect(row).toContainText("Offered");
    await expect(row).not.toContainText("High confidence");
    await expect(
      row.getByRole("button", { name: `${scheme}://example.com:${port}` })
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "mysql://example.com:3306" }).click();
  const detailsModal = page.locator(".bx--modal-content").filter({
    has: page.getByText("Endpoint evidence", { exact: true }),
  });
  await expect(page.getByText("Endpoint evidence", { exact: true })).toBeVisible();
  await expect(detailsModal).not.toContainText(/confidence/i);
  await expect(detailsModal).not.toContainText(/[—–]/);
  await expect(page.getByText("qureddy.scanners.mysql.probe", { exact: true })).toBeVisible();
  await expect(page.getByText("Incomplete code origin", { exact: true })).toHaveCount(0);
  const evidenceCell = page.locator(".bx--modal-content .bx--structured-list-td").first();
  const evidenceList = page.locator(".bx--modal-content .bx--structured-list").first();
  const [foreground, background] = await Promise.all([
    evidenceCell.evaluate((element) => getComputedStyle(element).color),
    evidenceList.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
});

test("keeps multiple endpoint evidence records on one cryptographic asset", async ({
  page,
}) => {
  const component = structuredClone(
    sampleCbom.components.find(
      (candidate) => candidate.evidence?.occurrences?.length > 0
    )
  );
  component["bom-ref"] = "endpoint-ike-multiple-evidence";
  component.name = "IKEv1";
  component.evidence.occurrences = [
    {
      location: "ike://127.0.0.1:4500",
      additionalContext:
        "observation=no_response; evidence_type=ike.mode.no_response; confidence=low; source=ike-scan/1.9.5",
    },
    {
      location: "ike://127.0.0.1:4500",
      additionalContext:
        "observation=observed; evidence_type=ike.mode.responded; confidence=low; source=ike-scan/1.9.5",
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
      { type: "bqp-load-cbom", cbom: payload, name: "endpoint-evidence" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("1 cryptographic asset found.").first()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Observed · IKE mode responded");
  await expect(page.locator("tbody tr")).not.toContainText("Low confidence");
  await expect(page.getByText("+1 more evidence record", { exact: true })).toBeVisible();
  await expect(page.getByText("High confidence", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "ike://127.0.0.1:4500" }).click();
  await expect(page.getByText("Observed at:", { exact: true })).toBeVisible();
  await expect(
    page.locator(
      ".bx--modal-content .endpoint-evidence-list .bx--structured-list-tbody .bx--structured-list-row"
    )
  ).toHaveCount(2);
  await expect(page.getByText("ike.mode.responded", { exact: true })).toBeVisible();
  await expect(page.getByText("ike.mode.no_response", { exact: true })).toBeVisible();
});

test("keeps file-and-line occurrences as source-code links", async ({ page }) => {
  const component = structuredClone(
    sampleCbom.components.find(
      (candidate) => candidate.evidence?.occurrences?.[0]?.line != null
    )
  );
  component.name = "source-code-asset";
  const occurrence = component.evidence.occurrences[0];
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    serialNumber: sampleCbom.serialNumber,
    version: sampleCbom.version,
    components: [component],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "source-code" },
      window.location.origin
    );
  }, cbom);

  const filename = occurrence.location.split("/").at(-1);
  const sourceButton = page.getByRole("button", {
    name: `${filename}:${occurrence.line}`,
  });
  await sourceButton.click();
  await expect(page.getByText("Incomplete code origin", { exact: true })).toBeVisible();
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

for (const [version, cbom, assetCount] of [
  ["1.6", officialCbom16, 1],
  ["1.7", officialCbom17, 5],
]) {
  test(`accepts the official CycloneDX ${version} cryptography fixture`, async ({
    page,
  }) => {
    await page.evaluate((payload) => {
      window.postMessage(
        { type: "bqp-load-cbom", cbom: payload, name: "official-fixture" },
        window.location.origin
      );
    }, cbom);

    const suffix = assetCount === 1 ? "asset" : "assets";
    await expect(
      page.getByText(`${assetCount} cryptographic ${suffix} found.`).first()
    ).toBeVisible();
    await expect(page.getByText("Invalid CBOM", { exact: true })).toHaveCount(0);
    if (version === "1.6") {
      await expect(
        page.getByText("Some components are not shown", { exact: true })
      ).toBeVisible();
    } else {
      await expect(page.getByText("Not compliant").first()).toBeVisible();
    }
    expect(page.frontendErrors).toEqual([]);
  });
}

test("rejects a CBOM missing a schema-required root field", async ({ page }) => {
  const cbom = {
    specVersion: sampleCbom.specVersion,
    components: [sampleCbom.components[0]],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "missing-bom-format" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("Invalid CBOM", { exact: true })).toBeVisible();
  page.frontendErrors = page.frontendErrors.filter(
    (error) => !error.includes("Invalid CBOM detected")
  );
});

test("reports an unsupported version separately from schema invalidity", async ({
  page,
}) => {
  const cbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.8",
    components: [sampleCbom.components[0]],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "future-version" },
      window.location.origin
    );
  }, cbom);

  await expect(
    page.getByText("Unsupported CycloneDX version", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Invalid CBOM", { exact: true })).toHaveCount(0);
});

test("treats a non-string specVersion as schema-invalid", async ({ page }) => {
  const cbom = {
    bomFormat: "CycloneDX",
    specVersion: 1.7,
    components: [sampleCbom.components[0]],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "malformed-version" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("Invalid CBOM", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Unsupported CycloneDX version", { exact: true })
  ).toHaveCount(0);
  page.frontendErrors = page.frontendErrors.filter(
    (error) => !error.includes("Invalid CBOM detected")
  );
});

test("rejects a malformed optional CycloneDX serial number", async ({ page }) => {
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    serialNumber: "not-a-urn-uuid",
    version: 1,
    components: [sampleCbom.components[0]],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "invalid-serial" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("Invalid CBOM", { exact: true })).toBeVisible();
  page.frontendErrors = page.frontendErrors.filter(
    (error) => !error.includes("Invalid CBOM detected")
  );
});

test("rejects invalid optional CycloneDX document versions", async ({ page }) => {
  for (const version of [0, "1"]) {
    const cbom = {
      bomFormat: sampleCbom.bomFormat,
      specVersion: sampleCbom.specVersion,
      version,
      components: [sampleCbom.components[0]],
    };

    await page.evaluate((payload) => {
      window.postMessage(
        { type: "bqp-load-cbom", cbom: payload, name: "invalid-version" },
        window.location.origin
      );
    }, cbom);

    await expect(page.getByText("Invalid CBOM", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).last().click();
  }
  page.frontendErrors = page.frontendErrors.filter(
    (error) => !error.includes("Invalid CBOM detected")
  );
});

test("accepts a schema-valid cryptographic asset without cryptoProperties", async ({
  page,
}) => {
  const cbom = {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    components: [
      {
        type: "cryptographic-asset",
        "bom-ref": "sparse-crypto-asset",
        name: "Sparse cryptographic asset",
      },
    ],
  };

  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "sparse-asset" },
      window.location.origin
    );
  }, cbom);

  await expect(page.getByText("1 cryptographic asset found.").first()).toBeVisible();
  await expect(page.getByText("Invalid CBOM", { exact: true })).toHaveCount(0);
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

test("fits the compact dark embed in a Mac-sized viewport", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1080, height: 680 });
  await page.goto(`${baseUrl}?mode=inventory&layout=compact&theme=dark`);
  await expect(page.getByRole("button", { name: "sample CBOM file" })).toBeVisible();
  const endpointComponents = sampleCbom.components.slice(0, 4).map((component) => ({
    ...component,
    evidence: {
      occurrences: [{
        location: "tls://example.test:443",
        additionalContext: "observation=observed; evidence_type=tls.test",
      }],
    },
  }));
  await page.evaluate((payload) => {
    window.postMessage(
      { type: "bqp-load-cbom", cbom: payload, name: "compact-endpoint" },
      window.location.origin
    );
  }, {
    bomFormat: sampleCbom.bomFormat,
    specVersion: sampleCbom.specVersion,
    version: 1,
    components: endpointComponents,
  });
  await expect(page.getByText("4 cryptographic assets found.").first()).toBeVisible();

  await expect(page.locator(".statistics-view")).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator(".make-the-carbon-theme-go-dark")).toHaveCount(1);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.getByRole("button", { name: "System theme" })).toBeVisible();
  await expect(page.locator(".make-the-carbon-theme-go-white")).toHaveCount(1);

  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    firstRowTop: document.querySelector("tbody tr")?.getBoundingClientRect().top,
  }))).toMatchObject({
    clientWidth: 1080,
    scrollWidth: 1080,
    clientHeight: 680,
    scrollHeight: 680,
  });
  expect(await page.locator("tbody tr").first().evaluate(
    (row) => row.getBoundingClientRect().top
  )).toBeLessThan(360);

  for (const width of [600, 900, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))).toEqual({ clientWidth: width, scrollWidth: width });
    await expect(page.locator("tbody tr").first()).toBeVisible();
  }
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
