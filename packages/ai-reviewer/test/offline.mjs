// Applied before every native test worker: fixtures must inject their HTTP boundary.
globalThis.fetch = () => {
  throw new Error("OFFLINE_TEST_NETWORK_FORBIDDEN");
};
for (const name of ["OPENAI_API_KEY", "GITHUB_TOKEN", "GH_TOKEN"]) Reflect.deleteProperty(process.env, name);
