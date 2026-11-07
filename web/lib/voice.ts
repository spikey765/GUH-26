"use client";

let current: HTMLAudioElement | null = null;

export function stopAudio() {
  if (current) {
    current.pause();
    current = null;
  }
}

export function playAudio(blob: Blob, onEnd?: () => void) {
  stopAudio();
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  current = a;
  a.onended = () => {
    URL.revokeObjectURL(url);
    if (current === a) current = null;
    onEnd?.();
  };
  return a.play();
}

export function canRecord() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startRecording(maxMs = 15000): Promise<{ stop: () => Promise<Blob> }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    throw new Error(name === "NotAllowedError" ? "Allow the microphone in your browser, then try again." : name === "NotFoundError" ? "No microphone found. Type it instead." : "The microphone didn't start. Type it instead.");
  }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const finished = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
  });
  rec.start(250);
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state !== "inactive") rec.stop();
      return finished;
    },
  };
}
