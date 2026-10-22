import { Prisma } from "@prisma/client";

export type TestScheduleFields = {
  isPublished: boolean;
  availableFrom: Date | null;
  availableUntil: Date | null;
};

export type TestWindowStatus = "draft" | "upcoming" | "open" | "closed";

export function testWindowStatus(
  test: TestScheduleFields,
  now: Date = new Date()
): TestWindowStatus {
  if (!test.isPublished) return "draft";
  if (test.availableFrom && now < test.availableFrom) return "upcoming";
  if (test.availableUntil && now > test.availableUntil) return "closed";
  return "open";
}

export function studentTakeTestMessage(status: TestWindowStatus): string {
  switch (status) {
    case "draft":
      return "This test is not published yet.";
    case "upcoming":
      return "This test is not open yet. Check the start time on your dashboard.";
    case "closed":
      return "The scheduled time for this test has ended.";
    default:
      return "This test is not available.";
  }
}

export function prismaWhereStudentCanTake(now: Date = new Date()): Prisma.TestWhereInput {
  return {
    isPublished: true,
    AND: [
      { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
      { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] },
    ],
  };
}

export function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateSchedule(
  availableFrom: Date | null,
  availableUntil: Date | null
): string | null {
  if (availableFrom && availableUntil && availableUntil <= availableFrom) {
    return "End time must be after start time.";
  }
  return null;
}
