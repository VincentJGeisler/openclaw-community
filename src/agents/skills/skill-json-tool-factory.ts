import { spawn } from "node:child_process";
import path from "node:path";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { jsonResult } from "../tools/common.js";
import type { LoadedSkillJsonTool } from "./skill-json-loader.js";

const logger = createSubsystemLogger("skills:json:exec");

// Maximum output size to prevent OOM (10MB)
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
// Default timeout for exec tools (5 minutes)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Execute a skill.json exec tool
 */
async function executeSkillJsonTool(params: {
  toolName: string;
  skillDir: string;
  command: string;
  args: string[];
  input: "json" | "text";
  toolInput: unknown;
  signal?: AbortSignal;
}): Promise<AgentToolResult<unknown>> {
  const { toolName, skillDir, command, args, input, toolInput, signal } = params;

  // Resolve command path (relative to skill directory)
  const resolvedArgs = args.map((arg) => {
    // If argument looks like a script path (scripts/*.js), resolve it relative to skill dir
    if (arg.startsWith("scripts/") || arg.startsWith("./")) {
      return path.resolve(skillDir, arg);
    }
    return arg;
  });

  return new Promise<AgentToolResult<unknown>>((resolve) => {
    let resolved = false;
    const safeResolve = (result: AgentToolResult<unknown>) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(result);
    };

    const proc = spawn(command, resolvedArgs, {
      cwd: skillDir,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let outputTruncated = false;

    // Timeout handler
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        proc.kill("SIGTERM");
        safeResolve(
          jsonResult({
            error: `Tool execution timeout after ${DEFAULT_TIMEOUT_MS}ms`,
            toolName,
          }),
        );
      }
    }, DEFAULT_TIMEOUT_MS);

    // Cleanup function
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    proc.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_SIZE) {
        outputTruncated = true;
        proc.kill("SIGTERM");
        return;
      }
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      if (stderr.length + chunk.length > MAX_OUTPUT_SIZE) {
        stderr += "[truncated]";
        return;
      }
      stderr += chunk.toString();
    });

    // Handle abort signal
    let abortHandler: (() => void) | null = null;
    if (signal) {
      abortHandler = () => {
        proc.kill("SIGTERM");
        cleanup();
        safeResolve(
          jsonResult({
            error: "Tool execution aborted",
            toolName,
          }),
        );
      };
      signal.addEventListener("abort", abortHandler);
    }

    proc.on("error", (err) => {
      cleanup();
      logger.error("skill.json tool execution failed", {
        toolName,
        command,
        error: err.message,
      });
      safeResolve(
        jsonResult({
          error: `Execution failed: ${err.message}`,
          toolName,
        }),
      );
    });

    proc.on("close", (code) => {
      cleanup();

      if (outputTruncated) {
        safeResolve(
          jsonResult({
            error: `Tool output exceeded ${MAX_OUTPUT_SIZE} bytes`,
            toolName,
          }),
        );
        return;
      }

      if (code !== 0) {
        logger.warn("skill.json tool exited with non-zero code", {
          toolName,
          code,
          stderr: stderr.slice(0, 500),
        });
        safeResolve(
          jsonResult({
            error: `Command exited with code ${code}`,
            stderr: stderr.trim() || undefined,
            toolName,
          }),
        );
        return;
      }

      // Parse stdout as JSON
      try {
        const result = JSON.parse(stdout);
        safeResolve(jsonResult(result));
      } catch (err) {
        logger.error("Failed to parse skill.json tool output", {
          toolName,
          error: err instanceof Error ? err.message : String(err),
          stdout: stdout.slice(0, 500),
        });
        safeResolve(
          jsonResult({
            error: "Failed to parse tool output as JSON",
            raw: stdout.slice(0, 1000),
            toolName,
          }),
        );
      }
    });

    // Write input to stdin
    if (input === "json") {
      try {
        proc.stdin.write(JSON.stringify(toolInput));
        proc.stdin.end();
      } catch (err) {
        cleanup();
        logger.error("Failed to write input to skill.json tool", {
          toolName,
          error: err instanceof Error ? err.message : String(err),
        });
        proc.kill();
        safeResolve(
          jsonResult({
            error: "Failed to write input to tool",
            toolName,
          }),
        );
      }
    } else {
      proc.stdin.end();
    }
  });
}

/**
 * Convert a loaded skill.json tool into an AgentTool
 */
export function createSkillJsonTool(loaded: LoadedSkillJsonTool): AgentTool {
  const { skillName, skillDir, tool } = loaded;

  // Use a simple object schema - the actual validation happens in the script
  const parameters = Type.Object({}, { additionalProperties: true });

  return {
    name: tool.name,
    label: tool.name,
    description: tool.description || `Exec tool from ${skillName} skill`,
    parameters,
    execute: async (_toolCallId, params, signal) => {
      logger.debug("Executing skill.json tool", {
        toolName: tool.name,
        skillName,
        command: tool.command,
        args: tool.args,
      });

      return executeSkillJsonTool({
        toolName: tool.name,
        skillDir,
        command: tool.command,
        args: tool.args || [],
        input: tool.input || "json",
        toolInput: params,
        signal,
      });
    },
  };
}

/**
 * Create AgentTool instances from all loaded skill.json tools
 */
export function createSkillJsonTools(loaded: LoadedSkillJsonTool[]): AgentTool[] {
  return loaded.map(createSkillJsonTool);
}
