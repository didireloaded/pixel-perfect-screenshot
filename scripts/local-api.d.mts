export function createLocalHandler(): Promise<{
  (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    next: () => void,
  ): Promise<void>;
  close(): Promise<void>;
}>;
