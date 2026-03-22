import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { SkillJsonDefinition, SkillJsonExecTool } from "./skill-json-types.js";

const logger = createSubsystemLogger("skills:json");

export type LoadedSkillJsonTool = {
  skillName: string;
  skillDir: string;
  tool: SkillJsonExecTool;
};

/**
 * Load skill.json file from a skill directory
 */
export function loadSkillJson(skillDir: string): SkillJsonDefinition | null {
  const skillJsonPath = path.join(skillDir, "skill.json");

  if (!fs.existsSync(skillJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillJsonPath, "utf-8");
    const parsed = JSON.parse(content) as SkillJsonDefinition;

    if (!parsed.name) {
      logger.warn("skill.json missing required 'name' field", { skillDir });
      return null;
    }

    return parsed;
  } catch (err) {
    logger.error("Failed to parse skill.json", {
      skillDir,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Load all skill.json tools from workspace skills directory
 */
export function loadAllSkillJsonTools(params: {
  workspaceDir: string;
  agentId?: string;
}): LoadedSkillJsonTool[] {
  const skillsDir = path.join(params.workspaceDir, "skills");

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const tools: LoadedSkillJsonTool[] = [];

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = path.join(skillsDir, entry.name);
      const skillJson = loadSkillJson(skillDir);

      if (!skillJson || !skillJson.tools || skillJson.tools.length === 0) {
        continue;
      }

      for (const tool of skillJson.tools) {
        if (tool.type !== "exec") {
          logger.warn("Unsupported tool type in skill.json", {
            skill: skillJson.name,
            toolName: tool.name,
            toolType: tool.type,
          });
          continue;
        }

        tools.push({
          skillName: skillJson.name,
          skillDir,
          tool,
        });
      }
    }
  } catch (err) {
    logger.error("Failed to load skill.json tools", {
      skillsDir,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return tools;
}
