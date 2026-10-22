/**
 * Student session must never leak answer keys.
 *   npx tsx server/testSession.security.check.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertNoAnswerKeysInStudentPayload } from "./attemptShuffle";

const prisma = new PrismaClient();
const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const PASSWORD = "changeme123";
const EMAIL = "student.dpharm.y1.a.01@gppharmacy.edu";

async function login(email: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  return raw.map((c) => c.split(";")[0]!).filter(Boolean).join("; ");
}

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  // Unit: sanitizer rejects keys
  let threw = false;
  try {
    assertNoAnswerKeysInStudentPayload([
      { id: "q1", prompt: "x", options: [{ id: "o1", text: "a", isCorrect: true }] },
    ]);
  } catch {
    threw = true;
  }
  check("sanitize.rejects_isCorrect", threw);

  const cookie = await login(EMAIL);
  const testsRes = await fetch(`${API_BASE}/api/student/tests`, {
    headers: { Cookie: cookie },
  });
  const testsBody = (await testsRes.json()) as {
    tests?: { id: string; title: string }[];
  };
  const testId = testsBody.tests?.[0]?.id;
  check("api.has_eligible_test", !!testId, testId ?? "none");
  if (!testId) throw new Error("No eligible test");

  const sessionRes = await fetch(`${API_BASE}/api/student/tests/${testId}/session`, {
    headers: { Cookie: cookie },
  });
  const session = (await sessionRes.json()) as {
    status?: string;
    test?: { questions?: Record<string, unknown>[] };
    error?: string;
  };
  check(
    "api.session_ok",
    sessionRes.status === 200 && session.status === "in_progress",
    `status ${sessionRes.status} body=${session.status ?? session.error}`
  );

  const questions = session.test?.questions ?? [];
  check("api.session_has_questions", questions.length > 0, `${questions.length}`);

  let leak = false;
  for (const q of questions) {
    if ("correctIndex" in q || "isCorrect" in q) leak = true;
    const opts = (q.options as { isCorrect?: boolean }[]) ?? [];
    for (const o of opts) {
      if (o && typeof o === "object" && "isCorrect" in o) leak = true;
    }
  }
  check("api.session_no_answer_keys", !leak);

  if (questions[0]) {
    const q0 = questions[0];
    check("api.question_shape_prompt", typeof q0.prompt === "string");
    check("api.question_shape_options", Array.isArray(q0.options));
  }

  if (failed) {
    console.error(`\n${failed} session security check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll session security checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
