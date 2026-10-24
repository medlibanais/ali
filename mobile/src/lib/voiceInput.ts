// Voice-to-text for the coach input, on top of expo-speech-recognition.
//
// The package calls requireNativeModule() as soon as it is imported, which
// throws in Expo Go (the native code is only in a development or store
// build). Importing it at the top of CoachScreen would crash the whole tab
// bar there, so it is loaded lazily and only when the native module exists.
// On web the package wraps the browser's Web Speech API instead.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionNativeEventMap,
} from 'expo-speech-recognition';

type SpeechPackage = typeof import('expo-speech-recognition');

let cached: SpeechPackage | null | undefined;

function loadSpeech(): SpeechPackage | null {
  if (cached !== undefined) return cached;
  try {
    const hasNative =
      Platform.OS === 'web' ||
      requireOptionalNativeModule('ExpoSpeechRecognition') !== null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = hasNative ? (require('expo-speech-recognition') as SpeechPackage) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export const VOICE_LANG = 'en-US';

export type VoiceError =
  | 'permission'
  | 'offline'
  | 'unavailable'
  | 'needs_build'
  | 'failed';

export const VOICE_ERROR_MESSAGES: Record<VoiceError, string> = {
  permission: 'Microphone access is needed to use voice input.',
  offline:
    'Voice input needs an internet connection on this phone. Type your message instead.',
  unavailable: 'Voice input is not available on this device.',
  needs_build:
    'Voice input needs the installed GROW app (a development or store build). It does not run in Expo Go.',
  failed: 'Voice input stopped. Tap the mic to try again.',
};

/**
 * Maps a recognizer error to what the user should hear about.
 * null: nothing worth a message (they cancelled, or stayed silent).
 */
export function voiceErrorFor(code: ExpoSpeechRecognitionErrorCode): VoiceError | null {
  switch (code) {
    case 'aborted':
    case 'no-speech':
    case 'speech-timeout':
      return null;
    case 'not-allowed':
      return 'permission';
    case 'network':
      return 'offline';
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'unavailable';
    default:
      return 'failed';
  }
}

/** Joins dictated text onto what was already typed, within the length cap. */
export function mergeTranscript(base: string, transcript: string, max: number): string {
  const spoken = transcript.trim();
  if (!spoken) return base.slice(0, max);
  const joined = base.trim() ? `${base.trimEnd()} ${spoken}` : spoken;
  return joined.slice(0, max);
}

interface VoiceInputOptions {
  /** Called with each partial and final transcript. */
  onTranscript: (text: string) => void;
  onError: (error: VoiceError) => void;
}

export function useVoiceInput({ onTranscript, onError }: VoiceInputOptions) {
  const [listening, setListening] = useState(false);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };
  // Results that arrive after cancel() (the message was sent) are dropped.
  const active = useRef(false);

  useEffect(() => {
    const speech = loadSpeech();
    if (!speech) return undefined;
    const on = <K extends keyof ExpoSpeechRecognitionNativeEventMap>(
      name: K,
      handler: (ev: ExpoSpeechRecognitionNativeEventMap[K]) => void,
    ) => speech.addSpeechRecognitionListener(name, handler);
    const subs = [
      on('start', () => setListening(true)),
      on('result', (ev) => {
        const text = ev.results[0]?.transcript;
        if (active.current && text) callbacks.current.onTranscript(text);
      }),
      on('end', () => {
        active.current = false;
        setListening(false);
      }),
      on('error', (ev) => {
        active.current = false;
        setListening(false);
        const error = voiceErrorFor(ev.error);
        if (error) callbacks.current.onError(error);
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      // Leaving the screen ends the session; the mic must not stay on.
      if (active.current) speech.ExpoSpeechRecognitionModule.abort();
      active.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    const speech = loadSpeech();
    if (!speech) {
      callbacks.current.onError('needs_build');
      return;
    }
    const { ExpoSpeechRecognitionModule } = speech;
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        callbacks.current.onError('permission');
        return;
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        callbacks.current.onError('unavailable');
        return;
      }
      active.current = true;
      // Show the listening state right away; the 'start' event confirms it.
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: VOICE_LANG, interimResults: true });
    } catch {
      active.current = false;
      setListening(false);
      callbacks.current.onError('failed');
    }
  }, []);

  /** Stop listening and keep the final transcript. */
  const stop = useCallback(() => {
    loadSpeech()?.ExpoSpeechRecognitionModule.stop();
  }, []);

  /** Stop listening and drop anything still on its way (used on send). */
  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    setListening(false);
    loadSpeech()?.ExpoSpeechRecognitionModule.abort();
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, toggle, stop, cancel };
}
