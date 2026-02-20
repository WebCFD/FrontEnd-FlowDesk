interface Config {}

let config: Config = {};

export async function loadConfig(): Promise<Config> {
  return config;
}

export function getConfig(): Config {
  return config;
}
