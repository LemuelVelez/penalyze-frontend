export type ProgressStreamMessage<TProgress, TData> =
  | { type: "progress"; progress: TProgress }
  | { type: "success"; message?: string; data?: TData }
  | { type: "error"; message?: string };

export type ProgressStreamEnvelope<TData> = {
  message?: string;
  data?: TData;
};

function parseProgressStreamLine<TProgress, TData>(line: string) {
  try {
    return JSON.parse(line) as ProgressStreamMessage<TProgress, TData>;
  } catch {
    return null;
  }
}

export async function readProgressStream<TProgress, TData>(
  response: Response,
  onProgress?: (progress: TProgress) => void,
  options: {
    errorFallback?: string;
    missingSuccessMessage?: string;
  } = {},
): Promise<ProgressStreamEnvelope<TData>> {
  if (!response.body) {
    return (await response.json()) as ProgressStreamEnvelope<TData>;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let successPayload: ProgressStreamEnvelope<TData> | null = null;

  const handleMessage = (message: ProgressStreamMessage<TProgress, TData> | null) => {
    if (!message) return;

    if (message.type === "progress") {
      onProgress?.(message.progress);
      return;
    }

    if (message.type === "success") {
      successPayload = { message: message.message, data: message.data };
      return;
    }

    throw new Error(message.message || options.errorFallback || "Request failed.");
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      handleMessage(parseProgressStreamLine<TProgress, TData>(line));
    }

    if (done) break;
  }

  if (buffer.trim()) {
    handleMessage(parseProgressStreamLine<TProgress, TData>(buffer.trim()));
  }

  if (!successPayload) {
    throw new Error(
      options.missingSuccessMessage ||
        options.errorFallback ||
        "Request finished without a result.",
    );
  }

  return successPayload;
}
