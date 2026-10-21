export function isOpenBetaEnabled(): boolean {
  return process.env.OPEN_BETA_ENABLED === "true";
}
