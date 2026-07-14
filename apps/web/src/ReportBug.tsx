import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { reportBug } from "./api";

type PanelState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; result?: string; runId: string }
  | { kind: "error"; message: string };

export function ReportBug() {
  const titleId = useId();
  const textareaId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.kind !== "submitting") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.kind]);

  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function close() {
    if (state.kind === "submitting") return;
    setOpen(false);
    setState({ kind: "idle" });
    setMessage("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || state.kind === "submitting") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "submitting" });

    let res: Awaited<ReturnType<typeof reportBug>>;
    try {
      res = await reportBug({ message: trimmed }, controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Request failed",
      });
      return;
    }
    if (controller.signal.aborted) return;

    if (!res.ok) {
      setState({
        kind: "error",
        message: res.error.details ? `${res.error.error} (${res.error.details})` : res.error.error,
      });
      return;
    }

    setState({ kind: "success", result: res.data.result, runId: res.data.runId });
    setMessage("");
  }

  return (
    <div className="report-bug">
      {open && (
        <div
          className="report-bug__panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="report-bug__header">
            <h2 id={titleId} className="report-bug__title">
              Report a bug
            </h2>
            <button
              type="button"
              className="report-bug__close"
              onClick={close}
              disabled={state.kind === "submitting"}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="report-bug__hint">
            Describe the bug or the change you want. A Cursor agent will edit this project locally.
          </p>
          <form className="report-bug__form" onSubmit={onSubmit}>
            <label htmlFor={textareaId} className="sr-only">
              Bug description
            </label>
            <textarea
              id={textareaId}
              className="report-bug__textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. The Today chart y-axis labels are cut off on mobile…"
              maxLength={4000}
              rows={5}
              disabled={state.kind === "submitting"}
              required
            />
            {state.kind === "error" && (
              <p className="report-bug__status report-bug__status--error" role="alert">
                {state.message}
              </p>
            )}
            {state.kind === "success" && (
              <div className="report-bug__status report-bug__status--success" role="status">
                <p>Agent finished (run {state.runId}).</p>
                {state.result ? <pre className="report-bug__result">{state.result}</pre> : null}
              </div>
            )}
            {state.kind === "submitting" && (
              <p className="report-bug__status" role="status">
                Running agent… this can take a minute.
              </p>
            )}
            <div className="report-bug__actions">
              <button
                type="submit"
                className="report-bug__submit"
                disabled={state.kind === "submitting" || !message.trim()}
              >
                {state.kind === "submitting" ? "Sending…" : "Send to agent"}
              </button>
            </div>
          </form>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="report-bug__fab"
        aria-label="Report a bug"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
            setState({ kind: "idle" });
          }
        }}
      >
        <BugIcon />
      </button>
    </div>
  );
}

function BugIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7.5V6a3 3 0 0 1 6 0v1.5M6.5 10.5h11M8 10.5v5.5a4 4 0 0 0 8 0v-5.5M5 8.5 7.5 11M19 8.5 16.5 11M5 16l2.5-2M19 16l-2.5-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
