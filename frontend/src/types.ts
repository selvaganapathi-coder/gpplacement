export type Role = "STUDENT" | "FACULTY" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
export type Program =
  | "ENGINEERING"
  | "CSE"
  | "IT"
  | "SCIENCE"
  | "ARTS"
  | "MANAGEMENT"
  | "COMMERCE"
  | "BPHARM"
  | "DPHARM"
  | "MPHARM"
  | "PHARMD"
  | "OTHER";
export type LevelType = "YEAR" | "SEMESTER";
export type Section = "A" | "B";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  program?: Program | null;
  levelType?: LevelType | null;
  level?: number | null;
  section?: Section | string | null;
  rollNo?: string | null;
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
  totpRequired?: boolean;
  totpRecoveryRemaining?: number;
};

export type QuestionDifficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionInput = {
  prompt: string;
  options: string[];
  correctIndex: number;
  /** Marks for a correct answer (default 1). */
  marks?: number;
  /** Deduction when negative marking is on (default 0). */
  negativeMarks?: number;
  /** Free-text topic / sub-topic (shown as subcategory in the bank). */
  topic?: string | null;
  difficulty?: QuestionDifficulty | null;
  /** Category display name from spreadsheet (resolved to categoryId on import). */
  category?: string | null;
  categoryId?: string | null;
  /** Comma-separated tags. */
  tags?: string | null;
  explanation?: string | null;
  /** Originating bank question id (no-repeat / quality). */
  sourceBankQuestionId?: string | null;
  caseBlockId?: string | null;
  caseStem?: string | null;
};
