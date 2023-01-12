import { config as configEnv } from "dotenv";

export function getEnv() {
  const { parsed: env } = configEnv();
  if (!env) throw new Error("No .env file found");
  return env;
}
