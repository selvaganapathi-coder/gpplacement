import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/api";
import type { QuestionInput } from "@/types";

type Bank = {
  id: string;
  name: string;
  specialization: string | null;
  _count: { questions: number };
};

type Category = { id: string; name: string; parentId: string | null };

type Rule = {
  categoryName: string;
  difficulty: "" | "EASY" | "MEDIUM" | "HARD";
  count: number;
};

type BankBlueprintPickerProps = {
  onPick: (questions: QuestionInput[], meta: { shortages: string[]; bankId: string }) => void;
  existingPrompts?: string[];
};

const DEFAULT_RULES: Rule[] = [
  { categoryName: "Aptitude", difficulty: "", count: 5 },
  { categoryName: "Logical Reasoning", difficulty: "", count: 5 },
  { categoryName: "B.Pharm — Pharmacology", difficulty: "", count: 5 },
];

const MPHARM_SPECS = [
  "Pharmaceutics",
  "Pharmacology",
  "Pharmaceutical Chemistry",
  "Pharmacognosy",
  "Pharmaceutical Analysis",
  "Quality Assurance",
  "Industrial Pharmacy",
  "Other Specialization",
];

export function BankBlueprintPicker({
  onPick,
  existingPrompts = [],
}: BankBlueprintPickerProps) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankId, setBankId] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      try {
        const [b, c] = await Promise.all([
          api<{ banks: Bank[] }>("/api/question-banks"),
          api<{ categories: Category[] }>("/api/categories"),
        ]);
        setBanks(b.banks);
        setCategories(c.categories);
        const master = b.banks.find((x) =>
          x.name.toLowerCase().includes("master")
        );
        setBankId(master?.id ?? b.banks[0]?.id ?? "");
      } catch {
        /* ignore — form still works without banks */
      }
    })();
  }, []);

  function updateRule(i: number, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function runPick() {
    if (!bankId) {
      setError("Select a question bank.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{
            questions: QuestionInput[];
            shortages: string[];
          }>(`/api/question-banks/${bankId}/smart-pick`, {
            method: "POST",
            body: JSON.stringify({
              rules: rules.filter((r) => r.count > 0 && r.categoryName.trim()),
              excludePrompts: existingPrompts,
              specialization: specialization || undefined,
            }),
          });
          if (res.questions.length === 0) {
            setError("No questions matched the blueprint.");
            return;
          }
          onPick(res.questions, { shortages: res.shortages, bankId });
          setMessage(
            `Added ${res.questions.length} question${res.questions.length === 1 ? "" : "s"} from bank.` +
              (res.shortages.length
                ? ` (${res.shortages.length} rule shortage${res.shortages.length === 1 ? "" : "s"})`
                : "")
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Smart pick failed.");
        }
      })();
    });
  }

  if (banks.length === 0) return null;

  return (
    <section className="new-test-bank">
      <div className="new-test-bank__head">
        <div>
          <h3 className="new-test-bank__title">Pull from question bank</h3>
          <p className="new-test-bank__sub">
            Blueprint by category / difficulty. Already-added prompts are skipped.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          className="new-test-bank__fill"
          onClick={runPick}
        >
          {pending ? "Picking…" : "Fill from bank"}
        </button>
      </div>

      <div className="new-test-bank__toolbar">
        <label className="new-test-field__label">
          Bank
          <select
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            className="new-test-field__input mt-1"
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b._count.questions})
              </option>
            ))}
          </select>
        </label>
        <label className="new-test-field__label">
          M.Pharm specialization
          <select
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className="new-test-field__input mt-1"
          >
            <option value="">Any</option>
            {MPHARM_SPECS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="new-test-bank__rules">
        {rules.map((r, i) => (
          <li key={i} className="new-test-bank__rule">
            <select
              value={r.categoryName}
              onChange={(e) => updateRule(i, { categoryName: e.target.value })}
              className="new-test-field__input"
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={r.difficulty}
              onChange={(e) =>
                updateRule(i, {
                  difficulty: e.target.value as Rule["difficulty"],
                })
              }
              className="new-test-field__input"
            >
              <option value="">Any diff.</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={r.count}
              onChange={(e) =>
                updateRule(i, { count: Math.max(0, Number(e.target.value) || 0) })
              }
              className="new-test-field__input"
            />
            <button
              type="button"
              className="new-test-bank__remove"
              onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="new-test-add-q"
        onClick={() =>
          setRules((prev) => [
            ...prev,
            { categoryName: "", difficulty: "", count: 5 },
          ])
        }
      >
        + Add rule
      </button>

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-emerald-800">{message}</p> : null}
    </section>
  );
}
