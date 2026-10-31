import { GitHubClient } from "../../src/github/client.mjs";
import { context } from "./review.mjs";
export function event(patch = {}) {
  return {
    action: "opened",
    repository: { full_name: context.repository },
    sender: { login: "OWNER", type: "User" },
    pull_request: {
      number: 1,
      state: "open",
      draft: true,
      title: "Change",
      body: "Body",
      user: { login: "owner", type: "User" },
      head: { sha: context.head, repo: { full_name: context.repository } },
      base: { sha: context.base, ref: "master" },
    },
    ...patch,
  };
}
export function fakeGitHub() {
  const state = {
    pr: event().pull_request,
    checks: [],
    comments: [],
    labels: new Set(),
    calls: [],
    failures: [],
    next: 1,
    before: null,
  };
  const response = (status, value) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => globalThis.structuredClone(value),
  });
  const fetchImpl = async (url, options) => {
    const path = url.slice(`https://api.github.com/repos/${context.repository}`.length);
    const [route, query = ""] = path.split("?");
    const data = options.body && JSON.parse(options.body);
    state.calls.push({ method: options.method, path, data, headers: options.headers });
    if (state.before) await state.before({ method: options.method, path, data });
    const failure = state.failures.find(
      (item) => item.method === options.method && route.includes(item.path) && item.count > 0,
    );
    if (failure) {
      failure.count--;
      return response(failure.status, {});
    }
    const page = Number(new URLSearchParams(query).get("page") ?? 1);
    const slice = (rows) => rows.slice((page - 1) * 100, page * 100);
    if (options.method === "GET") {
      if (route === "/pulls/1") return response(200, state.pr);
      if (route.startsWith("/actions/runs/")) {
        const runId = route.split("/").at(-1);
        const found = state.checks.filter((check) => JSON.parse(check.external_id).runId === runId).at(-1);
        if (!found) return response(404, {});
        const id = JSON.parse(found.external_id);
        return response(200, {
          head_sha: id.head,
          event: "pull_request",
          path: ".github/workflows/review.yml",
          repository: { full_name: id.repository },
          head_repository: { full_name: id.repository },
          run_attempt: id.runAttempt,
          // GitHub updates these nested refs when the PR moves, even for older runs.
          pull_requests: [{ number: id.pr, head: { sha: state.pr.head.sha }, base: { sha: state.pr.base.sha } }],
        });
      }

      if (route.includes("/commits/"))
        return response(200, { check_runs: slice(state.checks.filter((check) => route.includes(check.head_sha))) });
      if (route === "/issues/1/comments") return response(200, slice(state.comments));
      if (route.startsWith("/check-runs/")) {
        const check = state.checks.find((item) => String(item.id) === route.split("/").at(-1));
        return response(check ? 200 : 404, check);
      }
    }
    if (options.method === "POST" && route === "/check-runs") {
      const check = { ...data, id: state.next++, app: { slug: "github-actions" } };
      check.details_url = `https://github.com/${context.repository}/runs/${check.id}`;
      state.checks.push(check);
      return response(201, check);
    }
    if (options.method === "PATCH" && route.startsWith("/check-runs/")) {
      const check = state.checks.find((item) => String(item.id) === route.split("/").at(-1));
      Object.assign(check, data);
      check.details_url = `https://github.com/${context.repository}/runs/${check.id}`;
      return response(200, check);
    }
    if (options.method === "DELETE" && route.includes("/labels/")) {
      state.labels.delete(decodeURIComponent(route.split("/").at(-1)));
      return response(204);
    }
    if (options.method === "POST" && route === "/issues/1/labels") {
      for (const label of data.labels) state.labels.add(label);
      return response(200, []);
    }
    if (options.method === "POST" && route === "/issues/1/comments") {
      const comment = {
        ...data,
        id: state.next++,
        user: { login: "github-actions[bot]", type: "Bot" },
        issue_url: `https://api.github.com/repos/${context.repository}/issues/1`,
      };
      state.comments.push(comment);
      return response(201, comment);
    }
    if (options.method === "PATCH" && route.startsWith("/issues/comments/")) {
      const comment = state.comments.find((item) => String(item.id) === route.split("/").at(-1));
      Object.assign(comment, data);
      return response(200, comment);
    }
    throw new Error("Unexpected fake endpoint");
  };
  return {
    state,
    client: new GitHubClient({
      token: "fake-github-secret",
      repository: context.repository,
      fetchImpl,
      sleep: async () => {
        /* No real delay in fixture. */
      },
    }),
  };
}
