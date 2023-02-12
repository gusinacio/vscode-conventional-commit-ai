import { ExtensionContext, SecretStorage } from "vscode";

export class AuthManager {
  private static _instance: AuthManager;

  constructor(private secretStorage: SecretStorage) {}

  static init(context: ExtensionContext) {
    AuthManager._instance = new AuthManager(context.secrets);
  }

  static get instance() {
    if (!AuthManager._instance) {
      throw new Error("AuthManager not initialized");
    }
    return AuthManager._instance;
  }

  async getOpenaiKey() {
    return await this.secretStorage.get("openai_key");
  }

  async hasOpenaiKey() {
    return !!(await this.getOpenaiKey());
  }

  async setOpenaiKey(key?: string) {
    if (key) await this.secretStorage.store("openai_key", key);
  }
}
