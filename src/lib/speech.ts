import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    readonly SpeechRecognition?: SpeechRecognitionConstructor;
    readonly webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export type SpeechStatus =
  | { readonly state: "idle" }
  | { readonly state: "listening" }
  | { readonly state: "denied" }
  | { readonly state: "unsupported" }
  | { readonly state: "error"; readonly message: string };

export interface UseSpeechResult {
  readonly status: SpeechStatus;
  readonly interim: string;
  readonly start: () => void;
  readonly stop: () => void;
}

interface UseSpeechOpts {
  readonly lang?: string;
  readonly onFinal: (text: string) => void;
}

export function useSpeech({ lang = "en-US", onFinal }: UseSpeechOpts): UseSpeechResult {
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const [status, setStatus] = useState<SpeechStatus>(
    getCtor() !== null ? { state: "idle" } : { state: "unsupported" },
  );
  const [interim, setInterim] = useState("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setStatus({ state: "unsupported" });
      return;
    }
    recRef.current?.abort();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onstart = () => setStatus({ state: "listening" });
    rec.onresult = (e) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result?.[0];
        if (!result || !alt) continue;
        if (result.isFinal) finalChunk += alt.transcript;
        else interimChunk += alt.transcript;
      }
      if (finalChunk) {
        onFinalRef.current(finalChunk);
        setInterim("");
      } else {
        setInterim(interimChunk);
      }
    };
    rec.onerror = (e) => {
      switch (e.error) {
        case "not-allowed":
        case "service-not-allowed":
          setStatus({ state: "denied" });
          break;
        case "no-speech":
        case "aborted":
          setStatus({ state: "idle" });
          break;
        default:
          setStatus({ state: "error", message: e.error });
      }
      setInterim("");
    };
    rec.onend = () => {
      setInterim("");
      setStatus((s) => (s.state === "listening" ? { state: "idle" } : s));
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { status, interim, start, stop };
}
