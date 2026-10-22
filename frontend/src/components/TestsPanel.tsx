import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconCalendar,
  IconChart,
  IconDots,
  IconEdit,
  IconPlus,
  IconUpload,
} from "@/components/Icons";
import {
  PublishTestDialog,
  type PublishConfirmPayload,
} from "@/components/PublishTestDialog";
import {
  defaultTestFilters,
  filterTests,
  TestListFilters,
  type FilterableTest,
  type TestFilterState,
} from "@/components/TestListFilters";
import { useAuth } from "@/context/AuthContext";
import { api, downloadResultsCsv } from "@/lib/api";
import { formatAcademic, type Program } from "@/lib/academic";
import { getAssessmentType, isMcqAssessment } from "@/lib/assessmentTypes";
import { formatScheduleRange, testWindowStatus } from "@/lib/testSchedule";

type TestRow = FilterableTest;

type TestsPanelProps = {
  mode: "staff" | "admin";
  newTestPath: string;
  viewQuestionsPath?: (testId: string) => string;
  editQuestionsPath?: (testId: string) => string;
  resultsPath?: (testId: string) => string;
  allowedPrograms?: Program[];
};

type StatusChip = "all" | "draft" | "published" | "open" | "awaiting";

function audienceLabel(test: TestRow): string {
  if (!test.program) return "All students";
  return formatAcademic(
    test.program,
    test.levelType,
    test.level,
    test.section ?? null
  );
}

function primaryStatus(test: TestRow): {
  label: string;
  tone: "draft" | "open" | "scheduled" | "closed" | "awaiting" | "results";
} {
  if (!test.isPublished) return { label: "Draft", tone: "draft" };
  if (!test.resultsPublished) {
    const w = testWindowStatus(test);
    if (w === "closed") return { label: "Awaiting", tone: "awaiting" };
  } else if (test.resultsPublished) {
    const w = testWindowStatus(test);
    if (w === "closed") return { label: "Results out", tone: "results" };
  }
  const w = testWindowStatus(test);
  if (w === "upcoming") return { label: "Scheduled", tone: "scheduled" };
  if (w === "open") return { label: "Open", tone: "open" };
  if (w === "closed") return { label: "Closed", tone: "closed" };
  return { label: "Published", tone: "open" };
}

