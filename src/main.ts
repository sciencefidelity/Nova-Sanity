import { cleanPath } from "nova-extension-utils";

nova.commands.register("sciencefidelity.dart.reload", reload);

let client: LanguageClient | null = null;
const compositeDisposable = new CompositeDisposable();

async function makeFileExecutable(file: string) {
  return new Promise<void>((resolve, reject) => {
    const process = new Process("/usr/bin/env", {
      args: ["chmod", "u+x", file],
    });
    process.onDidExit((status) => {
      if (status === 0) {
        resolve();
      } else {
        reject(status);
      }
    });
    process.start();
  });
}

nova.config.onDidChange("sciencefidelity.elm.config.enableAnalyzer",
  async function (current) {
    if (current) {
      activate();
    } else {
      deactivate()
    }
  }
);

async function reload() {
  deactivate();
  console.log("reloading...");
  await asyncActivate();
}

async function asyncActivate() {

  const runFile = nova.path.join(nova.extension.path, "run.sh");

  // Uploading to the extension library makes this file not executable, so fix that
  await makeFileExecutable(runFile);

  let serviceArgs;
  if (nova.inDevMode() && nova.workspace.path) {
    const logDir = nova.path.join(nova.workspace.path, "logs");
    await new Promise<void>((resolve, reject) => {
      const p = new Process("/usr/bin/env", {
        args: ["mkdir", "-p", logDir],
      });
      p.onDidExit((status) => (status === 0 ? resolve() : reject()));
      p.start();
    });
    console.log("logging to", logDir);
    // passing inLog breaks some requests for an unknown reason
    // const inLog = nova.path.join(logDir, "languageServer-in.log");
    const outLog = nova.path.join(logDir, "languageServer-out.log");
    serviceArgs = {
      path: "/usr/bin/env",
      // args: ["bash", "-c", `tee "${inLog}" | "${runFile}" | tee "${outLog}"`],
      args: ["bash", "-c", `"${runFile}" | tee "${outLog}"`],
    };
  } else {
    serviceArgs = {
      path: runFile,
    };
  }

  let normalizedPath;
  if (nova.inDevMode() && nova.workspace.path) {
    normalizedPath = `${cleanPath(nova.workspace.path)}/test-workspace`;
  } else if (nova.workspace.path) {
    normalizedPath = cleanPath(nova.workspace.path)
  }
  const syntaxes = ["elm"];

  client = new LanguageClient(
    "sciencefidelity.elm",
    "Elm Language Server",
    {
      type: "stdio",
      ...serviceArgs,
      env: {
        WORKSPACE_DIR: normalizedPath || ""
      },
    },
    {
      syntaxes
    }
  );

  compositeDisposable.add(
    client.onDidStop((err) => {

      let message = "Elm Language Server stopped unexpectedly";
      if (err) {
        message += `:\n\n${err.toString()}`;
      } else {
        message += ".";
      }
      message +=
        "\n\nPlease report this, along with any output in the Extension Console.";
      nova.workspace.showActionPanel(
        message,
        {
          buttons: ["Restart", "Ignore"],
        },
        (index) => {
          if (index == 0) {
            nova.commands.invoke("sciencefidelity.elm.reload");
          }
        }
      );
    })
  );

  client.start();

}

export async function activate() {
  if (nova.config.get("sciencefidelity.elm.config.enableAnalyzer", "boolean")) {
    console.log("activating...");
    if (nova.inDevMode()) {
      const notification = new NotificationRequest("activated");
      notification.body = "Elm extension is loading";
      nova.notifications.add(notification);
    }
    return asyncActivate()
      .catch((err) => {
        console.error("Failed to activate");
        console.error(err);
        nova.workspace.showErrorMessage(err);
      })
      .then(() => {
        console.log("activated");
      });
  };
}

export function deactivate() {
  client?.stop();
  compositeDisposable.dispose();
}
