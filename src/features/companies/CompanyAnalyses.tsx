"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { fetchAnalyses, requestAnalysis } from "@/src/services/api/company.api";
import type { CompanyAnalysis } from "@/src/types/company";

/**
 * Ask for an analysis, and read the ones already produced.
 *
 * The POST answers 202 with a job id: queued, not done. No endpoint reports a
 * job's status, and an analysis row exists only once the worker has written
 * it, so this polls the collection until the row carrying that job id shows
 * up. Waiting on the thing you actually want is also the only check that
 * cannot be fooled by a stale count.
 *
 * The poll gives up instead of spinning forever. `pnpm dev` starts the web
 * process alone, so a reader trying this without a worker would otherwise sit
 * in front of a button that never comes back and no explanation of why.
 */

const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 20;

export function CompanyAnalyses({ companyId }: { companyId: string }) {
  const [analyses, setAnalyses] = useState<CompanyAnalysis[] | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Polling outlives a navigation away; this stops it writing to a dead tree. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await fetchAnalyses(companyId);
      if (mounted.current) setAnalyses(data);
    } catch (caught) {
      if (mounted.current)
        setError(messageOf(caught, "Failed to load analyses"));
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const { jobId } = await requestAnalysis(companyId, question);
      setQuestion("");

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS);
        if (!mounted.current) return;

        const { data } = await fetchAnalyses(companyId);
        if (!mounted.current) return;
        setAnalyses(data);

        if (data.some((analysis) => analysis.jobId === jobId)) return;
      }

      setNotice(
        "Still queued. It will appear here once a worker has picked the job up.",
      );
    } catch (caught) {
      if (mounted.current) {
        setError(messageOf(caught, "Failed to request an analysis"));
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis</CardTitle>
        <CardDescription>
          Questions are answered by a background job, not by this request.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <form className="flex gap-2" onSubmit={submit}>
          <Input
            placeholder="Ask something about this company"
            value={question}
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={pending}
          />
          <Button type="submit" disabled={pending || question.trim() === ""}>
            {pending ? "Analysing…" : "Analyse"}
          </Button>
        </form>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}

        {analyses === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No analyses yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {analyses.map((analysis) => (
              <AnalysisEntry key={analysis.id} analysis={analysis} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisEntry({ analysis }: { analysis: CompanyAnalysis }) {
  return (
    <li className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium">{analysis.question}</p>
      <p className="text-sm text-muted-foreground">{analysis.summary}</p>

      <ul className="list-disc pl-5 text-sm">
        {analysis.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      {/* Provider and model are shown because an answer cannot be judged
          without knowing what produced it. */}
      <p className="text-xs text-muted-foreground">
        {analysis.sentiment} · confidence {analysis.confidence} ·{" "}
        {analysis.model}
      </p>
    </li>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}