export function TestsPanel({
  mode,
  newTestPath,
  viewQuestionsPath,
  editQuestionsPath,
  resultsPath,
  allowedPrograms,
}: TestsPanelProps) {
  const { user } = useAuth();
  const listUrl = mode === "admin" ? "/api/admin/tests" : "/api/staff/tests";
  const [tests, setTests] = useState<TestRow[]>([]);
  const [managedPrograms, setManagedPrograms] = useState<Program[]>(allowedPrograms ?? []);
  const [filters, setFilters] = useState<TestFilterState>(defaultTestFilters);
  const [statusChip, setStatusChip] = useState<StatusChip>("all");
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishTarget, setPublishTarget] = useState<TestRow | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<TestRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const scopePrograms = allowedPrograms?.length ? allowedPrograms : managedPrograms;

  const stats = useMemo(() => {
    const drafts = tests.filter((t) => !t.isPublished).length;
    const published = tests.filter((t) => t.isPublished).length;
    const open = tests.filter(
      (t) => t.isPublished && testWindowStatus(t) === "open"
    ).length;
    const awaiting = tests.filter((t) => t.isPublished && !t.resultsPublished).length;
    return { total: tests.length, drafts, published, open, awaiting };
  }, [tests]);

  const filtered = useMemo(() => {
    const base = filterTests(tests, filters, mode === "staff" ? user?.id : undefined);
    return base.filter((t) => {
      if (statusChip === "draft") return !t.isPublished;
      if (statusChip === "published") return t.isPublished;
      if (statusChip === "open") {
        return t.isPublished && testWindowStatus(t) === "open";
      }
      if (statusChip === "awaiting") {
        return t.isPublished && !t.resultsPublished;
      }
      return true;
    });
  }, [tests, filters, mode, user?.id, statusChip]);

  const awaitingRelease = useMemo(
    () => filtered.filter((t) => t.isPublished && !t.resultsPublished),
    [filtered]
  );

  async function load() {
    try {
      const res = await api<{ tests: TestRow[]; managedPrograms?: Program[] }>(listUrl);
      setTests(res.tests);
      if (res.managedPrograms?.length) setManagedPrograms(res.managedPrograms);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load tests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [listUrl]);

  useEffect(() => {
    if (allowedPrograms?.length) setManagedPrograms(allowedPrograms);
  }, [allowedPrograms]);

  useEffect(() => {
    const visible = new Set(filtered.map((t) => t.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  async function publishWithSchedule(id: string, payload: PublishConfirmPayload) {
    try {
      await api(`/api/staff/tests/${id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          isPublished: true,
          availableFrom: payload.availableFrom,
          availableUntil: payload.availableUntil,
          program: payload.audience.program,
          levelType: payload.audience.levelType,
          level: payload.audience.level,
          section: payload.audience.section,
        }),
      });
      setPublishTarget(null);
      setScheduleTarget(null);
      setMessage("Test published. Students can take it until the exam end time.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed.");
      throw e;
    }
  }

  async function handleDownloadCsv(testId: string) {
    setDownloadingId(testId);
    setErr(null);
    try {
      await downloadResultsCsv(testId, mode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "CSV download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function unpublish(id: string) {
    try {
      await api(`/api/staff/tests/${id}/publish`, {
        method: "POST",
        body: JSON.stringify({ isPublished: false }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllAwaiting() {
    setSelectedIds(new Set(awaitingRelease.map((t) => t.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkPublishResults(publish: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setErr(null);
    setMessage(null);
    try {
      const res = await api<{ ok: boolean; updated: number }>(
        "/api/staff/tests/publish-results-bulk",
        {
          method: "POST",
          body: JSON.stringify({ testIds: ids, resultsPublished: publish }),
        }
      );
      setMessage(
        publish
          ? `Released results for ${res.updated} test${res.updated === 1 ? "" : "s"}.`
          : `Hid results for ${res.updated} test${res.updated === 1 ? "" : "s"}.`
      );
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  const chips: { id: StatusChip; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "draft", label: "Drafts", count: stats.drafts },
    { id: "published", label: "Published", count: stats.published },
    { id: "open", label: "Open now", count: stats.open },
    { id: "awaiting", label: "Awaiting results", count: stats.awaiting },
  ];

  return (
    <div className="tests-page">
      <header className="tests-toolbar">
        <p className="tests-toolbar__hint">
          {filtered.length} of {stats.total} shown
        </p>
        <Link to={newTestPath} className="tests-toolbar__cta">
          <IconPlus className="h-3.5 w-3.5" />
          New assessment
        </Link>
      </header>

      {err ? (
        <p className="soft-alert border-red-200 bg-red-50 text-red-900" role="alert">
          {err}
        </p>
      ) : null}
      {message ? (
        <p className="soft-alert border-emerald-200 bg-emerald-50 text-emerald-950" role="status">
          {message}
        </p>
      ) : null}

      <div className="tests-directory">
        <div className="tests-directory__toolbar">
          <div className="tests-status-tabs" role="tablist" aria-label="Test status">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={statusChip === c.id}
                onClick={() => setStatusChip(c.id)}
                className={`tests-status-tab tests-status-tab--${c.id} ${
                  statusChip === c.id ? "tests-status-tab--active" : ""
                }`}
              >
                <span className="tests-status-tab__count">{c.count}</span>
                <span className="tests-status-tab__label">{c.label}</span>
              </button>
            ))}
          </div>

          {tests.length > 0 ? (
            <TestListFilters
              filters={filters}
              onChange={setFilters}
              resultCount={filtered.length}
              totalCount={tests.length}
              allowedPrograms={mode === "staff" ? scopePrograms : undefined}
              hideAccessFilter={mode === "staff"}
              hideStatusFilter
              compact
            />
          ) : null}

          {awaitingRelease.length > 0 || selectedIds.size > 0 ? (
            <div className="tests-bulk-bar">
              <span className="tests-bulk-bar__label">
                Bulk results
                {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
              </span>
              {awaitingRelease.length > 0 ? (
                <button
                  type="button"
                  onClick={selectAllAwaiting}
                  className="tests-bulk-bar__btn"
                >
                  Select awaiting ({awaitingRelease.length})
                </button>
              ) : null}
              {selectedIds.size > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkPublishResults(true)}
                    className="tests-bulk-bar__btn tests-bulk-bar__btn--primary"
                  >
                    {bulkBusy ? "Updating…" : "Publish results"}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkPublishResults(false)}
                    className="tests-bulk-bar__btn"
                  >
                    Hide results
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={clearSelection}
                    className="tests-bulk-bar__clear"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <span className="tests-bulk-bar__hint">
                  Select published tests to release or hide scores.
                </span>
              )}
            </div>
          ) : null}
        </div>

        <div className="tests-directory__body">
          {loading ? (
            <p className="tests-empty">Loading assessments…</p>
          ) : tests.length === 0 ? (
            <div className="tests-empty-state">
              <p className="tests-empty-state__title">No assessments yet</p>
              <p className="tests-empty-state__lede">
                Create a draft, then publish when ready.
              </p>
              <Link to={newTestPath} className="tests-toolbar__cta">
                <IconPlus className="h-3.5 w-3.5" />
                New assessment
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <p className="tests-empty">No assessments match this view or filters.</p>
          ) : (
            <div className="tests-table-wrap">
              <table className="tests-table">
                <thead>
                  <tr>
                    <th className="tests-table__check" scope="col">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col">Assessment</th>
                    <th scope="col">Status</th>
                    <th scope="col">When</th>
                    <th className="tests-table__actions" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const status = primaryStatus(t);
                    const type = getAssessmentType(t.assessmentType);
                    const selected = selectedIds.has(t.id);
                    const sizeLabel = isMcqAssessment(t.assessmentType)
                      ? `${t._count.questions} Q`
                      : `Max ${t.maxScore ?? 100}`;
                    return (
                      <tr
                        key={t.id}
                        className={`tests-tr tests-tr--${status.tone} ${
                          selected ? "tests-tr--selected" : ""
                        } ${!t.isPublished ? "tests-tr--draft" : ""}`}
                      >
                        <td className="tests-table__check">
                          {t.isPublished ? (
                            <label title="Select for bulk results">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelected(t.id)}
                              />
                              <span className="sr-only">Select {t.title}</span>
                            </label>
                          ) : null}
                        </td>
                        <td>
                          <div className="tests-table__title">{t.title}</div>
                          <div className="tests-table__sub">
                            {type.label}
                            <span aria-hidden> · </span>
                            {audienceLabel(t)}
                            <span aria-hidden> · </span>
                            {sizeLabel}
                            {t._count.attempts > 0 ? (
                              <>
                                <span aria-hidden> · </span>
                                {t._count.attempts} attempt
                                {t._count.attempts === 1 ? "" : "s"}
                              </>
                            ) : null}
                            {t.canEdit === false ? (
                              <>
                                <span aria-hidden> · </span>
                                View only
                              </>
                            ) : null}
                            {t.lastEditedBy ? (
                              <>
                                <span aria-hidden> · </span>
                                Edited by {t.lastEditedBy.name}
                              </>
                            ) : t.createdBy ? (
                              <>
                                <span aria-hidden> · </span>
                                By {t.createdBy.name}
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={`tests-badge tests-badge--${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          <div className="tests-table__when">
                            <IconCalendar className="h-3.5 w-3.5" />
                            <span>
                              {t.isPublished
                                ? formatScheduleRange(t.availableFrom, t.availableUntil)
                                : "Not scheduled"}
                            </span>
                          </div>
                        </td>
                        <td className="tests-table__actions">
                          <div className="tests-row__actions">
                            {!t.isPublished && (mode === "staff" || mode === "admin") ? (
                              <button
                                type="button"
                                onClick={() => setPublishTarget(t)}
                                className="tests-action tests-action--primary"
                              >
                                <IconUpload className="h-3.5 w-3.5" aria-hidden />
                                Publish
                              </button>
                            ) : null}
                            {t.canEdit && editQuestionsPath ? (
                              <Link
                                to={editQuestionsPath(t.id)}
                                className="tests-action tests-action--edit"
                              >
                                <IconEdit className="h-3.5 w-3.5" aria-hidden />
                                Edit
                              </Link>
                            ) : null}
                            {resultsPath ? (
                              <Link
                                to={resultsPath(t.id)}
                                className="tests-action tests-action--results"
                              >
                                <IconChart className="h-3.5 w-3.5" aria-hidden />
                                Results
                                {t._count.attempts > 0 ? (
                                  <span className="tests-action__count">
                                    {t._count.attempts}
                                  </span>
                                ) : null}
                              </Link>
                            ) : null}
                            <details className="tests-more">
                              <summary className="tests-action" title="More">
                                <IconDots className="h-3.5 w-3.5" aria-hidden />
                                More
                              </summary>
                              <div className="tests-more__menu">
                                {viewQuestionsPath ? (
                                  <Link
                                    to={viewQuestionsPath(t.id)}
                                    className="tests-more__item"
                                  >
                                    Details
                                  </Link>
                                ) : null}
                                {t.isPublished && (mode === "staff" || mode === "admin") ? (
                                  <>
                                    {resultsPath ? (
                                      <button
                                        type="button"
                                        disabled={downloadingId === t.id}
                                        onClick={() => void handleDownloadCsv(t.id)}
                                        className="tests-more__item disabled:opacity-60"
                                      >
                                        {downloadingId === t.id
                                          ? "Downloading…"
                                          : "Download CSV"}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => setScheduleTarget(t)}
                                      className="tests-more__item"
                                    >
                                      Reschedule
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void unpublish(t.id)}
                                      className="tests-more__item"
                                    >
                                      Unpublish
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PublishTestDialog
        testTitle={publishTarget?.title ?? scheduleTarget?.title ?? ""}
        open={!!publishTarget || !!scheduleTarget}
        requireAudience={!!publishTarget}
        initialFrom={
          (publishTarget ?? scheduleTarget)?.availableFrom ?? null
        }
        initialUntil={
          (publishTarget ?? scheduleTarget)?.availableUntil ?? null
        }
        initialProgram={(publishTarget ?? scheduleTarget)?.program ?? null}
        initialLevel={(publishTarget ?? scheduleTarget)?.level ?? null}
        initialSection={
          ((publishTarget ?? scheduleTarget)?.section as
            | "A"
            | "B"
            | null
            | undefined) ?? null
        }
        allowedPrograms={mode === "staff" ? scopePrograms : undefined}
        allowAllStudents={mode === "admin"}
        onClose={() => {
          setPublishTarget(null);
          setScheduleTarget(null);
        }}
        onConfirm={async (payload) => {
          const id = publishTarget?.id ?? scheduleTarget?.id;
          if (!id) return;
          setErr(null);
          setMessage(null);
          await publishWithSchedule(id, payload);
        }}
      />
    </div>
  );
}
