import { afterEach, describe, expect, it, vi } from "vitest";

const originalBasePath = process.env.APP_BASE_PATH;

async function loadAppPath() {
  vi.resetModules();
  return import("./app-path");
}

afterEach(() => {
  if (originalBasePath === undefined) {
    delete process.env.APP_BASE_PATH;
  } else {
    process.env.APP_BASE_PATH = originalBasePath;
  }
  vi.resetModules();
});

describe("appPath", () => {
  it("uses /dogs/akita as the default base path", async () => {
    delete process.env.APP_BASE_PATH;
    const { APP_BASE_PATH, appPath } = await loadAppPath();

    expect(APP_BASE_PATH).toBe("/dogs/akita");
    expect(appPath()).toBe("/dogs/akita");
    expect(appPath("/api/inventory")).toBe("/dogs/akita/api/inventory");
    expect(appPath("api/items?category=pantry")).toBe(
      "/dogs/akita/api/items?category=pantry",
    );
  });

  it("normalizes surrounding slashes in a configured base path", async () => {
    process.env.APP_BASE_PATH = "///family/stock///";
    const { APP_BASE_PATH, appPath } = await loadAppPath();

    expect(APP_BASE_PATH).toBe("/family/stock");
    expect(appPath("/api/events")).toBe("/family/stock/api/events");
  });

  it("supports deployment at the origin root", async () => {
    process.env.APP_BASE_PATH = "/";
    const { APP_BASE_PATH, appPath } = await loadAppPath();

    expect(APP_BASE_PATH).toBe("");
    expect(appPath()).toBe("/");
    expect(appPath("/api/inventory")).toBe("/api/inventory");
  });
});
