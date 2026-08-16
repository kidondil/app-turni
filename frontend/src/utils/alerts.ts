import { Alert, Platform } from "react-native";
import type { AlertButton, AlertOptions } from "react-native";

let installed = false;

export function installWebAlertFallback() {
  if (installed || Platform.OS !== "web" || typeof window === "undefined") return;
  installed = true;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: AlertOptions,
  ) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    const availableButtons = buttons || [];

    if (availableButtons.length <= 1) {
      window.alert(text);
      availableButtons[0]?.onPress?.();
      return;
    }

    const cancelButton = availableButtons.find((button) => button.style === "cancel");
    const confirmButton = [...availableButtons]
      .reverse()
      .find((button) => button.style !== "cancel");
    if (window.confirm(text)) confirmButton?.onPress?.();
    else cancelButton?.onPress?.();
  };
}
