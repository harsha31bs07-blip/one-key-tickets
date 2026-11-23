import { estimateSpeechMs } from "../core/timing.ts";

export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
}

export function browserSpeaker(enabled: () => boolean): Speaker {
  let stop: (() => void) | undefined;
  const synthesis = window.speechSynthesis;

  function cancel(): void {
    stop?.();
  }

  return {
    cancel,
    speak(text) {
      cancel();
      if (!enabled() || !text) return Promise.resolve();
      return new Promise((resolve) => {
        const local = synthesis?.getVoices().filter((voice) => voice.localService) ?? [];
        const voice = local.find((item) => item.lang === "en-IN") ??
          local.find((item) => item.lang.startsWith("en")) ?? local[0];
        let timer: ReturnType<typeof setTimeout>;
        const utterance = voice ? new SpeechSynthesisUtterance(text) : undefined;
        const finish = () => {
          stop = undefined;
          clearTimeout(timer);
          resolve();
        };
        stop = () => {
          finish();
          if (utterance) {
            utterance.onend = utterance.onerror = null;
            synthesis.cancel();
          }
        };
        if (!utterance || !voice) {
          timer = setTimeout(finish, estimateSpeechMs(text));
          return;
        }
        utterance.voice = voice;
        utterance.onend = finish;
        utterance.onerror = () => {
          clearTimeout(timer);
          timer = setTimeout(finish, estimateSpeechMs(text));
        };
        timer = setTimeout(cancel, Math.max(4500, estimateSpeechMs(text) * 3 + 1500));
        synthesis.speak(utterance);
      });
    },
  };
}
