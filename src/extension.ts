// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Configuration, OpenAIApi } from "openai";
import * as vscode from "vscode";
import { AuthManager } from "./auth";
import { GitExtension, Repository } from "./git";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

let log = vscode.window.createOutputChannel("Commit Message AI");
export function activate(context: vscode.ExtensionContext) {
  AuthManager.init(context);
  const settings = AuthManager.instance;
  // Register commands to save and retrieve token
  let auth = vscode.commands.registerCommand(
    "conventional-commit-ai.setToken",
    async () => {
      const tokenInput = await vscode.window.showInputBox();
      await settings.setOpenaiKey(tokenInput);
    }
  );

  let disposable = vscode.commands.registerCommand(
    "conventional-commit-ai.createCommit",
    async (uri?) => {
      const git = getGitExtension();
      if (!git) {
        vscode.window.showErrorMessage("Unable to load Git Extension");
        return;
      }
      const hasKey = await settings.hasOpenaiKey();
      if (!hasKey) {
        vscode.window.showErrorMessage(
          "You don't have an OpenAI API key set. Please set one using the command 'Commit Message AI: Set OpenAI API Key'"
        );
        return;
      }
      if (uri) {
        const uriPath = uri._rootUri?.path || uri.rootUri.path;
        let selectedRepository = git.repositories.find((repository) => {
          return repository.rootUri.path === uriPath;
        });
        if (selectedRepository) {
          await createCommitMessage(selectedRepository);
        }
      } else {
        for (let repo of git.repositories) {
          await createCommitMessage(repo);
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function getSummaryUriDiff(repo: Repository, uri: string) {
  const diff = await repo.diffIndexWithHEAD(uri);
  // TODO - use a better tokenizer to split into 4k tokens
  return await getSummary(diff);
}

async function getSummary(diff: string) {
  const openai = await createOpenaiClient();
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    prompt:
      "Get a summary of what is changing in the following `git diff` output:\n\n" +
      diff,
    max_tokens: 500,
  });
  return completion.data.choices[0].text?.trim() || "";
}

async function createOpenaiClient() {
  const apiKey = await AuthManager.instance.getOpenaiKey();
  const configuration = new Configuration({
    apiKey: apiKey ?? "",
    // organization: org_id,
  });
  const openai = new OpenAIApi(configuration);
  return openai;
}

async function getCommitMessage(summaries: string[]) {
  const openai = await createOpenaiClient();
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    prompt:
      "Using the following summaries create a single commit message in the format of Conventional Commits with max of 40 characters:\n" +
      summaries.join("\n") +
      "\n\nCommit message: ",
    max_tokens: 45,
  });
  return (
    completion.data.choices[0].text?.trim() ||
    "It was not possible to create a commit message"
  );
}

async function createCommitMessage(repo: Repository) {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      cancellable: false,
      title: "Loading commit message",
    },
    async (progress) => {
      //   progress.report({ increment: 0 });

      // show the scm view
      vscode.commands.executeCommand("workbench.view.scm");

      const ind = await repo.diffIndexWithHEAD();
      const callbacks = ind.map((change) =>
        getSummaryUriDiff(repo, change.uri.path)
      );
      const summaries = await Promise.all(callbacks);
      const commitMessage = await getCommitMessage(summaries);
      repo.inputBox.value = commitMessage;

      //   progress.report({ increment: 100 });
    }
  );
}

function getGitExtension() {
  const vscodeGit = vscode.extensions.getExtension<GitExtension>("vscode.git");
  const gitExtension = vscodeGit && vscodeGit.exports;
  return gitExtension && gitExtension.getAPI(1);
}

// This method is called when your extension is deactivated
export function deactivate() {}
