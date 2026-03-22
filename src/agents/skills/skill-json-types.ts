/**
 * Type definitions for skill.json files
 */

export type SkillJsonToolSchema = {
  type: "object";
  required?: string[];
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
};

export type SkillJsonExecTool = {
  name: string;
  description?: string;
  type: "exec";
  command: string;
  args?: string[];
  input?: "json" | "text";
  schema?: SkillJsonToolSchema;
};

export type SkillJsonDefinition = {
  name: string;
  version?: string;
  description?: string;
  tools?: SkillJsonExecTool[];
};
