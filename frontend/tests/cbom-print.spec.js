/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

const { expect, test } = require("@playwright/test");

const baseUrl = process.env.CBOM_VIEWER_BASE_URL;

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
