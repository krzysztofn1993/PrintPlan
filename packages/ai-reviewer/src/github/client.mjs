import { setTimeout } from "node:timers/promises";

export class GitHubClient {
  constructor({ token, repository, fetchImpl = fetch, sleep = setTimeout }) {
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_CONFIG_REQUIRED");
    this.token = token;
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }
  async request(method, path, body, { retry = false, missing = false } = {}) {
    // The deployment target is public. Limit anonymous access to this immutable read
    // instead of broadening the mutation jobs' token permissions to Actions:read.
    const publicRunRead = method === "GET" && /^\/actions\/runs\/\d+$/.test(path) && body === undefined;
    for (let attempt = 1; attempt <= (retry ? 3 : 1); attempt++) {
      let response;
      try {
        response = await this.fetchImpl(`https://api.github.com/repos/${this.repository}${path}`, {
          method,
          signal: globalThis.AbortSignal.timeout(30000),
          headers: {
            ...(publicRunRead ? {} : { Authorization: `Bearer ${this.token}` }),
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch {
        if (attempt < (retry ? 3 : 1)) {
          await this.sleep(attempt * 100);
          continue;
        }
        throw new Error("GITHUB_UNAVAILABLE");
      }
      if (missing && response.status === 404) return null;
      if (response.ok) return response.status === 204 ? null : response.json();
      if (retry && [429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await this.sleep(attempt * 100);
        continue;
      }
      throw new Error(`GITHUB_HTTP_${response.status}`);
    }
    throw new Error("GITHUB_UNAVAILABLE");
  }
  async pages(path, key) {
    const all = [];
    for (let page = 1; ; page++) {
      const result = await this.request("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const rows = key ? result[key] : result;
      if (!Array.isArray(rows)) throw new Error("GITHUB_INVALID_RESPONSE");
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  }
}
