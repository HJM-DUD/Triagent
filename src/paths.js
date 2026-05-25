import { homedir } from "node:os";
import { join } from "node:path";

export function triagentHome() {
  return process.env.TRIAGENT_HOME || join(homedir(), ".triagent");
}

export function defaultDbPath() {
  return join(triagentHome(), "triagent.sqlite");
}
