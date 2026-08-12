import type { SourceFile } from "@/lib/compiler-api";
import type { ProgrammingLanguage } from "@/lib/file-items";

export type InteractiveStatus =
  | "idle"
  | "connecting"
  | "compiling"
  | "running"
  | "accepted"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "stopped"
  | "error";

export type InteractiveOutput = {
  stream: "stdin" | "stdout" | "stderr";
  data: string;
};

type InteractiveEvent =
  | { type: "status"; status: InteractiveStatus; exit_code?: number }
  | { type: "output"; stream: "stdout" | "stderr"; data: string }
  | { type: "error"; status: string; message: string };

type InteractiveHandlers = {
  onEvent: (event: InteractiveEvent) => void;
  onClose: () => void;
};

export type InteractiveConnection = {
  send: (data: string) => boolean;
  stop: () => void;
};

function getWebSocketUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  const apiUrl = configuredUrl
    ? configuredUrl.replace(/\/$/, "")
    : `${window.location.protocol}//${window.location.hostname}:8000`;
  return `${apiUrl.replace(/^http/, "ws")}/api/run/interactive`;
}

export function startInteractiveCode(
  files: SourceFile[],
  language: ProgrammingLanguage,
  handlers: InteractiveHandlers,
): InteractiveConnection {
  const socket = new WebSocket(getWebSocketUrl());
  let intentionallyStopped = false;

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "start",
      code: files.find((file) => file.name.toLocaleLowerCase() === (language === "python" ? "main.py" : "main.cpp"))?.content ?? "",
      files,
      language,
    }));
  });
  socket.addEventListener("message", (message) => {
    handlers.onEvent(JSON.parse(String(message.data)) as InteractiveEvent);
  });
  socket.addEventListener("error", () => {
    handlers.onEvent({
      type: "error",
      status: "connection_error",
      message: "Interactive compiler connection failed.",
    });
  });
  socket.addEventListener("close", () => {
    if (intentionallyStopped) {
      handlers.onEvent({ type: "status", status: "stopped" });
    }
    handlers.onClose();
  });

  return {
    send: (data) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type: "input", data }));
      return true;
    },
    stop: () => {
      intentionallyStopped = true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "stop" }));
      } else {
        socket.close();
      }
    },
  };
}
