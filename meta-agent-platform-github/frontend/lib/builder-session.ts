const INITIAL_MESSAGE_KEY = "meta-builder-initial-message";

export function saveBuilderInitialMessage(message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return;
  }

  window.sessionStorage.setItem(
    INITIAL_MESSAGE_KEY,
    normalizedMessage,
  );
}

export function getBuilderInitialMessage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedMessage = window.sessionStorage.getItem(
    INITIAL_MESSAGE_KEY,
  );

  if (!savedMessage?.trim()) {
    return null;
  }

  return savedMessage.trim();
}

export function clearBuilderInitialMessage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(INITIAL_MESSAGE_KEY);
}