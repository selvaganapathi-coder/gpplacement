import {
  ASSESSMENT_TYPES,
  getAssessmentType,
  isMcqAssessment,
  type AssessmentTypeId,
} from "@/lib/assessmentTypes";

type Props = {
  value: AssessmentTypeId;
  onChange: (id: AssessmentTypeId) => void;
  id?: string;
};

const MCQ_TYPES = ASSESSMENT_TYPES.filter((t) => t.method === "MCQ");
const SCORED_TYPES = ASSESSMENT_TYPES.filter((t) => t.method !== "MCQ");

export function AssessmentTypePicker({ value, onChange, id }: Props) {
  const selected = getAssessmentType(value);

  return (
    <div>
      <label className="new-test-field__label" htmlFor={id}>
        Type
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AssessmentTypeId)}
        className="new-test-field__input"
      >
        <optgroup label="MCQ">
          {MCQ_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Scored (no paper)">
          {SCORED_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      </select>
      {!isMcqAssessment(value) ? (
        <p className="new-test-field__hint">{selected.methodLabel} — no MCQ questions.</p>
      ) : null}
    </div>
  );
}
