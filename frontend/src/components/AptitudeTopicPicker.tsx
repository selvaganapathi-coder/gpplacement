import {
  APTITUDE_CURRICULUM,
  aptitudeTopicLabel,
  findAptitudeTopicByLabel,
} from "@/lib/aptitudeCurriculum";

type TopicPickerProps = {
  value: string | null | undefined;
  onChange: (topic: string | null) => void;
  id?: string;
};

/** Single topic &lt;select&gt; for each question (sections as option groups). */
export function AptitudeTopicPicker({ value, onChange, id }: TopicPickerProps) {
  const known = findAptitudeTopicByLabel(value ?? null);
  const selectValue = known
    ? aptitudeTopicLabel(known.module.label, known.topic.label)
    : "";

  return (
    <div>
      <label className="text-sm font-medium text-slate-700" htmlFor={id}>
        Topic
      </label>
      <select
        id={id}
        value={selectValue}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full rounded-md border border-sky-200/80 px-3 py-2 text-sm"
      >
        <option value="">— Select topic —</option>
        {APTITUDE_CURRICULUM.map((mod) => (
          <optgroup key={mod.id} label={`${mod.code}. ${mod.label}`}>
            {mod.topics.map((t) => {
              const label = aptitudeTopicLabel(mod.label, t.label);
              return (
                <option key={t.id} value={label}>
                  {t.label}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
