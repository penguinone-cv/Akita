const configuredBasePath = process.env.APP_BASE_PATH ?? "/dogs/akita";
const normalizedBasePath = configuredBasePath.replace(/^\/+|\/+$/g, "");

export const APP_BASE_PATH = normalizedBasePath ? `/${normalizedBasePath}` : "";

export function appPath(path = "/"): string {
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+/, "")}`;
  return `${APP_BASE_PATH}${normalizedPath}` || "/";
}
