// Built-in API declarations for this project's Node calls. No external type package is needed.
declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
}

declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<string> {
    headers: { origin?: string };
    method?: string;
    url?: string;
    setEncoding(encoding: "utf8"): void;
  }
  export interface ServerResponse {
    end(data?: string): void;
    on(event: "close", listener: () => void): void;
    setHeader(name: string, value: string): void;
    write(data: string): boolean;
    writeHead(status: number, headers?: Record<string, string>): void;
  }
  export function createServer(listener: (request: IncomingMessage, response: ServerResponse) => void): {
    listen(port: number, hostname: string, listener: () => void): void;
  };
}

declare module "node:process" {
  export const argv: string[];
}

declare module "node:url" {
  export function fileURLToPath(url: URL): string;
}

declare module "node:test" {
  export function test(name: string, run: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
  };
  export default assert;
}
