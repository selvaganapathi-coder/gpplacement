import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiUrl } from "@/lib/api";
import { useExamShield } from "@/hooks/useExamShield";

type Option = { id: string; text: string };
type Question = { id: string; prompt: string; options: Option[]; topic?: string | null };

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function firstUnansweredIndex(
  questions: Question[],
  answers: Record<string, string>
): number {
  const idx = questions.findIndex((q) => !answers[q.id]);
  return idx >= 0 ? idx : 0;
}

export function TakeTestClient({
  attemptId,
  title,
  durationMin,
  deadlineIso,
  serverNowIso,
  questions,
  initialAnswers = {},
  initialMarked = [],
}: {
  attemptId: string;
  title: string;
  durationMin: number;
  /** Server-authored deadline — never compute duration locally as authority. */
  deadlineIso: string;
  /** Optional server clock sample to reduce display skew (server still owns expiry). */
  serverNowIso?: string;
  questions: Question[];
  initialAnswers?: Record<string, string>;
  initialMarked?: string[];
}) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [marked, setMarked] = useState<Set<string>>(
    () => new Set(initialMarked.filter(Boolean))
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [proctorWarn, setProctorWarn] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [timeWarn, setTimeWarn] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(() =>
    firstUnansweredIndex(questions, initialAnswers)
  );
  const autoSubmitStarted = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const markedRef = useRef(marked);
  markedRef.current = marked;
  const dirtyRef = useRef<Record<string, string>>({});
  const markedDirtyRef = useRef(false);
  const warned5 = useRef(false);
  const warned1 = useRef(false);
  const questionPanelRef = useRef<HTMLDivElement>(null);
  const lastProctorAt = useRef(0);

  const deadline = useMemo(() => new Date(deadlineIso).getTime(), [deadlineIso]);
  /** Approximate serverNow ≈ Date.now() + skewMs */
  const skewMs = useMemo(() => {
    if (!serverNowIso) return 0;
    const serverMs = new Date(serverNowIso).getTime();
    if (Number.isNaN(serverMs)) return 0;
    return serverMs - Date.now();
  }, [serverNowIso]);
  const [now, setNow] = useState(() => Date.now() + skewMs);

  const remainingSec = Math.max(0, Math.floor((deadline - now) / 1000));
  const expired = remainingSec <= 0;
  const shieldOn = !expired && !pending;
  const { veiled, fullscreen, enterFullscreen } = useExamShield(shieldOn);

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const markedCount = questions.filter((q) => marked.has(q.id)).length;
  const unansweredCount = questions.length - answeredCount;
  const current = questions[activeIndex] ?? questions[0];
  const currentMarked = current ? marked.has(current.id) : false;
  const isLast = activeIndex >= questions.length - 1;
  const isFirst = activeIndex <= 0;
  const urgent = remainingSec < 120 && !expired;
  const progressPct = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  // Display-only ticker. Expiry is enforced by the API using attempt.endsAt.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skewMs), 1000);
    return () => window.clearInterval(id);
  }, [skewMs]);

  useEffect(() => {
    if (expired) return;
    if (remainingSec <= 60 && !warned1.current) {
      warned1.current = true;
      setTimeWarn("1 minute left — finish and submit soon.");
    } else if (remainingSec <= 5 * 60 && !warned5.current) {
      warned5.current = true;
      setTimeWarn("5 minutes left on this test.");
    }
  }, [remainingSec, expired]);

  useEffect(() => {
    questionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

  const reportProctor = useCallback(
    async (event: "TAB_SWITCH" | "FULLSCREEN_EXIT") => {
      if (expired || pending || autoSubmitStarted.current) return;
      const nowTs = Date.now();
      if (nowTs - lastProctorAt.current < 2500) return;
      lastProctorAt.current = nowTs;
      try {
        const res = await api<{
          ok: true;
          tabSwitchCount: number;
          fullscreenExitCount: number;
          proctorFlagged: boolean;
          thresholds: { tabSwitch: number; fullscreenExit: number };
        }>(`/api/student/attempts/${attemptId}/proctor`, {
          method: "POST",
          body: JSON.stringify({ event }),
        });
        const label =
          event === "TAB_SWITCH"
            ? `Tab switch recorded (${res.tabSwitchCount}). Stay on this page during the exam.`
            : `Fullscreen exit recorded (${res.fullscreenExitCount}). Prefer staying fullscreen.`;
        setProctorWarn(
          res.proctorFlagged
            ? `${label} This attempt is flagged for staff review.`
            : label
        );
      } catch {
        /* ignore network blips during exam */
      }
    },
    [attemptId, expired, pending]
  );

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        void reportProctor("TAB_SWITCH");
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        void reportProctor("FULLSCREEN_EXIT");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [reportProctor]);

  const saveAnswers = useCallback(async () => {
    const dirty = dirtyRef.current;
    const keys = Object.keys(dirty);
    const marksDirty = markedDirtyRef.current;
    if (keys.length === 0 && !marksDirty) {
      setSaveState("saved");
      return;
    }
    const payload = { ...dirty };
    const markedQuestionIds = [...markedRef.current];
    setSaveState("saving");
    try {
      await api(`/api/student/attempts/${attemptId}/answers`, {
        method: "PATCH",
        body: JSON.stringify({ answers: payload, markedQuestionIds }),
      });
      for (const k of Object.keys(payload)) {
        if (dirtyRef.current[k] === payload[k]) delete dirtyRef.current[k];
      }
      markedDirtyRef.current = false;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [attemptId]);

  const flushBeacon = useCallback(() => {
    const dirty = dirtyRef.current;
    const marksDirty = markedDirtyRef.current;
    if (Object.keys(dirty).length === 0 && !marksDirty) return;
    const body = JSON.stringify({
      answers: dirty,
      markedQuestionIds: [...markedRef.current],
    });
    try {
      void fetch(apiUrl(`/api/student/attempts/${attemptId}/answers`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }
  }, [attemptId]);

  const submit = useCallback(
    (opts?: { auto?: boolean }) => {
      if (autoSubmitStarted.current) return;
      autoSubmitStarted.current = true;
      setError(null);
      setConfirmSubmit(false);
      startTransition(() => {
        void (async () => {
          try {
            // Best-effort flush of last clicks / marks before scoring.
            try {
              await saveAnswers();
            } catch {
              /* submit still sends full answers map */
            }
            await api<{
              ok: true;
              attemptId: string;
              submitted?: boolean;
              score?: number;
              maxScore?: number;
            }>(`/api/student/attempts/${attemptId}/submit`, {
              method: "POST",
              body: JSON.stringify({
                answers: answersRef.current,
                auto: !!opts?.auto,
              }),
            });
            navigate("/dashboard/student", { replace: true });
          } catch {
            autoSubmitStarted.current = false;
            setError(
              opts?.auto
                ? "Time is up but we could not submit automatically. Press Finish & submit to try again."
                : "Could not submit. Check your connection and try again."
            );
          }
        })();
      });
    },
    [attemptId, navigate, saveAnswers]
  );

  useEffect(() => {
    if (!expired || pending || autoSubmitStarted.current) return;
    submit({ auto: true });
  }, [expired, pending, submit]);

  useEffect(() => {
    if (expired || pending) return;
    const t = window.setTimeout(() => {
      void saveAnswers();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [answers, marked, expired, pending, saveAnswers]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (expired || pending) return;
      flushBeacon();
      e.preventDefault();
    }
    function onPageHide() {
      if (expired || pending) return;
      flushBeacon();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [expired, pending, flushBeacon]);

  function selectAnswer(questionId: string, optionId: string) {
    dirtyRef.current[questionId] = optionId;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function selectByLetterIndex(letterIndex: number) {
    if (!current || expired || pending) return;
    const opt = current.options[letterIndex];
    if (opt) selectAnswer(current.id, opt.id);
  }

  function goTo(index: number) {
    if (expired || pending) return;
    if (index < 0 || index >= questions.length) return;
    setConfirmSubmit(false);
    setActiveIndex(index);
  }

  function goNext() {
    if (expired || pending || isLast) return;
    goTo(activeIndex + 1);
  }

  function goPrev() {
    if (expired || pending || isFirst) return;
    goTo(activeIndex - 1);
  }

  function toggleMark() {
    if (!current || expired || pending) return;
    markedDirtyRef.current = true;
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(current.id)) next.delete(current.id);
      else next.add(current.id);
      return next;
    });
  }

  function openFinishConfirm() {
    if (expired || pending) return;
    setConfirmSubmit(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (expired || pending || confirmSubmit || veiled) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMark();
        return;
      }
      const digit = e.key >= "1" && e.key <= "6" ? Number(e.key) - 1 : -1;
      const letter = "abcdABCD".includes(e.key)
        ? e.key.toUpperCase().charCodeAt(0) - 65
        : -1;
      const idx = digit >= 0 ? digit : letter;
      if (idx >= 0) {
        e.preventDefault();
        selectByLetterIndex(idx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable handlers for keys
  }, [expired, pending, confirmSubmit, current, isFirst, isLast, activeIndex, marked, veiled]);

  if (!current) {
    return <p className="text-sm text-slate-600">This test has no questions.</p>;
  }

  const currentAnswered = !!answers[current.id];

  return (
    <div className="exam-stage">
      {veiled ? (
        <div className="exam-veil" role="alert" aria-live="assertive">
          <div className="exam-veil__card">
            <p className="exam-veil__kicker">Secure exam mode</p>
            <h3 className="exam-veil__title">Content hidden</h3>
            <p className="exam-veil__body">
              Return to this tab and keep the window focused to continue. Leaving the exam is
              recorded.
            </p>
          </div>
        </div>
      ) : null}

      <header className="exam-top">
        <div className="exam-top__main">
          <p className="exam-top__kicker">
            Secure exam · {durationMin} min · autosaved
            {fullscreen ? " · fullscreen" : ""}
          </p>
          <h2 className="exam-top__title">{title}</h2>
          <div className="exam-top__track" aria-hidden>
            <div className="exam-top__fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="exam-top__progress">
            {answeredCount} of {questions.length} answered
            {saveState === "error"
              ? " · save failed"
              : saveState === "saving"
                ? " · saving…"
                : ""}
          </p>
        </div>
        <div
          className={`exam-top__timer ${urgent ? "is-urgent" : ""}`}
          aria-live="polite"
          aria-label={`Time left ${expired ? "0 minutes" : formatTime(remainingSec)}`}
        >
          <span className="exam-top__timer-label">Time</span>
          <span className="exam-top__timer-value">
            {expired ? "0:00" : formatTime(remainingSec)}
          </span>
        </div>
      </header>

      {!fullscreen && !expired ? (
        <div className="exam-alert exam-alert--secure">
          <p>Use fullscreen for secure mode (recommended on phones &amp; laptops).</p>
          <button
            type="button"
            className="exam-alert__btn"
            onClick={() => void enterFullscreen()}
          >
            Enter fullscreen
          </button>
        </div>
      ) : null}

      {saveState === "error" ? (
        <div className="exam-alert exam-alert--bad">
          <p>Connection issue — tap retry to save answers.</p>
          <button type="button" className="exam-alert__btn" onClick={() => void saveAnswers()}>
            Retry
          </button>
        </div>
      ) : null}

      {proctorWarn && !expired ? (
        <div className="exam-alert exam-alert--warn" role="status">
          <p>{proctorWarn}</p>
          <button type="button" className="exam-alert__btn" onClick={() => setProctorWarn(null)}>
            OK
          </button>
        </div>
      ) : null}

      {timeWarn && !expired ? (
        <div className="exam-alert exam-alert--warn" role="status">
          <p>{timeWarn}</p>
          <button type="button" className="exam-alert__btn" onClick={() => setTimeWarn(null)}>
            OK
          </button>
        </div>
      ) : null}

      {expired ? (
        <div className="exam-alert exam-alert--warn">
          <p>
            {pending
              ? "Time is up — submitting automatically…"
              : "Time is up — saving your answers…"}
          </p>
        </div>
      ) : null}

      <div className="exam-strip__legend" aria-hidden>
        <span>
          <i className="exam-strip__swatch" /> Not answered
        </span>
        <span>
          <i className="exam-strip__swatch is-done" /> Answered
        </span>
        <span>
          <i className="exam-strip__swatch is-mark" /> Marked
        </span>
        <span>
          <i className="exam-strip__swatch is-now" /> Current
        </span>
      </div>

      <div className="exam-strip" role="list" aria-label="Questions">
        {questions.map((q, idx) => {
          const answered = !!answers[q.id];
          const isMarked = marked.has(q.id);
          const active = idx === activeIndex;
          const statusParts = [
            answered ? "answered" : "not answered",
            isMarked ? "marked for review" : null,
            active ? "current" : null,
          ].filter(Boolean);
          return (
            <button
              key={q.id}
              type="button"
              role="listitem"
              disabled={expired || pending || veiled}
              title={`Question ${idx + 1} — ${statusParts.join(", ")}`}
              aria-label={`Question ${idx + 1}, ${statusParts.join(", ")}`}
              aria-current={active ? "true" : undefined}
              className={`exam-strip__dot ${answered ? "is-done" : ""} ${
                isMarked ? "is-mark" : ""
              } ${active ? "is-now" : ""}`}
              onClick={() => goTo(idx)}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <section ref={questionPanelRef} className="exam-card exam-card--secure" key={current.id}>
        <div className="exam-card__head">
          <p className="exam-card__step">
            Question {activeIndex + 1}
            <span> of {questions.length}</span>
          </p>
          <button
            type="button"
            className={`exam-card__flag ${currentMarked ? "is-on" : ""}`}
            disabled={expired || pending || veiled}
            onClick={toggleMark}
          >
            {currentMarked ? "Marked" : "Mark"}
          </button>
        </div>

        {current.topic ? <p className="exam-card__topic">{current.topic}</p> : null}

        <h3 className="exam-card__prompt">{current.prompt}</h3>
        <p className="exam-card__hint">
          {currentAnswered
            ? isLast
              ? "Answer saved. Tap Finish when ready."
              : "Answer saved. Tap Next for the next question."
            : "Tap one answer below"}
        </p>

        <div
          className="exam-choices"
          role="radiogroup"
          aria-label={`Answers for question ${activeIndex + 1}`}
        >
          {current.options.map((o, oi) => {
            const selected = answers[current.id] === o.id;
            const letter = OPTION_LETTERS[oi] ?? String(oi + 1);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={expired || pending || veiled}
                className={`exam-choice ${selected ? "is-on" : ""}`}
                onClick={() => selectAnswer(current.id, o.id)}
              >
                <span className="exam-choice__key">{letter}</span>
                <span className="exam-choice__label">{o.text}</span>
                {selected ? <span className="exam-choice__tick">✓</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {confirmSubmit ? (
        <div
          className="exam-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-submit-title"
        >
          <div className="exam-modal__panel">
            <p className="exam-modal__kicker">Submit</p>
            <h3 id="exam-submit-title" className="exam-modal__title">
              Finish this test?
            </h3>
            <p className="exam-modal__body">
              {unansweredCount > 0
                ? `${unansweredCount} question${unansweredCount === 1 ? "" : "s"} still unanswered.`
                : "All questions answered."}
              {markedCount > 0 ? ` ${markedCount} marked for review.` : ""}
            </p>
            <div className="exam-modal__actions">
              <button
                type="button"
                className="exam-footer__btn exam-footer__btn--ghost"
                onClick={() => setConfirmSubmit(false)}
                disabled={pending}
              >
                Go back
              </button>
              <button
                type="button"
                className="exam-footer__btn exam-footer__btn--primary"
                onClick={() => submit()}
                disabled={pending}
              >
                {pending ? "Sending…" : "Submit now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="exam-bar" aria-label="Navigate">
        <button
          type="button"
          className="exam-bar__btn exam-bar__btn--soft"
          disabled={isFirst || pending || expired || veiled}
          onClick={goPrev}
        >
          Back
        </button>
        <button
          type="button"
          className={`exam-bar__btn exam-bar__btn--soft ${currentMarked ? "is-mark" : ""}`}
          disabled={pending || expired || veiled}
          onClick={toggleMark}
        >
          {currentMarked ? "Unmark" : "Mark"}
        </button>
        {!isLast ? (
          <button
            type="button"
            className="exam-bar__btn exam-bar__btn--go"
            disabled={pending || expired || veiled}
            onClick={goNext}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="exam-bar__btn exam-bar__btn--go"
            disabled={pending || expired || veiled}
            onClick={openFinishConfirm}
          >
            {pending ? "…" : "Finish"}
          </button>
        )}
      </nav>
    </div>
  );
}
