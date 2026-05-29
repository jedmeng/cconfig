import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.js";

export function loadConfigTemplateYaml(workspaceRoot: string): string {
  const filePath = path.join(workspaceRoot, "data/config-template.yaml");
  if (!fs.existsSync(filePath)) {
    log.error("config template not found", undefined, { filePath });
    throw new Error("config template not found");
  }
  return fs.readFileSync(filePath, "utf8");
}
