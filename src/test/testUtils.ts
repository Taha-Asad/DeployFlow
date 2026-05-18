import * as vscode from "vscode";

export function createMockExtensionContext(): vscode.ExtensionContext {
  const mockSecretStorage: vscode.SecretStorage = {
    get: async () => undefined,
    store: async () => {},
    delete: async () => {},
    keys: async () => [],
    onDidChange: (() => ({ dispose: () => {} })) as any,
  };

  const mockMemento: vscode.Memento = {
    get: <T>(_key: string, _defaultValue?: T) => undefined as T | undefined,
    keys: () => [],
    update: async () => {},
  };

  return {
    subscriptions: [],
    workspaceState: mockMemento,
    globalState: { ...mockMemento, setKeysForSync: () => {} },
    secrets: mockSecretStorage,
    extensionUri: vscode.Uri.file(""),
    extensionPath: "",
    storageUri: undefined,
    globalStorageUri: vscode.Uri.file(""),
    logUri: vscode.Uri.file(""),
    extensionMode: vscode.ExtensionMode.Test,
    extension: null as any,
    languageModelAccessInformation: {
      onDidChange: (() => ({ dispose: () => {} })) as any,
      canSendRequest: () => false,
    },
    asAbsolutePath: (relativePath: string) => relativePath,
    storagePath: undefined,
    globalStoragePath: "",
    logPath: "",
    environmentVariableCollection: {
      [Symbol.iterator]: () => [][Symbol.iterator](),
      append: () => {},
      prepend: () => {},
      get: () => undefined,
      forEach: () => {},
      replace: () => {},
      delete: () => {},
      clear: () => {},
      getScoped: () => undefined,
    } as any,
  } as unknown as vscode.ExtensionContext;
}
