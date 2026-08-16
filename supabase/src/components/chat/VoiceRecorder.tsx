import { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceRecorderProps {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({ onRecorded, disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        onRecorded(blob);
        stream.getTracks().forEach(t => t.stop());
        setDuration(0);
      };

      recorder.start();
      setRecording(true);
      setDuration(0);
      timer.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      // Permission denied or no mic
    }
  };

  const stop = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-destructive animate-pulse">● {formatDuration(duration)}</span>
        <Button type="button" size="icon" variant="destructive" onClick={stop} className="h-8 w-8">
          <Square className="w-3 h-3 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" size="icon" variant="ghost" onClick={start} disabled={disabled} className="h-9 w-9">
      <Mic className="w-4 h-4" />
    </Button>
  );
}
