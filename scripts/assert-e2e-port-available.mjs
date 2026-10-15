import { createServer } from "node:net";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Pass an E2E preview port from 1024 through 65535.");
}

await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      reject(new Error(`E2E preview port ${port} is already in use. Choose another E2E_PORT.`, { cause: error }));
      return;
    }
    reject(error);
  });
  probe.listen(port, "127.0.0.1", () => {
    probe.close((error) => {
      if (error) reject(new Error(`Could not release E2E preview port ${port}.`, { cause: error }));
      else resolve();
    });
  });
});
