declare const chrome: {
  storage: {
    local: {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
    onChanged: {
      addListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
    };
  };
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown, sender: unknown, reply: (value: unknown) => void) => void): void;
    };
  };
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};

declare module "*.css" {
  const css: string;
  export default css;
}
