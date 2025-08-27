'use client';

import { useState } from 'react';
import { Button } from './button';

interface TranscriptSummaryProps {
  recordingUrl: string | null;
}

interface TranscriptData {
  transcription: string;
  summary: string;
}

export default function TranscriptSummary({
  recordingUrl,
}: TranscriptSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateTranscriptAndSummary = async () => {
    if (!recordingUrl) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordingUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe recording');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Transcription error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-4">
      {!recordingUrl ? (
        <p className="text-muted-foreground">No recording available yet</p>
      ) : !data && !loading ? (
        <div className="flex justify-center">
          <Button onClick={generateTranscriptAndSummary} disabled={loading}>
            Generate Transcript and Summary
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center p-6">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-t-2"></div>
          <p className="text-muted-foreground mt-4">
            Processing recording... This may take a few minutes.
          </p>
        </div>
      ) : error ? (
        <div className="text-destructive border-destructive rounded-md border p-4">
          <p>Error: {error}</p>
          <Button
            variant="outline"
            onClick={generateTranscriptAndSummary}
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-lg font-semibold">Summary</h3>
            <div className="bg-secondary/50 whitespace-pre-wrap rounded-md p-3">
              {data.summary}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">Transcript</h3>
            <div className="bg-secondary/50 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md p-3">
              {data.transcription}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
